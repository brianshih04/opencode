OpenCode Telegram 整合開發計畫書 (更新版：手動輸入)

第一階段：自動化配置 (Configuration)

目標：建立 opencode setup telegram 指令，透過簡單的問答收集 Token 和 User ID 並寫入設定檔。



1.1 實作 setup 互動腳本

指令路徑：src/cli/commands/setup.ts。



功能描述：使用 readline 模組建立互動式問答。



TypeScript

// src/cli/commands/setup.ts (概念程式碼)

import \* as readline from 'readline';



export async function runTelegramSetup() {

&#x20; const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

&#x20; const question = (query: string): Promise<string> => new Promise(resolve => rl.question(query, resolve));



&#x20; console.log('🤖 歡迎設定 OpenCode Telegram 整合！\\n');



&#x20; // 1. 收集 Token

&#x20; const token = await question('請輸入您的 Telegram Bot Token (例如: 123456:ABC...):\\n> ');

&#x20; 

&#x20; // 2. 收集 User ID，並提供查詢教學

&#x20; console.log('\\n💡 提示：您可以在 Telegram 搜尋 @userinfobot 並發送任意訊息來取得您的 User ID。');

&#x20; const userIdStr = await question('請輸入您的 Telegram User ID (一串數字，例如: 123456789):\\n> ');

&#x20; const userId = parseInt(userIdStr.trim(), 10);



&#x20; // 驗證輸入格式

&#x20; if (!token || isNaN(userId)) {

&#x20;   console.log('❌ 輸入格式錯誤，設定取消。');

&#x20;   process.exit(1);

&#x20; }



&#x20; // 3. 執行儲存邏輯

&#x20; await saveConfiguration(token, userId);

&#x20; 

&#x20; console.log('\\n✅ 設定完成！Token 已寫入 .env，User ID 已加入 .opencode.jsonc 白名單。');

&#x20; rl.close();

}

1.2 設定檔寫入邏輯 (saveConfiguration)

處理 .env：檢查 .env 檔案是否存在。如果存在，尋找並取代舊的 TELEGRAM\_BOT\_TOKEN；如果不存在或沒有該鍵值，則附加。



處理 opencode.jsonc：



解析 JSONC（需使用支援註解的 JSON 解析庫，如 comment-json 或 jsonc-parser）。



檢查是否存在 telegram.whitelist\_users 陣列。



將使用者輸入的 ID 加入陣列並確保唯一性。



將更新後的結構寫回檔案，並保留原有的註解與格式。



第二階段：通訊橋接與信箱整合 (Messaging Bridge)

目標：啟動 Telegram 監聽服務，並綁定 OpenCode 的信箱機制。



2.1 封裝 TelegramService

初始化驗證：載入 .env 和 opencode.jsonc。如果缺少 Token 或白名單為空，則提示錯誤並退出。



安全性實作：在所有的 Bot 事件監聽器（如 bot.on('text')）中，加入中介軟體 (Middleware) 驗證 ctx.from.id 是否存在於白名單中。



2.2 Mailbox 監控機制

監控 \~/.opencode/mailboxes/telegram\_bot/ 的檔案變化。



將讀取到的新檔案內容作為訊息，推播至白名單中的 User ID，隨後刪除該檔案。



第三階段：互動式審批機制 (HITL Approval)

目標：讓 Agent 能暫停執行，透過 Bot 詢問使用者。



3.1 實作 ask\_user 工具

在 src/tools/ 下建立新的 Agent 工具 telegram\_ask\_user。



流程：



Agent 觸發此工具。



工具發送包含 Inline Keyboard 的訊息至 Telegram。



工具回傳一個未解析的 Promise 讓 Agent 等待。



當 Telegram 收到對應的回呼 (bot.action) 時，解析 Promise，讓 Agent 繼續。



第四階段：監控與遠端狀態 (Monitoring)

目標：能主動查詢目前 OpenCode 的運行狀態。



4.1 實作基礎指令

/status：查詢目前執行中的 Swarm 任務、正在運作的 Agent 數量等資訊。



/cancel：強制中斷當前任務。

