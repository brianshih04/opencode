const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/Brian/.local/share/opencode/opencode-local.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables);
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(`\n${t.name}: ${cols.map(c => c.name).join(', ')}`);
}
db.close();
