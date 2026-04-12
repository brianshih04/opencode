# OpenCode Telegram 整合 — 實施計畫

## 架構概覽

本計畫將 Telegram Bot 深度整合至 OpenCode，利用現有的 `Bus` 事件系統、`Question` 互動機制、`Mailbox` 訊息傳遞及 `Tool` 框架，共分四個階段逐步推進。

---

## 第一階段：配置管理 (Configuration)

### 1.1 擴展 Config Schema

**目標**：在 `opencode.jsonc` 中新增 `telegram` 區塊

**檔案**：`packages/opencode/src/config/config.ts`

在 `Info` zod schema（約 L850）新增：

```typescript
telegram: z.object({
  bot_token: z.string().optional().describe("Telegram Bot Token (from @BotFather)"),
  whitelist_users: z.array(z.number()).optional().describe("Allowed Telegram User IDs"),
  enabled: z.boolean().optional().describe("Enable Telegram integration (default: false)"),
}).optional(),
```

Token 也可透過環境變數 `TELEGRAM_BOT_TOKEN` 注入（優先級高於設定檔），避免將 secret 明文寫入 JSONC。

**檔案**：新增 `packages/opencode/src/telegram/env.ts`

```typescript
export namespace TelegramEnv {
  export function botToken(): string | undefined {
    return process.env.TELEGRAM_BOT_TOKEN
  }
}
```

### 1.2 Setup 指令

**目標**：`opencode setup telegram` 互動式引導

**檔案**：`packages/opencode/src/cli/cmd/setup-telegram.ts`

**實作要點**：

- 使用 `readline` 互動式收集 Bot Token 和 User ID
- Token 寫入環境變數（不寫入 `.env`，改為寫入 `~/.opencode/telegram.env` 並在啟動時載入，避免污染使用者環境）
- User ID 寫入 `opencode.jsonc` 的 `telegram.whitelist_users` 陣列
- 利用 `jsonc-parser` 的 `modify` + `applyEdits` 做非破壞性 JSONC 更新（現有 `patchJsonc` 函式已在 `config.ts:1081`）
- 驗證 Token 格式（`/^\d+:[A-Za-z0-9_-]{35}$/`）
- 驗證 User ID 為正整數
- 可選：呼叫 Telegram `getMe` API 即時驗證 Token 有效性

**CLI 整合**：在 CLI 入口註冊 `setup telegram` 子指令

### 1.3 Telegram 設定讀取器

**檔案**：新增 `packages/opencode/src/telegram/config.ts`

```typescript
export namespace TelegramConfig {
  export function read(cfg: Config.Info): {
    enabled: boolean
    token: string | undefined
    whitelistUsers: number[]
  }
}
```

合併來源：`telegram.bot_token`（JSONC）+ `TELEGRAM_BOT_TOKEN`（env），env 優先。

---

## 第二階段：通訊橋接與信箱整合 (Messaging Bridge)

### 2.1 TelegramService

**目標**：封裝 Telegram Bot API 互動

**檔案**：新增 `packages/opencode/src/telegram/service.ts`

**依賴**：`grammy`（Telegram Bot Framework，輕量、TypeScript 原生）

**安裝**：`bun add grammy`

**實作要點**：

- Effect Service，透過 `InstanceState` 管理（每個 workspace 獨立生命週期）
- 初始化時驗證 Token 存在且 `whitelist_users` 非空
- **Middleware 白名單驗證**：所有 `ctx` 事件先檢查 `ctx.from.id` 是否在白名單中
- 生命週期管理：`Effect.addFinalizer` 中呼叫 `bot.stop()` 關閉長輪詢
- 使用 `bot.startPolling()` 而非 webhook（桌面/CLI 環境更適合）

**核心 API**：

```typescript
export namespace Telegram {
  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Telegram") {}

  export interface Interface {
    readonly send: (userId: number, message: string, opts?: SendOptions) => Effect.Effect<void>
    readonly sendWithKeyboard: (userId: number, message: string, buttons: Button[][]) => Effect.Effect<void>
    readonly onCallback: (handler: (data: CallbackData) => Effect.Effect<void>) => Effect.Effect<void>
    readonly isActive: () => Effect.Effect<boolean>
  }
}
```

### 2.2 Mailbox 橋接

**目標**：監聽 OpenCode mailbox，將訊息推送至 Telegram

**檔案**：新增 `packages/opencode/src/telegram/mailbox-bridge.ts`

