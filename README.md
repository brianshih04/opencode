<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent — <strong>Enhanced Fork</strong></p>
<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zht.md">繁體中文</a>
</p>

---

This is an enhanced fork of [OpenCode](https://github.com/anomalyco/opencode) with memory, multi-agent coordination, browser automation, and per-agent model configuration.

### Prerequisites

- [Bun](https://bun.sh) runtime
- `ZAI_API_KEY` environment variable

### Installation

```bash
# Clone this repo
git clone https://github.com/brianshih04/opencode.git
cd opencode

# Switch to brian_main branch
git checkout brian_main

# Install dependencies
bun install

# Start TUI
bun run dev

# Or one-shot mode
bun run dev run --model zai/glm-5-turbo "your prompt here"
```

#### Global `opencode` Command (Windows)

Create a wrapper to run from any directory:

```powershell
# 1. Create bin directory
mkdir $env:USERPROFILE\.openclaw\bin -Force

# 2. Create wrapper script (replace E:\Projects\opencode with your path)
"@"
@echo off
setlocal
cd /d E:\Projects\opencode
bun run dev %*
"@ | Set-Content $env:USERPROFILE\.openclaw\bin\opencode.cmd

# 3. Add to PATH
[Environment]::SetEnvironmentVariable("PATH", "$([Environment]::GetEnvironmentVariable('PATH','User'));$env:USERPROFILE\.openclaw\bin", "User")

# 4. Restart terminal, then:
opencode                                    # TUI mode
opencode run --model zai/glm-5-turbo "fix"  # One-shot
```

#### Browser Automation Setup

1. Clone [OpenCLI](https://github.com/brianshih04/opencli)
2. Install: `npm install --ignore-scripts` (Windows: skip bash prepare script)
3. Build: `npm run build`
4. Start daemon: `node dist/src/main.js`
5. Install Chrome Extension from `extension/dist/` (Load unpacked in `chrome://extensions/`)
6. Daemon runs on `localhost:19825` — verify with `node dist/src/main.js doctor`

### Agents

Six agents, each mapped to the optimal model:

| Agent | Model | Role | Mode |
|-------|-------|------|------|
| **plan** | zai/glm-5.1 | 🧠 Flagship brain — architecture & long-horizon planning | Primary, read-only |
| **build** | zai/glm-5-turbo | ⚡ Efficiency engine — fast code gen & tool calls | Primary, full access |
| **review** | zai/glm-5 | 🛡️ Strict gatekeeper — bug detection & logic review | Subagent, read-only |
| **explore** | zai/glm-5v-turbo | 👁️ Visual explorer — codebase search with image support | Subagent |
| **ultraplan** | zai/glm-5.1 | 📋 Deep planner — structured plans with risk assessment | Subagent, read-only |
| **general** | zai/glm-4.7 | 💡 Lightweight assistant — daily tasks, git ops | Subagent |

Switch in TUI with `Tab` (build ↔ plan), or specify via CLI: `--agent build`

### Slash Commands & CLI Usage

```bash
# One-shot with specific model and agent
opencode run --model zai/glm-5-turbo --agent build "Fix the auth bug"
opencode run --model zai/glm-5.1 --agent plan "Analyze the architecture"

# TUI interactive mode
opencode
#   Tab       — Switch between build/plan agents
#   Ctrl+K   — Switch model
#   /compact  — Compact conversation history
#   /new      — Start new session
#   /status   — Show session status

# From any project directory
opencode D:\Projects\my-project
```

### Custom Extensions (Fork Additions)

#### 🧠 MemPalace Memory System

Long-term memory via [MemPalace](https://github.com/user/mempalace).
- Auto-injects L0+L1 context into system prompt on startup
- `memory_search` tool for querying past conversations and project knowledge
- **autoDream with dual gates**: Time Gate (≥24h) + Session Gate (≥5 compactions) — incremental mining every session, full consolidation when both gates pass
- Dream state persisted to `~/.opencode/dream-lock.json`
- Multi-source: conversations, code, documents can all be mined

#### 🤖 Agent Memory

Each agent has its own persistent memory file:
- Stored at `~/.opencode/agent-memory/<agentName>/MEMORY.md`
- Auto-injected into system prompt at session start
- Agents can read/write their memory using the standard `write` tool
- Survives across sessions — agents learn and remember over time

#### 🔍 Tool Search

Discover available tools at runtime:
- Keyword search across 27 tools by name and description
- `select:name1,name2` for direct tool selection
- Weighted scoring: name match (10) > name part (5) > description word (3)
- Returns tool name, description, and usage hints

#### ⏰ Cron Scheduler

Schedule recurring or one-shot tasks:
- Standard 5-field cron expressions (`M H DoM Mon DoW`)
- Create/list/delete actions
- Task persistence to `~/.opencode/cron-tasks.json`
- One-shot tasks auto-delete after firing
- Up to 50 tasks maximum

#### 🐝 Swarm Parallel Agents

Two modes for multi-agent coordination:
- **Leader mode** — Describe a high-level goal, a Team Lead agent automatically breaks it into 2-5 parallel subtasks and executes them
- **Parallel mode** — Manually specify exact tasks to run concurrently
- TaskTracker with status indicators (✓ ⟳ ✗)

#### 📋 Task Management

Persistent task tracking with file-based storage (`~/.opencode/tasks/`):
- Create/update/list/get tasks
- Status workflow: `pending` → `in_progress` → `completed` / `deleted`
- Task dependencies via `blocks` and `blockedBy`
- Auto-unblock dependents when task completes

#### ✉️ Inter-Agent Messaging

File-based mailbox system (`~/.opencode/mailboxes/`):
- Direct messages to specific agents
- Broadcast (`*`) to all teammates
- Messages persist across session restarts

#### 🌐 Browser Automation

Control Chrome via [OpenCLI](https://github.com/brianshih04/opencli) daemon + extension:
- 13 operations: navigate, click, type, evaluate, screenshot, content, tabs, select_tab, cookies, scroll, wait, url, status
- Anti-detection stealth injection

#### 🤖 Per-Agent Model Configuration

Configure in `.opencode/opencode.jsonc`:
```jsonc
{
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

#### z.ai Provider

Built-in config for z.ai models (GLM-5.1, GLM-5, GLM-5 Turbo, GLM-5V Turbo, GLM-4.7).
Set `ZAI_API_KEY` environment variable to activate.

### Configuration

`.opencode/opencode.jsonc` — see the [full config reference](https://opencode.ai/docs).

### Documentation

- [OpenCode Docs](https://opencode.ai/docs) — upstream documentation
- [CHANGELOG.md](./CHANGELOG.md) — fork changelog
- [USERGUIDE.zht.md](./USERGUIDE.zht.md) — Traditional Chinese user guide

### Upstream

Based on [anomalyco/opencode](https://github.com/anomalyco/opencode). See upstream README for the original feature set and contribution guidelines.
