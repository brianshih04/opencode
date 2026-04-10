# OpenCode Fork 架構修復 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 修復 OpenCode fork 中 21 個架構問題（4 critical、4 high、7 medium、6 low），讓自訂工具穩定可用。

**Architecture:** 按優先級分 4 個 phase 修復。Phase 1 修一行 import 的 bug（最大影響最小成本），Phase 2 修安全漏洞，Phase 3 修功能邏輯，Phase 4 清理技術債。每個 task 獨立可 commit。

**Tech Stack:** Bun 1.3.11、TypeScript 5.8.2、Effect v4 beta.43、Zod 4.1.8

**Testing:** 從 `packages/opencode` 執行 `bun typecheck` 和 `bun test --timeout 30000`

---

## Phase 1: Critical Fixes（最大影響 / 最小改動）

### Task 1: 修正 task-mgmt.ts 的錯誤 import

**Objective:** 修復 task-mgmt.ts 第 3 行引用了錯誤的描述檔，導致 LLM 收到 Task（子 agent）工具的說明而非 Task Management 工具的說明。

**Files:**
- Modify: `packages/opencode/src/tool/task-mgmt.ts:3`

**Step 1: 驗證目前的 import 指向錯誤檔案**

```bash
cd /mnt/d/Projects/opencode
head -3 packages/opencode/src/tool/task-mgmt.ts
# 預期看到: import DESCRIPTION from "./task.txt"
```

確認 `task.txt` 是 Task 子 agent 工具的描述，而 `task-mgmt.txt` 才是 Task Management 工具的正確描述。

**Step 2: 修正 import**

將第 3 行：
```typescript
import DESCRIPTION from "./task.txt"
```
改為：
```typescript
import DESCRIPTION from "./task-mgmt.txt"
```

**Step 3: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

預期：通過

**Step 4: Commit**

```bash
git add packages/opencode/src/tool/task-mgmt.ts
git commit -m "fix(task-mgmt): import correct description file task-mgmt.txt instead of task.txt"
```

---

### Task 2: 修正 swarm.ts leader mode 忽略 params.agent 的 bug

**Objective:** 修復 swarm.ts 第 131 行寫死 `Agent.get("build")` 而忽略了使用者傳入的 `params.agent` 參數。

**Files:**
- Modify: `packages/opencode/src/tool/swarm.ts:131`

**Step 1: 確認 bug 位置**

第 131 行目前是：
```typescript
const agent = await Agent.get("build") ?? await Agent.get("general")
```

`agentName` 在第 109 行已經正確解析了 `params.agent ?? "general"`，但第 131 行沒有使用它。

**Step 2: 修正 agent 解析**

將第 131 行：
```typescript
const agent = await Agent.get("build") ?? await Agent.get("general")
```
改為：
```typescript
const agent = await Agent.get(agentName) ?? await Agent.get("general")
```

**Step 3: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 4: Commit**

```bash
git add packages/opencode/src/tool/swarm.ts
git commit -m "fix(swarm): use params.agent in leader mode instead of hardcoded 'build'"
```

---

### Task 3: 修正 swarm.ts JSON 解析的貪婪正則

**Objective:** 修復 swarm.ts 第 153 行的 `match(/\[[\s\S]*\]/)` 會匹配到最後一個 `]`（跨多個 JSON 物件），應改為匹配第一個完整的 JSON 陣列。

**Files:**
- Modify: `packages/opencode/src/tool/swarm.ts:153`

**Step 1: 確認 bug 位置**

第 153 行目前是：
```typescript
const jsonMatch = planText.match(/\[[\s\S]*\]/)
```

問題：`[\s\S]*` 是貪婪量詞，如果 LLM 回覆包含多個 `[...]` 區塊或有 markdown 格式，會匹配到最後一個 `]`，導致 JSON.parse 失敗或解析出錯誤內容。

**Step 2: 改用安全的 JSON 解析策略**

