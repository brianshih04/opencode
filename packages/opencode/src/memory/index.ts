import { Log } from "@/util/log"
import { Session } from "@/session"
import type { SessionID } from "@/session/schema"
import { Bus } from "@/bus"
import { SessionCompaction } from "@/session/compaction"
import type { MessageV2 } from "@/session/message-v2"
import path from "path"
import os from "os"

const log = Log.create({ service: "memory" })

function palacePath(): string {
  return process.env.MEMPALACE_PATH || path.join(os.homedir(), ".mempalace", "palace")
}

function stateDir(): string {
  return path.join(os.homedir(), ".opencode")
}

function runMempalace(...args: string[]): string {
  try {
    const proc = Bun.spawnSync(["mempalace", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
      env: { ...process.env, MEMPALACE_PATH: palacePath(), PYTHONIOENCODING: "utf-8" },
    })
    if (proc.exitCode !== 0) {
      log.info("mempalace failed", { args, error: proc.stderr.toString().trim() })
      return ""
    }
    return proc.stdout.toString().trim()
  } catch (e) {
    log.info("mempalace error", { args, error: String(e) })
    return ""
  }
}

// ---- Dream Lock State ----
interface DreamLock {
  lastConsolidatedAt: number // unix ms timestamp
  sessionCount: number // sessions seen since last consolidation
}

const LOCK_FILE = () => path.join(stateDir(), "dream-lock.json")
const MIN_HOURS = 24
const MIN_SESSIONS = 5

async function readLock(): Promise<DreamLock> {
  try {
    const fs = await import("fs/promises")
    const data = await fs.readFile(LOCK_FILE(), "utf-8")
    return JSON.parse(data)
  } catch {
    return { lastConsolidatedAt: 0, sessionCount: 0 }
  }
}

async function writeLock(lock: DreamLock): Promise<void> {
  try {
    const fs = await import("fs/promises")
    await fs.mkdir(stateDir(), { recursive: true })
    await fs.writeFile(LOCK_FILE(), JSON.stringify(lock, null, 2), "utf-8")
  } catch (e) {
    log.info("failed to write dream lock", { error: String(e) })
  }
}

// ---- Memory Namespace ----
export namespace Memory {
  /** Run MemPalace wake-up (L0+L1) and return the text to inject into system prompt */
  export function wakeUp(wing?: string): string {
    const args = ["wake-up"]
    if (wing) args.push("--wing", wing)
    return runMempalace(...args)
  }

  /** Search memories */
  export function search(query: string, opts?: { wing?: string; room?: string; n?: number }): string {
    const args = ["search", query]
    if (opts?.wing) args.push("--wing", opts.wing)
    if (opts?.room) args.push("--room", opts.room)
    if (opts?.n) args.push("--n-results", String(opts.n))
    return runMempalace(...args)
  }

  /** Mine session transcript into palace */
  async function mineTranscript(sessionID: SessionID): Promise<void> {
    let messages: MessageV2.WithParts[]
    try {
      messages = await Session.messages({ sessionID })
    } catch {
      return
    }

    if (!messages || messages.length < 2) return

    const transcript = messages
      .map((m) => {
        const role = m.role === "user" ? "> " : ""
        const text = m.content || m.text || JSON.stringify(m)
        return `${role}${text}`
      })
      .join("\n\n")

    const tmpDir = path.join(os.tmpdir(), "mempalace-dream")
    const tmpFile = path.join(tmpDir, `${sessionID}.md`)

    try {
      const fs = await import("fs/promises")
      await fs.mkdir(tmpDir, { recursive: true })
      await fs.writeFile(tmpFile, transcript, "utf-8")
    } catch {
      return
    }

    runMempalace("mine", tmpFile, "--mode", "convos")

    try {
      const fs = await import("fs/promises")
      await fs.unlink(tmpFile).catch(() => {})
    } catch {}
  }

  /**
   * dream() with dual gates (inspired by Claude Code's autoDream):
   *
   * Gate 1 — Time: ≥24h since last consolidation
   * Gate 2 — Session: ≥5 sessions accumulated since last consolidation
   *
   * Each compaction event increments the session counter. Only when both
   * gates pass does a full consolidation dream run.
   *
   * When gates don't pass, we still do a lightweight mineTranscript
   * to capture individual session data incrementally.
   */
  export async function dream(sessionID: SessionID): Promise<void> {
    log.info("dream triggered", { sessionID })

    // Always mine the transcript (lightweight, incremental)
    await mineTranscript(sessionID)

    // Check dual gates for consolidation
    const lock = await readLock()
    lock.sessionCount += 1

    const hoursSince = (Date.now() - lock.lastConsolidatedAt) / 3_600_000
    const timeGateOpen = lock.lastConsolidatedAt === 0 || hoursSince >= MIN_HOURS
    const sessionGateOpen = lock.sessionCount >= MIN_SESSIONS

    log.info("dream gate check", {
      hoursSince: Math.round(hoursSince * 10) / 10,
      sessionCount: lock.sessionCount,
      timeGateOpen,
      sessionGateOpen,
    })

    if (timeGateOpen && sessionGateOpen) {
      log.info("dream consolidation firing", {
        hoursSince: Math.round(hoursSince * 10) / 10,
        sessions: lock.sessionCount,
      })

      // Run a full consolidation dream across all accumulated sessions
      runMempalace("dream", "--consolidate")

      // Reset lock
      await writeLock({
        lastConsolidatedAt: Date.now(),
        sessionCount: 0,
      })

      log.info("dream consolidation completed")
    } else {
      // Just persist the incremented counter
      await writeLock(lock)
    }
  }

