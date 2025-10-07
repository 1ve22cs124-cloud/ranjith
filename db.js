const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.sqlite3');

const db = new sqlite3.Database(DB_PATH);

function init() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS vms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT UNIQUE,
        display_name TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vm_id INTEGER,
        user_id INTEGER,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME NULL,
        FOREIGN KEY(vm_id) REFERENCES vms(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    // seed a default user and some VMs if missing
    db.get('SELECT COUNT(1) as c FROM users', (err, row) => {
      if (!err && row.c === 0) {
        db.run('INSERT INTO users (username, password) VALUES (?,?)', ['alice', 'password']);
        db.run('INSERT INTO users (username, password) VALUES (?,?)', ['bob', 'password']);
      }
    });

    db.get('SELECT COUNT(1) as c FROM vms', (err, row) => {
      if (!err && row.c === 0) {
        const vms = [
          ['10.58.211.33','vm-1'],
          ['10.58.211.106','vm-2'],
          ['10.58.211.107','vm-3'],
          ['10.58.211.109','vm-4'],
          ['10.58.211.110','vm-5']
        ];
        const stmt = db.prepare('INSERT INTO vms (ip, display_name) VALUES (?,?)');
        vms.forEach(v => stmt.run(v[0], v[1]));
        stmt.finalize();
      }
    });
  });
}

module.exports = { db, init };
