import fs from "fs"
import path from "path"
import crypto from "crypto"
import { Bus } from "@/bus"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import * as Fs from "./filesystem"
import type { StatusMessage, QuestionMessage, RunInfo } from "./schema"
import * as Monitor from "./monitor"

export namespace Bridge {
  const log = Log.create({ service: "bridge" })

  let dir = ""
  let initialized = false

  export function dirpath() {
    return dir
  }

  export async function init(customPath?: string) {
    dir = Fs.bridgeDir(customPath)
    log.info("initializing", { dir })
    Fs.ensureDir(dir)
    Fs.cleanStale(dir)

    const run: RunInfo = {
      pid: process.pid,
      cwd: Instance.directory,
      started_at: new Date().toISOString(),
    }
    Fs.writeJson(dir, "run.json", run)
    initialized = true
    Monitor.start(dir)
    log.info("initialized", { pid: run.pid, cwd: run.cwd })
  }

  export function cleanup() {
    if (!initialized) return
    initialized = false
    Monitor.stop()
    Fs.removeFile(path.join(dir, "run.json"))
    log.info("cleaned up")
  }

  export function sendStatus(input: {
    level: "info" | "warning" | "error"
    sessionId: string
    agent: string
    title: string
    message: string
  }) {
    if (!initialized) return
    const ts = new Date().toISOString()
    const id = ts.replace(/[:.]/g, "-") + "-" + crypto.randomUUID().slice(0, 8)
    const msg: StatusMessage = {
      type: "status",
      level: input.level,
      session_id: input.sessionId,
      agent: input.agent,
      title: input.title,
      message: input.message,
      timestamp: ts,
    }
    Fs.writeJson(path.join(dir, "outgoing", "status"), `${id}.json`, msg)
  }

  export async function sendQuestion(input: {
    questionId: string
    sessionId: string
    title: string
    message: string
    choices: { index: number; label: string }[]
    multiple?: boolean
    timeoutMinutes?: number
  }): Promise<number[]> {
    if (!initialized) throw new Error("bridge not initialized")
    const ts = new Date().toISOString()
    const msg: QuestionMessage = {
      type: "question",
      question_id: input.questionId,
      session_id: input.sessionId,
      title: input.title,
      message: input.message,
      choices: input.choices,
      multiple: input.multiple ?? false,
      timeout_minutes: input.timeoutMinutes ?? 30,
      timestamp: ts,
    }
    return Monitor.sendQuestion(msg)
  }
}
