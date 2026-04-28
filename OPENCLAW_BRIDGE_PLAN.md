# OpenCode ↔ OpenClaw 通訊橋接規劃書 v2

## 目標

讓布萊恩能從手機（Telegram）即時掌握 OpenCode 執行狀況，並回覆 OpenCode 的問題。
OpenCode 為主動執行者，OpenClaw 為通訊中介。

## 設計原則

1. **零侵入** — Bridge 是附加層，不影響任何現有 Terminal 行為
2. **純檔案 IPC** — 不引入網路依賴，用 JSON 檔案做 mailbox
3. **Event-driven** — 統一訂閱 Bus event，不散落手動呼叫
4. **Race semantics** — Terminal 和 Telegram 並行等待，先到先贏
5. **離線容錯** — Telegram/OpenClaw 掛了不影響 OpenCode 運作

---

## 進程發現與監看

### OpenCode 端

OpenCode 啟動時在 bridge 目錄寫入 `run.json`：

```json
{
  "pid": 12345,
  "cwd": "D:\\Projects\\opencode",
  "branch": "dev_0411_2",
  "started_at": "2026-04-13T08:00:00Z"
}
```

正常關閉時刪除。殘留時 OpenClaw 可透過檢查 PID 是否存活判斷。

### OpenClaw 端

布萊恩說「監看 OpenCode」或 `/ocbridge watch` 時：

1. 掃描 `~/.opencode/bridge/` 下所有 `run.json`
2. **若有多個實例**，列出清單讓使用者選擇：
```
偵測到多個 OpenCode 實例：
1. PID 12345 — D:\Projects\opencode (3 分鐘前啟動)
2. PID 67890 — D:\Projects\my-app (剛剛啟動)

要監看哪個？
[1] [2] [全部]
```
3. 使用者選擇後開始監聽對應的 outgoing 目錄
4. OpenCode 關閉 → `run.json` 消失 → 自動停止並通知

指令：
- `/ocbridge start [path]` — 在指定目錄啟動 OpenCode 並自動監看
- `/ocbridge watch` — 掃描並選擇要監看的已存在 OpenCode
- `/ocbridge status` — 目前監看狀態
- `/ocbridge switch` — 中途切換監看其他實例（重新列出選單）
- `/ocbridge stop` — 停止監看（不關閉 OpenCode）
- `/ocbridge kill` — 停止監看並關閉 OpenCode 進程

---

## 架構

```
┌──────────┐     Telegram      ┌───────────┐     Mailbox      ┌──────────┐
│  手機     │ ◄──────────────► │  OpenClaw  │ ◄──────────────► │ OpenCode │
│ (布萊恩)  │   Inline KB      │  (小龍)    │   JSON 檔案      │ (Agent)  │
└──────────┘   訊息/按鈕       └───────────┘   雙向讀寫        └──────────┘
```

### 通訊協定：Mailbox（檔案系統 IPC）

共用目錄：`~/.opencode/bridge/`

```
bridge/
├── run.json           ← 進程資訊（PID、cwd、啟動時間）
├── outgoing/          ← OpenCode 寫，OpenClaw 讀後刪
│   ├── status/        ← 狀態推播
│   └── question/      ← HITL 問題
└── incoming/          ← OpenClaw 寫，OpenCode 讀後刪
    └── answer/        ← 使用者回覆
```

### 訊息格式

所有訊息為 JSON 檔案，檔名 = `{timestamp}-{uuid}.json`

#### Status 推播（outgoing/status/）

```json
{
  "type": "status",
  "level": "info" | "warning" | "error",
  "session_id": "abc123",
  "agent": "primary",
  "title": "任務開始",
  "message": "正在重構 auth 模組...",
  "timestamp": "2026-04-13T08:00:00Z"
}
```

#### Question 推播（outgoing/question/）

```json
{
  "type": "question",
  "question_id": "q-uuid-001",
  "session_id": "abc123",
  "title": "需要確認",
  "message": "是否要刪除舊的 auth cache？",
  "choices": [
    { "index": 0, "label": "是，刪除" },
    { "index": 1, "label": "否，保留" }
  ],
  "multiple": false,
  "timeout_minutes": 30,
  "timestamp": "2026-04-13T08:00:00Z"
}
```

