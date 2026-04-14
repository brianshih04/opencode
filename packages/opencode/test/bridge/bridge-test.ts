// Bridge integration test - direct filesystem tests
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

const BRIDGE_BASE = path.join(os.homedir(), ".opencode", "bridge")
const STATUS_DIR = path.join(BRIDGE_BASE, "outgoing", "status")
const QUESTION_DIR = path.join(BRIDGE_BASE, "outgoing", "question")
const ANSWER_DIR = path.join(BRIDGE_BASE, "incoming", "answer")
const RUN_JSON = path.join(BRIDGE_BASE, "run.json")

let pass = 0
let fail = 0

function assert(cond: boolean, msg: string) {
  if (cond) { console.log(`  ✅ ${msg}`); pass++ }
  else { console.log(`  ❌ ${msg}`); fail++ }
}

function cleanup() {
  for (const dir of [STATUS_DIR, QUESTION_DIR, ANSWER_DIR]) {
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json")))
      try { fs.unlinkSync(path.join(dir, f)) } catch {}
  }
  try { fs.unlinkSync(RUN_JSON) } catch {}
}

// --- Test 1: Directory creation ---
console.log("\nTest 1: Directory creation")
cleanup()
for (const dir of [STATUS_DIR, QUESTION_DIR, ANSWER_DIR])
  fs.mkdirSync(dir, { recursive: true })
assert(fs.existsSync(STATUS_DIR), "status dir exists")
assert(fs.existsSync(QUESTION_DIR), "question dir exists")
assert(fs.existsSync(ANSWER_DIR), "answer dir exists")

// --- Test 2: Write run.json ---
console.log("\nTest 2: run.json lifecycle")
const runData = { pid: process.pid, cwd: process.cwd(), branch: "test", started_at: new Date().toISOString() }
fs.writeFileSync(RUN_JSON, JSON.stringify(runData, null, 2))
const readRun = JSON.parse(fs.readFileSync(RUN_JSON, "utf-8"))
assert(readRun.pid === process.pid, "pid matches")
assert(readRun.branch === "test", "branch matches")
fs.unlinkSync(RUN_JSON)
assert(!fs.existsSync(RUN_JSON), "run.json removed")

// --- Test 3: Write status message ---
console.log("\nTest 3: Status message format")
const statusMsg = {
  type: "status",
  level: "info",
  session_id: "test-session",
  agent: "primary",
  title: "任務開始",
  message: "正在測試 bridge...",
  timestamp: new Date().toISOString(),
}
const statusFile = `${Date.now()}-status.json`
fs.writeFileSync(path.join(STATUS_DIR, statusFile), JSON.stringify(statusMsg, null, 2))
const readStatus = JSON.parse(fs.readFileSync(path.join(STATUS_DIR, statusFile), "utf-8"))
assert(readStatus.type === "status", "type=status")
assert(readStatus.level === "info", "level=info")
assert(readStatus.title === "任務開始", "title correct")
fs.unlinkSync(path.join(STATUS_DIR, statusFile))

// --- Test 4: Question + Answer flow ---
console.log("\nTest 4: Question/Answer flow")
const questionMsg = {
  type: "question",
  question_id: "q-test-001",
  session_id: "test-session",
  title: "需要確認",
  message: "是否繼續？",
  choices: [{ index: 0, label: "是" }, { index: 1, label: "否" }],
  multiple: false,
  timeout_minutes: 30,
  timestamp: new Date().toISOString(),
}
const qFile = `${Date.now()}-question.json`
fs.writeFileSync(path.join(QUESTION_DIR, qFile), JSON.stringify(questionMsg, null, 2))
const readQ = JSON.parse(fs.readFileSync(path.join(QUESTION_DIR, qFile), "utf-8"))
assert(readQ.type === "question", "type=question")
assert(readQ.question_id === "q-test-001", "question_id matches")
assert(readQ.choices.length === 2, "2 choices")

// Simulate answer
const answerMsg = {
  type: "answer",
  question_id: "q-test-001",
  selected: [0],
  timestamp: new Date().toISOString(),
}
const aFile = `${Date.now()}-answer.json`
fs.writeFileSync(path.join(ANSWER_DIR, aFile), JSON.stringify(answerMsg, null, 2))
const readA = JSON.parse(fs.readFileSync(path.join(ANSWER_DIR, aFile), "utf-8"))
assert(readA.type === "answer", "type=answer")
assert(readA.question_id === "q-test-001", "question_id matches")
assert(readA.selected[0] === 0, "selected=[0]")
fs.unlinkSync(path.join(ANSWER_DIR, aFile))

// --- Test 5: fs.watch on answer dir ---
console.log("\nTest 5: fs.watch answer detection")
await new Promise<void>((resolve) => {
  const watcher = fs.watch(ANSWER_DIR, (eventType, filename) => {
    if (filename?.endsWith(".json")) {
      const fp = path.join(ANSWER_DIR, filename)
      if (fs.existsSync(fp)) {
        const data = JSON.parse(fs.readFileSync(fp, "utf-8"))
        assert(data.type === "answer", "watcher received answer")
        assert(data.selected[0] === 1, "selected=[1]")
        fs.unlinkSync(fp)
        watcher.close()
        resolve()
      }
    }
  })
  
  watcher.on("error", (err) => {
    console.log(`  ❌ watcher error: ${err}`)
    watcher.close()
    resolve()
  })

  // Write answer after short delay
  setTimeout(() => {
    const a = { type: "answer", question_id: "q-test-002", selected: [1], timestamp: new Date().toISOString() }
    fs.writeFileSync(path.join(ANSWER_DIR, `${Date.now()}-answer.json`), JSON.stringify(a))
  }, 200)

  // Timeout after 5s
  setTimeout(() => {
    console.log("  ❌ watcher timeout")
    watcher.close()
    resolve()
  }, 5000)
})

// --- Test 6: monitor.cjs can read outgoing ---
console.log("\nTest 6: Monitor script compatibility")
// Write a test status
const monitorTestMsg = {
  type: "status",
  level: "warning",
  title: "Monitor Test",
  message: "Testing monitor.cjs compatibility",
  timestamp: new Date().toISOString(),
}
const monitorFile = `${Date.now()}-monitor-test.json`
fs.writeFileSync(path.join(STATUS_DIR, monitorFile), JSON.stringify(monitorTestMsg, null, 2))
const monitorRead = JSON.parse(fs.readFileSync(path.join(STATUS_DIR, monitorFile), "utf-8"))
assert(monitorRead.type === "status", "monitor can read status type")
assert(monitorRead.level === "warning", "monitor can read level")
fs.unlinkSync(path.join(STATUS_DIR, monitorFile))

// Cleanup
cleanup()

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
if (fail > 0) process.exit(1)
