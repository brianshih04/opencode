// Write an answer to OpenCode bridge incoming/answer/
// Usage: node answer.cjs <question_id> <selected_index_0> [selected_index_1] ...
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node answer.cjs <question_id> <selected_index_0> [selected_index_1] ...');
  process.exit(1);
}

const questionId = args[0];
const selected = args.slice(1).map(Number);

const BRIDGE_PATH = process.env.OC_BRIDGE_PATH || path.join(os.homedir(), '.opencode', 'bridge');
const ANSWER_DIR = path.join(BRIDGE_PATH, 'incoming', 'answer');

fs.mkdirSync(ANSWER_DIR, { recursive: true });

const answer = {
  type: 'answer',
  question_id: questionId,
  selected,
  timestamp: new Date().toISOString(),
};

const filename = `${Date.now()}-answer.json`;
fs.writeFileSync(path.join(ANSWER_DIR, filename), JSON.stringify(answer, null, 2));
console.log(`Answer written: question_id=${questionId} selected=[${selected}]`);