#### Answer 回覆（incoming/answer/）

```json
{
  "type": "answer",
  "question_id": "q-uuid-001",
  "selected": [0],
  "timestamp": "2026-04-13T08:02:00Z"
}
```

---

## 實作分工

### Part A：OpenCode 端（需改 OpenCode 原始碼）

#### A1. Bridge Service — `packages/opencode/src/bridge/`

採用 codebase 現有的 **ServiceMap.Service + Layer.effect** pattern，與 SessionStatus、Bus 等服務一致。

**`bridge/schema.ts`** — Zod schema 定義

```typescript
import z from "zod"

export const StatusMessage = z.object({
  type: z.literal("status"),
  level: z.enum(["info", "warning", "error"]),
  session_id: z.string(),
  agent: z.string(),
  title: z.string(),
  message: z.string(),
  timestamp: z.string(),
})

export const QuestionMessage = z.object({
  type: z.literal("question"),
  question_id: z.string(),
  session_id: z.string(),
  title: z.string(),
  message: z.string(),
  choices: z.array(z.object({ index: z.number(), label: z.string() })),
  multiple: z.boolean(),
  timeout_minutes: z.number(),
  timestamp: z.string(),
})

export const AnswerMessage = z.object({
  type: z.literal("answer"),
  question_id: z.string(),
  selected: z.array(z.number()),
  timestamp: z.string(),
})
```

**`bridge/index.ts`** — Effect Service 定義

```typescript
import { Effect, Layer, ServiceMap } from "effect"
import { Deferred } from "effect"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { v4 as uuid } from "uuid"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Log } from "@/util/log"
import { InstanceState } from "@/effect/instance-state"
import { StatusMessage, QuestionMessage, AnswerMessage } from "./schema"

export namespace Bridge {
  const log = Log.create({ service: "bridge" })

  // ---- Config ----
  interface BridgeConfig {
    enabled: boolean
    path: string
  }

  // ---- Pending Questions (Deferred map) ----
  type PendingQuestion = {
    deferred: Deferred.Deferred<number[], never>
    timeoutMs: number
    createdAt: number
  }

  export interface Interface {
    readonly sendStatus: (input: {
      level: "info" | "warning" | "error"
      sessionId: string
      agent: string
      title: string
      message: string
    }) => Effect.Effect<void>
    readonly sendQuestion: (input: {
      questionId: string
      sessionId: string
      title: string
      message: string
      choices: { index: number; label: string }[]
      multiple?: boolean
      timeoutMinutes?: number
    }) => Effect.Effect<number[], BridgeTimeoutError>
    readonly init: () => Effect.Effect<void>
    readonly cleanup: () => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Bridge") {}

  export class BridgeTimeoutError extends Schema.TaggedErrorClass<BridgeTimeoutError>()(
    "BridgeTimeoutError",
    { questionId: Schema.String },
  ) {}
}
```

**核心實作邏輯（`layer` 內）：**

```
layer = Layer.effect(Service, Effect.gen(function* () {
  // 1. 讀取 config，判斷 bridge.enabled
  // 2. 初始化 mailbox 目錄結構
  // 3. 寫入 run.json
  // 4. 啟動 incoming/answer/ 的 fs.watch 監聽
  // 5. 註冊 process exit hook 清理 run.json
  // 6. 回傳 Service.of({ sendStatus, sendQuestion, init, cleanup })
}))
```

**關鍵設計決策：**

- `sendStatus()` — 同步寫 JSON 到 `outgoing/status/`，fire-and-forget，不 block 主流程
- `sendQuestion()` — 寫 JSON 到 `outgoing/question/`，建立 `Deferred<number[]>`，啟動 timeout Race
- incoming 監聽用 `fs.watch`（Node 內建），不用 `@parcel/watcher`（因為監聽的是單一目錄，fs.watch 足夠且更輕量）
- 收到 answer → 匹配 `question_id` → resolve Deferred → 刪除檔案

