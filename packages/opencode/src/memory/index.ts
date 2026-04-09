import { Log } from "@/util/log"
import { Session } from "@/session"
import { SessionID } from "@/session/schema"
import path from "path"
import os from "os"

const log = Log.create({ service: "memory" })

function palacePath(): string {
  return process.env.MEMPALACE_PATH || path.join(os.homedir(), ".mempalace", "palace")
}

function runMempalace(...args: string[]): string {
  try {
    const proc = Bun.spawnSync(["python", "-m", "mempalace", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
      env: { ...process.env, MEMPALACE_PATH: palacePath() },
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
  export async function dream(sessionID: SessionID): Promise<void> {
    log.info("dream started", { sessionID })

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
    log.info("dream completed", { sessionID })

    try {
      const fs = await import("fs/promises")
      await fs.unlink(tmpFile).catch(() => {})
    } catch {}
  }
}
