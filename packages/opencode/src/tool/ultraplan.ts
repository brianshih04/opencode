import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./ultraplan.txt"
import { Session } from "../session"
import { MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "@/agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { Permission } from "@/permission"
import { Provider } from "../provider/provider"

type Depth = "standard" | "deep" | "comprehensive"

export const UltraPlanTool = Tool.define("ultraplan", async () => {
  return {
    description: DESCRIPTION,
    parameters: z.object({
      task: z.string().describe("The complex task to plan in depth"),
      depth: z
        .enum(["standard", "deep", "comprehensive"])
        .optional()
        .default("deep")
        .describe("Planning depth: standard (quick overview), deep (detailed analysis), comprehensive (exhaustive research)"),
    }),
    async execute(params, ctx) {
      const depth = params.depth ?? "deep"

      await ctx.ask({
        permission: "task",
        patterns: ["*"],
        always: ["*"],
        metadata: {
          description: `UltraPlan: ${params.task.slice(0, 50)}...`,
          type: "ultraplan",
        },
      })

      const agents = await Agent.list()
      const ultraplanAgent = agents.find((a) => a.name === "ultraplan")

      const session = await Session.create({
        parentID: ctx.sessionID,
        title: `UltraPlan: ${params.task.slice(0, 50)}...`,
        permission: [
          {
            permission: "read" as const,
            pattern: "*" as const,
            action: "allow" as const,
          },
          {
            permission: "glob" as const,
            pattern: "*" as const,
            action: "allow" as const,
          },
          {
            permission: "grep" as const,
            pattern: "*" as const,
            action: "allow" as const,
          },
          {
            permission: "bash" as const,
            pattern: "*" as const,
            action: "allow" as const,
          },
          {
            permission: "edit" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
          {
            permission: "write" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
          {
            permission: "task" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
          {
            permission: "todowrite" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
        ],
      })

      const msg = MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") throw new Error("Not an assistant message")

      const model = await iife(async () => {
        if (ultraplanAgent?.model) return ultraplanAgent.model

        const defaultModel = await Provider.defaultModel()
        const providers = await Provider.list()
        const defaultProvider = providers[defaultModel.providerID]

        if (defaultProvider?.models) {
          const strongModel = Object.values(defaultProvider.models).find(
            (m) =>
              m.id.toLowerCase().includes("opus") ||
              m.id.toLowerCase().includes("sonnet") ||
              m.id.toLowerCase().includes("claude-3-5"),
          )
          if (strongModel) {
            return { modelID: strongModel.id, providerID: defaultModel.providerID }
          }
        }

        return defaultModel
      })

      ctx.metadata({
        title: `UltraPlan: ${params.task.slice(0, 30)}...`,
        metadata: {
          sessionId: session.id,
          model,
          depth,
        },
      })

      const messageID = MessageID.ascending()

      const promptParts = await SessionPrompt.resolvePromptParts(
        buildUltraPlanPrompt(params.task, depth),
      )

      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: ultraplanAgent?.name ?? "general",
        tools: {
          read: true,
          glob: true,
          grep: true,
          bash: true,
          edit: false,
          write: false,
          task: false,
          todowrite: false,
        },
        parts: promptParts,
      })

      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = [
        `<ultraplan>`,
        text,
        `</ultraplan>`,
        "",
        `UltraPlan session completed. Review the plan above and decide whether to proceed with execution.`,
      ].join("\n")

      return {
        title: "UltraPlan Complete",
        metadata: {
          sessionId: session.id,
          model,
          depth,
        },
        output,
      }
    },
  }
})

function buildUltraPlanPrompt(task: string, depth: Depth): string {
  const depthInstructions = {
    standard: `
- Provide a high-level overview
- Identify main components
- Outline 3-5 key steps
- Note obvious risks
`,
    deep: `
- Thoroughly analyze the requirements
- Break down into detailed actionable steps
- Identify dependencies and prerequisites
- Assess potential risks and edge cases
- Suggest verification criteria
- Estimate complexity and time
`,
    comprehensive: `
- Exhaustively research the problem space
- Consider multiple approaches and trade-offs
- Identify all potential risks including edge cases
- Create a detailed implementation roadmap
- Include rollback strategies
- Define success metrics and acceptance criteria
- Consider testing strategy
- Address scalability concerns
`,
  }

  return `You are performing deep planning for the following task:

${task}

## Your Mission
Create a comprehensive, actionable plan that can be handed off for execution.

## Planning Depth
${depthInstructions[depth]}

## Output Format
Structure your response as follows:

### 📋 Executive Summary
Brief overview of what needs to be done and why.

### 🎯 Key Objectives
The main goals this plan aims to achieve.

### 📝 Detailed Steps
Numbered list of specific actions to take. Be concrete and actionable.

### 🔗 Dependencies
What needs to be in place before starting (files, packages, permissions, etc.)

### ⚠️ Risks & Mitigations
Potential issues and how to address them.

### ✅ Verification
How to confirm the plan was executed successfully.

### 📊 Effort Estimate
Rough time/complexity estimate.

---

Take your time and think deeply. This plan will be reviewed before any execution begins.`
}
