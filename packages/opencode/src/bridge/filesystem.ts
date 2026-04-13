import fs from "fs"
import path from "path"
import os from "os"
import { Log } from "@/util/log"
import { Global } from "@/global"

const log = Log.create({ service: "bridge-fs" })

export function bridgeDir(customPath?: string) {
  const base = customPath?.startsWith("~")
    ? path.join(os.homedir(), customPath.slice(1))
    : (customPath ?? path.join(Global.Path.data, "bridge"))
  return path.resolve(base)
}

export function ensureDir(dir: string) {
  fs.mkdirSync(path.join(dir, "outgoing", "status"), { recursive: true })
  fs.mkdirSync(path.join(dir, "outgoing", "question"), { recursive: true })
  fs.mkdirSync(path.join(dir, "incoming", "answer"), { recursive: true })
}

export function cleanStale(dir: string) {
  for (const sub of ["outgoing/status", "outgoing/question", "incoming/answer"]) {
    const full = path.join(dir, sub)
    let files: string[]
    try {
      files = fs.readdirSync(full)
    } catch {
      continue
    }
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(full, file))
      } catch {}
    }
  }
}

export function writeJson(dir: string, file: string, data: unknown) {
  const filepath = path.join(dir, file)
  const tmp = filepath + ".tmp"
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, filepath)
  log.debug("wrote", { file })
}

export function readJson<T>(filepath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf-8")) as T
  } catch {
    return undefined
  }
}

export function removeFile(filepath: string) {
  try {
    fs.unlinkSync(filepath)
  } catch {}
}
