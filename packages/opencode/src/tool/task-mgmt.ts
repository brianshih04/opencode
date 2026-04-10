import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./task-mgmt.txt"
import { Log } from "../util/log"
import path from "path"
import os from "os"
import fs from "fs/promises"

const log = Log.create({ service: "tool.task" })

// ─── Task Types ────────────────────────────────────────────────────

interface Task {
  id: string
  subject: string
  description: string
  status: "pending" | "in_progress" | "completed" | "deleted"
  owner?: string
  activeForm?: string
  blocks: string[]
  blockedBy: string[]
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

// ─── Task Store (file-based persistence) ───────────────────────────

const TASKS_DIR = path.join(os.homedir(), ".opencode", "tasks")

async function ensureTasksDir(): Promise<string> {
  await fs.mkdir(TASKS_DIR, { recursive: true })
  return TASKS_DIR
}

function taskPath(id: string): string {
  return path.join(TASKS_DIR, `${id}.json`)
}

async function readTask(id: string): Promise<Task | null> {
  try {
    const data = await fs.readFile(taskPath(id), "utf-8")
    return JSON.parse(data)
  } catch {
    return null
  }
}

async function writeTask(task: Task): Promise<void> {
  await ensureTasksDir()
  await fs.writeFile(taskPath(task.id), JSON.stringify(task, null, 2), "utf-8")
}

async function deleteTaskFile(id: string): Promise<void> {
  try { await fs.unlink(taskPath(id)) } catch { /* ignore */ }
}

async function listAllTasks(): Promise<Task[]> {
  try {
    const dir = await ensureTasksDir()
    const files = await fs.readdir(dir)
    const tasks: Task[] = []
    for (const f of files.filter(f => f.endsWith(".json"))) {
      try {
        const data = await fs.readFile(path.join(dir, f), "utf-8")
        const task = JSON.parse(data) as Task
        if (task.status !== "deleted") tasks.push(task)
      } catch { /* skip corrupt */ }
    }
    return tasks.sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

let nextId = 1
let idReady: Promise<void>

function generateId(): Promise<string> {
  return idReady.then(() => String(nextId++))
}

async function initIdCounter(): Promise<void> {
  const tasks = await listAllTasks()
  if (tasks.length > 0) {
    const maxId = Math.max(...tasks.map(t => parseInt(t.id) || 0))
    nextId = maxId + 1
  }
}

idReady = initIdCounter().catch(() => {})

// ─── Parameters ────────────────────────────────────────────────────

const Parameters = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    subject: z.string().describe("Short task title (imperative form, e.g. 'Fix login bug')"),
    description: z.string().optional().describe("Detailed task description"),
    activeForm: z.string().optional().describe("Present continuous form (e.g. 'Fixing login bug')"),
    blocks: z.array(z.string()).optional().describe("Task IDs that this task blocks"),
    blockedBy: z.array(z.string()).optional().describe("Task IDs that must complete before this one"),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().describe("Task ID to update"),
    status: z.enum(["pending", "in_progress", "completed", "deleted"]).optional(),
    subject: z.string().optional(),
    description: z.string().optional(),
    activeForm: z.string().optional(),
    owner: z.string().optional().describe("Agent name owning this task"),
    blocks: z.array(z.string()).optional(),
    blockedBy: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal("list"),
    status: z.enum(["pending", "in_progress", "completed"]).optional().describe("Filter by status"),
    owner: z.string().optional().describe("Filter by owner"),
  }),
  z.object({
    action: z.literal("get"),
    id: z.string().describe("Task ID to retrieve"),
  }),
])

// ─── Task Management Tool ──────────────────────────────────────────

export const TaskManagementTool = Tool.define("task", async () => {
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    async execute(params) {
      switch (params.action) {
        case "create":
          return handleCreate(params)
        case "update":
          return handleUpdate(params)
        case "list":
          return handleList(params)
        case "get":
          return handleGet(params)
        default:
          return { output: "Unknown action", title: "Task error", metadata: {} as Record<string, unknown> }
      }
    },
  }
})

// ─── Handlers ──────────────────────────────────────────────────────

