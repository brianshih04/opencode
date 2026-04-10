import { Tool } from "./tool"
import path from "path"
import fs from "fs"
import z from "zod"

const DESCRIPTION = fs.readFileSync(path.join(__dirname, "tool_search.txt"), "utf8")

// Static tool catalog
const CATALOG = [
  { name: "bash", description: "Execute shell commands" },
  { name: "read", description: "Read file contents" },
  { name: "write", description: "Write content to a file" },
  { name: "edit", description: "Edit files with search/replace" },
  { name: "multiedit", description: "Edit multiple files at once" },
  { name: "glob", description: "Find files by pattern" },
  { name: "grep", description: "Search file contents with regex" },
  { name: "ls", description: "List directory contents" },
  { name: "webfetch", description: "Fetch and extract content from URLs" },
  { name: "websearch", description: "Search the web" },
  { name: "codesearch", description: "Search code with semantic understanding" },
  { name: "lsp", description: "Language Server Protocol operations" },
  { name: "skill", description: "Load and execute skills" },
  { name: "todo", description: "Manage todo list" },
  { name: "task", description: "Background task management" },
  { name: "question", description: "Ask user a question" },
  { name: "plan", description: "Plan mode operations" },
  { name: "apply_patch", description: "Apply unified diff patches" },
  { name: "truncate", description: "Truncate output" },
  { name: "memory_search", description: "Search long-term memory (MemPalace)" },
  { name: "swarm", description: "Run parallel agent tasks (leader or parallel mode)" },
  { name: "send_message", description: "Send messages between agents via mailbox system" },
  { name: "browser", description: "Browser automation via OpenCLI daemon (navigate, click, type, screenshot, etc.)" },
  { name: "task_mgmt", description: "Task management with create/update/list/get and dependencies" },
  { name: "tool_search", description: "Search and discover available tools by keyword or name" },
  { name: "cron", description: "Schedule recurring or one-shot tasks with cron expressions (create/list/delete)" },
  { name: "ultraplan", description: "Deep planning with risk assessment and verification criteria" },
]

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function searchTools(query: string, maxResults: number) {
  const queryLower = query.toLowerCase().trim()

  // select: prefix
  const selectMatch = queryLower.match(/^select:(.+)$/)
  if (selectMatch) {
    const names = selectMatch[1]!.split(",").map((s: string) => s.trim()).filter(Boolean)
    return names
      .map((name: string) => CATALOG.find(t => t.name.toLowerCase() === name))
      .filter((t): t is typeof CATALOG[number] => t !== undefined)
      .slice(0, maxResults)
  }

  // Exact name match
  const exact = CATALOG.find(t => t.name.toLowerCase() === queryLower)
  if (exact) return [exact]

  // Keyword search
  const terms = queryLower.split(/\s+/).filter((t: string) => t.length > 0)
  if (terms.length === 0) return []

  return CATALOG.map(tool => {
    const nameLower = tool.name.toLowerCase()
    const descLower = tool.description.toLowerCase()
    let score = 0
    for (const term of terms) {
      const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`)
      if (nameLower.includes(term)) score += 10
      else if (nameLower.split("_").some((p: string) => p.includes(term))) score += 5
      if (pattern.test(descLower)) score += 3
      else if (descLower.includes(term)) score += 1
    }
    return { tool, score }
  })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.tool)
}

const Parameters = z.object({
  query: z.string().describe(
    'Query to find tools. Use "select:name1,name2" for direct selection, or keywords to search.',
  ),
  max_results: z.number().optional().default(5).describe("Maximum number of results (default: 5)"),
})

type Result = { query: string; matchCount: number; matches?: string[] }

export const ToolSearchTool = Tool.define("tool_search", async (): Promise<Tool.DefWithoutID<typeof Parameters, Result>> => ({
  description: DESCRIPTION,
  parameters: Parameters,
  async execute(args) {
    const results = searchTools(args.query, args.max_results ?? 5)

    if (results.length === 0) {
      return {
        title: "No tools found",
        metadata: { query: args.query, matchCount: 0 },
        output: `No tools matching "${args.query}" found.\n\nAvailable tools: ${CATALOG.map(t => t.name).join(", ")}`,
      }
    }

    const output = results.map((t) => `**${t.name}**\n${t.description}`).join("\n\n")

    return {
      title: `Found ${results.length} tool(s)`,
      metadata: { query: args.query, matchCount: results.length, matches: results.map((t) => t.name) },
      output,
    }
  },
}))
