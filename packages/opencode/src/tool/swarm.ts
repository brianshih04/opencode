import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./swarm.txt"
import { Session } from "../session"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { Log } from "../util/log"

const log = Log.create({ service: "tool.swarm" })

// ─── Task Tracker ──────────────────────────────────────────────────

interface TaskResult {
  description: string
  agent: string
  status: "pending" | "running" | "done" | "error"
  output?: string
  sessionID?: string
}

class TaskTracker {
  private tasks: TaskResult[] = []
  private messageStore: Map<string, Array<{ from: string; message: string; time: number }>> = new Map()

  addTask(description: string, agent: string): number {
    this.tasks.push({ description, agent, status: "pending" })
    return this.tasks.length - 1
  }

  updateStatus(index: number, status: TaskResult["status"], output?: string, sessionID?: string) {
    if (index < this.tasks.length) {
      this.tasks[index].status = status
      if (output !== undefined) this.tasks[index].output = output
      if (sessionID !== undefined) this.tasks[index].sessionID = sessionID
    }
  }

  sendMessage(from: string, to: string, message: string) {
    const key = to === "*" ? "__broadcast" : to
    if (!this.messageStore.has(key)) this.messageStore.set(key, [])
    this.messageStore.get(key)!.push({ from, message, time: Date.now() })
  }

  getMessages(forAgent: string): Array<{ from: string; message: string }> {
    const direct = this.messageStore.get(forAgent) ?? []
    const broadcast = this.messageStore.get("__broadcast") ?? []
    return [...direct, ...broadcast].map(({ from, message }) => ({ from, message }))
  }

  summary(): string {
    const done = this.tasks.filter((t) => t.status === "done").length
    const error = this.tasks.filter((t) => t.status === "error").length
    const running = this.tasks.filter((t) => t.status === "running").length
    return `[${done}✓ ${running}⟳ ${error}✗ / ${this.tasks.length} total]`
  }

  getTasks(): TaskResult[] {
    return [...this.tasks]
  }
}

// ─── Parameters ────────────────────────────────────────────────────

const Parameters = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("leader").describe("Team Lead mode: describe the goal, the leader breaks it into subtasks"),
    goal: z.string().describe("High-level goal description for the team lead to break down"),
    max_tasks: z.number().min(2).max(5).optional().describe("Max subtasks to create (default: 3)"),
    agent: z.string().optional().describe("Agent type for subtasks (default: 'general')"),
  }),
  z.object({
    mode: z.literal("parallel").describe("Manual mode: provide explicit tasks to run in parallel"),
    tasks: z
      .array(
        z.object({
          description: z.string().describe("Short description of the task"),
          prompt: z.string().describe("The task prompt for the agent"),
          agent: z.string().describe("Agent type to use (e.g. 'general')"),
        }),
      )
      .min(2)
      .max(5)
      .describe("Array of tasks to run in parallel (2-5 tasks)"),
  }),
])

// ─── Swarm Tool ────────────────────────────────────────────────────

export const SwarmTool = Tool.define("swarm", async () => {
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    async execute(params, ctx) {
      if (params.mode === "leader") {
        return executeLeaderMode(params, ctx)
      }
      return executeParallelMode(params, ctx)
    },
  }
})

// ─── Leader Mode ───────────────────────────────────────────────────

