# AGENTS.md — Fork Development Guide

## Branch Strategy
- Default branch: `brian_main`
- All changes on `brian_main`, pushed to `brianshih04/opencode`
- Use `--no-verify` on push (pre-push hook fails on `desktop-electron` typecheck, not our code)

## Style Guide

### General Principles
- Keep things in one function unless composable or reusable
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Prefer single word variable names where possible
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations unless necessary

### Naming (Mandatory)
- Use single word names by default for new locals, params, and helper functions
- Multi-word names only when a single word would be unclear
- Good: `pid`, `cfg`, `err`, `opts`, `dir`, `root`, `child`, `state`
- Bad: `inputPID`, `existingClient`, `connectTimeout`

### Effect v4 Notes
- `catchAll` does NOT exist — use `Effect.catch` or `Effect.catchTag`
- Strict typing requires matching error/context channels
- Plain functions preferred over Service/Layer for custom modules (avoids v4 boilerplate)

### Tool Definitions
- `Tool.define` description must be a static string (not dynamic) due to type constraints
- Tool `.txt` prompt files are separate from `.ts` implementation

## Key Architecture
- Runtime: Bun (runs TypeScript directly, no recompile for `bun run dev`)
- Framework: Effect v4
- Config: `.opencode/opencode.jsonc` (z.ai provider + agent model mapping)
- Custom tools: `src/tool/` — browser.ts, memory_search.ts, swarm.ts, send_message.ts, task-mgmt.ts
- Memory: `src/memory/index.ts` — MemPalace integration
- Auto-dream: `Memory.initDreamOnCompaction()` via `Bus.subscribe(SessionCompaction.Event.Compacted)`

## Testing
- Always run `bun typecheck` from `packages/opencode`, never `tsc` directly
- Tests cannot run from repo root; run from `packages/opencode`
