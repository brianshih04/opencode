// Send a message to OpenCode via bridge incoming/prompt directory
// Usage: node ocwrite.cjs "your message here"
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const message = process.argv.slice(2).join(' ');
if (!message) {
  console.log('Usage: node ocwrite.cjs "your message"');
  process.exit(1);
}

// Check OpenCode is running
const RUN_JSON = path.join(os.homedir(), '.opencode', 'bridge', 'run.json');
if (!fs.existsSync(RUN_JSON)) {
  console.log('❌ OpenCode is not running');
  process.exit(1);
}

// Find active session from DB
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/Brian/.local/share/opencode/opencode-local.db');
const session = db.prepare(`
  SELECT id, title FROM session 
  WHERE time_archived IS NULL
  ORDER BY time_updated DESC LIMIT 1
`).get();
db.close();

if (!session) {
  console.log('❌ No active session found');
  process.exit(1);
}

// Write prompt file to incoming/prompt/
const promptDir = path.join(os.homedir(), '.opencode', 'bridge', 'incoming', 'prompt');
fs.mkdirSync(promptDir, { recursive: true });

const id = Date.now() + '-' + crypto.randomUUID();
const promptMsg = {
  type: 'prompt',
  session_id: session.id,
  message,
  timestamp: new Date().toISOString(),
};

const filepath = path.join(promptDir, id + '.json');
fs.writeFileSync(filepath, JSON.stringify(promptMsg, null, 2));

console.log(`✅ Sent to: ${session.title || session.id.slice(0, 12)}`);
console.log(`👤 ${message}`);