將第 152-157 行：
```typescript
  try {
    const jsonMatch = planText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error("No JSON array found in leader response")
    subtasks = JSON.parse(jsonMatch[0])
```
改為：
```typescript
  try {
    // Find the first '[' then match to its closing ']' using bracket counting
    const start = planText.indexOf("[")
    if (start === -1) throw new Error("No JSON array found in leader response")
    let depth = 0
    let end = start
    for (let i = start; i < planText.length; i++) {
      if (planText[i] === "[") depth++
      else if (planText[i] === "]") depth--
      if (depth === 0) { end = i; break }
    }
    const jsonStr = planText.slice(start, end + 1)
    subtasks = JSON.parse(jsonStr)
```

這樣用括號計數法找到第一個完整陣列，不會被貪婪正則搞砸。

**Step 3: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 4: Commit**

```bash
git add packages/opencode/src/tool/swarm.ts
git commit -m "fix(swarm): use bracket-counting JSON parser instead of greedy regex"
```

---

### Task 4: 啟動 cron 排程器

**Objective:** CronScheduler 被匯出但從未被 import，導致 cron 排程完全不會執行。需要在初始化點啟動排程迴圈。

**Files:**
- Create: `packages/opencode/src/tool/cron-scheduler.ts`
- Modify: `packages/opencode/src/tool/registry.ts`（import 並啟動）
- Modify: `packages/opencode/src/tool/cron.ts`（加上 interval 支援）

**Step 1: 在 cron.ts 新增 startScheduler 函式**

在 `packages/opencode/src/tool/cron.ts` 檔案末尾（第 203 行之前，`CronScheduler` export 之前）新增：

```typescript
// ---- Scheduler ----
let schedulerInterval: ReturnType<typeof setInterval> | null = null

function startScheduler(): void {
  if (schedulerInterval) return // already running
  const CHECK_INTERVAL_MS = 60_000 // check every minute

  schedulerInterval = setInterval(() => {
    const tasks = readTasks()
    const now = new Date()
    for (const task of tasks) {
      const parsed = parseCron(task.cron)
      if (!parsed) continue
      if (matchesCron(parsed, now)) {
        // Fire task (log for now — actual execution via Session later)
        task.lastFiredAt = Date.now()
        if (!task.recurring) {
          // Remove one-shot tasks after firing
          const idx = tasks.indexOf(task)
          if (idx >= 0) tasks.splice(idx, 1)
        }
      }
    }
    writeTasks(tasks)
  }, CHECK_INTERVAL_MS)
}
```

然後在 `CronScheduler` export 中加上 `startScheduler`：
```typescript
export const CronScheduler = {
  parseCron,
  matchesCron,
  readTasks,
  writeTasks,
  startScheduler,
}
```

**Step 2: 在 registry.ts 初始化時啟動排程器**

在 `packages/opencode/src/tool/registry.ts` 的 import 區塊（約第 34 行之後）新增：
```typescript
// Start cron scheduler on load
import { CronScheduler as Cron } from "./cron"
Cron.startScheduler()
```

**Step 3: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 4: Commit**

```bash
git add packages/opencode/src/tool/cron.ts packages/opencode/src/tool/registry.ts
git commit -m "feat(cron): start scheduler loop on registry init, fire recurring/one-shot tasks"
```

---

## Phase 2: Security Fixes（安全漏洞）

### Task 5: 修正 send_message.ts 路徑穿越漏洞

**Objective:** `params.to` 未做 sanitize，攻擊者可以傳入 `../../../etc/passwd` 寫到任意位置。

**Files:**
- Modify: `packages/opencode/src/tool/send_message.ts:30-32`

**Step 1: 確認漏洞**

`mailboxPath()` 直接用 `path.join(MAILBOX_DIR, \`${agent}.json\`)`，如果 `agent` 包含 `../` 就可以逃出 MAILBOX_DIR。

