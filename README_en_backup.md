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
  <a href="README_cht.md">繁體中文</a>
</p>

---

An enhanced fork of [OpenCode](https://github.com/anomalyco/opencode) with long-term memory, multi-agent coordination, browser automation, bidirectional Telegram integration, and per-agent model configuration.

> **v0.6.003** — OpenClaw Bridge with bidirectional Telegram integration (`/ocread`, `/ocwrite`, `/ocsend`)

---

## Features

### 🧠 Memory System

Three-layer memory architecture:

- **MemPalace** — Long-term semantic memory via ChromaDB. Auto-injects L0+L1 context into system prompt. `memory_search` tool for querying past conversations.
- **Agent Memory** — Each agent has its own persistent memory file at `~/.opencode/agent-memory/<agent>/MEMORY.md`. Survives across sessions.
- **Auto-Memory** — Automatic session summaries stored and injected into system prompt (last 3 sessions).
- **autoDream Dual Gates** — Time Gate (≥24h) + Session Gate (≥5 compactions). Incremental mining every session, full consolidation when both gates pass.

### 🤖 Multi-Agent System

Six specialized agents, each mapped to the optimal model:

| Agent | Model | Role |
|-------|-------|------|
| **plan** | zai/glm-5.1 | 🧠 Flagship — architecture & long-horizon planning |
| **build** | zai/glm-5-turbo | ⚡ Fast — code generation & tool calls |
| **review** | zai/glm-5 | 🛡️ Gatekeeper — bug detection & logic review |
| **explore** | zai/glm-5v-turbo | 👁️ Visual — codebase search with image support |
| **ultraplan** | zai/glm-5.1 | 📋 Deep planner — 3 depth levels, auto model selection |
| **general** | zai/glm-4.7 | 💡 Lightweight — daily tasks & git ops |

Switch in TUI with `Tab`, or via CLI: `--agent build`

### 🐝 Swarm Parallel Agents

Three coordination modes:

- **Leader mode** — Describe a goal. Auto-assesses complexity, picks strategy (depth-first / breadth-first / straightforward), spawns 1-20 subagents.
- **Chain mode** — Sequential pipeline. Each task receives previous output via `$PREV`.
- **Parallel mode** — Manually specify tasks to run concurrently.

### 🌉 OpenClaw Bridge (Telegram Integration)

Bidirectional communication between OpenCode and Telegram via [OpenClaw](https://docs.openclaw.ai):

- **Read conversations** — `/ocread` (or `/ocr`) shows last 100 messages from OpenCode sessions
- **Send messages** — `/ocwrite <msg>` (or `/ocw <msg>`) sends a prompt to OpenCode's active session
- **Reply to questions** — `/ocsend <qid> <choice>` answers OpenCode's tool confirmation requests
- **File-system IPC** — Zero-dependency mailbox pattern using `~/.opencode/bridge/`

### 🌐 Browser Automation

Control Chrome via [OpenCLI](https://github.com/brianshih04/opencli) daemon + extension:

- 13 operations: navigate, click, type, evaluate, screenshot, content, tabs, cookies, scroll, wait, url, status
- Anti-detection stealth injection

### ⏰ Cron Scheduler

Schedule recurring or one-shot tasks with 5-field cron expressions. Up to 50 tasks, persisted to `~/.opencode/cron-tasks.json`.

### 📋 Task Management

Persistent task tracking with dependencies, status workflow (`pending` → `in_progress` → `completed`), and file-based storage.

### ✉️ Inter-Agent Messaging

File-based mailbox system at `~/.opencode/mailboxes/`. Direct messages, broadcast (`*`), persists across sessions.

### 🔍 Tool Search

Discover 61+ available tools at runtime with keyword search and weighted scoring.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime
- `ZAI_API_KEY` environment variable ([z.ai](https://z.ai))

### Installation

```bash
git clone https://github.com/brianshih04/opencode.git
cd opencode
bun install
```

### Running

```bash
# Interactive TUI
bun run dev

# One-shot mode
bun run dev run --model zai/glm-5-turbo "fix the auth bug"

# Specific agent
bun run dev run --agent plan --model zai/glm-5.1 "analyze the architecture"
```

#### Global Command (Windows)

```powershell
# Create wrapper
mkdir $env:USERPROFILE\.openclaw\bin -Force
@"
@echo off
setlocal
cd /d D:\Projects\opencode
bun run dev %*
"@ | Set-Content $env:USERPROFILE\.openclaw\bin\opencode.cmd

# Add to PATH
[Environment]::SetEnvironmentVariable("PATH",
  "$([Environment]::GetEnvironmentVariable('PATH','User'));$env:USERPROFILE\.openclaw\bin", "User")

# Use from anywhere
opencode
opencode run --model zai/glm-5-turbo "fix tests"
```

---

## Configuration

### `.opencode/opencode.jsonc`

```jsonc
{
  // Enable OpenClaw Bridge (Telegram integration)
  "bridge": { "enabled": true },

  // Per-agent model configuration
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

### OpenClaw Bridge Setup

1. Enable bridge in config: `"bridge": { "enabled": true }`
2. Start OpenCode with `bun run dev` (global `opencode` won't have bridge changes)
3. Install the `opencode-bridge` skill in OpenClaw:

```bash
# Copy skill to OpenClaw workspace
xcopy /E /I openclaw_skills\opencode-bridge %USERPROFILE%\.openclaw\workspace\skills\opencode-bridge\
```

4. Use slash commands in Telegram: `/ocread`, `/ocwrite <msg>`, `/ocsend <qid> <choice>`

### Browser Automation Setup

1. Clone [OpenCLI](https://github.com/brianshih04/opencli)
2. Install: `npm install --ignore-scripts`
3. Build: `npm run build`
4. Start daemon: `node dist/src/main.js`
5. Load Chrome Extension from `extension/dist/` in `chrome://extensions/`

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Bun 1.3.11 |
| **Monorepo** | Turborepo + Bun Workspaces (19 packages) |
| **Core Framework** | Effect v4 (beta.43) |
| **AI SDK** | Vercel AI SDK v6 |
| **Database** | Drizzle ORM (SQLite) |
| **Web** | Hono |
| **UI** | SolidJS + Solid Start |
| **Desktop** | Tauri (also Electron) |
| **Type System** | TypeScript 5.8 + tsgo native typecheck |

### Monorepo Structure

| Package | Purpose |
|---------|---------|
| `opencode` | **Core** — Agent, Session, Provider, Tool, Memory, Bridge |
| `app` | SolidJS Web App |
| `ui` | Shared UI components |
| `desktop` | Tauri desktop app |
| `desktop-electron` | Electron desktop app |
| `sdk` | JavaScript SDK |
| `plugin` | Plugin system |
| `enterprise` | Enterprise features |
| `util` | Shared utilities |

### Key Directories (`packages/opencode/src/`)

- `agent/` — 6 agents + dynamic generation
- `provider/` — 20+ AI providers via Vercel AI SDK
- `tool/` — 61+ built-in tools
- `bridge/` — OpenClaw Bridge (outgoing, incoming, watcher)
- `bus/` — Effect PubSub event system
- `session/` — Session management with auto-compaction
- `memory/` — MemPalace + autoDream integration
- `config/` — Zod-validated configuration

---

## TUI Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Switch agent (build ↔ plan) |
| `Ctrl+K` | Switch model |
| `Ctrl+P` | Commands |
| `/compact` | Compact conversation history |
| `/new` | Start new session |
| `/status` | Show session status |

---

## Providers

Built-in support for 20+ providers via Vercel AI SDK:

OpenAI, Anthropic, Google, Azure, Bedrock, Groq, Mistral, Cohere, Perplexity, XAI, Cerebras, TogetherAI, DeepInfra, OpenRouter, GitLab, Venice, and more — plus custom OpenAI-compatible endpoints.

---

## Links

- [CHANGELOG.md](./CHANGELOG.md) — Fork changelog
- [OpenCode Docs](https://opencode.ai/docs) — Upstream documentation
- [OpenClaw Docs](https://docs.openclaw.ai) — OpenClaw integration

## Upstream

Based on [anomalyco/opencode](https://github.com/anomalyco/opencode). See upstream README for the original feature set and contribution guidelines.

## License

Same as upstream OpenCode.
