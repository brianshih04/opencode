const fs = require('fs');
const path = require('path');
const os = require('os');

const BRIDGE_PATH = path.join(os.homedir(), '.opencode', 'bridge');
const STATUS_DIR = path.join(BRIDGE_PATH, 'outgoing', 'status');
const QUESTION_DIR = path.join(BRIDGE_PATH, 'outgoing', 'question');
const RUN_JSON = path.join(BRIDGE_PATH, 'run.json');
const HISTORY_FILE = path.join(__dirname, '..', 'history.json');
const MAX_HISTORY = 10;

// --- Read & delete new files from bridge ---
function readAndDelete(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(file => {
    const fp = path.join(dir, file);
    try { const d = JSON.parse(fs.readFileSync(fp, 'utf-8')); fs.unlinkSync(fp); return d; }
    catch { return null; }
  }).filter(Boolean);
}

// --- Load history ---
let history = [];
try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')); } catch {}
if (!Array.isArray(history)) history = [];

// --- Append new messages ---
const LEVEL_ICONS = { info: '🔵', warning: '🟡', error: '🔴' };
const statuses = readAndDelete(STATUS_DIR);
const questions = readAndDelete(QUESTION_DIR);

for (const s of statuses) {
  history.push({
    type: 'status',
    icon: LEVEL_ICONS[s.level] || '🔵',
    level: s.level,
    title: s.title,
    message: s.message,
    agent: s.agent || null,
    session_id: s.session_id ? s.session_id.slice(-12) : null,
    timestamp: s.timestamp,
    seen_at: Date.now(),
  });
}

for (const q of questions) {
  const choices = (q.choices || []).map(c => c.label);
  history.push({
    type: 'question',
    question_id: q.question_id,
    title: q.message || q.title,
    choices,
    session_id: q.session_id ? q.session_id.slice(-12) : null,
    timeout: (q.timeout_minutes || 30) * 60000 + Date.now(),
    timestamp: q.timestamp,
    seen_at: Date.now(),
  });
}

// Trim to last MAX_HISTORY
history = history.slice(-MAX_HISTORY);

// Expire old pending questions
const now = Date.now();
const pending = history.filter(h => h.type === 'question' && now < h.timeout);

// Save history
fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

// --- Check run.json ---
let runInfo = null;
if (fs.existsSync(RUN_JSON)) {
  try { runInfo = JSON.parse(fs.readFileSync(RUN_JSON, 'utf-8')); } catch {}
}

// --- Output ---
if (history.length > 0) {
  for (const h of history) {
    if (h.type === 'status') {
      console.log(`${h.icon} ${h.title} — ${h.message}${h.agent ? ' [' + h.agent + ']' : ''}`);
    } else {
      console.log(`🔴 ❓ ${h.title} → ${h.choices.join(' / ')} (qid:${h.question_id})`);
    }
  }
} else {
  console.log('NO_MESSAGES');
}

if (runInfo) {
  console.log(`RUN:pid=${runInfo.pid} branch=${runInfo.branch}`);
}

if (pending.length > 0) {
  console.log(`PENDING:${pending.length}`);
}
