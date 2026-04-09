import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./memory_search.txt"

const Parameters = z.object({
  query: z.string().describe("Search query for long-term memory"),
  wing: z.string().optional().describe("Filter by wing (project/person)"),
  room: z.string().optional().describe("Filter by room (topic)"),
  n_results: z.number().optional().describe("Number of results (default: 5)"),
})

export const MemorySearchTool = Tool.define("memory_search", async () => {
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    async execute(params, _ctx) {
      const args = ["-m", "mempalace", "search", params.query]
      if (params.wing) args.push("--wing", params.wing)
      if (params.room) args.push("--room", params.room)
      if (params.n_results) args.push("--n-results", String(params.n_results))

      try {
        const proc = Bun.spawnSync(["python", ...args], {
          stdout: "pipe",
          stderr: "pipe",
          timeout: 15_000,
        })

        if (proc.exitCode !== 0) {
          const err = proc.stderr.toString().trim()
          return {
            output: err || "Memory search failed. MemPalace may not be initialized.",
            title: `Memory search failed: ${params.query}`,
            metadata: {},
          }
        }

        const output = proc.stdout.toString().trim()
        return {
          output: output || "No memories found.",
          title: `Memory: ${params.query}`,
          metadata: {},
        }
      } catch (error) {
        return {
          output: `Memory search error: ${error instanceof Error ? error.message : String(error)}`,
          title: `Memory search error`,
          metadata: {},
        }
      }
    },
  }
})
