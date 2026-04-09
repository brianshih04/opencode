# OpenCode 使用指南（Fork 版）

本指南說明如何安裝與啟動此 Fork 版 OpenCode，包含 MemPalace 記憶系統、Swarm 平行 Agent、以及 z.ai Provider。

## 前置需求

- **Bun** ≥ 1.3（已安裝在 `C:\Users\Brian\.bun\bin\bun.exe`）
- **MemPalace** CLI（已安裝，用於記憶功能）
- **z.ai API Key**（已設定在環境變數 `ZAI_API_KEY`）
- **Git**

## 安裝步驟

### 1. Clone 此 Fork

```bash
git clone https://github.com/brianshih04/opencode.git
cd opencode
```

### 2. 安裝依賴

```bash
bun install
```

### 3. 確認編譯通過

```bash
bun run tsc --noEmit --project packages/opencode/tsconfig.json
```

應該只會看到 `test/lib/llm-server.ts` 的預先存在錯誤，不影響使用。

## 啟動方式

### 方法一：直接從原始碼跑（推薦）

```bash
# 互動模式（TUI）
bun run dev

# 一次性指令
bun run dev run "你的提示詞"

# 指定模型
bun run dev run --model zai/glm-5 "你的提示詞"
```

### 方法二：全域指令（已設定）

已建立 `C:\Users\Brian\.openclaw\bin\opencode.cmd` wrapper，可在任何目錄使用：

```bash
# 互動模式 — 自動使用當前目錄作為工作區
opencode

# 一次性指令
opencode run --model zai/glm-5 "幫我重構這個函式"

# 指定專案目錄
opencode D:\Projects\my-project
```

> **注意：** 需要重開終端機讓 PATH 生效。

### 方法三：透過 OpenClaw ACP

如果 OpenClaw gateway 正在運行，可以從 Telegram 或其他通道派任務：

```
用 opencode 幫我分析這個專案的架構
```

小龍會透過 ACP 自動啟動 OpenCode 並回報結果。

## 功能說明

### z.ai Provider

已內建 GLM-5 模型設定，無需額外配置。環境變數 `ZAI_API_KEY` 需已設定。

```bash
setx ZAI_API_KEY "你的API金鑰"
```

### MemPalace 記憶系統

- **自動注入：** 啟動時自動載入 L0+L1 記憶到系統提示詞
- **搜尋記憶：** 使用 `memory_search` 工具查詢過往對話
- **記憶來源：** MemPalace 記憶庫位於 `~/.mempalace/palace`

初始化記憶庫（如需加入新專案）：

```bash
mempalace init /path/to/project
mempalace mine /path/to/project
```

### Swarm 平行 Agent

讓多個子 Agent 同時處理不同任務：

```
Use the swarm tool to run these tasks in parallel:
1) Read src/main.ts and summarize it
2) Find all TODO comments in the codebase
3) Check for TypeScript errors
```

### Agent 間通訊

在 Swarm 任務中，Agent 可以用 `send_message` 互相溝通：

```
Use send_message to broadcast "analysis complete" to the team
```

## 模型切換

互動模式中按 `Ctrl+K` 切換模型，或使用 `--model` 參數：

```bash
opencode run --model zai/glm-5 "提示詞"          # GLM-5
opencode run --model zai/glm-4.7-flash "提示詞"  # GLM-4.7 Flash（較快）
```

## 常見問題

### Q: `bun` 找不到？

確認 `C:\Users\Brian\.bun\bin` 在 PATH 中：

```bash
setx PATH "%PATH%;C:\Users\Brian\.bun\bin"
```

重開終端機。

### Q: 工作區不對？

用 positional 參數指定專案目錄：

```bash
opencode D:\Projects\my-project
```

### Q: 記憶功能沒作用？

確認 MemPalace 已初始化且有資料：

```bash
mempalace status
```

如果空的，先 mine 一些資料進去。

### Q: z.ai 連線失敗？

確認 API Key 已設定：

```bash
echo %ZAI_API_KEY%
```

## 檔案結構

```
opencode/
├── .opencode/
│   └── opencode.jsonc          # z.ai provider 設定
├── packages/opencode/src/
│   ├── memory/index.ts         # MemPalace 記憶模組
│   ├── tool/
│   │   ├── memory_search.ts    # 記憶搜尋工具
│   │   ├── swarm.ts            # 平行 Agent 工具
│   │   └── send_message.ts     # Agent 通訊工具
│   └── session/instruction.ts  # 記憶注入掛鉤
├── README.md                   # 英文說明
├── README.zht.md               # 繁中說明
└── USERGUIDE.zht.md            # 本文件
```

## 相關連結

- [OpenCode 官方文件](https://opencode.ai/docs)
- [MemPalace](https://github.com/user/mempalace)
- [此 Fork 的 GitHub](https://github.com/brianshih04/opencode)
