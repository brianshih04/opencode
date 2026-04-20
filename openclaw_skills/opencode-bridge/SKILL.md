---
name: opencode-bridge
description: OpenCode ↔ OpenClaw 通訊橋接。透過 Mailbox IPC 監聽 OpenCode 狀態和問題，轉發到 Telegram，並將回覆寫回 OpenCode。
---

# OpenCode Bridge Skill

## Overview

透過 Mailbox（檔案系統 IPC）橋接 OpenCode 和 Telegram。

**監聯掃描**：`scripts/monitor.js` 由 cron 定期執行，掃描 outgoing 目錄並透過 `openclaw message send` 推播到 Telegram。

**回覆處理**：AI agent 在對話中攔截 Telegram callback 事件，寫入 answer JSON 到 incoming 目錄。

## 前置條件

- OpenCode 已安裝並支援 bridge 功能（`opencode.jsonc` 中 `bridge.enabled: true`）
- OpenClaw Telegram bot 已設定
- 環境變數 `OC_BRIDGE_CHAT_ID` 已設定（Telegram chat ID）

## Bridge 目錄結構

```
~/.opencode/bridge/
├── run.json           ← OpenCode 啟動時寫入（PID、cwd、branch、started_at）
├── outgoing/
│   ├── status/        ← 狀態推播 JSON（monitor 掃描後刪除）
│   └── question/      ← HITL 問題 JSON（monitor 掃描後刪除）
└── incoming/
    └── answer/        ← 使用者回覆 JSON（AI agent 寫入）
```

## 安裝與設定

### 1. 設定環境變數
```
OC_BRIDGE_CHAT_ID=6187953274   # 布萊恩的 Telegram chat ID
OC_BRIDGE_PATH=~/.opencode/bridge  # （選填）自訂 bridge 路徑
```

### 2. 設定 Cron
每 10 秒執行一次 monitor.js：
```
*/10 * * * * *  OC_BRIDGE_CHAT_ID=6187953274 node <skill_path>/scripts/monitor.js
```

### 3. Cron 指令
在 Telegram 跟我說：
- `ocbridge cron start` — 啟動監聽 cron
- `ocbridge cron stop` — 停止監聯 cron

## 指令

### ocbridge start [path]
在指定目錄啟動 OpenCode 並自動開始監看。
- 用 `exec` 啟動 `opencode`（需 pty）
- 啟動後等待 `run.json` 出現
- 自動啟動 cron 監聯
- 推播：「✅ OpenCode 已啟動 (PID xxx)，開始監看」

### ocbridge watch
掃描所有 OpenCode 實例。
1. 掃描 `~/.opencode/bridge/` 下所有 `run.json`
2. 若有多個，列出清單：
```
偵測到多個 OpenCode 實例：
1. PID 12345 — D:\Projects\opencode (3 分鐘前啟動)
2. PID 67890 — D:\Projects\my-app (剛剛啟動)

要監看哪個？
[1] [2] [全部]
```
3. 使用者選擇後啟動 cron 監聯
4. 若無實例，提示先啟動 OpenCode

### ocbridge switch
中途切換監看其他實例。流程同 `ocbridge watch`。

### ocbridge status
顯示目前監看狀態：
- 監看中的 PID、cwd、啟動時間
- 已處理的 status/question/answer 數量
- 上次活動時間

### ocbridge stop
停止 cron 監聽（不關閉 OpenCode）。
推播：「⏹ 已停止監看 OpenCode (PID xxx)」

### ocbridge kill
停止監聯並終止 OpenCode 進程。
- 用 `exec` 發送 kill signal
- 推播：「🛑 OpenCode (PID xxx) 已關閉」

### ocbridge cron start / stop
手動啟動或停止 monitor cron job。

## Telegram Callback 回覆處理

當 monitor.js 發送帶按鈕的 question 訊息後，使用者點擊按鈕會觸發 Telegram callback。

**AI Agent 職責：**
1. 當收到 Telegram callback 且 callback_data 匹配 `ocbridge_answer:{question_id}:{index}` 格式時
2. 讀取 `state.json` 中 `pending_questions` 確認問題有效（未過期）
3. 寫入 answer JSON 到 `~/.opencode/bridge/incoming/answer/{timestamp}-{uuid}.json`：
```json
{
  "type": "answer",
  "question_id": "q-uuid-001",
  "selected": [0],
  "timestamp": "2026-04-13T08:02:00Z"
}
```
4. 更新 `state.json`（增加 `answers_received`，移除 `pending_questions` 中對應項）
5. 回覆 Telegram：「✅ 已回覆：{label}」

**callback_data 格式：**
為了讓 AI 能識別 callback，monitor.js 發送按鈕時使用特殊 label 前綴：
```
callback_data = "ocbridge_answer:{question_id}:{index}"
```

## 訊息格式

### Status（outgoing/status/）
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

### Question（outgoing/question/）
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

### run.json
```json
{
  "pid": 12345,
  "cwd": "D:\\Projects\\opencode",
  "branch": "dev_0411_2",
  "started_at": "2026-04-13T08:00:00Z"
}
```

## Telegram 訊息格式

**狀態推播：**
```
🔵 OpenCode 狀態
━━━━━━━━━━━━━━━
📋 任務開始
🔧 正在重構 auth 模組...
⏰ 08:00
```

**問題推播（帶按鈕）：**
```
🔴 OpenCode 需要確認
━━━━━━━━━━━━━━━
❓ 是否要刪除舊的 auth cache？

[是，刪除] [否，保留]
```

## 檔案結構

```
opencode-bridge/
├── SKILL.md              ← 本文件
├── scripts/
│   └── monitor.js        ← cron 掃描腳本（每 10 秒）
└── state.json            ← 狀態追蹤（自動維護，勿手動編輯）
```

## 注意事項

- monitor.js 讀取 outgoing 檔案後**必須刪除**，避免重複處理
- 寫入 answer 時用 UUID 檔名避免衝突
- run.json 消失時自動通知「OpenCode 已離線」
- Question 超時（30 分鐘）後發送「⏰ 已過期」
- callback_data 使用 `ocbridge_answer:` 前綴讓 AI 能識別
