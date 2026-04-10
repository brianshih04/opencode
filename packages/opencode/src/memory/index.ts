import { Log } from "@/util/log"
import { Session } from "@/session"
import { SessionID } from "@/session/schema"
import { Bus } from "@/bus"
import { SessionCompaction } from "@/session/compaction"
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
  lastConsolidatedAt: number  // unix ms timestamp
  sessionCount: number        // sessions seen since last consolidation
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
    let messages: any[]
    try {
      messages = await Session.messages({ sessionID })
    } catch {
      return
    }

    if (!messages || messages.length < 2) return

    const transcript = messages
      .map((m: any) => {
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
  export function initDreamOnCompaction(): void {
    try {
      Bus.subscribe(SessionCompaction.Event.Compacted, (event) => {
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
}

// Auto-initialize dream on compaction when this module is loaded
Memory.initDreamOnCompaction()
