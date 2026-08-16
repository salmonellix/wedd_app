const splash = document.getElementById('splash');
const menuToggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.menu');
const songForm = document.getElementById('song-form');
const songsList = document.getElementById('songsList');
const messageBox = document.getElementById('form-message');
const likedStorageKey = 'weddingSongLikes';

const targetDate = new Date('2026-08-22T17:30:00');

function setCountdown() {
  const now = new Date();
  const diff = targetDate - now;

  if (diff <= 0) {
    document.getElementById('days').textContent = '00';
    document.getElementById('hours').textContent = '00';
    document.getElementById('minutes').textContent = '00';
    document.getElementById('seconds').textContent = '00';
    return;
  }

  const seconds = Math.floor(diff / 1000) % 60;
  const minutes = Math.floor(diff / 1000 / 60) % 60;
  const hours = Math.floor(diff / 1000 / 60 / 60) % 24;
  const days = Math.floor(diff / 1000 / 60 / 60 / 24);

  document.getElementById('days').textContent = String(days).padStart(2, '0');
  document.getElementById('hours').textContent = String(hours).padStart(2, '0');
  document.getElementById('minutes').textContent = String(minutes).padStart(2, '0');
  document.getElementById('seconds').textContent = String(seconds).padStart(2, '0');
}

