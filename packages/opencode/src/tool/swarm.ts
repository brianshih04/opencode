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

// ─── Query Complexity Assessment ────────────────────────────────

type QueryComplexity = "straightforward" | "standard" | "medium" | "high"

type QueryStrategy = "depth-first" | "breadth-first" | "straightforward"

interface StrategyAssessment {
  complexity: QueryComplexity
  strategy: QueryStrategy
  recommendedAgents: number
  reasoning: string
}

function assessQuery(goal: string): StrategyAssessment {
  const g = goal.toLowerCase()
  const words = g.split(/\s+/)

  // Heuristics for complexity
  const depthFirstSignals = [
    "analyze", "evaluate", "compare", "pros and cons", "different approaches",
    "perspectives", "trade-offs", "investigate", "assess", "review",
  ]
  const breadthFirstSignals = [
    "each", "every", "list", "all", "multiple", "several", "compare",
    "both", "vs", "versus", "components", "modules", "services",
    "features", "files", "directories",
  ]
  const complexSignals = [
    "comprehensive", "entire", "full", "complete", "thorough", "deep",
    "extensive", "detailed", "all aspects", "end-to-end", "architecture",
  ]
  const simpleSignals = [
    "what is", "how to", "find", "check", "fix", "update", "add",
    "remove", "rename", "create", "simple", "quick", "just",
  ]

  let depthScore = 0
  let breadthScore = 0
  let complexScore = 0
  let simpleScore = 0

  for (const signal of depthFirstSignals) if (g.includes(signal)) depthScore++
  for (const signal of breadthFirstSignals) if (g.includes(signal)) breadthScore++
  for (const signal of complexSignals) if (g.includes(signal)) complexScore++
  for (const signal of simpleSignals) if (g.includes(signal)) simpleScore++

  // Word count heuristic
  if (words.length > 30) complexScore += 1
  if (words.length > 50) complexScore += 1
  if (words.length < 10) simpleScore += 1

  // Multiple distinct topics (comma or 'and' separated)
  const topics = g.split(/[,;]|\band\b|\bor\b/).filter((t) => t.trim().length > 3)
  if (topics.length >= 4) breadthScore += 2
  else if (topics.length >= 3) breadthScore += 1

  // Determine strategy
  let strategy: QueryStrategy
  if (simpleScore > depthScore + breadthScore + complexScore) {
    strategy = "straightforward"
  } else if (depthScore >= breadthScore && depthScore > 0) {
    strategy = "depth-first"
  } else {
    strategy = "breadth-first"
  }

  // Determine complexity and agent count
  let complexity: QueryComplexity
  let recommendedAgents: number

  if (simpleScore >= 2 && complexScore === 0 && words.length < 15) {
    complexity = "straightforward"
    recommendedAgents = 1
  } else if (complexScore >= 2 || topics.length >= 4 || words.length > 40) {
    complexity = "high"
    recommendedAgents = Math.min(Math.max(topics.length, 5), 10)
  } else if (complexScore >= 1 || breadthScore >= 2 || words.length > 20) {
    complexity = "medium"
    recommendedAgents = Math.min(Math.max(topics.length, 3), 5)
  } else {
    complexity = "standard"
    recommendedAgents = 3
  }

  const reasoning = `depth=${depthScore} breadth=${breadthScore} complex=${complexScore} simple=${simpleScore} topics=${topics.length} words=${words.length}`

  return { complexity, strategy, recommendedAgents, reasoning }
}

// ─── Strategy-Aware Plan Prompt ──────────────────────────────────

