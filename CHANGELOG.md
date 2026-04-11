# Changelog

All notable changes to this fork of OpenCode will be documented in this file.

## [1.4.004] - 2026-04-11

### Changed — Phase 1: 基礎品質強化

#### 📦 依賴管理統一
- TypeScript 版本統一：`desktop` 和 `desktop-electron` 從 `~5.6.2` 改用 `catalog:` (5.8.2)
- 6 個套件的硬編碼依賴版本改為 `catalog:` 協議（`marked`, `@solidjs/router`, `@tsconfig/bun`）
- 移除 `packages/opencode` 重複的 devDependencies（`@standard-schema/spec`, `zod-to-json-schema`）
- `.editorconfig` `max_line_length` 從 80 改為 120，與 Prettier `printWidth` 一致

### Changed — Phase 2: 工具鏈強化

#### 🔧 ESLint 覆蓋擴充
- 新增 4 條規則：`no-floating-promises`, `no-misused-promises`, `await-thenable`, `consistent-type-exports`
- `no-explicit-any` 和 `no-unused-vars` 維持 `warn`，新規則初期設為 `warn` 以漸進改善
- 修復 `tool/swarm.ts` 的 `consistent-type-imports` error

#### ⚡ Turbo Pipeline 補全
- `turbo.json` 新增通用 `lint` 和 `test` tasks（原僅覆蓋 4 個特定套件，現 19 個全識別）
- Root `lint` script 改用 `bun turbo lint`（原僅 lint `packages/opencode`）
- 修復 `dev:console` 在 Windows 上因 `ulimit` 失敗的問題

### Changed — Phase 3: 架構優化

#### 🏗️ Provider Module 拆分
- 提取 `provider/models-dev-convert.ts`（84 行）— ModelsDev 到 Provider 類型轉換
- 提取 `provider/helpers.ts`（120 行）— bundled providers 映射、SSE 包裝、E2E URL 等工具函數
- `provider/provider.ts` 從 1709 行縮減至 1523 行

#### 🔄 共用工具統一
- 合併 `@opencode-ai/util/fn.ts` 和 `packages/opencode/src/util/fn.ts` 為單一實作
- 統一版本含 schema validation 失敗時的 debug trace
- Core 的 3 個檔案改用共享版本，移除重複的 `fn.ts`

### Changed — UltraPlan 功能增強

#### 🧭 深度規劃升級
- Prompt 模板移至 `agent/prompt/ultraplan.txt`，與其他 agent 慣例一致
- 三種深度模式加入結構化探索指令：
  - `standard`: 直接分析
  - `deep`: 要求先用 glob/grep 探索相關檔案
  - `comprehensive`: 系統性目錄結構、依賴圖、測試覆蓋分析
- 模型選擇改為 context window 最大的 active model（不再硬編碼 opus/sonnet）
- 結果擷取改為合併所有 text parts（不再只取最後一段）
- 新增 `webfetch`、`websearch`、`codesearch` 權限
- 移除 deprecated `tools` 參數，改用 session-level `permission`
- 新增「Current State Analysis」輸出段落，要求引用具體檔案路徑和行號

## [1.4.001] - 2026-04-11

### Added

#### 🐝 Swarm 调度升級
- **自動複雜度評估**: 分析 goal 自動判斷 straightforward / standard / medium / high
- **策略選擇**: depth-first（同題多角度）、breadth-first（多子題）、straightforward（簡單任務）
- **Chain mode**: 新增串行模式，任務依序執行，用 `$PREV` 引用前一個輸出
- **結果合成**: 多個 subagent 結果交給 Leader 綜合分析
- **Auto agent count**: 1~20 個 subagent，按複雜度自動計算
- **Strategy override**: 可手動指定 `depth-first` / `breadth-first` / `auto`

