import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./swarm.txt"
import { Session } from "../session"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { Log } from "../util/log"
import { iife } from "@/util/iife"

const log = Log.create({ service: "tool.swarm" })

const Parameters = z.object({
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
})

export const SwarmTool = Tool.define("swarm", async () => {
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    async execute(params, ctx) {
      log.info("swarm started", { taskCount: params.tasks.length })

      // Validate agents
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

      // Get model from current session
      const msgs = await Session.messages({ sessionID: ctx.sessionID, limit: 1 })
      const lastMsg = msgs[msgs.length - 1] as any
      const defaultModel = {
        modelID: lastMsg?.info?.modelID ?? lastMsg?.modelID,
        providerID: lastMsg?.info?.providerID ?? lastMsg?.providerID,
      }

      // Spawn all tasks in parallel
      const results = await Promise.allSettled(
        params.tasks.map(async (task) => {
          const agent = await Agent.get(task.agent)
          const model = agent?.model ?? defaultModel

          const session = await Session.create({
            parentID: ctx.sessionID,
            title: task.description + ` (@${task.agent})`,
          })

          const promptParts = await SessionPrompt.resolvePromptParts(task.prompt)

          const result = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: task.agent,
            model: { modelID: model.modelID, providerID: model.providerID },
            parts: promptParts,
          })

          return { description: task.description, agent: task.agent, sessionID: session.id, result }
        }),
      )

      const output = results
        .map((r, i) => {
          const task = params.tasks[i]
          if (r.status === "fulfilled") {
            const text = extractText(r.value.result)
            return `## ${task.description} (${task.agent})\n${text}`
          }
          return `## ${task.description} (${task.agent})\n**Error:** ${String(r.reason)}`
        })
        .join("\n\n---\n\n")

      return {
        output,
        title: `Swarm: ${params.tasks.length} tasks`,
        metadata: {} as Record<string, unknown>,
      }
    },
  }
})

function extractText(msg: any): string {
  if (!msg) return "(no output)"
  if (typeof msg === "string") return msg
  if (msg.parts) {
    return msg.parts
      .filter((p: any) => p.type === "text" && p.text)
      .map((p: any) => p.text)
      .join("\n")
  }
  return JSON.stringify(msg).slice(0, 2000)
}
