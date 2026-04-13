<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">開源 AI 程式設計 Agent — <strong>增強版 Fork</strong></p>
<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zht.md">繁體中文</a>
</p>

---

這是 [OpenCode](https://github.com/anomalyco/opencode) 的增強 Fork，加入記憶系統、多 Agent 協調、瀏覽器自動化與 Agent 模型指定。

### 環境需求

- [Bun](https://bun.sh) 執行環境
- `ZAI_API_KEY` 環境變數

### 安裝

```bash
# 複製專案
git clone https://github.com/brianshih04/opencode.git
cd opencode

# 切換到 brian_main 分支
git checkout brian_main

# 安裝依賴
bun install

# 啟動 TUI
bun run dev

# 或一次性執行
bun run dev run --model zai/glm-5-turbo "你的提示詞"
```

#### 全域 `opencode` 指令（Windows）

建立包裝腳本，從任何目錄執行：

```powershell
# 1. 建立 bin 目錄
mkdir $env:USERPROFILE\.openclaw\bin -Force

# 2. 建立包裝腳本（將 E:\Projects\opencode 換成你的路徑）
"@"
@echo off
setlocal
cd /d E:\Projects\opencode
bun run dev %*
"@ | Set-Content $env:USERPROFILE\.openclaw\bin\opencode.cmd

# 3. 加到 PATH
[Environment]::SetEnvironmentVariable("PATH", "$([Environment]::GetEnvironmentVariable('PATH','User'));$env:USERPROFILE\.openclaw\bin", "User")

# 4. 重開終端機後就能用了
opencode                                    # TUI 模式
opencode run --model zai/glm-5-turbo "修 bug"  # 一次性
```

#### 瀏覽器自動化設定

1. 複製 [OpenCLI](https://github.com/brianshih04/opencli)
2. 安裝：`npm install --ignore-scripts`（Windows 需跳過 bash 的 prepare 腳本）
3. 建置：`npm run build`
4. 啟動 daemon：`node dist/src/main.js`
5. 從 `extension/dist/` 安裝 Chrome 擴充功能（在 `chrome://extensions/` 中「載入未封裝擴充功能」）
6. Daemon 運行在 `localhost:19825` — 用 `node dist/src/main.js doctor` 驗證

### Agents

六個 Agent，各自搭配最佳模型：

| Agent         | 模型             | 角色                                     | 模式              |
| ------------- | ---------------- | ---------------------------------------- | ----------------- |
| **plan**      | zai/glm-5.1      | 🧠 最強大腦 — 架構規劃、長程任務         | Primary, 唯讀     |
| **build**     | zai/glm-5-turbo  | ⚡ 效率兵工廠 — 快速代碼生成與工具調用   | Primary, 完整權限 |
| **review**    | zai/glm-5        | 🛡️ 嚴謹守門員 — 抓 Bug、檢查邏輯         | Subagent, 唯讀    |
| **explore**   | zai/glm-5v-turbo | 👁️ 視覺探索者 — 支援圖片的 Codebase 搜尋 | Subagent          |
| **ultraplan** | zai/glm-5.1      | 📋 深度規劃師 — 結構化計畫含風險評估     | Subagent, 唯讀    |
| **general**   | zai/glm-4.7      | 💡 輕量助手 — 日常任務、Git 指令         | Subagent          |

TUI 中用 `Tab` 切換（build ↔ plan），或 CLI 指定：`--agent build`

### 指令使用方式

```bash
# 一次性執行，指定模型和 Agent
opencode run --model zai/glm-5-turbo --agent build "修復登入 bug"
opencode run --model zai/glm-5.1 --agent plan "分析架構"

# TUI 互動模式
opencode
#   Tab       — 切換 build/plan Agent
#   Ctrl+K   — 切換模型
#   /compact  — 壓縮對話歷史
#   /new      — 開新 Session
#   /status   — 顯示 Session 狀態

# 在任何專案目錄執行
opencode D:\Projects\my-project
```

### 自訂擴充功能 (Fork 新增)

#### 🧠 MemPalace 記憶系統

透過 [MemPalace](https://github.com/user/mempalace) 實現長期記憶。

- 啟動時自動注入 L0+L1 語境到系統提示詞
- `memory_search` 工具可查詢過往對話與專案知識
- **autoDream 雙閘門**：時間閘門（≥24 小時）+ Session 閘門（≥5 次壓縮）— 每次 session 增量 mining，雙閘門通過才跑完整整理
- Dream 狀態持久化到 `~/.opencode/dream-lock.json`
- 多來源：對話、程式碼、文件都可以 mining

#### 🤖 Agent 記憶

每個 Agent 擁有獨立的持久記憶檔案：

- 存放在 `~/.opencode/agent-memory/<agentName>/MEMORY.md`
- Session 啟動時自動注入系統提示詞
- Agent 可用標準 `write` 工具讀寫自己的記憶
- 跨 Session 持久保存 — Agent 會隨時間學習和記住

#### 🌉 OpenClaw Bridge

透過純檔案 IPC 讓 OpenClaw (Telegram bot) 即時監控 OpenCode 並雙向互動。

在 `.opencode/opencode.jsonc` 啟用：

```jsonc
{
  "bridge": {
    "enabled": true,
    "path": "~/.opencode/bridge", // optional
  },
}
```

- **零侵入** — Bridge 是附加層，Terminal 完全不受影響
- **Status 推播** — busy/idle/error 狀態自動推播到 Telegram
- **Question 互動** — HITL 問題帶 Inline Keyboard，手機可遠端回答
- **Race 語義** — Terminal 和 Telegram 並行等待，先到先贏
- **離線容錯** — OpenClaw 掛了不影響 OpenCode 運作
- 詳見 [OPENCLAW_BRIDGE_PLAN.md](./OPENCLAW_BRIDGE_PLAN.md)

#### 🔍 工具搜尋

在執行時動態發現可用工具：

- 關鍵字搜尋 27 個工具的名稱和描述
- `select:name1,name2` 直接選取指定工具
- 加權評分：名稱匹配 (10) > 名稱片段 (5) > 描述詞彙 (3)
- 回傳工具名稱、描述和使用提示

#### ⏰ 排程任務

建立週期性或一次性排程：

- 標準 5 欄 cron 表達式（`分 時 日 月 週`）
- 建立/列表/刪除操作
- 任務持久化到 `~/.opencode/cron-tasks.json`
- 一次性任務觸發後自動刪除
- 最多 50 個任務

#### 🐝 Swarm 平行 Agent

兩種多 Agent 協調模式：

- **Leader 模式** — 描述高層目標，Team Lead 自動拆解成 2-5 個平行子任務並執行
- **Parallel 模式** — 手動指定任務同時執行
- TaskTracker 追蹤狀態（✓ ⟳ ✗）

#### 📋 任務管理

持久化的任務追蹤系統（`~/.opencode/tasks/`）：

- 建立/更新/列表/查詢任務
- 狀態流程：`pending` → `in_progress` → `completed` / `deleted`
- 任務依賴（`blocks` / `blockedBy`）
- 完成任務時自動解鎖被依賴的任務

#### ✉️ Agent 間通訊

檔案式信箱系統（`~/.opencode/mailboxes/`）：

- 發送私訊給特定 Agent
- 廣播（`*`）給所有隊友
- 訊息跨 Session 持久保存

#### 🌐 瀏覽器自動化

透過 [OpenCLI](https://github.com/brianshih04/opencli) daemon + 擴充功能控制 Chrome：

- 13 種操作：導航、點擊、輸入、執行 JS、截圖、取得內容、分頁管理等
- 反偵測隱匿注入

#### 🤖 Agent 模型指定

在 `.opencode/opencode.jsonc` 中設定：

```jsonc
{
  "agent": {
    "plan": { "model": "zai/glm-5.1" },
    "build": { "model": "zai/glm-5-turbo" },
    "review": { "model": "zai/glm-5" },
    "explore": { "model": "zai/glm-5v-turbo" },
    "ultraplan": { "model": "zai/glm-5.1" },
    "general": { "model": "zai/glm-4.7" },
  },
}
```

#### z.ai Provider

內建 z.ai 模型設定（GLM-5.1、GLM-5、GLM-5 Turbo、GLM-5V Turbo、GLM-4.7）。
設定環境變數 `ZAI_API_KEY` 即可啟用。

### 設定檔

`.opencode/opencode.jsonc` — 參見[完整設定參考](https://opencode.ai/docs)。

### 文件

- [OpenCode 官方文件](https://opencode.ai/docs) — 上游文件
- [CHANGELOG.md](./CHANGELOG.md) — Fork 更新日誌
- [USERGUIDE.zht.md](./USERGUIDE.zht.md) — 繁中使用指南

### 上游

基於 [anomalyco/opencode](https://github.com/anomalyco/opencode) 開發。原始功能與貢獻指南請參考上游。
