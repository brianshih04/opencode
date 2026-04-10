<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">開源的 AI Coding Agent。</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/opencode-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

### 安裝

```bash
# 直接安裝 (YOLO)
curl -fsSL https://opencode.ai/install | bash

# 套件管理員
npm i -g opencode-ai@latest        # 也可使用 bun/pnpm/yarn
scoop install opencode             # Windows
choco install opencode             # Windows
brew install anomalyco/tap/opencode # macOS 與 Linux（推薦，始終保持最新）
brew install opencode              # macOS 與 Linux（官方 brew formula，更新頻率較低）
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-bin               # Arch Linux (Latest from AUR)
mise use -g opencode               # 任何作業系統
nix run nixpkgs#opencode           # 或使用 github:anomalyco/opencode 以取得最新開發分支
```

> [!TIP]
> 安裝前請先移除 0.1.x 以前的舊版本。

### 桌面應用程式 (BETA)

OpenCode 也提供桌面版應用程式。您可以直接從 [發佈頁面 (releases page)](https://github.com/anomalyco/opencode/releases) 或 [opencode.ai/download](https://opencode.ai/download) 下載。

| 平台                  | 下載連結                              |
| --------------------- | ------------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-darwin-aarch64.dmg` |
| macOS (Intel)         | `opencode-desktop-darwin-x64.dmg`     |
| Windows               | `opencode-desktop-windows-x64.exe`    |
| Linux                 | `.deb`, `.rpm`, 或 AppImage           |

```bash
# macOS (Homebrew Cask)
brew install --cask opencode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/opencode-desktop
```

#### 安裝目錄

安裝腳本會依據以下優先順序決定安裝路徑：

1. `$OPENCODE_INSTALL_DIR` - 自定義安裝目錄
2. `$XDG_BIN_DIR` - 符合 XDG 基礎目錄規範的路徑
3. `$HOME/bin` - 標準使用者執行檔目錄 (若存在或可建立)
4. `$HOME/.opencode/bin` - 預設備用路徑

```bash
# 範例
OPENCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://opencode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://opencode.ai/install | bash
```

### Agents

OpenCode 內建了兩種 Agent，您可以使用 `Tab` 鍵快速切換。

- **build** - 預設模式，具備完整權限的 Agent，適用於開發工作。
- **plan** - 唯讀模式，適用於程式碼分析與探索。
  - 預設禁止修改檔案。
  - 執行 bash 指令前會詢問權限。
  - 非常適合用來探索陌生的程式碼庫或規劃變更。

此外，OpenCode 還包含一個 **general** 子 Agent，用於處理複雜搜尋與多步驟任務。此 Agent 供系統內部使用，亦可透過在訊息中輸入 `@general` 來呼叫。

了解更多關於 [Agents](https://opencode.ai/docs/agents) 的資訊。

### 自訂擴充功能 (Fork 新增)

此 Fork 包含上游 OpenCode 以外的額外功能：

#### 🧠 MemPalace 記憶系統

透過 [MemPalace](https://github.com/user/mempalace) 實現長期記憶。
- 啟動時自動注入 L0+L1 語境到系統提示詞
- `memory_search` 工具可查詢過往對話與專案知識
- Session 壓縮時自動觸發 `dream()`，將對話內容存入記憶庫
- 多來源：對話、程式碼、文件都可以 mining

#### 🐝 Swarm 平行 Agent

兩種多 Agent 協調模式：
- **Leader 模式** — 描述高層目標，Team Lead 自動拆解成 2-5 個平行子任務並執行
- **Parallel 模式** — 手動指定任務同時執行
- TaskTracker 追蹤狀態（✓ ⟳ ✗）
- 範例：`{"mode": "leader", "goal": "分析這個專案的安全性問題"}`

#### 📋 任務管理

持久化的任務追蹤系統：
- 建立/更新/列表/查詢任務
- 狀態流程：`pending` → `in_progress` → `completed` / `deleted`
- 任務依賴（`blocks` / `blockedBy`）
- 完成任務時自動解鎖被依賴的任務
- 可指派 owner 給不同 Agent

#### ✉️ Agent 間通訊

檔案式信箱系統：
- 發送私訊給特定 Agent
- 廣播（`*`）給所有隊友
- 訊息跨 Session 持久保存

#### 🌐 瀏覽器自動化

透過 [OpenCLI](https://github.com/brianshih04/opencli) daemon + 擴充功能控制 Chrome：
- 13 種操作：導航、點擊、輸入、執行 JS、截圖、取得內容、分頁管理等
- 反偵測隱匿注入
- 截圖存檔

#### 🤖 Agent 模型指定

每個 Agent 可以指定不同的 LLM 模型：

| Agent | 模型 | 用途 |
|-------|------|------|
| **build** | zai/glm-5 | 主力開發、修改、重構 |
| **plan** | zai/glm-4.7-flash | 快速唯讀分析、探索 |
| **general** | zai/glm-5-turbo | 子 Agent 平行任務 |

在 `.opencode/opencode.jsonc` 中設定：
```jsonc
{
  "agent": {
    "build": { "model": "zai/glm-5" },
    "plan": { "model": "zai/glm-4.7-flash" },
    "general": { "model": "zai/glm-5-turbo" }
  }
}
```

#### z.ai Provider

內建 z.ai 模型設定（GLM-5、GLM-5 Turbo、GLM-4.7 Flash）。
設定環境變數 `ZAI_API_KEY` 即可啟用。

#### 指令使用方式

```bash
# 一次性執行，指定模型和 Agent
opencode run --model zai/glm-5 --agent build "修復登入 bug"
opencode run --model zai/glm-4.7-flash --agent plan "分析架構"

# TUI 互動模式
opencode
# 進入後可使用：
#   Tab       — 切換 build/plan Agent
#   Ctrl+K   — 切換模型
#   /compact  — 壓縮對話歷史
#   /new      — 開新 Session
#   /status   — 顯示 Session 狀態

# 在任何專案目錄執行
opencode D:\Projects\my-project
```

#### 快速開始

```bash
# 從原始碼執行（需要 bun）
cd D:\Projects\opencode
bun run dev run --model zai/glm-5 "你的提示詞"

# 或安裝 opencode.cmd 從任何專案目錄執行
opencode
```

### 線上文件

關於如何設定 OpenCode 的詳細資訊，請參閱我們的 [**官方文件**](https://opencode.ai/docs)。

### 參與貢獻

如果您有興趣參與 OpenCode 的開發，請在提交 Pull Request 前先閱讀我們的 [貢獻指南 (Contributing Docs)](./CONTRIBUTING.md)。

### 基於 OpenCode 進行開發

如果您正在開發與 OpenCode 相關的專案，並在名稱中使用了 "opencode"（例如 "opencode-dashboard" 或 "opencode-mobile"），請在您的 README 中加入聲明，說明該專案並非由 OpenCode 團隊開發，且與我們沒有任何隸屬關係。

### 常見問題 (FAQ)

#### 這跟 Claude Code 有什麼不同？

在功能面上與 Claude Code 非常相似。以下是關鍵差異：

- 100% 開源。
- 不綁定特定的服務提供商。雖然我們推薦使用透過 [OpenCode Zen](https://opencode.ai/zen) 提供的模型，但 OpenCode 也可搭配 Claude, OpenAI, Google 甚至本地模型使用。隨著模型不斷演進，彼此間的差距會縮小且價格會下降，因此具備「不限廠商 (provider-agnostic)」的特性至關重要。
- 內建 LSP (語言伺服器協定) 支援。
- 專注於終端機介面 (TUI)。OpenCode 由 Neovim 愛好者與 [terminal.shop](https://terminal.shop) 的創作者打造。我們將不斷挑戰終端機介面的極限。
- 客戶端/伺服器架構 (Client/Server Architecture)。這讓 OpenCode 能夠在您的電腦上運行的同時，由行動裝置進行遠端操控。這意味著 TUI 前端只是眾多可能的客戶端之一。

---

**加入我們的社群** [飞书](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=738j8655-cd59-4633-a30a-1124e0096789&qr_code=true) | [X.com](https://x.com/opencode)