**實作要點**：

- 監控 `~/.opencode/mailboxes/telegram_bot/` 目錄
- 使用 `@parcel/watcher`（已在專案依賴中）監聽檔案變更，透過 `Instance.bind` 包裝 callback
- 讀取新檔案 → 推播至所有白名單 User ID → 刪除檔案
- 使用 `Effect.forkScoped` 在 Service layer 中啟動背景監聽
- 訊息格式：MarkdownV2（Telegram 原生支援）

**Bus 事件整合**：

新增 BusEvent：

```typescript
// 在 telegram/mailbox-bridge.ts 或獨立事件檔
export const TelegramEvent = {
  MessageSent: BusEvent.define(
    "telegram.message.sent",
    z.object({
      userId: z.number(),
      content: z.string(),
    }),
  ),
  Error: BusEvent.define(
    "telegram.error",
    z.object({
      message: z.string(),
    }),
  ),
}
```

### 2.3 信箱寫入器

**目標**：Telegram 接收到的使用者訊息可寫入指定 agent 的 mailbox

**檔案**：擴展 `packages/opencode/src/telegram/service.ts`

- 新增 `/msg <agent> <content>` Bot 指令
- 解析後呼叫現有的 `send_message.ts` 中的 `handleDirect` 邏輯（或直接寫入 mailbox JSON）
- 讓使用者從 Telegram 端也能與 Agent 溝通

---

## 第三階段：互動式審批機制 (HITL Approval)

### 3.1 Question → Telegram 橋接

**目標**：當 Agent 觸發 `question` 工具時，同步推播至 Telegram

**檔案**：新增 `packages/opencode/src/telegram/question-bridge.ts`

**實作要點**：

- 訂閱 `Question.Event.Asked` Bus 事件（透過 `Bus.subscribe`）
- 將每個 `Question.Info` 轉換為 Telegram InlineKeyboard 按鈕
- 每個按鈕的 `callback_data` 編碼格式：`q:{requestID}:{selectedIndex}` 或 `q:{requestID}:label`
- 使用者點擊按鈕後，解析 callback data，呼叫 `Question.reply` 完成 Deferred
- 處理 `multiple` 模式：允許點選多個後以「確認」按鈕提交

**流程圖**：

```
Agent → Question.ask() → Bus → QuestionBridge → Telegram InlineKeyboard
                                                        ↓
User clicks button ← ─────── Telegram ← ──── callback_query
        ↓
QuestionBridge → Question.reply() → Deferred resolved → Agent continues
```

### 3.2 超時處理

- 每個 Question 搭配 30 分鐘超時
- 超時後自動呼叫 `Question.reject`，並在 Telegram 推播「已超時」訊息
- 使用 `Effect.timeout` 或 `Deferred.race` 實作

### 3.3 send_message 通知整合

**目標**：Agent 之間的 `send_message` 工具訊息也同步推播至 Telegram

- 訂閱 `SendMessageTool` 執行結果（透過 Bus event 或直接 hook）
- 格式化後推播至 Telegram

---

## 第四階段：監控與遠端控制 (Monitoring)

### 4.1 Bot 指令實作

**檔案**：擴展 `packages/opencode/src/telegram/service.ts`

#### `/status` 指令

- 查詢 `Session.Event` 相關 Bus 狀態
- 回報：當前 active session 數量、正在執行的 Agent、Swarm 任務狀態
- 格式化为 Telegram HTML 訊息

#### `/cancel` 指令

- 呼叫 `Session.Event.Cancel` 或透過 Bus 發送取消事件
- 中斷當前正在執行的 Agent 工具

#### `/sessions` 指令

- 列出所有 active sessions 及其狀態

#### `/help` 指令

- 列出所有可用 Bot 指令

### 4.2 狀態推播

**目標**：關鍵事件主動推送至 Telegram

訂閱以下 Bus 事件並格式化推播：

- `Session.Event.Started` — 新 session 建立
- `Session.Event.Error` — 執行錯誤
- `Tool.Execute.*` — 工具執行完成（可選，透過設定開關）

---

## 可行性評估

### 一、架構相容性 — 高度可行 ✅

