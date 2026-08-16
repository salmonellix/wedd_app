const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}
loadEnvFile();

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const songsFile = path.join(dataDir, 'songs.json');

app.disable('etag');

const rateWindowMs = 60_000;
const maxRequestsPerWindow = 100;
const rateMap = new Map();

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

app.disable('x-powered-by');
app.use(express.json());
app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  let guestId = cookies.guestId;
  if (!guestId) {
    guestId = crypto.randomUUID();
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `guestId=${guestId}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secure}`);
  }
  req.guestId = guestId;
  next();
});
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');

  if (req.path.startsWith('/api/')) {
    const now = Date.now();
    const ip = req.ip;
    const info = rateMap.get(ip) || { windowStart: now, count: 0 };

    if (now - info.windowStart > rateWindowMs) {
      info.windowStart = now;
      info.count = 0;
    }

    info.count += 1;
    rateMap.set(ip, info);

    if (info.count > maxRequestsPerWindow) {
      return res.status(429).json({ error: 'Za dużo żądań. Spróbuj za chwilę.' });
    }
  }

  next();
});

// Development: disable caching for all responses to ensure fresh files during development
app.use((req, res, next) => {
  res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma','no-cache');
  res.set('Expires','0');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  maxAge: 0
}));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /api');
});

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(songsFile)) {
    fs.writeFileSync(songsFile, '[]', 'utf8');
  }
}

function loadSongs() {
  try {
    return JSON.parse(fs.readFileSync(songsFile, 'utf8')) || [];
  } catch (error) {
    return [];
  }
}

function saveSongs(list) {
  fs.writeFileSync(songsFile, JSON.stringify(list, null, 2), 'utf8');
}

function sanitize(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').slice(0, 200);
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function verifyRecaptcha(token, remoteIp) {
  if (!token) return false;
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) {
    console.warn('RECAPTCHA_SECRET not set — skipping reCAPTCHA verification (development mode)');
    return true;
  }
  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    if (remoteIp) params.append('remoteip', remoteIp);

    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await resp.json();
    if (!data.success) return false;
    // v3 returns a score — require a reasonable threshold when present
    if (typeof data.score === 'number') {
      return data.score >= 0.5;
    }
    return true;
  } catch (err) {
    console.warn('reCAPTCHA verification failed:', err && err.message);
    return false;
  }
}

ensureDataFile();
let songs = loadSongs();

app.get('/api/songs', (req, res) => {
  const sorted = [...songs].sort((a, b) => b.likes - a.likes);
  res.json(sorted);
});

app.post('/api/songs', async (req, res) => {
  const { title, artist, myNameIs = '', recaptchaToken = '' } = req.body || {};

  if (typeof myNameIs !== 'string' || myNameIs.length > 0) {
    return res.status(400).json({ error: 'Nieprawidłowe zgłoszenie.' });
  }

  // verify reCAPTCHA token (if RECAPTCHA_SECRET is set)
  const recaptchaOk = await verifyRecaptcha(recaptchaToken, req.ip);
  if (!recaptchaOk) {
    return res.status(400).json({ error: 'Weryfikacja reCAPTCHA nie powiodła się.' });
  }

  const safeTitle = sanitize(title);
  const safeArtist = sanitize(artist);

  if (!safeTitle || !safeArtist) {
    return res.status(400).json({ error: 'Proszę podać tytuł i wykonawcę.' });
  }

  const isDuplicate = songs.some((item) =>
    item.title.toLowerCase() === safeTitle.toLowerCase() &&
    item.artist.toLowerCase() === safeArtist.toLowerCase()
  );
  if (isDuplicate) {
    return res.status(409).json({ error: 'Ten utwór jest już na liście.' });
  }

  const song = {
    id: createId(),
    title: safeTitle,
    artist: safeArtist,
    likes: 0,
    likedSessions: []
  };

  songs.unshift(song);
  saveSongs(songs);
  res.status(201).json(song);
});

app.post('/api/songs/:id/like', (req, res) => {
  const { myNameIs = '' } = req.body || {};

  if (typeof myNameIs !== 'string' || myNameIs.length > 0) {
    return res.status(400).json({ error: 'Nieprawidłowe zgłoszenie.' });
  }

  const song = songs.find((item) => item.id === req.params.id);
  if (!song) {
    return res.status(404).json({ error: 'Nie znaleziono utworu.' });
  }

  const sessionIndex = (song.likedSessions || []).indexOf(req.guestId);
  if (!song.likedSessions) song.likedSessions = [];
  let liked;

  if (sessionIndex === -1) {
    song.likes += 1;
    song.likedSessions.push(req.guestId);
    liked = true;
  } else {
    song.likes = Math.max(0, song.likes - 1);
    song.likedSessions.splice(sessionIndex, 1);
    liked = false;
  }

  saveSongs(songs);

  res.json({ id: song.id, likes: song.likes, liked });
});

app.listen(port, () => {
  console.log(`Aplikacja działa na http://localhost:${port}`);
});
