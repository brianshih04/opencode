# OpenCode ↔ OpenClaw 通訊橋接規劃書

## 目標

讓布萊恩能從手機（Telegram）即時掌握 OpenCode 執行狀況，並回覆 OpenCode 的問題。
OpenCode 為主動執行者，OpenClaw 為通訊中介。

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

布萊恩說「監看 OpenCode」或 `/bridge watch` 時：

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

#### A1. Bridge Core — `packages/opencode/src/bridge/`

**`index.ts`** — 匯出統一介面

**`outgoing.ts`** — 寫入 outgoing 訊息
- `Bridge.sendStatus(level, title, message)` — 推播狀態
- `Bridge.sendQuestion(questionId, title, message, choices, opts)` — 發送問題，回傳 `Effect<Answer>`
- 內部：寫 JSON 到 `outgoing/`，然後監聽 `incoming/answer/` 等待對應 `question_id` 的回覆
- 超時機制：預設 30 分鐘，超時回傳 `TimeoutError`

**`incoming.ts`** — 監聽回覆
- 使用 `@parcel/watcher` 監聽 `incoming/answer/`
- 收到回覆後匹配 `question_id`，resolve 對應的 `Deferred`
- 讀取後刪除檔案

**`watcher.ts`** — 目錄初始化與清理
- 確保 `bridge/` 目錄結構存在
- 啟動時清理殘留的舊訊息（避免誤判）

#### A2. Hook 整合

**狀態推播觸發點：**

| 事件 | 觸發位置 | 訊息內容 |
|------|---------|---------|
| Session 開始 | `session/` | "新任務開始：{prompt 摘要}" |
| Agent 工具執行 | `tool/tool.ts` 執行前後 | "執行 {toolName}..." |
| Session 完成 | `session/` | "任務完成 ✅" |
| Session 錯誤 | `session/` error handler | "任務失敗 ❌：{error}" |
| Swarm 進度 | `tool/swarm.ts` | "Swarm 子任務 {n}/{total} 完成" |

做法：在現有 Bus 事件處理中加入 `Bridge.sendStatus()` 呼叫，或訂閱 Bus event。

**Question 整合：**

在 `tool/question.ts` 的 `Question.ask()` 流程中，**並行**觸發 Bridge：
- 原本 CLI 端的 terminal prompt 保持運作（桌面用）
- 額外呼叫 `Bridge.sendQuestion()` 到 Telegram 端
- 兩邊哪邊先回就採用，另一邊忽略（race semantics）
- Terminal 操作完全不受影響，Bridge 是無侵入的附加通道

#### A3. Config 擴展

在 `opencode.jsonc` 新增：

```jsonc
{
  "bridge": {
    "enabled": true,  // 啟用 OpenClaw 橋接
    "path": "~/.opencode/bridge"  // 可自訂路徑
  }
}
```

**啟動方式：全自動，無需手動指令。** OpenCode 啟動時自動偵測 `bridge.enabled`，
若為 true 則初始化 outgoing/incoming 監聽。使用者在 OpenCode 端零感知，
Terminal 操作完全不受影響。Telegram 端只是額外的並行通知/互動通道。

### Part B：OpenClaw 端（OpenClaw Skill）

#### B1. Bridge Skill — `skills/opencode-bridge/`

**`SKILL.md`** — Skill 定義

**`scripts/bridge-monitor.ts`** — 核心監控腳本

功能：
1. 監聽 `~/.opencode/bridge/outgoing/status/` → 轉發到 Telegram
2. 監聽 `~/.opencode/bridge/outgoing/question/` → 發送 Inline Keyboard 到 Telegram
3. 收到 Telegram callback → 寫入 `incoming/answer/`
4. 定期清理過期訊息

**OpenClaw 整合方式：**
- 在 HEARTBEAT.md 加入橋接檢查
- 或用 cron 每 10 秒掃描一次 outgoing 目錄
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

## 實施順序

```
Step 1: OpenCode bridge core (A1)
        - outgoing 寫入
        - incoming 監聽 + Deferred
        - 目錄管理
        ↓
Step 2: OpenCode hook 整合 (A2)
        - status 推播（先做最簡單的：session 開始/結束）
        - question 橋接
        ↓
Step 3: OpenClaw bridge skill (B1 + B2)
        - 監聽 outgoing
        - Telegram 轉發
        - answer 回寫
        ↓
Step 4: 端到端測試
        - OpenCode 啟動任務 → Telegram 收到狀態
        - OpenCode 問問題 → Telegram 收到按鈕 → 回覆 → OpenCode 繼續
```

---

## 工時估算

| 步驟 | 內容 | 預估 |
|------|------|------|
| Step 1 | Bridge core（約 3 個新檔案） | 3 小時 |
| Step 2 | Hook 整合（修改 3-5 個現有檔案） | 2 小時 |
| Step 3 | OpenClaw Skill（1 個新 skill） | 2 小時 |
| Step 4 | 端到端測試 + debug | 2 小時 |
| **總計** | | **~1 天** |

---

## 優點（vs 直接整合 grammy）

| | 直接整合 | OpenClaw 橋接 |
|---|---|---|
| OpenCode 新依賴 | grammy | 無（純 fs） |
| 改動範圍 | 新 telegram/ 模組 + 4 階段 | bridge/ 小模組 + hooks |
| 維護成本 | OpenCode 維護 Telegram 邏輯 | 各管各的 |
| 可擴展性 | 只能 Telegram | 換頻道只改 OpenClaw |
| 離線可用 | Telegram 掛了就全掛 | OpenCode 不受影響，只是收不到通知 |

## 使用者體驗設計

- **Terminal 完全不受影響**：Bridge 是透明的附加層，不修改任何現有 UI 行為
- **Race semantics**：Question 觸發時 Terminal 和 Telegram 並行等待，哪邊先回就用哪邊
- **狀態推播單向通知**：不干擾 Terminal 輸出
- **場景**：在電腦前用 Terminal，離開電腦用手機 Telegram
- **零指令**：不需要 `/bridge` 或 `opencode bridge`，設定好就自動運作

## 風險

| 風險 | 緩解 |
|------|------|
| 檔案監聽延遲 | `@parcel/watcher` 是 native，延遲 < 100ms |
| 殘留檔案誤判 | 啟動時清理 + timestamp 比對 |
| 並發寫入衝突 | UUID 檔名確保唯一 |
| Question 超時 | 30 分鐘自動 reject，Telegram 端顯示「已過期」 |
| OpenCode 沒在跑 | OpenClaw 監聽空目錄，無副作用 |