| 現有機制                                     | 與 Telegram 整合的對接點                                       | 複雜度                         |
| -------------------------------------------- | -------------------------------------------------------------- | ------------------------------ |
| `Bus` 事件系統 (`bus/index.ts`)              | 訂閱 `Question.Event.Asked`、`Session.Event.*` 推播至 Telegram | 低 — 純訂閱者模式，零侵入      |
| `Question.Service` (`question/index.ts`)     | 透過 `Question.reply()` 解鎖 Deferred，與 CLI 端並行           | 低 — 公開 API 已完整           |
| `Mailbox` (`tool/send_message.ts`)           | 讀寫 `~/.opencode/mailboxes/telegram_bot/`                     | 低 — 純檔案 I/O，現有範例充分  |
| `Tool.Def` 框架 (`tool/tool.ts`)             | 新增 `telegram_ask_user` 工具（如需直接觸發）                  | 中 — 需遵循 `Tool.define` 模式 |
| `InstanceState` (`effect/instance-state.ts`) | 每個 workspace 獨立的 TelegramService 生命週期                 | 低 — 專案慣用模式              |
| `Config.Info` + `patchJsonc`                 | 新增 `telegram` schema 區塊 + Setup 寫入                       | 中 — `.strict()` 需同步更新    |
| `@parcel/watcher` + `Instance.bind`          | 監聽 mailbox 目錄變更                                          | 低 — 專案已有精確範例          |
| `readline` / CLI 指令框架                    | `opencode setup telegram` 互動                                 | 低 — 標準 Node.js API          |

**結論**：OpenCode 的 Effect Service + Bus 事件驅動架構，天然適合外掛通知頻道。Telegram 整合本質上是一組「Bus 訂閱者 + 檔案監聽器」，不需修改任何核心邏輯。

### 二、依賴評估

| 依賴                              | 狀態                         | 風險                                                                       |
| --------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `grammy` (Telegram Bot Framework) | 需新增 `bun add grammy`      | 低 — 純 JS、零 native dependency、Bun 相容性佳、GitHub 7k+ stars、活躍維護 |
| `jsonc-parser`                    | 已在專案中使用 (`config.ts`) | 無風險 — 直接復用                                                          |
| `@parcel/watcher`                 | 已在專案依賴中               | 無風險                                                                     |
| `Effect v4`                       | 核心框架                     | 無風險 — 僅使用現有 API (`ServiceMap`, `InstanceState`, `Bus`, `Deferred`) |

**結論**：唯一新增的外部依賴是 `grammy`，風險極低。

### 三、各階段可行性細項

#### Phase 1 — 配置管理：可行性 95%

- `Config.Info` 的 `.strict()` 是唯一摩擦點，但只是加一個 `telegram` optional object，影響範圍小
- `patchJsonc` 已有完整實作，可直接用於 Setup 寫入 JSONC
- Token 儲存為環境變數或獨立 `.env` 檔案，遵循專案現有 `Env` namespace 模式
- **潛在阻礙**：CLI 子指令註冊機制需確認入口點結構（`packages/opencode/src/cli/`），但不預期有技術難題

#### Phase 2 — 通訊橋接：可行性 90%

- `grammy` 的 Long Polling 在 Bun runtime 下需驗證相容性（Bun 對 `fetch` 和 `EventEmitter` 的實作與 Node.js 有微小差異）
- ** mitigant**：grammy 底層使用標準 `fetch`，Bun 已完整支援；可先用 `bun test` 快速驗證
- Mailbox 橋接為純檔案操作 + 現有 watcher，幾無風險
- **潛在阻礙**：`grammy` 的 `bot.start()` 是非阻塞的，需確認在 Effect Service layer 中與 `Effect.forkScoped` 的配合方式

#### Phase 3 — HITL 審批：可行性 85%

- 核心流程依賴 `Question.Service` 的 Deferred 機制，此機制已穩定運作於 CLI 端
- **主要挑戰**：`multiple` 模式（多選題）的 Telegram 互動設計較複雜，需自製「確認」按鈕的狀態機
- ** mitigant**：先實作單選模式（covers 80% 使用場景），多選作為後續迭代
- `callback_data` 有 64 bytes 限制，`QuestionID` + index 編碼需確認不超限
- ** mitigant**：使用簡短前綴 `q:{id}:{idx}` 或 Map 快照方案

#### Phase 4 — 監控控制：可行性 80%

- `/status` 需聚合多個 Bus 事件的狀態，目前 Bus 是 fire-and-forget 模式，沒有內建的狀態快照機制
- ** mitigant**：透過 Session 的持久化（SQLite）查詢 active sessions，不依賴 Bus 狀態
- `/cancel` 需找到對應 session 的 `AbortController`，需研究 Session 層的取消機制
- ** mitigant**：Phase 4 定位為加分項，若取消機制過於複雜可降級為僅提供 `/status` + `/sessions` 唯讀指令

