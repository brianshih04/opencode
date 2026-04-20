# cc-clone → opencode 移植計畫 v2

> 將 Claude Code（cc-clone）的優秀設計移植到 opencode fork
> 基於 brianshih04 的實際 codebase 盤點更新

---

## 已完成（不需移植）

| 功能 | 現有實作位置 | 備註 |
|------|-------------|------|
| Doom Loop 偵測 | `processor.ts` | threshold=3 |
| Tool Output 截斷 | `Tool.define()` | 2k 行/50KB + 暫存檔溢位 |
| Tool Search | `tool_search.ts` | 28 工具目錄 |
| Folder-per-Skill | `skill.ts` | 多目錄掃描、子資料夾結構 |
| Context 指示器 | TUI 側邊欄 + prompt footer | token 用量百分比 |
| Git 積分統計 | Snapshot system | 完整差異追蹤 |

---

## 執行計畫

### Wave 1：快速見效（1 週內）

#### 1.1 Turn Budget Warning

**工作量**：30 分鐘 | **優先級**：P0

在 `session/processor.ts` 的 event loop 中，當剩餘 steps 接近上限時注入提醒。

```
位置：processor.ts event loop
邏輯：
  if (currentStep >= maxSteps - 2 && !budgetWarned) {
    messages.push({
      role: "user",
      content: "URGENT: You are about to run out of steps. Wrap up NOW."
    })
    budgetWarned = true
  }
```

**驗收**：agent 在接近 step 上限時自動收尾，不再突然中斷。

---

#### 1.2 工具並行策略

**工作量**：4 小時 | **優先級**：P1

read-only 工具並行，write 工具序列。

```
位置：processor.ts tool call 處理邏輯

readOnlyTools = ["read", "glob", "grep", "ls", "codesearch", "webfetch", "websearch", "memory_search", "tool_search"]

分流邏輯：
  const readOnly = calls.filter(c => readOnlyTools.includes(c.tool))
  const write = calls.filter(c => !readOnlyTools.includes(c.tool))

  // 並行跑 read-only
  await Effect.all(readOnly.map(execute))
  // 序列跑 write
  for (const call of write) await execute(call)
```

**參考**：cc-clone `toolOrchestration.ts` 的 `canRunConcurrently()` 設計

**驗證**：兩個 write 工具修改同一檔案時不會 race condition。

---

### Wave 2：基礎建設（1-2 週）

#### 2.1 Hooks 事件系統

**工作量**：2-3 天 | **優先級**：P0

利用現有 `Bus` pub/sub 系統擴展，新增 tool lifecycle hooks。

**新增檔案**：
```
src/hooks/index.ts      — Hook 定義、註冊、執行
src/hooks/config.ts     — hooks 配置解析（opencode.jsonc）
src/hooks/executor.ts   — Hook 執行器（async，不 block 主流程）
```

**BusEvent 新增**：
```
Tool.BeforeExecute  — { tool_name, tool_input }
Tool.AfterExecute   — { tool_name, output, is_error, duration_ms }
Session.Start       — { session_id }
Session.End         — { session_id, turns_used }
Compaction.Before   — { strategy }
Compaction.After    — { strategy, tokens_before, tokens_after }
```

**配置格式**（加入 opencode.jsonc）：
```jsonc
{
  "hooks": [
    {
      "type": "command",
      "match": { "event": "after_tool_use", "tool_name": "bash" },
      "command": "echo executed >> /tmp/hooks.log"
    },
    {
      "type": "http",
      "match": { "event": "before_tool_use" },
      "url": "https://example.com/webhook",
      "method": "POST"
    }
  ]
}
```

**設計要點**：
- Hook 失敗只 log warning，不 block 主流程（跟 Leeway 一致）
- Hook 執行用 `Effect.fork`（fire-and-forget）
- `match` 支援 event + tool_name 兩層過濾

**參考**：cc-clone 的 24 個 HookEvent types + Leeway 的 HookExecutor

**驗收**：after_tool_use hook 能正確觸發 command 和 http 兩種類型。

---

#### 2.2 多層 Compaction Pipeline

**工作量**：3-5 天 | **優先級**：P1

現有 `compaction.ts` 有 prune + summarize，缺少三層 pipeline 架構。

**目標架構**：
```
Pipeline：
  Snip    → 移除舊 tool result 的大段輸出（只保留前 N 行 + 摘要）
  Micro   → 精簡 system prompt + 移除冗餘 context
  Full    → 完整 compaction（現有邏輯）

觸發條件：
  Snip:  當 token 用量 > 60%
  Micro: 當 token 用量 > 75%
  Full:  當 token 用量 > 90%（現有觸發點）
```

**新增/修改**：
```
src/session/compaction/
  snip.ts          — Tool result 摘要化
  micro.ts         — System prompt 精簡
  pipeline.ts      — 串接三層，決定觸發策略
  token-budget.ts  — Token 預算追蹤
```

**設計要點**：
- Snip 保留每個 tool result 的前 500 字元 + 行數統計（"[truncated: 2345 lines]"）
- Micro 移除多餘的 system prompt 段落（如已完成的 skill 內容）
- Full compaction 走現有邏輯，只是從 pipeline 呼叫
- 每層透過 BusEvent 通知（Compaction.Before/After）

**參考**：cc-clone `src/services/compact/`（4,600 行，10 個檔案）

**驗收**：長對話中 agent 不會因 context overflow 而品質下降。

---

### Wave 3：進階功能（視需求）

#### 3.1 VCR 錄影系統

**工作量**：2 天 | **優先級**：P2 | **依賴**：Hooks (2.1)

```
新增：
  src/recording/index.ts    — 錄製邏輯（訂閱 Bus.subscribeAll）
  src/recording/replay.ts   — 回放邏輯
  src/recording/format.ts   — JSON 序列化

CLI：
  opencode record            — 開始錄製
  opencode replay <file>     — 回放錄製
```

**設計**：
- 錄製 = 訂閱所有 BusEvent + LLM messages → 寫入 JSON
- 回放 = 讀取 JSON，逐步重播 events
- 格式：`{ version, timestamp, events: [...], messages: [...] }`

**驗收**：可以完整回放一段 agent 對話。

---

#### 3.2 子 Agent Worktree 隔離

**工作量**：1 天 | **優先級**：P2

在 `tool/swarm.ts` 中整合現有 `worktree/index.ts`。

```
流程：
  1. git worktree add -b agent-{uuid} /tmp/opencode-wt-{uuid}
  2. 子 agent cwd = worktree path
  3. 完成後 git worktree remove
```

**驗收**：swarm 子 agent 的檔案修改不影響主工作目錄。

---

## 不移植

| 功能 | 原因 |
|------|------|
| NotebookEdit | 小眾需求，投入產出比低 |
| Buddy 寵物系統 | 純花功能 |
| Undercover Mode | Anthropic 內部專用 |
| Feature Flags (25+) | 過度工程 |
| Ink fork | 架構完全不同 |
| VIM / Voice Mode | 低優先 |

---

## 時程

```
Wave 1（本週）：    Turn Budget (30min) + 工具並行 (4h)
Wave 2（下週）：    Hooks (2-3d) + Compaction Pipeline (3-5d)
Wave 3（之後）：    VCR (2d) + Worktree (1d) — 視需求啟動
```

---

## 風險

1. **授權** — 只借鑒設計思路，不複製 cc-clone 程式碼
2. **Effect v4** — 新功能遵循 opencode 的 Effect 模式
3. **Bus 事件膨脹** — 謹慎設計 event schema，避免 breaking change
4. **向後相容** — hooks config 新增，不修改現有 schema
