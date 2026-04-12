# Codebase Improvement Plan

**Date:** 2026-04-12
**Branch:** dev_0411_2
**Status:** Planning

## Current State Summary

| Metric | Value | Trend |
|--------|-------|-------|
| Typecheck | 0 errors, 13/13 packages | Stable |
| ESLint | 0 errors, 447 warnings | Stable |
| `any` types | 209 occurrences / 42 files | Down from 118 (scoped) |
| `console.*` remnants | 109 occurrences / 14 files | Unchanged |
| TODO/FIXME | 15 items / 14 files | Unchanged |
| Files > 1000 lines | 6 files | Unchanged |
| Total source files | 311 files / ~62K lines | — |

---

## Phase A: High-Impact Quick Wins

### A1. `console.*` Cleanup (109 occurrences)

**Effort:** Small
**Impact:** Medium — removes debug noise from production code

Hot spots:
- `util/stats.ts` — 41 occurrences
- `cli/cmd/github.ts` — 42 occurrences

Strategy:
1. Replace `console.log/warn/error` with the existing `Log` utility (`src/util/log.ts`)
2. Remove pure debug `console.log` calls that serve no production purpose
3. Keep intentional console output in CLI-facing code (e.g. `console.error` for user-facing errors)

### A2. ESLint `no-unused-vars` Cleanup (447 warnings)

**Effort:** Medium
**Impact:** Medium — reduces dead code, improves readability

Strategy:
1. Run `eslint --fix` for auto-fixable cases (unused imports)
2. Manually review and remove genuinely unused variables
3. Prefix intentionally unused params with `_` convention

### A3. TODO/FIXME Audit (15 items)

**Effort:** Small
**Impact:** Low-Medium — surface hidden tech debt

Strategy:
1. Catalog each TODO/FIXME with owner and priority
2. Resolve or convert to GitHub issues
3. Remove stale/outdated comments

---

## Phase B: Type Safety Improvements

### B1. `any` Type Reduction (209 occurrences)

**Effort:** Large
**Impact:** High — catches bugs at compile time

Priority order (biggest hotspots first):
1. `provider/provider.ts` — 16 `any` occurrences
2. `util/log.ts` — 11 occurrences
3. `tool/browser.ts` — 5 occurrences
4. Remaining 39 files — 177 occurrences

Strategy:
- Replace `any` with proper types or `unknown` + type guards
- Use branded types for IDs (partially done via `ToolID`)
- Focus on public API boundaries first, internal code second

### B2. `noUncheckedIndexedAccess` (967 errors)

**Effort:** Very Large
**Impact:** High — prevents runtime undefined access errors

Strategy:
- Long-term goal, enable per-module instead of globally
- Start with new code and leaf modules (fewest dependencies)
- Use `!` non-null assertion only when genuinely guaranteed

---

## Phase C: Architecture — Large File Refactoring

### C1. Top Priority Files (>1500 lines)

| File | Lines | Proposed Split |
|------|-------|----------------|
| `lsp/server.ts` | 1,968 | Extract: diagnostics handler, completion handler, hover handler |
| `session/prompt.ts` | 1,917 | Extract: tool execution loop, structured output, message building |
| `acp/agent.ts` | 1,847 | Extract: agent lifecycle, tool routing, message processing |
| `provider/sdk/copilot/responses/openai-responses-language-model.ts` | 1,769 | Extract: response conversion, tool handling, streaming |
| `cli/cmd/github.ts` | 1,646 | Extract: PR creation, issue management, triage logic |
| `config/config.ts` | 1,600 | Extract: schema validation, environment detection, defaults |

Strategy:
- Extract cohesive responsibilities into separate modules
- Maintain backward compatibility via re-exports
- One file per PR to keep reviews manageable

### C2. Second Priority Files (500-1500 lines)

| File | Lines |
|------|-------|
| `provider/transform.ts` | 1,050 |
| `cli/cmd/tui/plugin/runtime.ts` | 1,031 |
| `server/routes/session.ts` | 1,031 |
| `session/message-v2.ts` | 1,031 |
| `mcp/index.ts` | 921 |
| `session/index.ts` | 887 |
| `provider/sdk/copilot/chat/...-chat-language-model.ts` | 816 |
| `cli/cmd/mcp.ts` | 754 |
| `patch/index.ts` | 680 |
| `file/index.ts` | 686 |
| `cli/cmd/run.ts` | 689 |

---

## Phase D: Wave 2 Feature Completion (Paused)

### Current Progress

**Step 1: Hooks BusEvent + Config Schema** — Partial
- [x] ToolEvent (BeforeUse/AfterUse) BusEvent in `prompt.ts`
- [x] Registry tool execute Bus.publish
- [ ] MCP tool execute Bus.publish
- [ ] Session started/ended BusEvent
- [ ] Compaction before/after BusEvent
- [ ] Config schema `hooks` field

**Steps 2-4:** All pending
- [ ] Step 2: HookRunner Service
- [ ] Step 3: Snip
- [ ] Step 4: Micro Compact + Pipeline

### Prerequisites
- Phase A/B improvements should be done first to reduce merge conflicts
- Large file refactoring (Phase C) for `prompt.ts` and `session/index.ts` should happen before Step 2

---

## Phase E: Uncommitted Work Resolution

### Pending Changes (not yet committed)
- `packages/opencode/src/session/instruction.ts` — modified
- `packages/opencode/src/session/prompt.ts` — modified (Wave 1 turn-budget-warning)
- `packages/opencode/src/session/prompt/turn-budget-warning.txt` — untracked
- `bun.lock` — modified
- `.claude/settings.local.json` — modified

### Action Items
1. Review and commit Wave 1 changes (turn-budget-warning + parallel tool strategy)
2. Review `instruction.ts` changes and commit or discard
3. Clean up `.claude/settings.local.json`

---

## Recommended Execution Order

1. **Phase E** — Commit pending work (clears the deck)
2. **Phase A** — Quick wins, low risk, immediate quality improvement
3. **Phase B1** — `any` reduction, high impact on code correctness
4. **Phase C1** — Large file refactoring (prerequisite for Wave 2)
5. **Phase D** — Resume Wave 2 (Hooks + Compaction)
6. **Phase B2** — `noUncheckedIndexedAccess` (ongoing, per-module)
7. **Phase C2** — Second priority file refactoring (ongoing)