### 四、Bun Runtime 相容性風險

| 項目                       | 評估      | 說明                                                               |
| -------------------------- | --------- | ------------------------------------------------------------------ |
| `grammy` + `fetch`         | ✅ 安全   | Bun 的 `fetch` 是 Web API 標準實作，grammy 直接使用                |
| `grammy` + `EventEmitter`  | ⚠️ 需驗證 | grammy 內部使用 Node.js `EventEmitter`，Bun 已相容但邊界情況需測試 |
| `@parcel/watcher` callback | ✅ 已驗證 | 專案已在用 `Instance.bind` 包裝 watcher callback，無問題           |
| `readline`                 | ✅ 安全   | Bun 完整支援 Node.js `readline` 模組                               |
| `AbortController`          | ✅ 安全   | Bun 原生支援                                                       |

### 五、整體可行性結論

| 階段    | 可行性           | 預估工時 | 關鍵依賴                   |
| ------- | ---------------- | -------- | -------------------------- |
| Phase 1 | ⭐⭐⭐⭐⭐ (95%) | 0.5 天   | 無                         |
| Phase 2 | ⭐⭐⭐⭐ (90%)   | 1 天     | `grammy` Bun 相容性驗證    |
| Phase 3 | ⭐⭐⭐⭐ (85%)   | 1 天     | Question Deferred 流程驗證 |
| Phase 4 | ⭐⭐⭐☆ (80%)    | 0.5 天   | Session 取消機制研究       |

**總評**：本計畫架構設計與 OpenCode 現有系統高度契合，核心風險在於 `grammy` 框架在 Bun runtime 下的邊際相容性，但影響範圍可控（僅限 Phase 2 初始化階段可偵測）。建議在 Phase 2 啟動前先花 30 分鐘撰寫 `grammy` + Bun 的 smoke test，確認 Long Polling 正常運作後再全面推進。

---

## 技術決策與風險

### 決策記錄

| 項目          | 決策                          | 理由                                                 |
| ------------- | ----------------------------- | ---------------------------------------------------- |
| Bot 框架      | `grammy`                      | TypeScript 原生、輕量（< 100KB）、社群活躍、不需编译 |
| 通訊模式      | Long Polling                  | CLI/桌面環境無固定 public URL，Webhook 不適用        |
| Token 儲存    | 環境變數 `TELEGRAM_BOT_TOKEN` | 避免明文寫入 JSONC，遵循 12-factor 原則              |
| 檔案監聽      | `@parcel/watcher`             | 專案已有依賴，跨平台 native 支援                     |
| Question 橋接 | Bus 事件訂閱                  | 與現有 `Question.Service` 解耦，不侵入核心邏輯       |

### 風險

1. **Long Polling 資源消耗**：在 idle 狀態仍佔用一條 HTTP 長連線。可接受，因為 opencode 本身是長駐進程。
2. **白名單繞過風險**：Telegram callback_query 的 `from.id` 也必須驗證，否則任何人可回應別人的 Question。
3. **Telegram Rate Limit**：單群組每秒最多 30 條訊息。需加入發送佇列與速率限制。
4. **Strict Schema**：`Config.Info` 使用 `.strict()`，新增 `telegram` 欄位需同步更新 schema，否則會被拒絕。

### 驗證標準

- [ ] `bun typecheck` 通過（從 `packages/opencode` 執行）
- [ ] Setup 流程完整運行，配置正確寫入
- [ ] 白名單外使用者發送訊息被無聲忽略
- [ ] Question 從 Telegram 端可正確回答並讓 Agent 繼續
- [ ] `/status` 指令正確回報目前狀態
- [ ] 超時後 Agent 收到 `QuestionRejectedError` 並優雅降級

---

## 建議實施順序

```
Phase 1.1 → 1.2 → 1.3 (配置基礎)
    ↓
Phase 2.1 (TelegramService 核心能力)
    ↓
Phase 2.2 (Mailbox 橋接，可驗收雙向通訊)
    ↓
Phase 3.1 → 3.2 (HITL 核心價值，可獨立 demo)
    ↓
Phase 4.1 → 4.2 (監控為加分項，依需求排定)
```

預估總工時：Phase 1（0.5天）、Phase 2（1天）、Phase 3（1天）、Phase 4（0.5天）