**A1 檔案清單：**

| 檔案 | 職責 |
|------|------|
| `bridge/schema.ts` | Zod schema |
| `bridge/index.ts` | Service 定義 + Layer + sendStatus/sendQuestion |
| `bridge/monitor.ts` | incoming 目錄監聽 + Deferred 管理 |
| `bridge/filesystem.ts` | 目錄初始化、清理、檔案讀寫工具 |

#### A2. Bus Event 訂閱整合

**做法：統一訂閱 Bus event，不散落手動呼叫。**

建立 `bridge/subscriber.ts`，在 Bridge Layer 初始化時訂閱以下事件：

| Bus Event | 來源 | Bridge 動作 |
|-----------|------|-------------|
| `session.status` | `SessionStatus.Event.Status` | status 變化推播（busy → 開始工作，idle → 完成） |
| `session.error` | `Session.Event.Error` | 錯誤推播 |
| `session.diff` | `Session.Event.Diff` | 檔案變更摘要（可選，後期加入） |

**訂閱方式**（符合 codebase 現有 pattern）：

```typescript
// 在 layer 初始化中使用 Bus.subscribe
yield* bus.subscribeCallback(SessionStatus.Event.Status, (event) => {
  // 轉譯 status → Bridge status message
  bridge.sendStatus({...})
})

yield* bus.subscribeCallback(Session.Event.Error, (event) => {
  bridge.sendStatus({ level: "error", ... })
})
```

**優點：**
- 零修改現有 session/processor.ts、session/status.ts 等檔案
- 新增/移除事件只需要改 subscriber.ts
- 不會漏掉任何事件

#### A3. Question 整合（Race 機制）

這是最複雜的部分。需要在 `question/` 模組中並行觸發 Bridge。

**Race 策略：**

```
Terminal prompt ──┐
                  ├── Race.first() ──→ 採用先到的結果
Bridge question ──┘
```

**實作方式：**

在現有 `Question.ask()` 流程中（或其上層 caller），加入 Bridge 作為第二通道：

1. 原本 CLI 端的 terminal prompt 保持運作
2. 額外呼叫 `Bridge.sendQuestion()` 到 Telegram 端
3. 兩邊用 `Effect.race()` 競爭，先回就採用
4. 贏的一方自動 cancel 輸家的 Effect（包括 Deferred 和 cleanup）

**需要修改的檔案：**

- `question/index.ts` — 在 `ask()` 中加入 Bridge race（需加 Bridge Service 到依賴）
- 或：不改 question，改在 `permission/index.ts` 的 ask 流程中加 race（取決於哪裡是統一的入口）

**建議：先不改 Question，Phase 1 只做單向 status 推播。** Question race 留到 Phase 2，等 status pipeline 驗證通過後再處理。

#### A4. Config 擴展

在 `.opencode/opencode.jsonc` 新增：

```jsonc
{
  "bridge": {
    "enabled": true,  // 啟用 OpenClaw 橋接
    "path": "~/.opencode/bridge"  // 可自訂路徑
  }
}
```

**Config 讀取方式**：在 `Config.Service` 的 `get()` 回傳值中已有完整 config 物件，直接讀 `bridge` 欄位即可。

**啟動方式：全自動。** OpenCode 啟動時自動偵測 `bridge.enabled`，若為 true 則初始化 outgoing/incoming 監聽。使用者在 OpenCode 端零感知。

#### A5. Process Lifecycle 管理

**啟動時（init）：**
1. 讀取 config → `bridge.enabled === true`
2. `path.resolve(bridge.path)` 處理 `~` 和相對路徑
3. `fs.mkdirSync(path, { recursive: true })` 確保目錄存在
4. 清理殘留的舊 outgoing/incoming 訊息
5. 寫入 `run.json`
6. 啟動 incoming 監聽器
7. 註冊 Bus event subscriber

**關閉時（cleanup）：**
1. 刪除 `run.json`
2. 關閉 incoming 監聽器
3. Reject 所有 pending question 的 Deferred
4. 清理 outgoing 中未讀的訊息