**Step 2: 新增 sanitize 函式**

在 `mailboxPath` 函式之後（約第 33 行）新增 sanitize：

```typescript
function sanitizeAgentName(name: string): string {
  // Only allow alphanumeric, dash, underscore
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "")
  if (!safe || safe.length > 64) {
    throw new Error(`Invalid agent name: ${name}`)
  }
  return safe
}
```

**Step 3: 在所有使用 agent name 的地方加入 sanitize**

修改 `mailboxPath`：
```typescript
function mailboxPath(agent: string): string {
  return path.join(MAILBOX_DIR, `${sanitizeAgentName(agent)}.json`)
}
```

修改 `readMailbox` 和 `writeMailbox` 的呼叫處，在 `handleDirect` 函式中（第 94-122 行），在呼叫 readMailbox/writeMailbox 前 sanitize `to`：
```typescript
async function handleDirect(
  from: string,
  to: string,
  content: string,
  summary: string | undefined,
  timestamp: string,
) {
  const safeTo = sanitizeAgentName(to)
  const msg: Message = {
    id: generateMsgId(),
    from,
    to: safeTo,
    content,
    summary,
    timestamp,
    read: false,
  }

  const mailbox = await readMailbox(safeTo)
  mailbox.push(msg)
  if (mailbox.length > 100) mailbox.splice(0, mailbox.length - 100)
  await writeMailbox(safeTo, mailbox)

  return {
    output: `✉️ Message sent to @${safeTo}\nFrom: @${from}\n${summary ? `Summary: ${summary}\n` : ""}Content: ${content.slice(0, 500)}`,
    title: `Message → @${safeTo}`,
    metadata: { messageId: msg.id, from, to: safeTo } as Record<string, unknown>,
  }
}
```

**Step 4: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 5: Commit**

```bash
git add packages/opencode/src/tool/send_message.ts
git commit -m "fix(send_message): sanitize agent name to prevent path traversal"
```

---

### Task 6: 修正 send_message.ts TOCTOU 競態條件

**Objective:** readMailbox → modify → writeMailbox 無鎖定，並發寫入可能丟失訊息。

**Files:**
- Modify: `packages/opencode/src/tool/send_message.ts`

**Step 1: 新增簡易的檔案鎖機制**

在 `writeMailbox` 函式之後（約第 47 行後）新增：

```typescript
const locks = new Map<string, Promise<void>>()

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Chain on previous operation for same key
  const prev = locks.get(key) ?? Promise.resolve()
  let resolve!: () => void
  const next = new Promise<void>((r) => { resolve = r })
  locks.set(key, next)
  await prev
  try {
    return await fn()
  } finally {
    resolve()
    if (locks.get(key) === next) locks.delete(key)
  }
}
```

**Step 2: 包裝 readMailbox + writeMailbox 呼叫**

修改 `handleDirect` 中的讀寫邏輯：
```typescript
  await withLock(safeTo, async () => {
    const mailbox = await readMailbox(safeTo)
    mailbox.push(msg)
    if (mailbox.length > 100) mailbox.splice(0, mailbox.length - 100)
    await writeMailbox(safeTo, mailbox)
  })
```

修改 `handleBroadcast` 中的讀寫邏輯（for 迴圈內）：
```typescript
  for (const agent of agents) {
    await withLock(agent, async () => {
      const mailbox = await readMailbox(agent)
      mailbox.push({ ...msg, to: agent })
      if (mailbox.length > 100) mailbox.splice(0, mailbox.length - 100)
      await writeMailbox(agent, mailbox)
    })
  }
```

同樣修改 `getMessagesFor`：
```typescript
export async function getMessagesFor(agent: string, markRead = true): Promise<Message[]> {
  return withLock(agent, async () => {
    const mailbox = await readMailbox(agent)
    const unread = mailbox.filter(m => !m.read)
    if (markRead && unread.length > 0) {
      for (const m of mailbox) m.read = true
      await writeMailbox(agent, mailbox)
    }
    return unread.length > 0 ? unread : mailbox.slice(-20)
  })
}
```

