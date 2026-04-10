# Contributing to OpenCode (Fork)

This is a personal fork. Contributions are welcome but informal.

## Development Setup

```bash
bun install
bun run dev                          # Start TUI
bun run dev run --model zai/glm-5-turbo "prompt"  # One-shot
```

### Key Commands

```bash
bun typecheck          # From packages/opencode
bun dev <directory>    # Run against specific project
bun dev serve          # Headless API server
bun dev web            # Web interface
```

## Branch & Commit

- Branch: `brian_main`
- Push: `git push origin brian_main --no-verify` (pre-push hook has upstream-only checks)
- Commit style: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)

## Architecture

- **Runtime**: Bun (TypeScript, no compile step for `bun run dev`)
- **Framework**: Effect v4
- **Config**: `.opencode/opencode.jsonc`
- **Custom tools**: `packages/opencode/src/tool/`
- **Memory**: `packages/opencode/src/memory/`
- **Agents**: 6 agents with per-agent model mapping

See [AGENTS.md](./AGENTS.md) for the full style guide and Effect v4 notes.

## Upstream

Based on [anomalyco/opencode](https://github.com/anomalyco/opencode). See upstream CONTRIBUTING.md for original guidelines.