**跨平台 PID 檢查（供 OpenClaw 用）：**

```typescript
// Windows + Unix 通用
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = 存活檢查
    return true
  } catch {
    return false
  }
}
```

> `process.kill(pid, 0)` 在 Windows 上也能正確運作（Node 內部處理了跨平台差異）。

---

### Part B：OpenClaw 端（OpenClaw Skill）

#### B1. Bridge Skill — `skills/opencode-bridge/`

**`SKILL.md`** — Skill 定義

**`scripts/bridge-monitor.ts`** — 核心監控腳本

功能：
1. 監聯 `~/.opencode/bridge/outgoing/status/` → 轉發到 Telegram
2. 監聽 `~/.opencode/bridge/outgoing/question/` → 發送 Inline Keyboard 到 Telegram
3. 收到 Telegram callback → 寫入 `incoming/answer/`
4. 定期清理過期訊息

**監聽方式：用 `fs.watch` 而非輪詢。**

原因：
- `fs.watch` 是 Node 內建，零依賴
- 延遲 < 50ms，比 10 秒輪詢好太多
- question 場景需要即時回應，輪詢體驗差

```typescript
// OpenClaw 端監聽
const statusWatcher = fs.watch(bridgePath + "/outgoing/status", (event, filename) => {
  if (event === "rename" && filename) {
    // 讀取、轉發到 Telegram、刪除
  }
})
```

**OpenClaw 整合方式：**
- 在 HEARTBEAT.md 加入橋接檢查
- 收到 question 時發送帶按鈕的 Telegram 訊息
- 使用者點按鈕後，寫入 answer JSON

#### B2. Telegram 互動設計

**狀態推播格式：**
```
🔵 OpenCode 狀態
━━━━━━━━━━━━━━━
📋 任務開始
🔧 重構 auth 模組...
⏰ 08:00
```

**問題推播格式：**
```
🔴 OpenCode 需要確認
━━━━━━━━━━━━━━━
❓ 是否要刪除舊的 auth cache？

[是，刪除] [否，保留]
```

點擊按鈕後：
```
✅ 已回覆：是，刪除
```

---

## 實施順序（分兩個 Phase）

### Phase 1：單向 Status 推播（驗證 pipeline）

```
Step 1: Bridge Service 基礎 (A1)
        - schema.ts, filesystem.ts, index.ts
        - sendStatus() 實作
        - run.json lifecycle
        - Config 讀取
        ↓
Step 2: Bus Event 訂閱 (A2)
        - subscriber.ts
        - 訂閱 session.status, session.error
        - 不修改任何現有檔案
        ↓
Step 3: OpenClaw 監聽端 (B1 partial)
        - fs.watch outgoing/status/
        - Telegram 轉發
        - run.json 掃描 + PID 檢查
        ↓
Step 4: 端到端驗證
        - OpenCode 啟動 → run.json 出現 → OpenClaw 偵測到
        - OpenCode 執行任務 → Telegram 收到狀態推播
        - OpenCode 關閉 → run.json 消失 → OpenClaw 自動停止
```

### Phase 2：雙向 Question 互動

```
Step 5: Incoming 監聽 + Deferred (A1 補完)
        - monitor.ts — fs.watch incoming/answer/
        - Deferred map 管理
        - Timeout 機制
        ↓
Step 6: Question Race 整合 (A3)
        - 修改 question 或 permission 模組
        - Effect.race() 競爭
        - Cancel/ cleanup 邏輯
        ↓
Step 7: OpenClaw Question 端 (B1 補完 + B2)
        - 監聽 outgoing/question/
        - Telegram Inline Keyboard
        - Answer 回寫
        ↓
Step 8: 端到端驗證
        - OpenCode 問問題 → Telegram 收到按鈕
        - 點按鈕 → answer 回寫 → OpenCode 繼續
        - Terminal 先回 → Telegram 按鈕消失
```

---

## 檔案變更清單

### 新增檔案（Part A）

