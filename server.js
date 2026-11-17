const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize SQLite Database
const db = new sqlite3.Database('./uptime.db', (err) => {
  if (err) console.error('Database error:', err.message);
  else console.log('Connected to SQLite database.');
});

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS monitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER,
    status_code INTEGER,
    response_time INTEGER,
    status TEXT,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(monitor_id) REFERENCES monitors(id)
  )`);
});

// Serve frontend HTML directly from server.js
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PingWatch — Uptime Monitor</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0D1117; color: #E6EDF3; margin: 0; padding: 40px; }
    .container { max-width: 800px; margin: auto; }
    h1 { font-size: 24px; border-bottom: 1px solid #30363D; padding-bottom: 15px; }
    .card { background: #161B22; border: 1px solid #30363D; padding: 20px; border-radius: 6px; margin-bottom: 20px; }
    form { display: flex; gap: 10px; margin-top: 15px; }
    input { background: #0D1117; border: 1px solid #30363D; color: #fff; padding: 10px; border-radius: 4px; flex: 1; }
    button { background: #238636; color: #fff; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
    button:hover { background: #2ea043; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #30363D; }
    th { color: #8b949e; font-size: 13px; }
    .badge-up { background: #1f6feb33; color: #58a6ff; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .badge-down { background: #da363333; color: #f85149; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>PingWatch // System Uptime Monitor</h1>
    
    <div class="card">
      <h3>Add New Endpoint</h3>
      <form id="monitorForm">
        <input type="text" id="name" placeholder="Service Name (e.g. My API)" required />
        <input type="url" id="url" placeholder="URL (e.g. https://api.example.com/health)" required />
        <button type="submit">Add Monitor</button>
      </form>
    </div>

    <div class="card">
      <h3>Monitored Services</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>URL</th>
            <th>Status</th>
            <th>Latency</th>
            <th>Last Checked</th>
          </tr>
        </thead>
        <tbody id="monitorTable">
          <tr><td colspan="5" style="text-align: center; color: #8b949e;">Loading monitors...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    async function fetchMonitors() {
      try {
        const res = await fetch('/api/monitors');
        const data = await res.json();
        const tbody = document.getElementById('monitorTable');
        
        if (data.length === 0) {
          tbody.innerHTML = \`<tr><td colspan="5" style="text-align: center; color: #8b949e;">No monitors added yet.</td></tr>\`;
          return;
        }

        tbody.innerHTML = data.map(m => \`
          <tr>
            <td><strong>\${m.name}</strong></td>
            <td><a href="\${m.url}" target="_blank" style="color: #58a6ff; text-decoration: none;">\${m.url}</a></td>
            <td><span class="\${m.status === 'UP' ? 'badge-up' : 'badge-down'}">\${m.status || 'PENDING'}</span></td>
            <td>\${m.response_time ? m.response_time + 'ms' : '—'}</td>
            <td style="color: #8b949e; font-size: 13px;">\${m.checked_at || 'Waiting for check...'}</td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Error fetching monitors:', err);
      }
    }

    document.getElementById('monitorForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('name').value;
      const url = document.getElementById('url').value;

      await fetch('/api/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url })
      });

      document.getElementById('name').value = '';
      document.getElementById('url').value = '';
      fetchMonitors();
    });

    fetchMonitors();
    setInterval(fetchMonitors, 10000);
  </script>
</body>
</html>`);
});

// API: Get all monitors
app.get('/api/monitors', (req, res) => {
  const query = `
    SELECT m.*, l.status_code, l.response_time, l.status, l.checked_at 
    FROM monitors m
    LEFT JOIN logs l ON m.id = l.monitor_id
    WHERE l.id IS NULL OR l.id = (
      SELECT MAX(id) FROM logs WHERE monitor_id = m.id
    )
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: Add a new monitor URL
app.post('/api/monitors', (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });

  db.run(`INSERT INTO monitors (name, url) VALUES (?, ?)`, [name, url], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, url });
  });
});

// Background Worker: Run every minute
cron.schedule('* * * * *', () => {
  db.all(`SELECT * FROM monitors`, [], (err, monitors) => {
    if (err || !monitors) return;

    monitors.forEach(async (mon) => {
      const start = Date.now();
      try {
        const response = await axios.get(mon.url, { timeout: 5000 });
        const duration = Date.now() - start;
        const status = response.status >= 200 && response.status < 300 ? 'UP' : 'DOWN';

        db.run(`INSERT INTO logs (monitor_id, status_code, response_time, status) VALUES (?, ?, ?, ?)`,
          [mon.id, response.status, duration, status]);
      } catch (error) {
        const duration = Date.now() - start;
        const statusCode = error.response ? error.response.status : 500;
        db.run(`INSERT INTO logs (monitor_id, status_code, response_time, status) VALUES (?, ?, ?, ?)`,
          [mon.id, statusCode, duration, 'DOWN']);
      }
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});