function buildLeaderPrompt(assessment: StrategyAssessment, goal: string, maxTasks: number): string {
  const { strategy, complexity } = assessment

  const strategyGuidance: Record<QueryStrategy, string> = {
    "depth-first": `
**Strategy: Depth-First**
This query benefits from exploring the same topic from multiple angles or methodologies.
Create subtasks that each take a different approach to the core question.
Example angles: code analysis, documentation review, testing approach, performance profile.`,
    "breadth-first": `
**Strategy: Breadth-First**
This query has multiple distinct sub-topics that can be investigated independently.
Create subtasks with clear, non-overlapping boundaries for each sub-topic.
Ensure no two subtasks cover the same ground.`,
    "straightforward": `
**Strategy: Straightforward**
This is a focused, well-defined query. Create 1-2 subtasks maximum.
One task should handle the main objective; add a second only for verification.`,
  }

  const complexityGuidance: Record<QueryComplexity, string> = {
    straightforward: `Keep it minimal — 1 task is usually enough.`,
    standard: `Use 2-3 agents. Default approach.`,
    medium: `Use 3-5 agents for good coverage without redundancy.`,
    high: `Use up to ${maxTasks} agents. Break into many small, well-defined sub-tasks. Prefer more capable agents over many narrow ones.`,
  }

  return `You are a Team Lead. Break down this goal into subtasks for parallel execution.

GOAL: ${goal}

${strategyGuidance[strategy]}

**Complexity: ${complexity.toUpperCase()}**
${complexityGuidance[complexity]}

RULES:
1. Each subtask must be independently executable
2. Include sufficient context in each prompt so the teammate can work autonomously
3. Specify what format the output should be in
4. Keep prompts concise but complete
${strategy === "depth-first" ? "5. Each subtask should explore a DIFFERENT angle/methodology\n" : ""}${strategy === "breadth-first" ? "5. Ensure zero overlap between subtask scopes\n" : ""}Output ONLY a JSON array of objects with "description" and "prompt" fields.
No explanation, no markdown, just the raw JSON array.

Target: ${assessment.recommendedAgents} subtask(s)${assessment.recommendedAgents >= 5 ? " (scale down if fewer are truly needed)" : ""}.

Example: [{"description":"Analyze auth flow","prompt":"Read src/auth/ files and describe the authentication flow in 5 bullet points"},{"description":"Check auth security","prompt":"Search for security vulnerabilities in the authentication code. Report findings as a severity-ranked list."}]

Output the JSON array now:`
}

// ─── Parameters ────────────────────────────────────────────────────

const Parameters = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("leader").describe("Team Lead mode: describe the goal, the leader breaks it into subtasks"),
    goal: z.string().describe("High-level goal description for the team lead to break down"),
    max_tasks: z.number().min(1).max(20).optional().describe("Max subtasks to create (default: auto, max 20)"),
    agent: z.string().optional().describe("Agent type for subtasks (default: 'general')"),
    strategy: z.enum(["depth-first", "breadth-first", "auto"]).optional().describe("Force strategy or let the system decide (default: 'auto')"),
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
      .max(20)
      .describe("Array of tasks to run in parallel (2-20 tasks)"),
  }),
  z.object({
    mode: z.literal("chain").describe("Chain mode: run tasks sequentially, each receiving previous results"),
    tasks: z
      .array(
        z.object({
          description: z.string().describe("Short description of the task"),
          prompt: z.string().describe("The task prompt (use $PREV to reference previous output)"),
          agent: z.string().optional().describe("Agent type (default: 'general')"),
        }),
      )
      .min(2)
      .max(10)
      .describe("Array of tasks to chain sequentially (2-10 tasks)"),
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
      if (params.mode === "chain") {
        return executeChainMode(params, ctx)
      }
      return executeParallelMode(params, ctx)
    },
  }
})

// ─── Leader Mode ───────────────────────────────────────────────────

async function executeLeaderMode(
  params: { goal: string; max_tasks?: number; agent?: string; strategy?: "depth-first" | "breadth-first" | "auto" },
  ctx: any,
) {
  const maxTasks = params.max_tasks ?? 20
  const agentName = params.agent ?? "general"

  // Step 0: Assess query complexity
  const assessment = assessQuery(params.goal)
  const strategy = params.strategy === "auto" || !params.strategy
    ? assessment.strategy
    : params.strategy

  // Cap recommended agents to maxTasks
  const targetAgents = Math.min(assessment.recommendedAgents, maxTasks)

  log.info("swarm leader mode", {
    goal: params.goal,
    complexity: assessment.complexity,
    strategy,
    targetAgents,
    maxTasks,
    reasoning: assessment.reasoning,
  })

  const tracker = new TaskTracker()

  // Step 1: Team Lead plans subtasks (strategy-aware)
  const planPrompt = buildLeaderPrompt(assessment, params.goal, targetAgents)

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

  log.info("leader created subtasks", { count: subtasks.length, strategy })

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

  // Step 3: Synthesize results with Leader summary
  const rawOutput = formatResults(subtasks, results, tracker)
  let synthesizedOutput = rawOutput

  // Only synthesize if we have multiple results and at least some succeeded
  const succeeded = results.filter((r) => r.status === "fulfilled").length
  if (succeeded >= 2 && assessment.complexity !== "straightforward") {
    synthesizedOutput = await synthesizeResults(assessment, params.goal, subtasks, results, rawOutput, {
      sessionID: ctx.sessionID,
      agent: agent?.name ?? "build",
      model,
    })
  }

  return {
    output: synthesizedOutput,
    title: `Swarm Leader: ${subtasks.length} tasks ${tracker.summary()} [${strategy}]`,
    metadata: { complexity: assessment.complexity, strategy } as Record<string, unknown>,
  }
}