**Step 3: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 4: Commit**

```bash
git add packages/opencode/src/tool/send_message.ts
git commit -m "fix(send_message): add per-mailbox locking to prevent TOCTOU race"
```

---

### Task 7: 修正 ultraplan.ts 的 bash 權限漏洞

**Objective:** ultraplan 給了 bash `allow *` 但 deny edit/write，但 bash 可以 `echo > file` 繞過。正確做法是限制 bash 為 read-only 命令。

**Files:**
- Modify: `packages/opencode/src/tool/ultraplan.ts:61-65`

**Step 1: 確認問題**

第 61-65 行：
```typescript
{
  permission: "bash" as const,
  pattern: "*" as const,
  action: "allow" as const,
},
```

這給了無限制的 bash 權限。雖然下面 deny 了 edit 和 write，但 `bash -c "echo data > file"` 完全繞過。

**Step 2: 改用 tools 白名單控制（更安全）**

ultraplan 已經在第 137-146 行有 tools 白名單：
```typescript
tools: {
  read: true,
  glob: true,
  grep: true,
  bash: true,
  edit: false,
  write: false,
  task: false,
  todowrite: false,
},
```

但 permissions 陣列仍然給了 bash full access。修正方式：移除 bash allow，改為只允許 read-only bash：

將 permission 陣列中的 bash rule（第 61-65 行）改為：
```typescript
{
  permission: "bash" as const,
  pattern: "^(cat|head|tail|ls|find|grep|rg|wc|sort|uniq|diff|git log|git diff|git show|git status|file|which|echo|pwd|stat|tree|du|npm list|bun pm ls)" as const,
  action: "allow" as const,
},
{
  permission: "bash" as const,
  pattern: "*" as const,
  action: "deny" as const,
},
```

注意：如果 OpenCode 的 permission pattern 不支持 regex，則替代方案是直接把 tools.bash 改為 false，讓 ultraplan 只用 read/glob/grep：

```typescript
tools: {
  read: true,
  glob: true,
  grep: true,
  bash: false,
  edit: false,
  write: false,
  task: false,
  todowrite: false,
},
```

並刪除 permission 陣列中的 bash rule。

**以刪除 bash 為優先方案**（更簡單、更安全），因為 read/glob/grep 已經足夠 ultraplan 做分析了。

**Step 3: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 4: Commit**

```bash
git add packages/opencode/src/tool/ultraplan.ts
git commit -m "fix(ultraplan): remove bash permission to prevent edit/write bypass, read/glob/grep sufficient for planning"
```

---

### Task 8: 修正 task-mgmt.ts nextId 競態條件

**Objective:** `initIdCounter` 是 async 的，在第 92 行 fire-and-forget。如果模組載入後立即呼叫 `execute()`，`nextId` 可能還是 1（即使已有 task 10+），導致 ID 衝突。

**Files:**
- Modify: `packages/opencode/src/tool/task-mgmt.ts:76-92`

**Step 1: 確認問題**

```typescript
let nextId = 1

function generateId(): string {
  return String(nextId++)
}

async function initIdCounter(): Promise<void> {
  const tasks = await listAllTasks()
  if (tasks.length > 0) {
    const maxId = Math.max(...tasks.map(t => parseInt(t.id) || 0))
    nextId = maxId + 1
  }
}

initIdCounter().catch(() => {})
```

問題：`initIdCounter()` 是 async 但沒有 await，`generateId()` 可能在 `initIdCounter` 完成前被呼叫。

**Step 2: 用 Promise gate 解決**

將第 76-92 行替換為：