async function handleCreate(params: {
  subject: string
  description?: string
  activeForm?: string
  blocks?: string[]
  blockedBy?: string[]
}) {
  const id = await generateId()
  const now = Date.now()
  const task: Task = {
    id,
    subject: params.subject,
    description: params.description ?? "",
    status: "pending",
    activeForm: params.activeForm,
    blocks: params.blocks ?? [],
    blockedBy: params.blockedBy ?? [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }

  await writeTask(task)

  // Update blocked tasks' blockedBy lists
  for (const blockedId of task.blocks) {
    const blocked = await readTask(blockedId)
    if (blocked && !blocked.blockedBy.includes(id)) {
      blocked.blockedBy.push(id)
      blocked.updatedAt = now
      await writeTask(blocked)
    }
  }

  // Verify blockedBy tasks exist
  for (const blockerId of task.blockedBy) {
    const blocker = await readTask(blockerId)
    if (!blocker) {
      return {
        output: `⚠️ Task ${id} created, but blocker ${blockerId} not found.\n${formatTask(task)}`,
        title: `Task #${id}: ${task.subject}`,
        metadata: { id } as Record<string, unknown>,
      }
    }
  }

  return {
    output: `✅ Task #${id} created\n${formatTask(task)}`,
    title: `Task #${id}: ${task.subject}`,
    metadata: { id } as Record<string, unknown>,
  }
}

async function handleUpdate(params: {
  id: string
  status?: "pending" | "in_progress" | "completed" | "deleted"
  subject?: string
  description?: string
  activeForm?: string
  owner?: string
  blocks?: string[]
  blockedBy?: string[]
}) {
  const task = await readTask(params.id)
  if (!task) {
    return { output: `❌ Task #${params.id} not found`, title: "Task not found", metadata: {} as Record<string, unknown> }
  }

  if (params.status !== undefined) task.status = params.status
  if (params.subject !== undefined) task.subject = params.subject
  if (params.description !== undefined) task.description = params.description
  if (params.activeForm !== undefined) task.activeForm = params.activeForm
  if (params.owner !== undefined) task.owner = params.owner
  if (params.blocks !== undefined) task.blocks = params.blocks
  if (params.blockedBy !== undefined) task.blockedBy = params.blockedBy
  task.updatedAt = Date.now()

  if (task.status === "deleted") {
    await deleteTaskFile(params.id)
    return {
      output: `🗑️ Task #${params.id} deleted`,
      title: `Task #${params.id} deleted`,
      metadata: { id: params.id } as Record<string, unknown>,
    }
  }

  await writeTask(task)

  // When completed, unblock dependent tasks
  if (params.status === "completed") {
    for (const blockedId of task.blocks) {
      const blocked = await readTask(blockedId)
      if (blocked) {
        blocked.blockedBy = blocked.blockedBy.filter(b => b !== params.id)
        blocked.updatedAt = Date.now()
        await writeTask(blocked)
      }
    }
  }

  const statusIcon = task.status === "completed" ? "✅" : task.status === "in_progress" ? "⟳" : "○"
  return {
    output: `${statusIcon} Task #${params.id} updated\n${formatTask(task)}`,
    title: `Task #${params.id}: ${task.subject}`,
    metadata: { id: params.id } as Record<string, unknown>,
  }
}

async function handleList(params: { status?: string; owner?: string }) {
  let tasks = await listAllTasks()

  if (params.status) tasks = tasks.filter(t => t.status === params.status)
  if (params.owner) tasks = tasks.filter(t => t.owner === params.owner)

  if (tasks.length === 0) {
    return { output: "No tasks found.", title: "Tasks (empty)", metadata: {} as Record<string, unknown> }
  }

  const pending = tasks.filter(t => t.status === "pending").length
  const inProgress = tasks.filter(t => t.status === "in_progress").length
  const completed = tasks.filter(t => t.status === "completed").length

  const header = `📋 Tasks: ${pending} pending · ${inProgress} in progress · ${completed} completed\n`
  const body = tasks.map(t => {
    const icon = t.status === "completed" ? "✅" : t.status === "in_progress" ? "⟳" : "○"
    const owner = t.owner ? ` [@${t.owner}]` : ""
    const blockers = t.blockedBy.length > 0 ? ` ⏳ blocked by: ${t.blockedBy.join(", ")}` : ""
    return `${icon} #${t.id}: ${t.subject}${owner}${blockers}`
  }).join("\n")

  return {
    output: header + body,
    title: `Tasks (${tasks.length})`,
    metadata: { count: tasks.length, pending, inProgress, completed } as Record<string, unknown>,
  }
}

async function handleGet(params: { id: string }) {
  const task = await readTask(params.id)
  if (!task) {
    return { output: `❌ Task #${params.id} not found`, title: "Task not found", metadata: {} as Record<string, unknown> }
  }
  return {
    output: formatTask(task),
    title: `Task #${task.id}: ${task.subject}`,
    metadata: { id: task.id } as Record<string, unknown>,
  }
}

// ─── Formatting ────────────────────────────────────────────────────

function formatTask(task: Task): string {
  const lines = [
    `**#${task.id}: ${task.subject}**`,
    `Status: ${task.status}${task.owner ? ` | Owner: @${task.owner}` : ""}`,
    `Created: ${new Date(task.createdAt).toISOString()}`,
  ]
  if (task.description) lines.push(`Description: ${task.description}`)
  if (task.activeForm) lines.push(`Active form: ${task.activeForm}`)
  if (task.blocks.length > 0) lines.push(`Blocks: ${task.blocks.join(", ")}`)
  if (task.blockedBy.length > 0) lines.push(`Blocked by: ${task.blockedBy.join(", ")}`)
  return lines.join("\n")
}
