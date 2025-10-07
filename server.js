const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const { db, init } = require('./db');

init();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(session({
  secret: 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000 }
}));

// simple auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT id, username FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!user) return res.status(401).json({ error: 'invalid' });
    req.session.user = { id: user.id, username: user.username };
    res.json({ ok: true, user: req.session.user });
  });
});

app.post('/api/logout', (req, res) => {
  if (req.session) req.session.destroy(() => {});
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'unauth' });
}

// list VMs with current reservation (if any)
app.get('/api/vms', requireAuth, (req, res) => {
  const sql = `
    SELECT v.id, v.ip, v.display_name,
      r.id as reservation_id, r.user_id, r.started_at, r.ended_at, u.username
    FROM vms v
    LEFT JOIN reservations r ON r.vm_id = v.id AND r.ended_at IS NULL
    LEFT JOIN users u ON u.id = r.user_id
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'db' });
    res.json(rows.map(r => ({
      id: r.id,
      ip: r.ip,
      display_name: r.display_name,
      reserved: !!r.reservation_id,
      reservation_id: r.reservation_id,
      reserved_by: r.username || null,
      started_at: r.started_at
    })));
  });
});

// reserve a VM: create reservation row
app.post('/api/vms/:id/reserve', requireAuth, (req, res) => {
  const vmId = Number(req.params.id);
  const userId = req.session.user.id;
  // check if already reserved
  db.get('SELECT id FROM reservations WHERE vm_id = ? AND ended_at IS NULL', [vmId], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (row) return res.status(409).json({ error: 'reserved' });
    db.run('INSERT INTO reservations (vm_id, user_id) VALUES (?,?)', [vmId, userId], function(err2) {
      if (err2) return res.status(500).json({ error: 'db' });
      res.json({ ok: true, reservation_id: this.lastID });
    });
  });
});

// release a VM: set ended_at
app.post('/api/vms/:id/release', requireAuth, (req, res) => {
  const vmId = Number(req.params.id);
  const userId = req.session.user.id;
  // only the reserving user or admin (not implemented) can release
  db.get('SELECT id, user_id FROM reservations WHERE vm_id = ? AND ended_at IS NULL', [vmId], (err, row) => {
    if (err) return res.status(500).json({ error: 'db' });
    if (!row) return res.status(404).json({ error: 'not_reserved' });
    if (row.user_id !== userId) return res.status(403).json({ error: 'not_owner' });
    db.run('UPDATE reservations SET ended_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id], function(err2) {
      if (err2) return res.status(500).json({ error: 'db' });
      res.json({ ok: true });
    });
  });
});

// serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