```typescript
let nextId = 1
let idReady: Promise<void>

function generateId(): Promise<string> {
  return idReady.then(() => String(nextId++))
}

function initIdCounter(): Promise<void> {
  return listAllTasks().then((tasks) => {
    if (tasks.length > 0) {
      const maxId = Math.max(...tasks.map(t => parseInt(t.id) || 0))
      nextId = maxId + 1
    }
  })
}

idReady = initIdCounter().catch(() => {})
```

**Step 3: 更新 handleCreate 使用 async generateId**

將 `handleCreate` 第 159 行：
```typescript
const id = generateId()
```
改為：
```typescript
const id = await generateId()
```

**Step 4: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 5: Commit**

```bash
git add packages/opencode/src/tool/task-mgmt.ts
git commit -m "fix(task-mgmt): await id counter init before generating IDs to prevent collisions"
```

---

## Phase 3: Medium Severity Fixes（功能改善）

### Task 9: 移除 swarm.ts TaskTracker 死碼

**Objective:** TaskTracker 的 `sendMessage()` 和 `getMessages()` 方法從未被呼叫（功能已由 send_message 工具取代），是死碼。

**Files:**
- Modify: `packages/opencode/src/tool/swarm.ts:23,38-48`

**Step 1: 刪除 messageStore 及相關方法**

移除第 23 行：
```typescript
  private messageStore: Map<string, Array<{ from: string; message: string; time: number }>> = new Map()
```

移除第 38-48 行的 `sendMessage` 和 `getMessages` 方法。

**Step 2: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 3: Commit**

```bash
git add packages/opencode/src/tool/swarm.ts
git commit -m "refactor(swarm): remove dead message code from TaskTracker (handled by send_message tool)"
```

---

### Task 10: 修正 swarm.ts ctx 型別從 any 改為正確型別

**Objective:** `executeLeaderMode` 和 `executeParallelMode` 的 `ctx` 參數型別是 `any`，違反 AGENTS.md 的 no-any 規範。

**Files:**
- Modify: `packages/opencode/src/tool/swarm.ts:106,208`

**Step 1: 找到 ToolContext 型別定義**

在 tool.ts 或 registry.ts 中找到 `ToolContext` 或 `Tool.Ctx` 型別。查看 `execute(params, ctx)` 中 `ctx` 的使用方式：
- `ctx.sessionID`
- `ctx.messageID`
- `ctx.agent`

**Step 2: 定義適當的 ctx 介面**

在 swarm.ts 頂部新增：
```typescript
interface SwarmContext {
  sessionID: string
  messageID?: string
  agent?: string
  ask: (req: any) => Promise<any>
  metadata: (meta: any) => void
  abort?: AbortSignal
}
```

將第 106 行和第 208 行的 `ctx: any` 改為 `ctx: SwarmContext`。

如果專案已有 `ToolContext` 型別（在 `tool.ts` 中），直接 import 使用：
```typescript
import type { ToolContext } from "./tool"
```

**Step 3: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 4: Commit**

```bash
git add packages/opencode/src/tool/swarm.ts
git commit -m "refactor(swarm): type ctx parameter instead of any"
```

---

### Task 11: 修正 memory/index.ts Bus.subscribe 訂閱洩漏

**Objective:** `initDreamOnCompaction()` 呼叫 `Bus.subscribe()` 但回傳值（unsubscribe）被丟棄，永遠無法取消訂閱。

**Files:**
- Modify: `packages/opencode/src/memory/index.ts:183-196`

**Step 1: 確認問題**

第 185 行：
```typescript
Bus.subscribe(SessionCompaction.Event.Compacted, (event) => { ... })
```

回傳的 unsubscribe 函式被丟棄。如果這個 module 被多次載入或需要清理，訂閱會洩漏。

**Step 2: 儲存 unsubscribe 引用**