#### 🧠 Memory CRUD Tool + Auto-Memory
- `memory` tool — commands: view / write / append / delete / list
- `AutoMemory.recordSessionSummary()` — 自動記錄 session 摘要
- **三層記憶架構**: Auto-Memory (auto, per-session) + Memory CRUD (agent proactive) + MemPalace (long-term semantic search)
- Auto-memory trigger on: processor end, TUI exit, agent manual write
- System prompt 注入最近 3 次 session summaries

#### 🔧 ESLint + 嚴格規則
- `@typescript-eslint/no-explicit-any` (warn)
- `@typescript-eslint/no-unused-vars` (warn)
- `@typescript-eslint/consistent-type-imports` (error)
- `no-console` (warn)
- Replaced fake `lint`/`format`/`docs`/`deploy` scripts with real ones

#### 🧪 Tests (47 total)
- `swarm.test.ts` — parameter validation (8 tests)
- `send_message.test.ts` — parameters + security (7 tests)
- `task-mgmt.test.ts` — parameter validation (6 tests)
- `cron.test.ts` — cron parser (14 tests)
- `registry.test.ts` — tool loading (3 tests)
- `agent-memory.test.ts` — memory CRUD (9 tests)

### Fixed — Architecture Fixes (21 issues, 4 phases)

#### Phase 1: Critical
- `task-mgmt.ts` import 錯誤 (task.txt → task-mgmt.txt)
- `cron.ts` 排程器未啟動 → 加入 `startScheduler()` 在 registry init 時啟動

#### Phase 2: Security
- `send_message` agent name sanitize（防 `../` 路徑穿越）
- `send_message` per-mailbox lock（防 TOCTOU 競態）
- `ultraplan` bash 權限限縮為 read-only 命令（防 `echo > file` 繞過）
- `task-mgmt` nextId 改為 await init（防 ID 競態衝突）
- `send_message` 廣播每個收件人獨立 msg ID

#### Phase 3: Medium
- `swarm` ctx 型別從 `any` 改為 `Tool.Context`
- `memory` Bus.subscribe 儲存 unsubscribe ref（防訂閱洩漏）
- `memory_search` 改用 `python3` + 傳 `MEMPALACE_PATH` 環境變數
- `skill.ts` 移除重複的動態描述

#### Phase 4: Low
- `package.json` 移除 random script / randomField
- `cron.ts` 描述檔從 `readFileSync` 改為 `import`
- Root test script 改為 `bun turbo test`
- `index.ts` ResolveMessage Bun global 宣告

### Changed
- ESLint: fork 模組消除 `any` 型別 (swarm, memory, tool_search)
- `.gitignore` 加入 dev scratch files, `docs/plans/` 加入版控
- `brian_main` → `dev` branch push workflow

## [0.4.0] - 2026-04-10

### Added

#### 🔍 Tool Search
- `tool_search` tool — discover available tools by keyword or `select:` prefix
- 27 tools in static catalog with weighted scoring
- Name match (+10/+5), description match (+3/+1)

#### 🧠 autoDream Dual Gates
- **Time Gate**: ≥24 hours since last consolidation
- **Session Gate**: ≥5 session compactions since last consolidation
- Incremental mining every session; full consolidation only when both gates pass
- Dream state persisted to `~/.opencode/dream-lock.json`
- Inspired by Claude Code's autoDream architecture

#### 🤖 Agent Memory
- Per-agent persistent memory at `~/.opencode/agent-memory/<agentName>/MEMORY.md`
- Auto-injected into system prompt at session start
- Agents can update their memory using the standard `write` tool
- Survives across sessions — agents accumulate knowledge over time

#### ⏰ Cron Scheduler
- `cron` tool with create/list/delete actions
- 5-field cron expression parser (M H DoM Mon DoW)
- Supports wildcards, ranges, steps, and comma-separated values
- Task persistence to `~/.opencode/cron-tasks.json`
- One-shot (recurring: false) auto-delete after firing
- Up to 50 tasks maximum

#### 🧪 Tests
- 35 tests passing across 3 test files
- `cron.test.ts` — cron parser (14 tests)
- `dream-gates.test.ts` — autoDream gate logic (12 tests)
- `agent-memory.test.ts` — agent memory CRUD (9 tests)

