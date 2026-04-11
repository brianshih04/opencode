import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./send_message.txt"
import { Log } from "../util/log"
import path from "path"
import os from "os"
import fs from "fs/promises"

const log = Log.create({ service: "tool.send_message" })

// ─── Mailbox Store (file-based) ────────────────────────────────────

const MAILBOX_DIR = path.join(os.homedir(), ".opencode", "mailboxes")

interface Message {
  id: string
  from: string
  to: string
  content: string
  summary?: string
  timestamp: string
  read: boolean
}

async function ensureMailboxDir(): Promise<string> {
  await fs.mkdir(MAILBOX_DIR, { recursive: true })
  return MAILBOX_DIR
}

function sanitizeAgentName(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "")
  if (!safe || safe.length > 64) throw new Error(`Invalid agent name: ${name}`)
  return safe
}

function mailboxPath(agent: string): string {
  return path.join(MAILBOX_DIR, `${sanitizeAgentName(agent)}.json`)
}

async function readMailbox(agent: string): Promise<Message[]> {
  try {
    const data = await fs.readFile(mailboxPath(agent), "utf-8")
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function writeMailbox(agent: string, messages: Message[]): Promise<void> {
  await ensureMailboxDir()
  await fs.writeFile(mailboxPath(agent), JSON.stringify(messages, null, 2), "utf-8")
}

// Per-mailbox lock to prevent TOCTOU race
const locks = new Map<string, Promise<void>>()
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  let resolve!: () => void
  const next = new Promise<void>((r) => { resolve = r })
  locks.set(key, next)
  await prev
  try {
    return await fn()
  } finally {
    resolve()
    if (locks.get(key) === next) locks.delete(key)
  }
}

async function getTeamName(): Promise<string | undefined> {
  try {
    const data = await fs.readFile(path.join(MAILBOX_DIR, "_team"), "utf-8")
    return data.trim() || undefined
  } catch {
    return undefined
  }
}

export async function setTeamName(name: string): Promise<void> {
  await ensureMailboxDir()
  await fs.writeFile(path.join(MAILBOX_DIR, "_team"), name, "utf-8")
}

function generateMsgId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ─── Parameters ────────────────────────────────────────────────────

const Parameters = z.object({
  to: z.string().describe("Recipient agent name, or '*' for broadcast to all teammates"),
  message: z.string().describe("Message content"),
  summary: z.string().optional().describe("5-10 word summary for preview"),
})

// ─── Send Message Tool ─────────────────────────────────────────────

export const SendMessageTool = Tool.define("send_message", async () => {
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    async execute(params, ctx) {
      const from = ctx.agent ?? "lead"
      const timestamp = new Date().toISOString()

      if (params.to === "*") {
        return handleBroadcast(from, params.message, params.summary, timestamp)
      }
      return handleDirect(from, params.to, params.message, params.summary, timestamp)
    },
  }
})

// ─── Handlers ──────────────────────────────────────────────────────

async function handleDirect(
  from: string,
  to: string,
  content: string,
  summary: string | undefined,
  timestamp: string,
) {
  const safeTo = sanitizeAgentName(to)
  const msg: Message = {
    id: generateMsgId(),
    from,
    to: safeTo,
    content,
    summary,
    timestamp,
    read: false,
  }

  await withLock(safeTo, async () => {
    const mailbox = await readMailbox(safeTo)
    mailbox.push(msg)
    if (mailbox.length > 100) mailbox.splice(0, mailbox.length - 100)
    await writeMailbox(safeTo, mailbox)
  })

  return {
    output: `✉️ Message sent to @${safeTo}\nFrom: @${from}\n${summary ? `Summary: ${summary}\n` : ""}Content: ${content.slice(0, 500)}`,
    title: `Message → @${safeTo}`,
    metadata: { messageId: msg.id, from, to: safeTo } as Record<string, unknown>,
  }
}

async function handleBroadcast(
  from: string,
  content: string,
  summary: string | undefined,
  timestamp: string,
) {
  const team = await getTeamName()
  if (!team) {
    return {
      output: "❌ Not in a team context. Start a swarm session first.",
      title: "Send message: no team",
      metadata: {} as Record<string, unknown>,
    }
  }

  // Discover teammates from mailbox files
  const dir = await ensureMailboxDir()
  const files = await fs.readdir(dir)
  const agents = files
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(".json", ""))
    .filter(a => a !== from && !a.startsWith("_"))

  if (agents.length === 0) {
    return {
      output: "📢 Broadcast sent but no teammates found.",
      title: "Broadcast: no recipients",
      metadata: {} as Record<string, unknown>,
    }
  }

  for (const agent of agents) {
    const msg: Message = {
      id: generateMsgId(),
      from,
      to: agent,
      content,
      summary,
      timestamp,
      read: false,
    }
    const safeAgent = sanitizeAgentName(agent)
    await withLock(safeAgent, async () => {
      const mailbox = await readMailbox(safeAgent)
      mailbox.push(msg)
      if (mailbox.length > 100) mailbox.splice(0, mailbox.length - 100)
      await writeMailbox(safeAgent, mailbox)
    })
  }

  return {
    output: `📢 Broadcast sent to ${agents.length} teammates: ${agents.map(a => `@${a}`).join(", ")}\nFrom: @${from}\nContent: ${content.slice(0, 500)}`,
    title: `Broadcast → ${agents.length} agents`,
    metadata: { messageId: generateMsgId(), from, recipients: agents } as Record<string, unknown>,
  }
}

// ─── Utility: read messages for an agent ───────────────────────────

export async function getMessagesFor(agent: string, markRead = true): Promise<Message[]> {
  const safeAgent = sanitizeAgentName(agent)
  return withLock(safeAgent, async () => {
    const mailbox = await readMailbox(safeAgent)
    const unread = mailbox.filter(m => !m.read)
    if (markRead && unread.length > 0) {
      for (const m of mailbox) m.read = true
      await writeMailbox(safeAgent, mailbox)
    }
    return unread.length > 0 ? unread : mailbox.slice(-20)
  })
}