修改 `initDreamOnCompaction`：
```typescript
let dreamUnsubscribe: (() => void) | null = null

export function initDreamOnCompaction(): void {
  if (dreamUnsubscribe) return // already registered
  try {
    dreamUnsubscribe = Bus.subscribe(SessionCompaction.Event.Compacted, (event) => {
      const sessionID = event.properties.sessionID
      log.info("compaction detected, triggering dream", { sessionID })
      dream(sessionID).catch((err) => {
        log.info("dream error", { sessionID, error: String(err) })
      })
    })
    log.info("dream-on-compaction listener registered")
  } catch (err) {
    log.info("failed to register dream listener", { error: String(err) })
  }
}

export function stopDreamOnCompaction(): void {
  if (dreamUnsubscribe) {
    dreamUnsubscribe()
    dreamUnsubscribe = null
  }
}
```

**Step 3: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 4: Commit**

```bash
git add packages/opencode/src/memory/index.ts
git commit -m "fix(memory): store Bus.subscribe unsubscribe reference to prevent subscription leak"
```

---

### Task 12: 修正 memory_search.ts 硬編碼 python 路徑

**Objective:** `Bun.spawnSync(["python", ...])` 在某些系統上 `python` 指向 Python 2，應改為 `python3`。且缺少 `MEMPALACE_PATH` 環境變數。

**Files:**
- Modify: `packages/opencode/src/tool/memory_search.ts:23-27`

**Step 1: 修正 python 命令和加上 MEMPALACE_PATH**

將第 23-27 行：
```typescript
const proc = Bun.spawnSync(["python", ...args], {
  stdout: "pipe",
  stderr: "pipe",
  timeout: 15_000,
})
```
改為：
```typescript
import os from "os"
import p from "path"

// 在檔案頂部新增 helper
function mempalacePath(): string {
  return process.env.MEMPALACE_PATH || p.join(os.homedir(), ".mempalace", "palace")
}

// 修改 spawnSync
const proc = Bun.spawnSync(["python3", ...args], {
  stdout: "pipe",
  stderr: "pipe",
  timeout: 15_000,
  env: { ...process.env, MEMPALACE_PATH: mempalacePath(), PYTHONIOENCODING: "utf-8" },
})
```

**Step 2: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 3: Commit**

```bash
git add packages/opencode/src/tool/memory_search.ts
git commit -m "fix(memory_search): use python3 and pass MEMPALACE_PATH env"
```

---

### Task 13: 修正 send_message.ts 廣播訊息共享 ID

**Objective:** handleBroadcast 中所有收件人共用同一個 `msgId`，導致前端無法區分不同收件人收到的訊息。

**Files:**
- Modify: `packages/opencode/src/tool/send_message.ts:155-169`

**Step 1: 確認問題**

第 155 行：
```typescript
const msgId = generateMsgId()
```

然後 for 迴圈中所有 agent 的訊息都用同一個 `msgId`。

**Step 2: 為每個收件人生成獨立 ID**

修改 for 迴圈：
```typescript
  for (const agent of agents) {
    const msg: Message = {
      id: generateMsgId(), // 每個收件人獨立 ID
      from,
      to: agent,
      content,
      summary,
      timestamp,
      read: false,
    }
    const mailbox = await readMailbox(agent)
    mailbox.push(msg)
    if (mailbox.length > 100) mailbox.splice(0, mailbox.length - 100)
    await writeMailbox(agent, mailbox)
  }
```

注意：`to` 也從 `"*"` 改為實際的 `agent` 名稱，方便收件人知道這是給自己的。

**Step 3: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 4: Commit**

```bash
git add packages/opencode/src/tool/send_message.ts
git commit -m "fix(send_message): generate unique msg ID per broadcast recipient"
```

---

## Phase 4: Low Severity（清理技術債）

### Task 14: 清理 package.json 無用 script 和 randomField

**Objective:** 移除 `random` script 和 `randomField` 欄位。

**Files:**
- Modify: `packages/opencode/package.json:17,28`

**Step 1: 刪除第 17 行 random script**

