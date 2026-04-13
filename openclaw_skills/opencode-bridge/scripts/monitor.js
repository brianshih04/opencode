#!/usr/bin/env node
/**
 * OpenCode Bridge Monitor
 * 
 * 掃描 ~/.opencode/bridge/outgoing/ 目錄，轉發到 Telegram。
 * 由 OpenClaw cron 每 10 秒呼叫。
 * 
 * 用法: node monitor.js [--chat-id <telegram_chat_id>]
 * 環境變數:
 *   OC_BRIDGE_CHAT_ID   Telegram chat ID（必填）
 *   OC_BRIDGE_PATH      bridge 目錄路徑（預設 ~/.opencode/bridge）
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// --- Config ---
const BRIDGE_PATH = process.env.OC_BRIDGE_PATH || path.join(
  process.env.HOME || process.env.USERPROFILE,
  ".opencode", "bridge"
);
const CHAT_ID = process.env.OC_BRIDGE_CHAT_ID || process.argv.find((_, i, a) => a[i - 1] === "--chat-id");

if (!CHAT_ID) {
  console.error("Error: OC_BRIDGE_CHAT_ID or --chat-id is required");
  process.exit(1);
}

const STATUS_DIR = path.join(BRIDGE_PATH, "outgoing", "status");
const QUESTION_DIR = path.join(BRIDGE_PATH, "outgoing", "question");
const RUN_JSON = path.join(BRIDGE_PATH, "run.json");
const STATE_FILE = path.join(__dirname, "..", "state.json");

// --- State ---
let state = loadState();

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {
      watching: [],
      stats: { status_sent: 0, questions_sent: 0, answers_received: 0 },
      pending_questions: {},
    };
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- Helpers ---
function sendTelegram(message, buttons = null) {
  const args = [
    "openclaw", "message", "send",
    "--channel", "telegram",
    "--target", CHAT_ID,
    "--message", message,
    "--silent",
  ];
  if (buttons) {
    args.push("--buttons", JSON.stringify(buttons));
  }
  try {
    execSync(args.join(" "), { stdio: "pipe", timeout: 10000 });
    return true;
  } catch (e) {
    console.error("Send failed:", e.message?.split("\n")[0]);
    return false;
  }
}

function readAndDelete(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  const results = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      results.push(data);
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error(`Failed to read ${file}:`, e.message);
    }
  }
  return results;
}

function formatTimestamp(ts) {
  try {
    return new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const LEVEL_ICONS = { info: "🔵", warning: "🟡", error: "🔴" };

// --- Process Status ---
function processStatuses() {
  const statuses = readAndDelete(STATUS_DIR);
  for (const s of statuses) {
    const icon = LEVEL_ICONS[s.level] || "🔵";
    const time = formatTimestamp(s.timestamp);
    const msg = [
      `${icon} OpenCode 狀態`,
      `━━━━━━━━━━━━━━━`,
      `📋 ${s.title || ""}`,
      `🔧 ${s.message || ""}`,
      s.agent ? `🤖 Agent: ${s.agent}` : "",
      s.session_id ? `📎 Session: ${s.session_id}` : "",
      `⏰ ${time}`,
    ].filter(Boolean).join("\n");

    sendTelegram(msg);
    state.stats.status_sent++;
  }
}

// --- Process Questions ---
function processQuestions() {
  const questions = readAndDelete(QUESTION_DIR);
  for (const q of questions) {
    const time = formatTimestamp(q.timestamp);
    const rows = (q.choices || []).map(c => [c.label]);

    const msg = [
      `🔴 OpenCode 需要確認`,
      `━━━━━━━━━━━━━━━`,
      `❓ ${q.message || q.title || ""}`,
      q.session_id ? `📎 Session: ${q.session_id}` : "",
      `⏰ ${time}`,
    ].filter(Boolean).join("\n");

    const sent = sendTelegram(msg, rows.length > 0 ? rows : null);

    if (sent && q.question_id) {
      // Track timeout
      const timeout = (q.timeout_minutes || 30) * 60 * 1000;
      state.pending_questions[q.question_id] = {
        choices: q.choices || [],
        message: q.message || q.title || "",
        asked_at: Date.now(),
        timeout_at: Date.now() + timeout,
      };
      state.stats.questions_sent++;
    }
  }
}

// --- Check timeouts ---
function checkTimeouts() {
  const now = Date.now();
  const expired = Object.entries(state.pending_questions).filter(
    ([_, q]) => now > q.timeout_at
  );
  for (const [id, q] of expired) {
    sendTelegram(`⏰ 已過期（未回覆）：${q.message}`);
    delete state.pending_questions[id];
  }
}

// --- Check run.json ---
function checkRunJson() {
  if (!fs.existsSync(RUN_JSON)) {
    if (state.watching.length > 0) {
      sendTelegram("⚠️ OpenCode 已離線（run.json 消失）");
      state.watching = [];
    }
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(RUN_JSON, "utf-8"));
  } catch {
    return null;
  }
}

// --- Main ---
function main() {
  processStatuses();
  processQuestions();
  checkTimeouts();
  checkRunJson();
  saveState();
  
  const total = state.stats.status_sent + state.stats.questions_sent;
  if (total > 0) {
    console.log(`Processed: ${state.stats.status_sent} statuses, ${state.stats.questions_sent} questions, ${state.stats.answers_received} answers`);
  }
}

main();
