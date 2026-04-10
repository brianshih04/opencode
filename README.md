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

# Install dependencies
bun install

# Start TUI
bun run dev

# Or one-shot mode
bun run dev run --model zai/glm-5-turbo "your prompt here"
```

#### Optional: opencode.cmd Wrapper

Create a wrapper script to run from any project directory:

```batch
@echo off
setlocal
cd /d D:\Projects\opencode\packages\opencode
C:\Users\Brian\.bun\bin\bun.exe run dev %*
```

Save to a directory in your PATH (e.g. `C:\Users\Brian\.openclaw\bin\opencode.cmd`).

#### Browser Automation Setup

1. Clone [OpenCLI](https://github.com/brianshih04/opencli) and build: `npm run build`
2. Start the daemon: `node dist/src/main.js`
3. Install the Chrome Extension from `extension/dist/` (Load unpacked in `chrome://extensions/`)
4. Daemon runs on `localhost:19825` — verify with `node dist/src/main.js doctor`

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
- Auto-trigger `dream()` on session compaction — mines conversation transcripts into memory palace
- Multi-source: conversations, code, documents can all be mined

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
