import { Tool } from "./tool"
import path from "path"
import fs from "fs"
import os from "os"
import z from "zod"
import DESCRIPTION from "./cron.txt"

// ---- Cron Expression Parser (minimal, 5-field) ----
function parseCron(expr: string): number[][] | null {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return null

  const ranges = [
    [0, 59],   // minute
    [0, 23],   // hour
    [1, 31],   // day of month
    [1, 12],   // month
    [0, 6],    // day of week (0=Sun)
  ]

  try {
    return fields.map((field, i) => {
      const [min, max] = ranges[i]!
      if (field === "*") return Array.from({ length: max - min + 1 }, (_, k) => k + min)

      const values: number[] = []
      for (const part of field.split(",")) {
        const stepMatch = part.match(/^(\*|\d+)-?(\d+)?\/(\d+)$/)
        if (stepMatch) {
          const start = stepMatch[1] === "*" ? min : parseInt(stepMatch[1]!)
          const end = stepMatch[2] ? parseInt(stepMatch[2]!) : max
          const step = parseInt(stepMatch[3]!)
          for (let v = start; v <= end; v += step) values.push(v)
          continue
        }
        const rangeMatch = part.match(/^(\d+)-(\d+)$/)
        if (rangeMatch) {
          const s = parseInt(rangeMatch[1]!), e = parseInt(rangeMatch[2]!)
          for (let v = s; v <= e; v++) values.push(v)
          continue
        }
        const n = parseInt(part)
        if (isNaN(n) || n < min || n > max) throw new Error(`invalid: ${part}`)
        values.push(n)
      }
      return [...new Set(values)].sort((a, b) => a - b)
    })
  } catch {
    return null
  }
}

function matchesCron(parsed: number[][], now: Date): boolean {
  const fields = [now.getMinutes(), now.getHours(), now.getDate(), now.getMonth() + 1, now.getDay()]
  return parsed.every((values, i) => values.includes(fields[i]!))
}

// ---- Task Store ----
interface CronTask {
  id: string
  cron: string
  prompt: string
  recurring: boolean
  createdAt: number
  lastFiredAt?: number
}

const TASKS_FILE = path.join(os.homedir(), ".opencode", "cron-tasks.json")
const MAX_TASKS = 50

function readTasks(): CronTask[] {
  try {
    const data = fs.readFileSync(TASKS_FILE, "utf-8")
    return JSON.parse(data)
  } catch { return [] }
}

function writeTasks(tasks: CronTask[]): void {
  fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true })
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), "utf-8")
}

// ---- Tool ----
const Parameters = z.object({
  action: z.enum(["create", "list", "delete"]).describe("Action to perform"),
  cron: z.string().optional().describe('5-field cron expression (required for create)'),
  prompt: z.string().optional().describe("Prompt to execute when cron fires (required for create)"),
  recurring: z.boolean().optional().default(true).describe("true = repeating, false = one-shot"),
  id: z.string().optional().describe("Task ID (required for delete)"),
})

type Result = { action: string; taskId?: string; tasks?: any[]; error?: string }

export const CronTool = Tool.define("cron", async (): Promise<Tool.DefWithoutID<typeof Parameters, Result>> => ({
  description: DESCRIPTION,
  parameters: Parameters,
  async execute(args) {
    if (args.action === "create") {
      if (!args.cron || !args.prompt) {
        return {
          title: "Missing arguments",
          metadata: { action: "create", error: "cron and prompt required" },
          output: "Error: 'cron' expression and 'prompt' are required for create action.",
        }
      }
      const parsed = parseCron(args.cron)
      if (!parsed) {
        return {
          title: "Invalid cron expression",
          metadata: { action: "create", error: "invalid cron" },
          output: `Error: Invalid cron expression '${args.cron}'. Expected 5 fields: M H DoM Mon DoW`,
        }
      }
      const tasks = readTasks()
      if (tasks.length >= MAX_TASKS) {
        return {
          title: "Too many tasks",
          metadata: { action: "create", error: "max tasks" },
          output: `Error: Maximum ${MAX_TASKS} tasks. Delete one first.`,
        }
      }
      const id = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const task: CronTask = {
        id,
        cron: args.cron,
        prompt: args.prompt,
        recurring: args.recurring ?? true,
        createdAt: Date.now(),
      }
      tasks.push(task)
      writeTasks(tasks)

      return {
        title: `Scheduled ${task.recurring ? "recurring" : "one-shot"} task`,
        metadata: { action: "create", taskId: id },
        output: `Task ${id} scheduled.\nCron: ${args.cron}\nRecurring: ${task.recurring}\nPrompt: ${args.prompt}`,
      }
    }

    if (args.action === "list") {
      const tasks = readTasks()
      if (tasks.length === 0) {
        return {
          title: "No scheduled tasks",
          metadata: { action: "list", tasks: [] },
          output: "No scheduled tasks.",
        }
      }
      const output = tasks.map(t =>
        `**${t.id}**\nCron: ${t.cron}\nRecurring: ${t.recurring}\nCreated: ${new Date(t.createdAt).toISOString()}\nPrompt: ${t.prompt}`
      ).join("\n\n")

      return {
        title: `${tasks.length} scheduled task(s)`,
        metadata: { action: "list", tasks: tasks.map(t => t.id) },
        output,
      }
    }

    if (args.action === "delete") {
      if (!args.id) {
        return {
          title: "Missing task ID",
          metadata: { action: "delete", error: "no id" },
          output: "Error: 'id' is required for delete action.",
        }
      }
      const tasks = readTasks()
      const idx = tasks.findIndex(t => t.id === args.id)
      if (idx < 0) {
        return {
          title: "Task not found",
          metadata: { action: "delete", error: "not found" },
          output: `Error: Task '${args.id}' not found.`,
        }
      }
      const removed = tasks.splice(idx, 1)[0]!
      writeTasks(tasks)

      return {
        title: `Deleted task ${removed.id}`,
        metadata: { action: "delete", taskId: removed.id },
        output: `Task ${removed.id} deleted.\nCron: ${removed.cron}\nPrompt: ${removed.prompt}`,
      }
    }

    return {
      title: "Unknown action",
      metadata: { action: args.action, error: "unknown" },
      output: `Error: Unknown action '${args.action}'. Use create, list, or delete.`,
    }
  },
}))

// Export helpers for scheduler integration
let schedulerInterval: ReturnType<typeof setInterval> | null = null

function startScheduler(): void {
  if (schedulerInterval) return
  const CHECK_INTERVAL_MS = 60_000

  schedulerInterval = setInterval(() => {
    try {
      const tasks = readTasks()
      const now = new Date()
      let changed = false
      for (const task of tasks) {
        const parsed = parseCron(task.cron)
        if (!parsed) continue
        if (matchesCron(parsed, now)) {
          task.lastFiredAt = Date.now()
          if (!task.recurring) {
            const idx = tasks.indexOf(task)
            if (idx >= 0) tasks.splice(idx, 1)
          }
          changed = true
        }
      }
      if (changed) writeTasks(tasks)
    } catch {}
  }, CHECK_INTERVAL_MS)
}

export const CronScheduler = {
  parseCron,
  matchesCron,
  readTasks,
  writeTasks,
  startScheduler,
}
