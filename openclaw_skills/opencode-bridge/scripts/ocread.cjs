const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

const BRIDGE_RUN = path.join(os.homedir(), '.opencode', 'bridge', 'run.json');
const fs = require('fs');

let online = false;
try { online = !!JSON.parse(fs.readFileSync(BRIDGE_RUN, 'utf8')).pid; } catch {}

const db = new DatabaseSync('C:/Users/Brian/.local/share/opencode/opencode-local.db');

// Get last 100 text parts
const parts = db.prepare(`
  SELECT p.data as pdata, m.data as mdata, p.session_id, s.title
  FROM part p
  JOIN message m ON p.message_id = m.id
  JOIN session s ON p.session_id = s.id
  WHERE json_extract(p.data, '$.type') = 'text'
  ORDER BY p.time_created DESC
  LIMIT 100
`).all();

const results = [];
for (const p of parts) {
  const pdata = JSON.parse(p.pdata);
  const mdata = JSON.parse(p.mdata);
  const text = (pdata.text || '').trim().substring(0, 2000);
  const role = mdata.role;
  const agent = mdata.agent || '';
  const icon = role === 'user' ? '👤' : '🤖';
  results.push({ icon, role, agent, title: p.title || '', text });
}

// Reverse to chronological order
results.reverse();

if (results.length === 0) {
  console.log('NO_MESSAGES');
} else {
  for (const r of results) {
    console.log(`${r.icon} [${r.role}${r.agent ? '/' + r.agent : ''}] ${r.title}`);
    console.log(r.text);
    console.log('---');
  }
}

if (online) console.log('RUN:online');
else console.log('RUN:offline');

db.close();