async function executeLeaderMode(
  params: { goal: string; max_tasks?: number; agent?: string },
  ctx: any,
) {
  const maxTasks = params.max_tasks ?? 3
  const agentName = params.agent ?? "general"
  log.info("swarm leader mode", { goal: params.goal, maxTasks })

  const tracker = new TaskTracker()

  // Step 1: Team Lead plans subtasks
  const planPrompt = `You are a Team Lead. Break down this goal into ${maxTasks} independent, parallel subtasks.

GOAL: ${params.goal}

For each subtask, output ONLY a JSON array of objects with "description" and "prompt" fields.
No explanation, no markdown, just the raw JSON array.

Example: [{"description":"Analyze auth module","prompt":"Read all files in src/auth/ and summarize the authentication flow"},{"description":"Find security issues","prompt":"Search for common security vulnerabilities in the codebase"}]

Output the JSON array now:`

  const planSession = await Session.create({
    parentID: ctx.sessionID,
    title: `Team Lead: ${params.goal.slice(0, 60)}`,
  })

  const agent = await Agent.get("build") ?? await Agent.get("general")
  const msgs = await Session.messages({ sessionID: ctx.sessionID, limit: 1 })
  const lastMsg = msgs[msgs.length - 1] as any
  const model = {
    modelID: lastMsg?.info?.modelID ?? lastMsg?.modelID,
    providerID: lastMsg?.info?.providerID ?? lastMsg?.providerID,
  }

  const planParts = await SessionPrompt.resolvePromptParts(planPrompt)
  const planResult = await SessionPrompt.prompt({
    sessionID: planSession.id,
    agent: agent?.name ?? "build",
    model,
    parts: planParts,
  })

  const planText = extractText(planResult)
  log.info("leader plan generated", { plan: planText.slice(0, 500) })

  // Parse subtasks from leader response
  let subtasks: Array<{ description: string; prompt: string }>
  try {
    const jsonMatch = planText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error("No JSON array found in leader response")
    subtasks = JSON.parse(jsonMatch[0])
    if (!Array.isArray(subtasks) || subtasks.length === 0) throw new Error("Empty array")
    subtasks = subtasks.slice(0, maxTasks)
  } catch (e) {
    return {
      output: `## Team Lead Planning Failed\nCould not parse subtasks from leader response.\n\nLeader output:\n${planText}`,
      title: "Swarm: leader parse error",
      metadata: {} as Record<string, unknown>,
    }
  }

  log.info("leader created subtasks", { count: subtasks.length })

  // Step 2: Execute subtasks in parallel (Teammates)
  const results = await Promise.allSettled(
    subtasks.map(async (task, i) => {
      const idx = tracker.addTask(task.description, agentName)
      tracker.updateStatus(idx, "running")

      const session = await Session.create({
        parentID: ctx.sessionID,
        title: `Teammate ${i + 1}: ${task.description.slice(0, 50)}`,
      })

      tracker.updateStatus(idx, "running", undefined, session.id)

      const promptParts = await SessionPrompt.resolvePromptParts(task.prompt)
      const result = await SessionPrompt.prompt({
        sessionID: session.id,
        agent: agentName,
        model,
        parts: promptParts,
      })

      const text = extractText(result)
      tracker.updateStatus(idx, "done", text)
      return { description: task.description, agent: agentName, sessionID: session.id, output: text }
    }),
  )

  // Step 3: Format results
  const output = formatResults(subtasks, results, tracker)
  return {
    output,
    title: `Swarm Leader: ${subtasks.length} tasks ${tracker.summary()}`,
    metadata: {} as Record<string, unknown>,
  }
}

// ─── Parallel Mode (original) ──────────────────────────────────────

async function executeParallelMode(
  params: { tasks: Array<{ description: string; prompt: string; agent: string }> },
  ctx: any,
) {
  log.info("swarm parallel mode", { taskCount: params.tasks.length })

  const tracker = new TaskTracker()
  const allAgents = await Agent.list()
  for (const task of params.tasks) {
    if (!(await Agent.get(task.agent))) {
      return {
        output: `Error: Agent "${task.agent}" not found. Available: ${allAgents.map((a) => a.name).join(", ")}`,
        title: "Swarm: agent not found",
        metadata: {} as Record<string, unknown>,
      }
    }
  }

  const msgs = await Session.messages({ sessionID: ctx.sessionID, limit: 1 })
  const lastMsg = msgs[msgs.length - 1] as any
  const defaultModel = {
    modelID: lastMsg?.info?.modelID ?? lastMsg?.modelID,
    providerID: lastMsg?.info?.providerID ?? lastMsg?.providerID,
  }

  const results = await Promise.allSettled(
    params.tasks.map(async (task) => {
      const idx = tracker.addTask(task.description, task.agent)
      tracker.updateStatus(idx, "running")

      const agent = await Agent.get(task.agent)
      const model = agent?.model ?? defaultModel

      const session = await Session.create({
        parentID: ctx.sessionID,
        title: task.description + ` (@${task.agent})`,
      })

      tracker.updateStatus(idx, "running", undefined, session.id)

      const promptParts = await SessionPrompt.resolvePromptParts(task.prompt)
      const result = await SessionPrompt.prompt({
        sessionID: session.id,
        agent: task.agent,
        model: { modelID: model.modelID, providerID: model.providerID },
        parts: promptParts,
      })

      const text = extractText(result)
      tracker.updateStatus(idx, "done", text)
      return { description: task.description, agent: task.agent, sessionID: session.id, output: text }
    }),
  )

  const output = formatResults(params.tasks, results, tracker)
  return {
    output,
    title: `Swarm: ${params.tasks.length} tasks ${tracker.summary()}`,
    metadata: {} as Record<string, unknown>,
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatResults(
  tasks: Array<{ description: string }>,
  results: PromiseSettledResult<any>[],
  tracker: TaskTracker,
): string {
  const header = `# Swarm Results ${tracker.summary()}\n`
  const body = results
    .map((r, i) => {
      const task = tasks[i]
      if (r.status === "fulfilled") {
        const text = r.value.output ?? extractText(r.value.result)
        return `## ✓ ${task.description}\n${text}`
      }
      tracker.updateStatus(i, "error")
      return `## ✗ ${task.description}\n**Error:** ${String(r.reason)}`
    })
    .join("\n\n---\n\n")
  return header + body
}

function extractText(msg: any): string {
  if (!msg) return "(no output)"
  if (typeof msg === "string") return msg
  if (msg.output) return msg.output
  if (msg.parts) {
    return msg.parts
      .filter((p: any) => p.type === "text" && p.text)
      .map((p: any) => p.text)
      .join("\n")
  }
  return JSON.stringify(msg).slice(0, 2000)
}
