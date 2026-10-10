// Tiny JSON-file database: zero native dependencies, survives restarts.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

let db = { users: [], conversations: [], messages: [] };
if (fs.existsSync(DB_FILE)) {
  try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; }
  catch (e) { console.error('Could not read db.json, starting fresh:', e.message); }
}

let timer = null;
const save = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), err => {
      if (!err) fs.rename(tmp, DB_FILE, () => {});
    });
  }, 150);
};
process.on('SIGINT', () => { fs.writeFileSync(DB_FILE, JSON.stringify(db)); process.exit(0); });

module.exports = { db, save, DATA_DIR };
