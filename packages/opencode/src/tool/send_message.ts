import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./send_message.txt"
import { Bus } from "../bus"

export const SendMessageTool = Tool.define("send_message", async () => {
  return {
    description: DESCRIPTION,
    parameters: z.object({
      to: z.string().describe("Target agent name or '*' for broadcast"),
      message: z.string().describe("Message to send"),
    }),
    async execute(params, _ctx) {
      // For now, store messages in a simple in-memory map
      // In a full implementation, this would use the bus system
      if (!globalThis.__swarmMessages) {
        globalThis.__swarmMessages = new Map()
      }

      const messages = globalThis.__swarmMessages as Map<string, Array<{ from: string; message: string; time: number }>>
      const key = params.to === "*" ? "__broadcast" : params.to

      if (!messages.has(key)) {
        messages.set(key, [])
      }

      messages.get(key)!.push({
        from: _ctx.agent,
        message: params.message,
        time: Date.now(),
      })

      return {
        output: `Message sent to ${params.to}`,
        title: `Message → ${params.to}`,
        metadata: { to: params.to, broadcast: params.to === "*" },
      }
    },
  }
})

// Extend globalThis for message store
declare global {
  var __swarmMessages: Map<string, Array<{ from: string; message: string; time: number }>>
}
