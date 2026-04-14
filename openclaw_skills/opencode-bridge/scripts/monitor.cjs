#!/usr/bin/env node
/**
 * OpenCode Bridge Monitor (OpenClaw HTTP Gateway edition)
 * 
 * 掃描 ~/.opencode/bridge/outgoing/ 目錄，透過 gateway websocket 轉發到 Telegram。
 * 由 OpenClaw cron 每 15 秒呼叫。
 * 
 * 用法: node monitor.cjs [--chat-id <telegram_chat_id>]
 */

const fs = require("fs");
const path = require("path");
const http = require("http");

// --- Config ---
const BRIDGE_PATH = process.env.OC_BRIDGE_PATH || path.join(
  process.env.HOME || process.env.USERPROFILE,
  ".opencode", "bridge"
);
const CHAT_ID = process.env.OC_BRIDGE_CHAT_ID || process.argv.find((_, i, a) => a[i - 1] === "--chat-id");
const GATEWAY = process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789";

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
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); }
  catch { return { watching: [], stats: { status_sent: 0, questions_sent: 0, answers_received: 0 }, pending_questions: {} }; }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- Telegram via openclaw CLI (spawned as separate process to avoid stdin hang) ---
function sendTelegram(message, buttons = null) {
  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    const args = [
      require("path").join(process.env.HOME || process.env.USERPROFILE, ".openclaw", "bin", "openclaw.cmd" ),
      "message", "send",
      "--channel", "telegram",
      "-t", CHAT_ID,
      "-m", message,
    ];
    if (buttons) {
      args.push("--interactive", JSON.stringify(buttons));
    }
    const child = spawn("cmd", ["/c", ...args], { stdio: "pipe", timeout: 15000 });
    let stderr = "";
    child.stderr.on("data", (d) => stderr += d);
    child.on("close", (code) => {
      if (code === 0) resolve(true);
      else { console.error("Send failed:", stderr.split("\n")[0]); resolve(false); }
    });
    child.on("error", (e) => { console.error("Spawn error:", e.message); resolve(false); });
  });
}

// --- File helpers ---
function readAndDelete(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(file => {
    const fp = path.join(dir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
      fs.unlinkSync(fp);
      return data;
    } catch { return null; }
  }).filter(Boolean);
}

function formatTimestamp(ts) {
  try { return new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

const LEVEL_ICONS = { info: "🔵", warning: "🟡", error: "🔴" };

// --- Process ---
async function processStatuses() {
  for (const s of readAndDelete(STATUS_DIR)) {
    const icon = LEVEL_ICONS[s.level] || "🔵";
    const time = formatTimestamp(s.timestamp);
    const msg = [
      `${icon} OpenCode 狀態`, `━━━━━━━━━━━━━━━`,
      `📋 ${s.title || ""}`, `🔧 ${s.message || ""}`,
      s.agent ? `🤖 Agent: ${s.agent}` : "",
      s.session_id ? `📎 ${s.session_id.slice(-12)}` : "",
      `⏰ ${time}`,
    ].filter(Boolean).join("\n");
    await sendTelegram(msg);
    state.stats.status_sent++;
  }
}

async function processQuestions() {
  for (const q of readAndDelete(QUESTION_DIR)) {
    const time = formatTimestamp(q.timestamp);
    const choices = (q.choices || []).map(c => c.label);
    const msg = [
      `🔴 OpenCode 需要確認`, `━━━━━━━━━━━━━━━`,
      `❓ ${q.message || q.title || ""}`,
      q.session_id ? `📎 ${q.session_id.slice(-12)}` : "",
      choices.length ? `👉 ${choices.join(" / ")}` : "",
      `⏰ ${time}`,
    ].filter(Boolean).join("\n");
    
    // Send with inline buttons
    const buttons = choices.length ? { rows: [choices.map(c => ({ label: c, callback: `bridge:answer:${q.question_id}:${choices.indexOf(c)}` }))] } : null;
    const sent = await sendTelegram(msg, buttons);
    
    if (sent && q.question_id) {
      const timeout = (q.timeout_minutes || 30) * 60 * 1000;
      state.pending_questions[q.question_id] = {
        choices: q.choices || [], message: q.message || q.title || "",
        asked_at: Date.now(), timeout_at: Date.now() + timeout,
      };
      state.stats.questions_sent++;
    }
  }
}

function checkTimeouts() {
  const now = Date.now();
  for (const [id, q] of Object.entries(state.pending_questions)) {
    if (now > q.timeout_at) {
      sendTelegram(`⏰ 已過期（未回覆）：${q.message}`);
      delete state.pending_questions[id];
    }
  }
}

function checkRunJson() {
  if (!fs.existsSync(RUN_JSON)) {
    if (state.watching.length > 0) {
      sendTelegram("⚠️ OpenCode 已離線（run.json 消失）");
      state.watching = [];
    }
    return null;
  }
  try { return JSON.parse(fs.readFileSync(RUN_JSON, "utf-8")); }
  catch { return null; }
}

// --- Main ---
async function main() {
  await processStatuses();
  await processQuestions();
  checkTimeouts();
  checkRunJson();
  saveState();
  const total = state.stats.status_sent + state.stats.questions_sent;
  if (total > 0) console.log(`Processed: ${state.stats.status_sent} statuses, ${state.stats.questions_sent} questions`);
}

main().catch(e => console.error("Fatal:", e));
