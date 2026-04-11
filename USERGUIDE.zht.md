# OpenCode 使用指南（繁體中文）

> AI 驅動的開發工具 — 增強版 Fork

---

## 目錄

- [1. 簡介](#1-簡介)
- [2. 安裝與啟動](#2-安裝與啟動)
- [3. CLI 命令參考](#3-cli-命令參考)
- [4. TUI 互動介面](#4-tui-互動介面)
- [5. 設定檔參考](#5-設定檔參考)
- [6. Agent 系統](#6-agent-系統)
- [7. 工具參考](#7-工具參考)
- [8. 記憶系統](#8-記憶系統)
- [9. MCP Server 整合](#9-mcp-server-整合)
- [10. 權限系統](#10-權限系統)
- [11. 自定義命令、Agent 與 Skill](#11-自定義命令agent-與-skill)
- [12. 環境變數參考](#12-環境變數參考)
- [13. 常見問題](#13-常見問題)

---

## 1. 簡介

OpenCode 是一個開源的 AI 程式開發助手，提供終端機互動介面（TUI）、CLI 非互動模式、以及 Web/桌面應用。本增強版 Fork 額外提供：

- **6 個預設 Agent** — plan、build、review、explore、ultraplan、general，各有專屬模型與職責
- **MemPalace 長期記憶** — 語意搜尋、自動夢境整合、跨 session 記憶保存
- **Swarm 多 Agent 協作** — leader / parallel / chain 三種模式
- **Agent 間通訊** — send_message 工具讓 Agent 互相傳遞訊息
- **瀏覽器自動化** — 透過 Chrome Extension 控制網頁
- **排程系統** — Cron 工具支援定期或一次性任務
- **Task 管理** — 建立任務清單、設定依賴關係、追蹤進度

### 前置條件

- [Bun](https://bun.sh) 執行環境（v1.3.11+）
- AI Provider API Key（z.ai、Anthropic、OpenAI 等，擇一）
- （選用）[MemPalace CLI](https://github.com/nicobailon/mempalace) — 啟用長期記憶功能

---

## 2. 安裝與啟動

### 從原始碼安裝

```bash
git clone https://github.com/brianshih04/opencode.git
cd opencode
bun install
```

### 三種啟動方式

```bash
# 1. 開發模式（直接執行 TypeScript）
bun run dev

# 2. 安裝全域命令後使用
bun run build
bun install -g ./packages/opencode
opencode                          # 啟動 TUI

# 3. 單次非互動執行
opencode run "解釋這個檔案的用途" --file src/index.ts
```

---

## 3. CLI 命令參考

### 全域旗標

| 旗標 | 說明 |
|------|------|
| `--help`, `-h` | 顯示說明 |
| `--version`, `-v` | 顯示版本 |
| `--print-logs` | 將日誌輸出至 stderr |
| `--log-level <LEVEL>` | 日誌等級：DEBUG / INFO / WARN / ERROR |
| `--pure` | 不載入外部插件 |

### 核心命令

#### `opencode [project]` — 啟動 TUI

```bash
opencode                        # 在當前目錄啟動
opencode /path/to/project       # 指定專案目錄
opencode --model zai/glm-5.1    # 指定模型
opencode --agent plan           # 指定 Agent
opencode --continue             # 繼續上次 session
opencode --session <id>         # 載入指定 session
opencode --fork                 # Fork 一個新 session
opencode --prompt "分析程式碼"  # 帶入初始提示
```

#### `opencode run [message..]` — 非互動執行

```bash
opencode run "修復 typecheck 錯誤"
opencode run --model zai/glm-5.1 --file README.md "改善文件"
opencode run --format json "列出所有 TODO"     # JSON 格式輸出
opencode run --dangerously-skip-permissions "重構所有檔案"
opencode run --variant high "深度分析架構"     # 高推理模式
opencode run --thinking                         # 顯示思考過程
```

| 旗標 | 說明 |
|------|------|
| `--model`, `-m` | 模型 (`provider/model`) |
| `--agent` | Agent 名稱 |
| `--continue`, `-c` | 繼續上次 session |
| `--session`, `-s` | 載入指定 session |
| `--fork` | Fork session |
| `--share` | 分享 session |
| `--format` | 輸出格式：`default` / `json` |
| `--file`, `-f` | 附加檔案 |
| `--variant` | 模型變體（reasoning effort：high / max / minimal） |
| `--thinking` | 顯示思考區塊 |
| `--dangerously-skip-permissions` | 自動核准所有權限（除明確 deny 外） |
| `--attach` | 連接至運行中的 server |
| `--dir` | 指定工作目錄 |

### Server 相關

```bash
opencode serve                  # 啟動無頭 server
opencode web                    # 啟動 server 並開啟瀏覽器
opencode attach <url>           # 連接 TUI 至運行中的 server
opencode acp                    # 啟動 ACP (stdin/stdout) 模式
```

### 帳戶管理

```bash
opencode console login <url>    # 登入
opencode console logout         # 登出
opencode console switch         # 切換組織
opencode console orgs           # 列出組織
opencode console open           # 在瀏覽器開啟 console
```

### Provider 與模型

```bash
opencode providers list         # 列出所有 provider 與憑證
opencode providers login        # 登入 provider
opencode providers logout       # 登出 provider
opencode models                 # 列出所有可用模型
opencode models anthropic       # 篩選特定 provider
opencode models --verbose       # 顯示費用等詳細資訊
opencode models --refresh       # 從 models.dev 刷新快取
```

### Session 管理

```bash
opencode session list           # 列出 session
opencode session list -n 20     # 最近 20 個
opencode session delete <id>    # 刪除 session
opencode export <id>            # 匯出 session 為 JSON
opencode import <file>          # 匯入 session
```

### MCP Server

```bash
opencode mcp add                # 互動式新增 MCP server
opencode mcp list               # 列出 MCP server 狀態
opencode mcp auth <name>        # OAuth 認證
opencode mcp auth list          # 列出可認證的 server
opencode mcp logout <name>      # 移除 OAuth 憑證
opencode mcp debug <name>       # 除錯連線
```

### 其他命令

```bash
opencode stats                  # Token 使用量與費用統計
opencode stats --days 7         # 近 7 天統計
opencode stats --models         # 模型使用統計
opencode agent list             # 列出所有 Agent
opencode agent create           # 建立新 Agent
opencode plugin <module>        # 安裝插件
opencode pr <number>            # Checkout GitHub PR 並啟動
opencode github install         # 安裝 GitHub Agent
opencode upgrade                # 升級 OpenCode
opencode uninstall              # 解除安裝
```

### 除錯命令

```bash
opencode debug config           # 顯示完整設定
opencode debug paths            # 顯示全域路徑
opencode debug agent <name>     # 顯示 Agent 設定
opencode debug skill            # 列出可用 Skill
opencode db <query>             # 執行 SQL 查詢
opencode db path                # 顯示資料庫路徑
```

---

## 4. TUI 互動介面

### 操作概覽

啟動後進入終端機互動介面，上方為訊息串、下方為輸入區。所有功能透過快捷鍵操作。

### Leader Key

大部分快捷鍵以 `Ctrl+X` 為前綴（Leader key）。例如 `Ctrl+X Q` = 按 `Ctrl+X` 放開後再按 `Q`。

### 核心快捷鍵

| 快捷鍵 | 動作 |
|--------|------|
| `Tab` | 切換 Agent |
| `Shift+Tab` | 反向切換 Agent |
| `Escape` | 中斷生成 |
| `Return` | 送出輸入 |
| `Shift+Return` / `Ctrl+Return` | 輸入換行 |

### Leader 快捷鍵

| 快捷鍵 | 動作 |
|--------|------|
| `Ctrl+X Q` | 離開 |
| `Ctrl+X N` | 新 session |
| `Ctrl+X L` | 列出 session |
| `Ctrl+X G` | Session 時間軸 |
| `Ctrl+X M` | 列出模型 |
| `Ctrl+X A` | 列出 Agent |
| `Ctrl+X T` | 列出佈景主題 |
| `Ctrl+X B` | 切換側邊欄 |
| `Ctrl+X S` | 檢視狀態 |
| `Ctrl+X C` | 壓縮 session context |
| `Ctrl+X E` | 開啟外部編輯器 |
| `Ctrl+X X` | 匯出 session |
| `Ctrl+X H` | 切換提示 / 隱藏程式碼 |
| `Ctrl+X Y` | 複製訊息 |
| `Ctrl+X U` | 復原訊息 |

### 捲動

| 快捷鍵 | 動作 |
|--------|------|
| `PageUp` / `Ctrl+Alt+B` | 向上翻頁 |
| `PageDown` / `Ctrl+Alt+F` | 向下翻頁 |
| `Ctrl+Alt+U` / `Ctrl+Alt+D` | 上/下半頁 |
| `Ctrl+G` / `Home` | 第一則訊息 |
| `Ctrl+Alt+G` / `End` | 最後一則訊息 |

### 輸入編輯

| 快捷鍵 | 動作 |
|--------|------|
| `Ctrl+A` / `Ctrl+E` | 行首 / 行尾 |
| `Ctrl+K` / `Ctrl+U` | 刪至行尾 / 刪至行首 |
| `Ctrl+W` | 刪除前一個詞 |
| `Alt+F` / `Alt+B` | 前移 / 後移一詞 |
| `Ctrl+V` | 貼上 |

### 其他

| 快捷鍵 | 動作 |
|--------|------|
| `F2` / `Shift+F2` | 切換最近使用的模型 |
| `Ctrl+T` | 切換模型變體 |
| `Ctrl+P` | 命令面板 |
| `Ctrl+R` | 重新命名 session |
| `Ctrl+Z` | 暫停終端機 |

### 對話框

TUI 內建的彈出對話框：

| 對話框 | 說明 |
|--------|------|
| 模型列表 | 選擇 AI 模型，`Ctrl+F` 加入最愛 |
| Agent 列表 | 選擇 Agent，`Ctrl+A` 從模型對話框跳轉 |
| Session 列表 | 歷史 session 瀏覽與載入 |
| 命令面板 | 搜尋並執行自定義命令 |
| 權限對話框 | 當 Agent 需要權限時跳出，可選：允許一次 / 永遠允許 / 拒絕 |
| 時間軸 | Session 完整操作歷程 |
| 狀態面板 | MCP server、Provider、Token 用量等 |

---

## 5. 設定檔參考

設定檔為 `.opencode/opencode.jsonc`（支援 JSON 註解），依以下順序合併（後者覆蓋前者）：

1. 全域設定 `~/.opencode/opencode.jsonc`
2. `OPENCODE_CONFIG` 環境變數指定的檔案
3. 專案設定 `<project>/.opencode/opencode.jsonc`
4. `OPENCODE_CONFIG_DIR` 指定的目錄
5. 企業管理設定

### 完整設定範例

```jsonc
{
  "$schema": "https://opencode.ai/config.json",

  // === 模型設定 ===
  "model": "zai/glm-5.1",           // 預設模型
  "small_model": "zai/glm-4.7",     // 小模型（標題生成等）
  "default_agent": "build",         // 預設 Agent

  // === Provider 設定 ===
  "provider": {
    "zai": {
      "options": {
        "apiKey": "your-api-key"
      }
    },
    "anthropic": {
      "options": {
        "apiKey": "sk-ant-..."
      },
      "whitelist": ["claude-sonnet-4-*"],    // 白名單模型
      "models": {
        "claude-sonnet-4-20250514": {
          "variants": {
            "high": { "disabled": false }
          }
        }
      }
    }
  },
  "disabled_providers": ["groq"],          // 停用特定 provider
  "enabled_providers": ["zai", "anthropic"], // 啟用白名單（設定後僅這些可用）

  // === Agent 設定 ===
  "agent": {
    "plan": {
      "model": "zai/glm-5.1",
      "mode": "primary",
      "description": "架構師 — 負責規劃"
    },
    "build": {
      "model": "zai/glm-5-turbo",
      "mode": "primary"
    },
    "my-custom": {
      "model": "anthropic/claude-sonnet-4-20250514",
      "mode": "all",
      "prompt": "你是一個測試專家",
      "permission": { "bash": "allow", "edit": "allow" }
    }
  },

  // === MCP Server ===
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "@anthropic/mcp-filesystem", "/path"],
      "enabled": true
    },
    "remote-api": {
      "type": "remote",
      "url": "https://api.example.com/mcp",
      "headers": { "Authorization": "Bearer token" }
    }
  },

  // === 權限設定 ===
  "permission": {
    "read": "allow",
    "edit": "allow",
    "bash": "ask",               // 每次執行 bash 都要確認
    "external_directory": "ask",
    "webfetch": "allow",
    "websearch": "allow",
    "*": "allow"
  },

  // === 功能設定 ===
  "share": "manual",            // manual / auto / disabled
  "autoupdate": true,           // true / false / "notify"
  "snapshot": true,             // 檔案快照（復原用）
  "username": "我的名字",

  // === 壓縮設定 ===
  "compaction": {
    "auto": true,               // context 滿時自動壓縮
    "prune": true               // 修剪舊的工具輸出
  },

  // === 格式化工具 ===
  "formatter": {
    "typescript": {
      "command": ["prettier", "--stdin-filepath", "$FILE"],
      "extensions": [".ts", ".tsx"]
    }
  },

  // === LSP 設定 ===
  "lsp": {
    "typescript": {
      "command": ["typescript-language-server", "--stdio"],
      "extensions": [".ts", ".tsx"]
    }
  },

  // === 插件 ===
  "plugin": ["@opencode-ai/plugin-example"],

  // === 自定義命令 ===
  "command": {
    "review": {
      "template": "審查以下程式碼變更，找出潛在問題：$ARGUMENTS",
      "description": "程式碼審查",
      "agent": "review"
    }
  },

  // === 監看器 ===
  "watcher": {
    "ignore": ["node_modules", "*.log", "dist"]
  }
}
```

### 設定檔路徑

| 路徑 | 說明 |
|------|------|
| `<project>/.opencode/opencode.jsonc` | 專案設定 |
| `~/.opencode/opencode.jsonc` | 全域使用者設定 |
| `~/.config/opencode/opencode.jsonc` | XDG 設定目錄 |
| `<project>/.opencode/commands/` | 自定義命令 |
| `<project>/.opencode/agents/` | 自定義 Agent |
| `<project>/.opencode/skills/` | 自定義 Skill |

---

## 6. Agent 系統

### 內建 Agent

| Agent | 模式 | 說明 |
|-------|------|------|
| **build** | primary | 預設 Agent，執行所有開發任務 |
| **plan** | primary | 規劃模式，僅能寫入 `.opencode/plans/*.md`，不修改程式碼 |
| **general** | subagent | 通用 Agent，用於 subtask |
| **explore** | subagent | 快速探索 codebase，支援 quick/medium/very thorough |
| **ultraplan** | subagent | 深度規劃，3 種深度模式（standard/deep/comprehensive） |
| **review** | subagent | 程式碼審查，唯讀 |
| **compaction** | hidden | 自動壓縮過長 context |
| **title** | hidden | 自動生成 session 標題 |
| **summary** | hidden | 自動生成 session 摘要 |

### 切換 Agent

```
TUI 中按 Tab 鍵切換 Agent
CLI  中使用 --agent plan
```

### 自定義 Agent

在 `.opencode/agents/my-agent.md` 建立檔案：

```markdown
---
description: "測試專家 — 專注於撰寫測試"
mode: "all"
model: "zai/glm-5-turbo"
tools:
  bash: true
  read: true
  edit: true
  glob: true
  grep: true
---

你是測試工程專家。你的任務是：
1. 分析現有程式碼結構
2. 撰寫全面的單元測試
3. 確保測試覆蓋邊界條件
```

---

## 7. 工具參考

### 檔案操作

| 工具 | 說明 | 參數 |
|------|------|------|
| `read` | 讀取檔案（支援圖片、PDF），最多 2000 行 | `filePath`, `offset?`, `limit?` |
| `write` | 建立/覆寫檔案 | `filePath`, `content` |
| `edit` | 精確字串取代（需先 read） | `filePath`, `oldString`, `newString`, `replaceAll?` |
| `multiedit` | 同一檔案多次取代（原子操作） | `file_path`, `edits[]` |
| `apply_patch` | diff 風格的批次編輯 | patch 內容 |
| `glob` | 快速檔案模式匹配（`**/*.ts`） | `pattern`, `path?` |
| `grep` | 內容正規表達式搜尋 | `pattern`, `path?`, `include?` |
| `list` | 列出目錄內容 | `path?`, `ignore?` |

### 執行

| 工具 | 說明 |
|------|------|
| `bash` | 執行 shell 命令（持久 session），預設 2 分鐘 timeout |
| `browser` | 瀏覽器自動化（導航、點擊、輸入、截圖、評估 JS 等） |

### Agent 協作

| 工具 | 說明 |
|------|------|
| `task` | 啟動 sub-agent 處理複雜任務 |
| `swarm` | 多 Agent 平行/序列協作。模式：leader（自動分解）、chain（串行 `$PREV`）、parallel（平行） |
| `send_message` | Agent 間通訊（發送/接收訊息） |
| `todowrite` | 當前 session 的任務追蹤 |
| `task_mgmt` | 持久化任務管理（支援狀態流程與依賴關係） |
| `ultraplan` | 深度規劃（需 `OPENCODE_EXPERIMENTAL_ULTRAPLAN=true`） |

### 搜尋與網路

| 工具 | 說明 |
|------|------|
| `webfetch` | 抓取 URL 內容，轉為 markdown |
| `websearch` | 即時網路搜尋 |
| `codesearch` | 程式碼範例搜尋（需啟用 Exa） |
| `tool_search` | 搜尋可用工具 |

### 記憶

| 工具 | 說明 |
|------|------|
| `memory` | 讀寫持久記憶（decisions/lessons/context/auto） |
| `memory_search` | MemPalace 語意搜尋 |

### 其他

| 工具 | 說明 | 條件 |
|------|------|------|
| `skill` | 載入專門技能 | 始終可用 |
| `question` | 向使用者提問 | 僅 CLI/APP/Desktop |
| `cron` | 排程管理（最多 50 個任務） | 始終可用 |
| `lsp` | 語言伺服器（goToDefinition、references 等） | 需 `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` |
| `plan_exit` | 退出規劃模式，切換至 build | 需 `OPENCODE_EXPERIMENTAL_PLAN_MODE=true` |

---

## 8. 記憶系統

OpenCode 提供三層記憶架構：

### 第一層：Auto-Memory（自動）

每次 session 結束時自動記錄摘要（使用的工具、修改的檔案、使用者意圖）。系統 prompt 自動注入最近 3 次 session 摘要。

- 儲存位置：`~/.opencode/memory/auto/`
- 無需手動操作

### 第二層：Memory CRUD（主動）

Agent 使用 `memory` 工具主動記錄重要決策和知識：

```
/memory write decisions/2026-04-api-design.md "決定使用 REST API 而非 GraphQL..."
/memory view lessons/testing-patterns.md
/memory list
```

分類目錄：
- `decisions/` — 架構決策記錄
- `lessons/` — 學到的教訓
- `context/` — 專案上下文
- `auto/` — 自動記錄

### 第三層：MemPalace（長期語意記憶）

需要安裝 MemPalace CLI。提供語意搜尋能力，可搜尋過去的對話、決策、專案知識。

- 自動整合：session 壓縮時觸發 dream（記憶整合）
- 雙重觸發條件：距上次整合 ≥24 小時 且 ≥5 次 session
- `memory_search` 工具可在對話中使用

### Agent 記憶

每個 Agent 有獨立的持久記憶檔案 `~/.opencode/agent-memory/<agentName>/MEMORY.md`，自動注入系統 prompt。

---

## 9. MCP Server 整合

MCP（Model Context Protocol）讓 OpenCode 連接外部工具伺服器。

### 新增 MCP Server

```bash
# 互動式新增
opencode mcp add

# 或在設定檔中設定
```

```jsonc
{
  "mcp": {
    "local-server": {
      "type": "local",
      "command": ["npx", "mcp-server-name"],
      "environment": { "API_KEY": "..." },
      "enabled": true,
      "timeout": 5000
    },
    "remote-server": {
      "type": "remote",
      "url": "https://mcp.example.com/sse",
      "headers": { "Authorization": "Bearer ..." },
      "oauth": {
        "clientId": "...",
        "scope": "read write"
      }
    }
  }
}
```

### 管理

```bash
opencode mcp list              # 列出狀態
opencode mcp auth <name>       # OAuth 認證
opencode mcp logout <name>     # 移除認證
opencode mcp debug <name>      # 除錯
```

MCP Server 提供的工具會以 `servername_toolname` 的格式出現在 Agent 可用工具中。

---

## 10. 權限系統

每個工具有三種權限等級：

| 等級 | 說明 |
|------|------|
| `allow` | 自動允許 |
| `deny` | 拒絕 |
| `ask` | 每次詢問使用者 |

### 可設定的權限類別

| 類別 | 說明 |
|------|------|
| `read` | 讀取檔案 |
| `edit` | 編輯檔案（含 write、edit、patch、multiedit） |
| `glob` | 檔案模式匹配 |
| `grep` | 內容搜尋 |
| `bash` | 執行 shell 命令 |
| `task` | 啟動 sub-agent |
| `external_directory` | 存取專案目錄外的檔案 |
| `webfetch` | 抓取網頁 |
| `websearch` | 網路搜尋 |
| `codesearch` | 程式碼搜尋 |
| `lsp` | LSP 操作 |
| `*` | 萬用字元（所有未特別設定的） |

### 權限設定方式

```jsonc
{
  "permission": {
    // 簡單設定：字串值套用至所有模式
    "bash": "ask",
    "read": "allow",

    // 細粒度設定：依 pattern 區分
    "edit": {
      "*": "allow",              // 預設允許
      "*.env": "ask",            // .env 檔案需確認
      "*.env.example": "allow"   // .env.example 允許
    },
    "external_directory": {
      "*": "ask",
      "/home/user/shared/**": "allow"
    }
  }
}
```

### 權限提示回應

當 Agent 需要權限時，TUI 會跳出對話框：
- **允許一次（once）** — 僅本次
- **永遠允許（always）** — 永久加入白名單
- **拒絕（reject）** — 拒絕並取消同批次所有請求

---

## 11. 自定義命令、Agent 與 Skill

### 自定義命令

在 `.opencode/commands/review.md` 建立：

```markdown
---
description: "程式碼審查"
agent: "review"
model: "zai/glm-5.1"
---

請審查以下程式碼的品質、安全性與可維護性：

$ARGUMENTS

重點檢查：
1. 是否有安全漏洞
2. 是否有效能問題
3. 是否符合最佳實踐
```

在 TUI 中輸入 `/review` 或透過命令面板（`Ctrl+P`）執行。

### 自定義 Agent

見 [第 6 章 — 自定義 Agent](#自定義-agent)。

### 自定義 Skill

在 `.opencode/skills/SKILL.md` 建立：

```markdown
---
name: "database-expert"
description: "資料庫設計與優化專家"
---

你是資料庫專家。在設計 schema 時：
- 遵循正規化原則（至少 3NF）
- 為高頻查詢建立適當索引
- 考慮資料量增長的擴展性
```

Agent 可透過 `skill` 工具載入。

---

## 12. 環境變數參考

### 核心設定

| 變數 | 說明 |
|------|------|
| `OPENCODE_CONFIG` | 自訂設定檔路徑 |
| `OPENCODE_CONFIG_DIR` | 額外設定目錄 |
| `OPENCODE_CONFIG_CONTENT` | 內嵌 JSON 設定 |
| `OPENCODE_PERMISSION` | JSON 格式的權限覆蓋 |
| `OPENCODE_CLIENT` | 客戶端類型：cli / app / desktop / server |
| `OPENCODE_PURE` | 純淨模式（不載入插件） |

### 模型與 Provider

| 變數 | 說明 |
|------|------|
| `OPENCODE_MODELS_URL` | 自訂模型清單 URL |
| `OPENCODE_MODELS_PATH` | 自訂模型清單檔案路徑 |
| `OPENCODE_ENABLE_EXPERIMENTAL_MODELS` | 啟用實驗性模型 |
| `OPENCODE_ENABLE_EXA` | 啟用 Exa AI 搜尋 |

### 行為調整

| 變數 | 說明 |
|------|------|
| `OPENCODE_DISABLE_MOUSE` | 停用 TUI 滑鼠支援 |
| `OPENCODE_DISABLE_AUTOCOMPACT` | 停用自動 context 壓縮 |
| `OPENCODE_DISABLE_AUTOUPDATE` | 停用自動更新 |
| `OPENCODE_SHOW_TTFD` | 顯示首 token 延遲 |
| `OPENCODE_DB` | 自訂資料庫路徑 |

### 實驗性功能

| 變數 | 說明 |
|------|------|
| `OPENCODE_EXPERIMENTAL` | 總開關（啟用所有實驗功能） |
| `OPENCODE_EXPERIMENTAL_PLAN_MODE` | 啟用 plan/build 模式 |
| `OPENCODE_EXPERIMENTAL_ULTRAPLAN` | 啟用 UltraPlan 工具 |
| `OPENCODE_EXPERIMENTAL_LSP_TOOL` | 啟用 LSP 工具 |
| `OPENCODE_EXPERIMENTAL_MARKDOWN` | 啟用 Markdown 渲染（預設開啟） |
| `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS` | 覆蓋 bash timeout |

### 記憶系統

| 變數 | 說明 |
|------|------|
| `MEMPALACE_PATH` | MemPalace 資料目錄（預設 `~/.mempalace/palace`） |

### Windows 特定

| 變數 | 說明 |
|------|------|
| `OPENCODE_GIT_BASH_PATH` | Git Bash 路徑 |

---

## 13. 常見問題

### Q: 如何切換 AI 模型？

TUI 中按 `Ctrl+X M` 開啟模型列表，或 `F2` 快速切換上次使用的模型。CLI 中使用 `--model provider/model-id`。

### Q: 如何設定 API Key？

在 `.opencode/opencode.jsonc` 中設定：

```jsonc
{
  "provider": {
    "anthropic": {
      "options": { "apiKey": "sk-ant-..." }
    }
  }
}
```

或透過環境變數（如 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`）。

### Q: Agent 權限被拒絕怎麼辦？

權限提示時選擇「永遠允許」，或在設定檔中加入：

```jsonc
{ "permission": { "bash": "allow" } }
```

或在 `opencode run` 時加 `--dangerously-skip-permissions`。

### Q: Context 太長怎麼辦？

按 `Ctrl+X C` 手動壓縮。或開啟自動壓縮：

```jsonc
{ "compaction": { "auto": true, "prune": true } }
```

### Q: 如何使用 Swarm 多 Agent？

在對話中請 Agent 使用 `swarm` 工具，或明確要求：

> 請用 swarm 工具平行處理：1) 重構 auth 模組 2) 新增測試 3) 更新文件

Swarm 支援三種模式：
- **leader** — 自動分解任務、平行執行、綜合結果
- **parallel** — 手動指定多個任務平行執行
- **chain** — 依序執行，用 `$PREV` 引用前一個輸出

### Q: 如何分享 session？

TUI 中按 `Ctrl+X X` 匯出。或使用 `opencode export <session-id>`。

### Q: 資料儲存在哪裡？

| 資料 | 路徑 |
|------|------|
| 設定 | `~/.opencode/opencode.jsonc` |
| Session 資料庫 | `~/.local/share/opencode/opencode.db` |
| 快取 | `~/.cache/opencode/` |
| 記憶 | `~/.opencode/memory/` |
| Agent 記憶 | `~/.opencode/agent-memory/` |
| Cron 排程 | `~/.opencode/cron-tasks.json` |

### Q: 如何在 CI/CD 中使用？

```bash
opencode run --dangerously-skip-permissions \
  --model zai/glm-5-turbo \
  "執行 typecheck 並修復所有錯誤"
```

### Q: 完全解除安裝？

```bash
opencode uninstall --force       # 移除所有
opencode uninstall --keep-config # 保留設定
```