function getLikedSongs() {
  try {
    return JSON.parse(localStorage.getItem(likedStorageKey) || '[]');
  } catch (error) {
    return [];
  }
}

  // Contact reveal functionality: mask numbers and reveal on button click
  function formatNumberForDisplay(raw) {
    const str = String(raw || '');
    const digits = str.replace(/\D/g, '');
    const ccMatch = str.match(/^\+(\d{1,3})/);
    let cc = '';
    let rest = digits;
    if (ccMatch) {
      cc = '+' + ccMatch[1];
      rest = digits.slice(ccMatch[1].length);
    }
    const groups = rest.match(/.{1,3}/g) || [];
    return cc ? (cc + ' ' + groups.join(' ')) : groups.join(' ');
  }

  function maskNumber(raw) {
    const formatted = formatNumberForDisplay(raw);
    if (!formatted) return '';
    const parts = formatted.split(' ');
    if (parts[0] && parts[0].startsWith('+')) {
      const cc = parts.shift();
      const rest = parts.join(' ');
      const masked = rest.replace(/\d/g, '*');
      return cc + (masked ? ' ' + masked : '');
    }
    return formatted.replace(/\d/g, '*');
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
    return Promise.resolve();
  }

  function initContactReveal() {
    const phones = Array.from(document.querySelectorAll('.phone'));
    phones.forEach((phoneEl) => {
      const full = phoneEl && phoneEl.dataset && phoneEl.dataset.number;
      if (!full) return;
      phoneEl.textContent = maskNumber(full);
      phoneEl.classList.add('masked');

      phoneEl.addEventListener('click', () => {
        if (phoneEl.classList.contains('masked')) return;
        copyToClipboard(full).then(() => {
          const formatted = formatNumberForDisplay(full);
          phoneEl.textContent = 'Skopiowano!';
          setTimeout(() => {
            phoneEl.textContent = formatted;
          }, 1200);
        });
      });
    });

    const globalBtn = document.querySelector('.reveal-contacts-global');
    if (!globalBtn) return;

    globalBtn.addEventListener('click', () => {
      const expanded = globalBtn.getAttribute('aria-expanded') === 'true';
      if (!expanded) {
        // reveal all
        phones.forEach((phoneEl) => {
          const full = phoneEl && phoneEl.dataset && phoneEl.dataset.number;
          if (!full) return;
          phoneEl.textContent = formatNumberForDisplay(full);
          phoneEl.classList.remove('masked');
          phoneEl.classList.add('copyable');
          phoneEl.title = 'Kliknij, aby skopiować numer';
        });
        globalBtn.textContent = 'Ukryj kontakty';
        globalBtn.setAttribute('aria-expanded', 'true');
      } else {
        // mask all
        phones.forEach((phoneEl) => {
          const full = phoneEl && phoneEl.dataset && phoneEl.dataset.number;
          if (!full) return;
          phoneEl.textContent = maskNumber(full);
          phoneEl.classList.add('masked');
          phoneEl.classList.remove('copyable');
          phoneEl.removeAttribute('title');
        });
        globalBtn.textContent = 'Pokaż kontakty';
        globalBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  initContactReveal();

function saveLikedSong(id) {
  const liked = new Set(getLikedSongs());
  liked.add(id);
  localStorage.setItem(likedStorageKey, JSON.stringify([...liked]));
}

function showMessage(text, isError = true) {
  messageBox.textContent = text;
  messageBox.style.color = isError ? '#a32f3f' : '#2a5f3f';
}

async function fetchSongs() {
  try {
    const response = await fetch('/api/songs');
    if (!response.ok) {
      throw new Error('Błąd przy pobieraniu utworów');
    }
    const songs = await response.json();
    renderSongs(songs);
  } catch (error) {
    showMessage('Nie udało się pobrać listy utworów. Spróbuj później.');
  }
}

function renderSongs(songs) {
  const likedIds = new Set(getLikedSongs());
  songsList.innerHTML = '';

  if (songs.length === 0) {
    songsList.innerHTML = '<li class="song-item"><div class="song-meta"><strong>Brak utworów.</strong><small>Dodaj pierwszy utwór do playlisty.</small></div></li>';
    return;
  }

  songs.forEach((song) => {
    const item = document.createElement('li');
    item.className = 'song-item';
    item.dataset.id = song.id;

    const meta = document.createElement('div');
    meta.className = 'song-meta';
    meta.innerHTML = `<strong>${song.title}</strong><small>${song.artist}</small>`;

    const errorDiv = document.createElement('div');
    errorDiv.className = 'song-error';
    errorDiv.textContent = '';

    const actions = document.createElement('div');
    actions.className = 'song-actions';
    const likes = document.createElement('span');
    likes.textContent = song.likes;
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = likedIds.has(song.id) ? '❤' : '🤍';
    if (likedIds.has(song.id)) {
      button.classList.add('liked');
      button.disabled = true;
    }
    button.addEventListener('click', () => likeSong(song.id));

    actions.appendChild(button);
    actions.appendChild(likes);
    item.appendChild(meta);
    item.appendChild(actions);
    item.appendChild(errorDiv);
    songsList.appendChild(item);
  });
}

async function likeSong(id) {
  try {
    const response = await fetch(`/api/songs/${id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ myNameIs: '' })
    });

    const result = await response.json();
    if (!response.ok) {
      // If response includes the song id, show the error inline next to that song
      if (result && result.id) {
        const target = document.querySelector(`li.song-item[data-id="${result.id}"]`);
        if (target) {
          const errEl = target.querySelector('.song-error');
          if (errEl) {
            errEl.textContent = result.error || 'Nie można polubić utworu.';
            // clear the inline error after 5s
            setTimeout(() => { if (errEl) errEl.textContent = ''; }, 5000);
          }
          return;
        }
      }
      return showMessage(result.error || 'Nie można polubić utworu.', true);
    }

    saveLikedSong(id);
    showMessage('Utwór został polubiony!', false);
    fetchSongs();
  } catch (error) {
    showMessage('Problemy z polubieniem utworu. Spróbuj ponownie.', true);
  }
}

songForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');

  const title = document.getElementById('title').value.trim();
  const artist = document.getElementById('artist').value.trim();
  const myNameIs = document.getElementById('myNameIs').value;

  if (!title || !artist) {
    return showMessage('Proszę podać tytuł i wykonawcę.');
  }

  let recaptchaToken = null;
  try {
    if (window.grecaptcha && typeof grecaptcha.execute === 'function') {
      await new Promise((r) => grecaptcha.ready(r));
      recaptchaToken = await grecaptcha.execute('6Lc5tIctAAAAADRtrhGy_dnu78zXcftJ5sMw5u_Z', { action: 'submit' });
    }
  } catch (err) {
    console.warn('reCAPTCHA error:', err && err.message);
  }

  try {
    const response = await fetch('/api/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist, myNameIs, recaptchaToken })
    });

    const result = await response.json();
    if (!response.ok) {
      return showMessage(result.error || 'Nie udało się dodać utworu.');
    }

    songForm.reset();
    showMessage('Utwór dodany do listy!', false);
    fetchSongs();
  } catch (error) {
    showMessage('Błąd połączenia. Spróbuj ponownie.');
  }
});

splash.addEventListener('click', () => {
  document.body.classList.remove('splash-open');
  splash.style.opacity = '0';
  splash.style.pointerEvents = 'none';
  setTimeout(() => splash.remove(), 500);
});

setCountdown();
setInterval(setCountdown, 1000);
fetchSongs();

// Mobile menu toggle
if (menuToggle && menu) {
  menuToggle.addEventListener('click', () => {
    const opened = menu.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', opened ? 'true' : 'false');
  });

  // close menu when a link is clicked (mobile)
  menu.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      if (menu.classList.contains('open')) {
        menu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      }
    });
  });
}
