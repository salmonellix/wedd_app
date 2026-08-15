const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const songsFile = path.join(dataDir, 'songs.json');

function backupAndClear() {
  if (!fs.existsSync(songsFile)) {
    console.error('File not found:', songsFile);
    process.exit(1);
  }

  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(dataDir, `songs.${now}.bak.json`);

  try {
    fs.copyFileSync(songsFile, backup);
    fs.writeFileSync(songsFile, '[]', 'utf8');
    console.log('Backup created:', backup);
    console.log('songs.json cleared.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('Are you sure you want to clear all songs? This will create a backup. (yes/no) ', (answer) => {
    readline.close();
    if (answer.trim().toLowerCase() === 'yes') {
      backupAndClear();
    } else {
      console.log('Aborted. No changes made.');
    }
  });
}

module.exports = { backupAndClear };
