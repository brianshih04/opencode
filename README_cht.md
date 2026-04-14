---
title: OpenCode Enhanced Fork
---

<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">開源 AI Coding Agent — <strong>增強分支</strong></p>
<p align="center">
  <a href="README.md">English</a> |
  <a href="README_cht.md">繁體中文</a>
</p>

---

[OpenCode](https://github.com/anomalyco/opencode) 的增強分支，新增長期記憶系統、多 Agent 協調、瀏覽器自動化、雙向 Telegram 整合，以及每個 Agent 獨立的模型配置。

> **v0.6.003** — OpenClaw Bridge 雙向 Telegram 整合（`/ocread`、`/ocwrite`、`/ocsend`）

---

## 功能特色

### 🧠 記憶系統

三層記憶架構：

- **MemPalace** — 基於 ChromaDB 的長期語意記憶。啟動時自動注入 L0+L1 上下文到系統提示詞。提供 `memory_search` 工具查詢過去的對話。
- **Agent Memory** — 每個 Agent 擁有獨立的持久化記憶檔案，存放在 `~/.opencode/agent-memory/<agent>/MEMORY.md`，跨 Session 保留。
- **Auto-Memory** — 自動記錄 Session 摘要，並注入到系統提示詞（最近 3 次）。
- **autoDream 雙閘門** — 時間閘門（≥24小時）+ Session 閘門（≥5 次壓縮）。每次 Session 增量挖掘，雙閘門通過時完整整合。

### 🤖 多 Agent 系統

六個專門化 Agent，各自對應最佳模型：

| Agent | 模型 | 角色 |
|-------|------|------|
| **plan** | zai/glm-5.1 | 🧠 旗艦 — 架構設計與長期規劃 |
| **build** | zai/glm-5-turbo | ⚡ 高效 — 快速程式碼生成與工具呼叫 |
| **review** | zai/glm-5 | 🛡️ 守門員 — Bug 偵測與邏輯審查 |
| **explore** | zai/glm-5v-turbo | 👁️ 視覺 — 支援圖片的程式碼搜尋 |
| **ultraplan** | zai/glm-5.1 | 📋 深度規劃 — 3 種深度等級，自動模型選擇 |
| **general** | zai/glm-4.7 | 💡 輕量 — 日常任務與 git 操作 |

TUI 中按 `Tab` 切換，CLI 指定：`--agent build`

### 🐝 Swarm 平行 Agent

三種協調模式：

- **Leader 模式** — 描述目標，自動評估複雜度、選擇策略（深度優先 / 廣度優先 / 直接執行），產生 1-20 個子 Agent。
- **Chain 模式** — 串行管線，每個任務透過 `$PREV` 接收前一個輸出。
- **Parallel 模式** — 手動指定並行任務。

### 🌉 OpenClaw Bridge（Telegram 整合）

透過 [OpenClaw](https://docs.openclaw.ai) 實現 OpenCode 與 Telegram 的雙向通訊：

- **讀取對話** — `/ocread`（或 `/ocr`）顯示 OpenCode Session 最近 100 則訊息
- **發送訊息** — `/ocwrite <訊息>`（或 `/ocw <訊息>`）向 OpenCode 活躍 Session 發送提示
- **回覆問題** — `/ocsend <qid> <選項>` 回覆 OpenCode 的工具確認請求
- **檔案系統 IPC** — 零依賴的信箱模式，使用 `~/.opencode/bridge/`

### 🌐 瀏覽器自動化

透過 [OpenCLI](https://github.com/brianshih04/opencli) daemon + 擴充功能控制 Chrome：

- 13 種操作：navigate、click、type、evaluate、screenshot、content、tabs、cookies、scroll、wait、url、status
- 反偵測隱匿注入

### ⏰ Cron 排程器

5 欄位 cron 表達式排程，支援週期性與一次性任務。最多 50 個任務，持久化到 `~/.opencode/cron-tasks.json`。

### 📋 任務管理

持久化任務追蹤，支援依賴關係、狀態流程（`pending` → `in_progress` → `completed`），檔案式儲存。

### ✉️ Agent 間通訊

檔案式信箱系統 `~/.opencode/mailboxes/`。支援直接傳訊、廣播（`*`），跨 Session 保留。

### 🔍 工具搜尋

執行時透過關鍵字搜尋發現 61+ 個可用工具，加權評分排序。

---

## 快速開始

### 環境需求

- [Bun](https://bun.sh) 執行環境
- `ZAI_API_KEY` 環境變數（[z.ai](https://z.ai)）

### 安裝

```bash
git clone https://github.com/brianshih04/opencode.git
cd opencode
bun install
```

### 執行

```bash
# 互動式 TUI
bun run dev

# 一次性模式
bun run dev run --model zai/glm-5-turbo "修復 auth bug"

# 指定 Agent
bun run dev run --agent plan --model zai/glm-5.1 "分析架構"
```

#### 全域指令（Windows）

```powershell
# 建立包裝腳本
mkdir $env:USERPROFILE\.openclaw\bin -Force
@"
@echo off
setlocal
cd /d D:\Projects\opencode
bun run dev %*
"@ | Set-Content $env:USERPROFILE\.openclaw\bin\opencode.cmd

# 加入 PATH
[Environment]::SetEnvironmentVariable("PATH",
  "$([Environment]::GetEnvironmentVariable('PATH','User'));$env:USERPROFILE\.openclaw\bin", "User")

# 從任何目錄使用
opencode
opencode run --model zai/glm-5-turbo "修復測試"
```

---

## 設定

### `.opencode/opencode.jsonc`

```jsonc
{
  // 啟用 OpenClaw Bridge（Telegram 整合）
  "bridge": { "enabled": true },

  // 每 Agent 模型配置
  "agent": {
    "plan": { "model": "zai/glm-5.1" },
    "build": { "model": "zai/glm-5-turbo" },
    "review": { "model": "zai/glm-5" },
    "explore": { "model": "zai/glm-5v-turbo" },
    "ultraplan": { "model": "zai/glm-5.1" },
    "general": { "model": "zai/glm-4.7" }
  }
}
```

### OpenClaw Bridge 設定

1. 在設定中啟用：`"bridge": { "enabled": true }`
2. 使用 `bun run dev` 啟動 OpenCode（全域 `opencode` 不含 bridge 變更）
3. 安裝 `opencode-bridge` skill 到 OpenClaw：

```powershell
xcopy /E /I openclaw_skills\opencode-bridge %USERPROFILE%\.openclaw\workspace\skills\opencode-bridge\
```

4. 在 Telegram 使用指令：`/ocread`、`/ocwrite <訊息>`、`/ocsend <qid> <選項>`

### 瀏覽器自動化設定

1. 複製 [OpenCLI](https://github.com/brianshih04/opencli)
2. 安裝：`npm install --ignore-scripts`
3. 建置：`npm run build`
4. 啟動 daemon：`node dist/src/main.js`
5. 在 `chrome://extensions/` 載入 `extension/dist/` 的 Chrome 擴充功能

---

## 架構

### 技術棧

| 層級 | 技術 |
|------|------|
| **執行環境** | Bun 1.3.11 |
| **Monorepo** | Turborepo + Bun Workspaces（19 個套件） |
| **核心框架** | Effect v4 (beta.43) |
| **AI SDK** | Vercel AI SDK v6 |
| **資料庫** | Drizzle ORM (SQLite) |
| **Web** | Hono |
| **UI** | SolidJS + Solid Start |
| **桌面** | Tauri（另有 Electron 版） |
| **型別系統** | TypeScript 5.8 + tsgo 原生型別檢查 |

### 核心目錄（`packages/opencode/src/`）

- `agent/` — 6 個 Agent + 動態生成
- `provider/` — 20+ AI Provider
- `tool/` — 61+ 內建工具
- `bridge/` — OpenClaw Bridge（outgoing、incoming、watcher）
- `bus/` — Effect PubSub 事件系統
- `session/` — Session 管理 + 自動壓縮
- `memory/` — MemPalace + autoDream 整合
- `config/` — Zod 驗證的設定系統

---

## TUI 快捷鍵

| 按鍵 | 動作 |
|------|------|
| `Tab` | 切換 Agent（build ↔ plan） |
| `Ctrl+K` | 切換模型 |
| `Ctrl+P` | 指令面板 |
| `/compact` | 壓縮對話歷史 |
| `/new` | 開始新 Session |
| `/status` | 顯示 Session 狀態 |

---

## AI Provider

透過 Vercel AI SDK 內建支援 20+ Provider：

OpenAI、Anthropic、Google、Azure、Bedrock、Groq、Mistral、Cohere、Perplexity、XAI、Cerebras、TogetherAI、DeepInfra、OpenRouter、GitLab、Venice 等，另支援自訂 OpenAI 相容端點。

---

## 連結

- [CHANGELOG.md](./CHANGELOG.md) — 分支更新日誌
- [OpenCode Docs](https://opencode.ai/docs) — 上游文件
- [OpenClaw Docs](https://docs.openclaw.ai) — OpenClaw 整合

## 上游

基於 [anomalyco/opencode](https://github.com/anomalyco/opencode)。請參考上游 README 了解原始功能與貢獻指南。

## 授權

與上游 OpenCode 相同。