// ─── Chain Mode ────────────────────────────────────────────────────

async function executeChainMode(
  params: { tasks: Array<{ description: string; prompt: string; agent?: string }> },
  ctx: any,
) {
  log.info("swarm chain mode", { taskCount: params.tasks.length })

  const tracker = new TaskTracker()
  const allAgents = await Agent.list()

  const msgs = await Session.messages({ sessionID: ctx.sessionID, limit: 1 })
  const lastMsg = msgs[msgs.length - 1] as any
  const defaultModel = {
    modelID: lastMsg?.info?.modelID ?? lastMsg?.modelID,
    providerID: lastMsg?.info?.providerID ?? lastMsg?.providerID,
  }

  let prevOutput = ""
  const chainResults: Array<{ description: string; output: string }> = []

  for (let i = 0; i < params.tasks.length; i++) {
    const task = params.tasks[i]
    const taskAgent = task.agent ?? "general"

    if (!(await Agent.get(taskAgent))) {
      log.info("chain: agent not found", { agent: taskAgent, available: allAgents.map((a) => a.name).join(", ") })
      tracker.addTask(task.description, taskAgent)
      chainResults.push({ description: task.description, output: `**Error:** Agent "${taskAgent}" not found` })
      continue
    }

    const idx = tracker.addTask(task.description, taskAgent)
    tracker.updateStatus(idx, "running")

    const session = await Session.create({
      parentID: ctx.sessionID,
      title: `Chain ${i + 1}/${params.tasks.length}: ${task.description.slice(0, 50)}`,
    })

    tracker.updateStatus(idx, "running", undefined, session.id)

    // Replace $PREV placeholder with previous output
    const prompt = task.prompt.replace(/\$PREV/g, prevOutput.slice(0, 3000))

    const agent = await Agent.get(taskAgent)
    const model = agent?.model ?? defaultModel

    const promptParts = await SessionPrompt.resolvePromptParts(prompt)
    const result = await SessionPrompt.prompt({
      sessionID: session.id,
      agent: taskAgent,
      model: { modelID: model.modelID, providerID: model.providerID },
      parts: promptParts,
    })

    const text = extractText(result)
    prevOutput = text
    tracker.updateStatus(idx, "done", text)
    chainResults.push({ description: task.description, output: text })
    log.info("chain step done", { step: i + 1, total: params.tasks.length })
  }

  // Format chain results
  const header = `# Chain Results ${tracker.summary()}\n`
  const body = chainResults
    .map((r, i) => `## Step ${i + 1}: ${r.description}\n${r.output}`)
    .join("\n\n---\n\n")

  return {
    output: header + body,
    title: `Swarm Chain: ${params.tasks.length} steps ${tracker.summary()}`,
    metadata: {} as Record<string, unknown>,
  }
}

// ─── Result Synthesis ──────────────────────────────────────────────

async function synthesizeResults(
  assessment: StrategyAssessment,
  goal: string,
  subtasks: Array<{ description: string; prompt: string }>,
  results: PromiseSettledResult<any>[],
  rawOutput: string,
  ctx: { sessionID: string; agent: string; model: any },
): Promise<string> {
  try {
    const synthPrompt = `You are a Team Lead synthesizing results from your team.

GOAL: ${goal}

STRATEGY: ${assessment.strategy}

Below are the raw results from ${results.length} subtasks. Create a unified synthesis:
- Eliminate redundancy across results
- Highlight the most important findings
- ${assessment.strategy === "depth-first" ? "Present different perspectives and identify consensus/disagreement" : "Organize findings by subtopic"}
- Keep the synthesis concise and actionable
- Use markdown headers and bullet points

RAW RESULTS:
${rawOutput}

SYNTHESIZE NOW:`

    const session = await Session.create({
      parentID: ctx.sessionID,
      title: `Synthesis: ${goal.slice(0, 40)}`,
    })

    const promptParts = await SessionPrompt.resolvePromptParts(synthPrompt)
    const result = await SessionPrompt.prompt({
      sessionID: session.id,
      agent: ctx.agent,
      model: ctx.model,
      parts: promptParts,
    })

    const synthText = extractText(result)
    log.info("synthesis complete", { length: synthText.length })

    return `# Synthesized Results\n\n> Strategy: ${assessment.strategy} | Complexity: ${assessment.complexity}\n\n${synthText}`
  } catch (e) {
    log.info("synthesis failed, returning raw results", { error: String(e) })
    return rawOutput
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
