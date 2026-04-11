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
import { ModelID, ProviderID } from "../provider/schema"
import ULTRAPLAN_PROMPT from "../agent/prompt/ultraplan.txt"

type Depth = "standard" | "deep" | "comprehensive"

const depthInstructions: Record<Depth, string> = {
  standard: `
## Depth: Standard
- Focus on providing a high-level overview
- Identify the main components involved
- Outline 3-5 key steps
- Note obvious risks
- Minimal codebase exploration needed — rely on your existing knowledge`,
  deep: `
## Depth: Deep
- Use glob and grep to find ALL relevant files before planning
- Break down into detailed actionable steps
- Identify dependencies and prerequisites by reading import statements
- Assess potential risks and edge cases
- Suggest verification criteria
- Reference specific file paths and line numbers in your plan`,
  comprehensive: `
## Depth: Comprehensive
- Systematically explore the directory structure with glob
- Search for all related code with grep (multiple patterns)
- Read key files to understand the full implementation
- Map out the dependency graph between modules
- Identify existing tests and their coverage
- Consider multiple approaches with trade-offs
- Include rollback strategies
- Define success metrics and acceptance criteria
- Address scalability and maintainability concerns
- Check for existing patterns in the codebase that should be followed`,
}

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
            permission: "codesearch" as const,
            pattern: "*" as const,
            action: "allow" as const,
          },
          {
            permission: "bash" as const,
            pattern: "^(cat|head|tail|ls|find|grep|rg|wc|sort|uniq|diff|git log|git diff|git show|git status|file|which|echo|pwd|stat|tree|du|npm list|bun pm ls)" as const,
            action: "allow" as const,
          },
          {
            permission: "bash" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
          {
            permission: "webfetch" as const,
            pattern: "*" as const,
            action: "allow" as const,
          },
          {
            permission: "websearch" as const,
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

      const model = await selectBestModel(ultraplanAgent)

      ctx.metadata({
        title: `UltraPlan: ${params.task.slice(0, 30)}...`,
        metadata: {
          sessionId: session.id,
          model,
          depth,
        },
      })

      const messageID = MessageID.ascending()

      const prompt = ULTRAPLAN_PROMPT.replace("{depth_instructions}", depthInstructions[depth]).replace(
        "{task}",
        params.task,
      )

      const promptParts = await SessionPrompt.resolvePromptParts(prompt)

      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: ModelID.make(model.modelID),
          providerID: ProviderID.make(model.providerID),
        },
        agent: ultraplanAgent?.name ?? "general",
        parts: promptParts,
      })

      const text = result.parts
        .filter((x) => x.type === "text")
        .map((x) => x.text)
        .join("\n")

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

async function selectBestModel(ultraplanAgent: { model?: { modelID: string; providerID: string } } | undefined) {
  if (ultraplanAgent?.model) return ultraplanAgent.model

  const defaultModel = await Provider.defaultModel()
  const providers = await Provider.list()
  const defaultProvider = providers[defaultModel.providerID]

  if (defaultProvider?.models) {
    const models = Object.values(defaultProvider.models)
    const strongest = models.reduce((best, m) => {
      if (m.status !== "active") return best
      return m.limit.context > (best?.limit.context ?? 0) ? m : best
    }, models[0])

    if (strongest) {
      return { modelID: ModelID.make(strongest.id), providerID: ProviderID.make(defaultModel.providerID) }
    }
  }

  return defaultModel
}