### Changed
- Default model for hidden agents (compaction/title/summary) set to `zai/glm-4.7`
- MemPalace dream now dual-gated instead of firing on every compaction

## [0.3.0] - 2026-04-10

### Changed
- **Redesigned agent model mapping** for optimal cost/performance:
  - Plan → glm-5.1 (flagship brain for architecture)
  - Build → glm-5-turbo (fast code gen & tool calls)
  - Review → glm-5 (strict gatekeeper, new subagent)
  - Explore → glm-5v-turbo (vision-capable explorer)
  - Ultraplan → glm-5.1 (deep planning)
  - General → glm-4.7 (lightweight assistant)

### Added
- **glm-5.1** model — z.ai flagship for long-horizon tasks
- **glm-5v-turbo** model — vision-capable (attachment: true)
- **glm-4.7** model — cost-effective for daily tasks
- **Review agent** — read-only subagent for bug detection and logic review
- OpenCLI Browser Bridge extension connected and verified
- Repo visibility set to private

## [0.2.0] - 2026-04-10

### Added

#### 🐝 Swarm Team Lead Mode
- **Leader mode**: Describe a high-level goal, Team Lead agent automatically breaks it into 2-5 parallel subtasks
- **Parallel mode**: Original explicit task specification preserved
- `TaskTracker` with status indicators (pending/running/done/error)
- Improved result formatting with ✓ ⟳ ✗ status

#### 📋 Task Management
- `task` tool with 4 actions: create, update, list, get
- Status workflow: `pending` → `in_progress` → `completed` / `deleted`
- Task dependencies via `blocks` and `blockedBy`
- Auto-unblock dependents when task completes
- Owner assignment for team coordination
- File-based persistence (`~/.opencode/tasks/`)

#### ✉️ Mailbox Messaging
- Replaced in-memory Map with file-based mailbox system
- Direct messages to specific agents
- Broadcast (`*`) to all teammates
- Messages persist across session restarts (`~/.opencode/mailboxes/`)
- 100 message cap per mailbox

#### 🌐 Browser Automation
- `browser` tool with 13 operations via OpenCLI daemon
- navigate, click, type, evaluate, screenshot, content
- tabs, select_tab, cookies, scroll, wait, url, status
- Anti-detection stealth injection on navigate
- Screenshot save to file support

#### 🤖 Per-Agent Model Configuration
- Assign different LLM models to different agents in config
- `build` → zai/glm-5 (main development)
- `plan` → zai/glm-4.7-flash (fast analysis)
- `general` → zai/glm-5-turbo (sub-agent tasks)
- Added GLM-5 Turbo and GLM-4.7 Flash models to z.ai provider

#### 🧠 Dream Auto-Trigger
- `Memory.dream()` auto-triggers on `session.compacted` bus event
- Uses `Bus.subscribe()` for clean event subscription
- Fire-and-forget to avoid blocking compaction

### Changed
- `send_message` tool now uses file-based mailbox instead of globalThis Map
- `swarm` tool now uses `discriminatedUnion("mode")` for leader/parallel modes
- Agent model configuration via `.opencode/opencode.jsonc`

## [0.1.0] - 2026-04-09

### Added
- **MemPalace Memory System** — `src/memory/index.ts` with wakeUp(), search(), dream()
- **memory_search tool** — agent can search long-term memories
- **Swarm tool** — run 2-5 agent tasks in parallel
- **send_message tool** — inter-agent communication
- **z.ai Provider** — config-based GLM-5 model setup
- **Auto-inject MemPalace L0+L1** into system prompt via `instruction.ts`
- **opencode.cmd wrapper** — run from any project directory
- **ACP integration** — OpenCode as ACP harness for OpenClaw
- **繁中 README** (`README.zht.md`) and **使用指南** (`USERGUIDE.zht.md`)
- **Private repo** at `brianshih04/opencode`