  /**
   * Subscribe to session.compacted events and auto-trigger dream.
   * Call this once during initialization.
   */
  let dreamUnsubscribe: (() => void) | null = null

  export function initDreamOnCompaction(): void {
    if (dreamUnsubscribe) return
    try {
      dreamUnsubscribe = Bus.subscribe(SessionCompaction.Event.Compacted, (event) => {
        const sessionID = event.properties.sessionID
        log.info("compaction detected, triggering dream", { sessionID })
        // Fire-and-forget: don't block compaction
        dream(sessionID).catch((err) => {
          log.info("dream error", { sessionID, error: String(err) })
        })
      })
      log.info("dream-on-compaction listener registered")
    } catch (err) {
      log.info("failed to register dream listener", { error: String(err) })
    }
  }

  export function stopDreamOnCompaction(): void {
    if (dreamUnsubscribe) {
      dreamUnsubscribe()
      dreamUnsubscribe = null
    }
  }

  /**
   * Load agent-specific memory file.
   * Returns the content of ~/.opencode/agent-memory/<agentName>/MEMORY.md if it exists.
   */
  export function agentMemory(agentName: string): string {
    try {
      const memFile = path.join(stateDir(), "agent-memory", agentName, "MEMORY.md")
      const data = require("fs").readFileSync(memFile, "utf-8")
      const content = data.trim()
      if (content) return content
    } catch {}
    return ""
  }
}

// ---- AutoMemory Namespace ----
export namespace AutoMemory {
  const autoMemoryDir = path.join(stateDir(), "memory", "auto")
  const autoLog = Log.create({ service: "auto-memory" })

  async function ensureAutoMemoryDir(): Promise<void> {
    try {
      const fs = await import("fs/promises")
      await fs.mkdir(autoMemoryDir, { recursive: true })
    } catch (e) {
      autoLog.info("failed to create auto memory dir", { error: String(e) })
    }
  }

  export async function recordSessionSummary(sessionID: SessionID): Promise<void> {
    try {
      const fs = await import("fs/promises")

      let messages: MessageV2.WithParts[]
      try {
        messages = await Session.messages({ sessionID })
      } catch {
        autoLog.info("failed to get session messages", { sessionID })
        return
      }

      if (!messages || messages.length < 3) {
        autoLog.info("skipping session summary (too few messages)", { sessionID, count: messages?.length ?? 0 })
        return
      }

      const toolCalls = new Map<string, { success: number; fail: number }>()
      const filesModified = new Set<string>()
      const keyDecisions: string[] = []

      for (const msg of messages) {
        for (const part of msg.parts || []) {
          if (part.type === "tool") {
            const toolName = part.tool
            if (!toolCalls.has(toolName)) {
              toolCalls.set(toolName, { success: 0, fail: 0 })
            }
            if (part.state.status === "completed") {
              toolCalls.get(toolName)!.success++
            } else if (part.state.status === "error") {
              toolCalls.get(toolName)!.fail++
            }

            const metadata = part.state.metadata || {}
            if (metadata.path) {
              filesModified.add(metadata.path as string)
            }
          }
        }
      }

      const userMessages = messages.filter((m) => m.role === "user")
      const summaryLines: string[] = []

      if (userMessages.length > 0) {
        summaryLines.push(`## Summary`)
        const firstUserMsg = userMessages[0]
        const text = firstUserMsg.parts.find((p) => p.type === "text")?.text || ""
        summaryLines.push(text.substring(0, 200) + (text.length > 200 ? "..." : ""))
        summaryLines.push("")
      }

      if (toolCalls.size > 0) {
        summaryLines.push(`## Tools Used`)
        for (const [name, stats] of toolCalls.entries()) {
          const total = stats.success + stats.fail
          summaryLines.push(
            `- ${name}: ${total} call${total > 1 ? "s" : ""} (${stats.success} success, ${stats.fail} fail)`,
          )
        }
        summaryLines.push("")
      }

      if (filesModified.size > 0) {
        summaryLines.push(`## Files Modified`)
        for (const file of Array.from(filesModified).sort()) {
          summaryLines.push(`- ${file}`)
        }
        summaryLines.push("")
      }

      const date = new Date().toISOString()
      const content = `# Session ${sessionID}
Date: ${date}

${summaryLines.join("\n")}
`

      await ensureAutoMemoryDir()
      const summaryFile = path.join(autoMemoryDir, `${sessionID}.md`)
      await fs.writeFile(summaryFile, content, "utf-8")

      autoLog.info("session summary recorded", { sessionID, file: summaryFile })
    } catch (e) {
      autoLog.info("failed to record session summary", { sessionID, error: String(e) })
    }
  }

