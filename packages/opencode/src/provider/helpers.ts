import { Env } from "../env"
import { type LanguageModelV3 } from "@ai-sdk/provider"

// Direct imports for bundled providers
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAzure } from "@ai-sdk/azure"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createXai } from "@ai-sdk/xai"
import { createMistral } from "@ai-sdk/mistral"
import { createGroq } from "@ai-sdk/groq"
import { createDeepInfra } from "@ai-sdk/deepinfra"
import { createCerebras } from "@ai-sdk/cerebras"
import { createCohere } from "@ai-sdk/cohere"
import { createGateway } from "@ai-sdk/gateway"
import { createTogetherAI } from "@ai-sdk/togetherai"
import { createPerplexity } from "@ai-sdk/perplexity"
import { createVercel } from "@ai-sdk/vercel"
import { createVenice } from "venice-ai-sdk-provider"
import {
  createGitLab,
} from "gitlab-ai-provider"
import { createOpenaiCompatible as createGitHubCopilotOpenAICompatible } from "./sdk/copilot"

export type BundledSDK = {
  languageModel(modelId: string): LanguageModelV3
}

export function shouldUseCopilotResponsesApi(modelID: string): boolean {
  const match = /^gpt-(\d+)/.exec(modelID)
  if (!match) return false
  return Number(match[1]) >= 5 && !modelID.startsWith("gpt-5-mini")
}

export function wrapSSE(res: Response, ms: number, ctl: AbortController) {
  if (typeof ms !== "number" || ms <= 0) return res
  if (!res.body) return res
  if (!res.headers.get("content-type")?.includes("text/event-stream")) return res

  const reader = res.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const part = await new Promise<Awaited<ReturnType<typeof reader.read>>>((resolve, reject) => {
        const id = setTimeout(() => {
          const err = new Error("SSE read timed out")
          ctl.abort(err)
          reject(err)
        }, ms)
        reader.read().then(
          (result) => {
            clearTimeout(id)
            resolve(result)
          },
          (err) => {
            clearTimeout(id)
            reject(err)
          },
        )
      })
      if (part.done) {
        ctrl.close()
        reader.releaseLock()
        return
      }
      ctrl.enqueue(part.value)
    },
    async cancel(reason) {
      reader.cancel(reason)
      reader.releaseLock()
    },
  })
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  })
}

export function e2eURL() {
  const url = Env.get("OPENCODE_E2E_LLM_URL")
  if (typeof url !== "string" || url === "") return
  return url
}

export const BUNDLED_PROVIDERS: Record<string, (options: any) => BundledSDK> = {
  "@ai-sdk/amazon-bedrock": createAmazonBedrock,
  "@ai-sdk/anthropic": createAnthropic,
  "@ai-sdk/azure": createAzure,
  "@ai-sdk/google": createGoogleGenerativeAI,
  "@ai-sdk/google-vertex": createVertex,
  "@ai-sdk/google-vertex/anthropic": createVertexAnthropic,
  "@ai-sdk/openai": createOpenAI,
  "@ai-sdk/openai-compatible": createOpenAICompatible,
  "@openrouter/ai-sdk-provider": createOpenRouter,
  "@ai-sdk/xai": createXai,
  "@ai-sdk/mistral": createMistral,
  "@ai-sdk/groq": createGroq,
  "@ai-sdk/deepinfra": createDeepInfra,
  "@ai-sdk/cerebras": createCerebras,
  "@ai-sdk/cohere": createCohere,
  "@ai-sdk/gateway": createGateway,
  "@ai-sdk/togetherai": createTogetherAI,
  "@ai-sdk/perplexity": createPerplexity,
  "@ai-sdk/vercel": createVercel,
  "venice-ai-sdk-provider": createVenice,
  "gitlab-ai-provider": createGitLab,
  "./sdk/copilot": createGitHubCopilotOpenAICompatible,
}

export function useLanguageModel(sdk: any) {
  return sdk.responses === undefined && sdk.chat === undefined
}