| 檔案 | 行數估計 | 說明 |
|------|----------|------|
| `src/bridge/schema.ts` | ~50 | Zod schema |
| `src/bridge/index.ts` | ~150 | Service + Layer + sendStatus/sendQuestion |
| `src/bridge/monitor.ts` | ~80 | incoming 監聽 + Deferred 管理 |
| `src/bridge/filesystem.ts` | ~60 | 目錄管理工具 |
| `src/bridge/subscriber.ts` | ~80 | Bus event 訂閱 |

### 修改檔案（Part A）

| 檔案 | 改動 | Phase |
|------|------|-------|
| `.opencode/opencode.jsonc` | 加入 `bridge` 設定 | 1 |
| `src/index.ts` | middleware 中初始化 Bridge Service | 1 |
| `src/question/index.ts` 或 `src/permission/index.ts` | 加入 race 機制 | 2 |

### 新增檔案（Part B — OpenClaw）

| 檔案 | 說明 |
|------|------|
| `skills/opencode-bridge/SKILL.md` | Skill 定義 |
| `skills/opencode-bridge/scripts/bridge-monitor.ts` | 監控腳本 |

---

## 工時估算

| 步驟 | 內容 | 預估 |
|------|------|------|
| Step 1 | Bridge Service 基礎（4 個新檔案） | 3 小時 |
| Step 2 | Bus event 訂閱（1 個新檔案 + index.ts 改動） | 1.5 小時 |
| Step 3 | OpenClaw 監聽端 | 2 小時 |
| Step 4 | Phase 1 端到端測試 + debug | 1.5 小時 |
| **Phase 1 小計** | | **8 小時** |
| Step 5 | Incoming 監聽 + Deferred | 2 小時 |
| Step 6 | Question Race 整合（最複雜的部分） | 3-4 小時 |
| Step 7 | OpenClaw Question 端 | 2 小時 |
| Step 8 | Phase 2 端到端測試 + debug | 2 小時 |
| **Phase 2 小計** | | **9-10 小時** |
| **總計** | | **~2 天** |

---

## 優點（vs 直接整合 grammy）

| | 直接整合 | OpenClaw 橋接 |
|---|---|---|
| OpenCode 新依賴 | grammy | 無（純 fs + fs.watch） |
| 改動範圍 | 新 telegram/ 模組 + 4 階段 | bridge/ 小模組 + Bus 訂閱 |
| 維護成本 | OpenCode 維護 Telegram 邏輯 | 各管各的 |
| 可擴展性 | 只能 Telegram | 換頻道只改 OpenClaw |
| 離線可用 | Telegram 掛了就全掛 | OpenCode 不受影響 |
| 對現有 code 的侵入性 | 高（需改 session, tool 多處） | 極低（Bus 訂閱 + 1 處 init） |

## 風險與緩解

| 風險 | 緩解 |
|------|------|
| `fs.watch` 在 Windows 上的可靠性 | Node 18+ 的 `fs.watch` 在 Windows 上穩定；備案：回退到 2 秒 polling |
| 殘留 `run.json` 誤判 | 啟動時清理 + `process.kill(pid, 0)` 跨平台檢查 |
| Question Race 的 cancel 複雜度 | Phase 2 才做；先用 Phase 1 驗證 pipeline |
| Effect Service Layer 依賴注入 | Bridge Layer 掛在 `SessionProcessor.defaultLayer` 的 provider 鏈下 |
| 多實例並發寫入同一 bridge 目錄 | UUID 檔名確保唯一；或每個實例用獨立子目錄（用 PID 區分） |
| OpenCode 沒在跑 | OpenClaw 監聽空目錄，無副作用 |
| Session event 不夠細粒度 | 先用 status busy/idle 推播，後期可加 tool-call 事件 |

## 使用者體驗設計

- **Terminal 完全不受影響**：Bridge 是透明的附加層
- **Race semantics**：Question 觸發時 Terminal 和 Telegram 並行等待，先到先贏
- **狀態推播單向通知**：不干擾 Terminal 輸出
- **場景**：在電腦前用 Terminal，離開電腦用手機 Telegram
- **零指令**：OpenCode 端不需要下任何指令。OpenClaw 端透過 `/ocbridge` 系列指令管理