  export async function recordAction(action: string, detail: string): Promise<void> {
    autoLog.info("action recorded", { action, detail })
  }
}

// ---- Auto-Memory (session summaries) ----
export namespace AutoMemory {
  const autoDir = () => path.join(stateDir(), "memory", "auto")
  const autoLog = Log.create({ service: "auto-memory" })

  export async function recordSessionSummary(sessionID: SessionID): Promise<void> {
    let messages: MessageV2.WithParts[]
    try {
      messages = await Session.messages({ sessionID })
    } catch {
      return
    }

    if (!messages || messages.length < 3) return

    try {
      const fs = await import("fs/promises")
      await fs.mkdir(autoDir(), { recursive: true })

      // Extract tool call stats
      const toolStats: Record<string, { count: number; success: number; fail: number }> = {}
      const filesModified = new Set<string>()
      const userMessages: string[] = []
      const decisions: string[] = []

      for (const msg of messages) {
        const role = msg.role as string
        const content = msg.content || msg.text || ""

        if (role === "user") {
          const text = typeof content === "string" ? content : JSON.stringify(content)
          if (text.trim()) userMessages.push(text.slice(0, 200))
        }

        // Parse tool calls from assistant messages
        if (role === "assistant") {
          const parts = Array.isArray(content) ? content : []
          for (const part of parts) {
            if (part.type === "tool_use" && part.name) {
              const name = part.name
              if (!toolStats[name]) toolStats[name] = { count: 0, success: 0, fail: 0 }
              toolStats[name].count++
            }
          }
        }

        // Parse tool results
        if (role === "tool" || content?.type === "tool_result") {
          const toolName = content?.tool_use_id || msg.toolName || ""
          const isError = content?.is_error || content?.type === "tool_result" && content?.content?.[0]?.type === "text" && content?.content?.[0]?.text?.includes("Error")
          if (toolName && toolStats[toolName]) {
            if (isError) toolStats[toolName].fail++
            else toolStats[toolName].success++
          }
        }

        // Extract file paths from tool use
        if (typeof content === "string") {
          const fileMatch = content.match(/(?:write|edit|create|modify)\s+[`"']?([\w/.\-_]+\.[\w]+)[`"']?/i)
          if (fileMatch) filesModified.add(fileMatch[1])
        }
      }

      // Build summary
      const date = new Date().toISOString()
      const toolLines = Object.entries(toolStats)
        .map(([name, s]) => `- ${name}: ${s.count} calls (${s.success} success, ${s.fail} fail)`)
        .join("\n")
      const fileLines = [...filesModified].map((f) => `- ${f}`).join("\n")
      const userLines = userMessages.slice(0, 5).map((m) => `- ${m.slice(0, 100)}`).join("\n")

      const summary = [
        `# Session ${sessionID}`,
        `Date: ${date}`,
        "",
        "## Summary",
        `User sent ${userMessages.length} messages. Tools used: ${Object.keys(toolStats).join(", ") || "none"}.`,
        "",
        "## User Messages",
        userLines || "(none)",
        "",
        "## Tools Used",
        toolLines || "(none)",
        "",
        ...(filesModified.size > 0 ? ["## Files Modified", fileLines, ""] : []),
        ...(decisions.length > 0 ? ["## Key Decisions", ...decisions.map((d) => `- ${d}`), ""] : []),
      ].join("\n")

      await fs.writeFile(path.join(autoDir(), `${sessionID}.md`), summary, "utf-8")
      autoLog.info("session summary recorded", { sessionID })
    } catch (e) {
      autoLog.info("failed to record session summary", { sessionID, error: String(e) })
    }
  }

  /**
   * Load the most recent N auto-memory summaries for system prompt injection.
   */
  export async function recentSummaries(n: number = 3): Promise<string> {
    try {
      const fs = await import("fs/promises")
      await fs.mkdir(autoDir(), { recursive: true })
      const files = await fs.readdir(autoDir())
      if (files.length === 0) return ""

      // Sort by modification time descending
      const withTime = await Promise.all(
        files.map(async (f) => ({
          name: f,
          mtime: (await fs.stat(path.join(autoDir(), f))).mtimeMs,
        })),
      )
      withTime.sort((a, b) => b.mtime - a.mtime)

      const recent = withTime.slice(0, n)
      const summaries = await Promise.all(recent.map((r) => fs.readFile(path.join(autoDir(), r.name), "utf-8")))

      return ["## Recent Memory", "", ...summaries.map((s) => s + "\n---")].join("\n")
    } catch {
      return ""
    }
  }
}

// Auto-initialize dream on compaction when this module is loaded
Memory.initDreamOnCompaction()