移除：
```json
    "random": "echo 'Random script updated at $(date)' && echo 'Change queued successfully' && echo 'Another change made' && echo 'Yet another change' && echo 'One more change' && echo 'Final change' && echo 'Another final change' && echo 'Yet another final change'",
```

**Step 2: 刪除第 28 行 randomField**

移除：
```json
  "randomField": "this-is-a-random-value-12345",
```

**Step 3: 驗證 JSON 合法**

```bash
cd packages/opencode && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" && echo "valid"
```

**Step 4: Commit**

```bash
git add packages/opencode/package.json
git commit -m "chore: remove useless random script and randomField from package.json"
```

---

### Task 15: 統一 cron.ts 描述檔載入方式

**Objective:** cron.ts 用 `fs.readFileSync` 載入描述，其他工具都用 `import`。統一為 import 方式。

**Files:**
- Modify: `packages/opencode/src/tool/cron.ts:1-7`

**Step 1: 修改 import**

將第 1-7 行：
```typescript
import { Tool } from "./tool"
import path from "path"
import fs from "fs"
import os from "os"
import z from "zod"

const DESCRIPTION = fs.readFileSync(path.join(__dirname, "cron.txt"), "utf-8")
```
改為：
```typescript
import { Tool } from "./tool"
import path from "path"
import fs from "fs"
import os from "os"
import z from "zod"
import DESCRIPTION from "./cron.txt"
```

注意：`fs` 仍然被 `readTasks()` 和 `writeTasks()` 使用，所以 import 保留。

**Step 2: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 3: Commit**

```bash
git add packages/opencode/src/tool/cron.ts
git commit -m "refactor(cron): use import for description file instead of readFileSync"
```

---

### Task 16: 修正 skill.ts 靜態+動態描述重複

**Objective:** `SkillTool` 的 `Tool.define` 回呼中動態生成 description（第 14-33 行），同時又有 `SkillDescription` 的 `Tool.DynamicDescription`（第 102-120 行）做幾乎一樣的事。動態描述應由 DynamicDescription 負責，Tool.define 中的 description 應為靜態字串。

**Files:**
- Modify: `packages/opencode/src/tool/skill.ts:14-33`

**Step 1: 簡化 Tool.define 中的 description**

將第 14-33 行的動態 description 生成改為靜態 fallback：
```typescript
export const SkillTool = Tool.define("skill", async () => {
  return {
    description: "Load a specialized skill that provides domain-specific instructions and workflows. See dynamic description for available skills.",
    parameters: Parameters,
    async execute(params: z.infer<typeof Parameters>, ctx) {
```

**Step 2: 確認 SkillDescription 已被 registry 使用**

檢查 `registry.ts` 中 `SkillTool` 和 `SkillDescription` 的使用方式。確認 registry 有用 `SkillDescription` 做動態描述注入。

**Step 3: 驗證 typecheck 通過**

```bash
cd packages/opencode && bun typecheck
```

**Step 4: Commit**

```bash
git add packages/opencode/src/tool/skill.ts
git commit -m "refactor(skill): remove duplicated dynamic description from Tool.define, keep DynamicDescription"
```

---

## Summary

| Phase | Tasks | Issues Fixed | Severity |
|-------|-------|-------------|----------|
| 1 | Task 1-4 | #1,#2,#3,#4 | 🔴 Critical |
| 2 | Task 5-8 | #5,#6,#7,#8 | 🟠 High |
| 3 | Task 9-13 | #9,#10,#11,#12,#16 | 🟡 Medium |
| 4 | Task 14-16 | #18,#19,#20,#21 | 🟢 Low |

**注意：** Issue #10（raw fs 繞過 Effect）、#13（全域訂閱 vs per-Instance）、#14（wakeUp 同步阻塞）、#15（dream lock 競態）需要更大的重構，建議獨立規劃，不在本次修復範圍內。

**執行方式：** 每個 Task 用 subagent 執行，完成後做 spec compliance review + code quality review，通過後才進入下一個 Task。
