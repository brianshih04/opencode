import fs from "fs"
import path from "path"
import { Log } from "@/util/log"
import { Bridge } from "./index"
import * as Fs from "./filesystem"
import type { AnswerMessage, QuestionMessage } from "./schema"

const log = Log.create({ service: "bridge-monitor" })

const pending = new Map<string, { timeout: ReturnType<typeof setTimeout>; resolve: (selected: number[]) => void }>()

let watcher: fs.FSWatcher | undefined
let answerDir = ""

export function start(dir: string) {
  answerDir = path.join(dir, "incoming", "answer")
  watcher = fs.watch(answerDir, (event, filename) => {
    if (event !== "rename" || !filename) return
    if (!filename.endsWith(".json")) return
    processAnswer(path.join(answerDir, filename))
  })
  log.info("monitor started", { dir: answerDir })
}

export function stop() {
  watcher?.close()
  watcher = undefined
  for (const [, entry] of pending) {
    clearTimeout(entry.timeout)
  }
  pending.clear()
  log.info("monitor stopped")
}

function processAnswer(filepath: string) {
  const msg = Fs.readJson<AnswerMessage>(filepath)
  if (!msg || msg.type !== "answer") {
    log.warn("invalid answer file", { filepath })
    Fs.removeFile(filepath)
    return
  }

  const entry = pending.get(msg.question_id)
  if (entry) {
    clearTimeout(entry.timeout)
    pending.delete(msg.question_id)
    entry.resolve(msg.selected)
    log.info("answer received", { question_id: msg.question_id, selected: msg.selected })
  } else {
    log.warn("answer for unknown question", { question_id: msg.question_id })
  }
  Fs.removeFile(filepath)
}

export function sendQuestion(msg: QuestionMessage): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const timeoutMs = (msg.timeout_minutes ?? 30) * 60 * 1000
    const timer = setTimeout(() => {
      pending.delete(msg.question_id)
      reject(new Error(`bridge question timeout: ${msg.question_id}`))
      log.warn("question timed out", { question_id: msg.question_id })
    }, timeoutMs)

    pending.set(msg.question_id, { timeout: timer, resolve })

    const ts = msg.timestamp.replace(/[:.]/g, "-")
    const id = `${ts}-${msg.question_id.slice(-8)}`
    Fs.writeJson(path.join(Bridge.dirpath(), "outgoing", "question"), `${id}.json`, msg)
    log.info("question sent", { question_id: msg.question_id })
  })
}

export function hasPending(questionId: string) {
  return pending.has(questionId)
}
