# Changelog

All notable changes to this fork of OpenCode will be documented in this file.

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
