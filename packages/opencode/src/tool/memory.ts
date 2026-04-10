import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./memory.txt"
import path from "path"
import os from "os"
import { Log } from "../util/log"

const log = Log.create({ service: "tool.memory" })

const MEMORY_ROOT = () => path.join(os.homedir(), ".opencode", "memory")

const ALLOWED_EXTENSIONS = [".md", ".txt", ".json"]

function validateRelativePath(p: string): string {
  // Prevent directory traversal
  const normalized = path.normalize(p).replace(/\\/g, "/")
  if (normalized.startsWith("..") || path.isAbsolute(p)) {
    throw new Error(`Invalid path: "${p}" — must be relative and cannot use ".."`)
  }
  // Validate extension for file operations
  const ext = path.extname(normalized).toLowerCase()
  if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Invalid extension "${ext}" — allowed: ${ALLOWED_EXTENSIONS.join(", ")}`)
  }
  return normalized
}

function fullPath(p: string): string {
  return path.join(MEMORY_ROOT(), p)
}

async function ensureDir(filePath: string): Promise<void> {
  const fs = await import("fs/promises")
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function readDirSafe(dirPath: string): Promise<string[]> {
  const fs = await import("fs/promises")
  const items: string[] = []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue
      items.push(entry.isDirectory() ? `${entry.name}/` : entry.name)
    }
  } catch {}
  return items
}

const Parameters = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("view").describe("View memory contents"),
    path: z.string().optional().describe("Memory file path (e.g. decisions/2026-04-10.md). If omitted, list memory root directory."),
    view_range: z.tuple([z.number(), z.number()]).optional().describe("Line range [start, end]. end=-1 means to end of file."),
  }),
  z.object({
    command: z.literal("write").describe("Write or overwrite a memory file"),
    path: z.string().describe("Memory file path (e.g. decisions/2026-04-10.md)"),
    content: z.string().describe("Content to write"),
  }),
  z.object({
    command: z.literal("append").describe("Append content to an existing memory file"),
    path: z.string().describe("Memory file path"),
    content: z.string().describe("Content to append"),
  }),
  z.object({
    command: z.literal("delete").describe("Delete a memory file or directory"),
    path: z.string().describe("Memory file or directory path to delete"),
  }),
  z.object({
    command: z.literal("list").describe("List all memory categories and files"),
  }),
])

export const MemoryTool = Tool.define("memory", async () => {
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    async execute(params, _ctx) {
      const fs = await import("fs/promises")

      try {
        switch (params.command) {
          case "list": {
            const root = MEMORY_ROOT()
            await fs.mkdir(root, { recursive: true })
            const categories = await readDirSafe(root)
            if (categories.length === 0) {
              return { output: "Memory is empty. Use `write` to create memories.", title: "Memory: empty", metadata: {} }
            }
            const lines = ["# Memory Categories", ""]
            for (const cat of categories) {
              lines.push(`## ${cat}`)
              const catPath = path.join(root, cat.replace("/", ""))
              const files = await readDirSafe(catPath)
              if (files.length === 0) {
                lines.push("  (empty)")
              } else {
                for (const f of files) {
                  lines.push(`  - ${f}`)
                }
              }
              lines.push("")
            }
            return { output: lines.join("\n"), title: "Memory: list", metadata: {} }
          }

          case "view": {
            if (!params.path) {
              const root = MEMORY_ROOT()
              await fs.mkdir(root, { recursive: true })
              const items = await readDirSafe(root)
              if (items.length === 0) {
                return { output: "Memory is empty.", title: "Memory: view root", metadata: {} }
              }
              return { output: "# Memory Root\n\n" + items.map((i) => `- ${i}`).join("\n"), title: "Memory: view root", metadata: {} }
            }

            const relPath = validateRelativePath(params.path)
            const fp = fullPath(relPath)
            const stat = await fs.stat(fp).catch(() => null)

            if (!stat) {
              return { output: `Memory not found: ${params.path}`, title: "Memory: not found", metadata: {} }
            }

            if (stat.isDirectory()) {
              const items = await readDirSafe(fp)
              return {
                output: `# ${params.path}\n\n` + (items.length === 0 ? "(empty)" : items.map((i) => `- ${i}`).join("\n")),
                title: `Memory: ${params.path}`,
                metadata: {},
              }
            }

            const content = await fs.readFile(fp, "utf-8")
            let lines = content.split("\n")
            if (params.view_range) {
              const [start, end] = params.view_range
              const s = Math.max(0, start - 1)
              const e = end === -1 ? lines.length : end
              lines = lines.slice(s, e)
              lines = lines.map((l, i) => `${s + i + 1}: ${l}`)
            } else {
              lines = lines.map((l, i) => `${i + 1}: ${l}`)
            }

            return { output: lines.join("\n"), title: `Memory: ${params.path}`, metadata: {} }
          }

          case "write": {
            const relPath = validateRelativePath(params.path)
            const fp = fullPath(relPath)
            if (!path.extname(relPath)) {
              return { output: "Error: file must have an extension (.md, .txt, .json)", title: "Memory: error", metadata: {} }
            }
            await ensureDir(fp)
            await fs.writeFile(fp, params.content, "utf-8")
            log.info("memory written", { path: relPath })
            return { output: `Memory written: ${params.path}`, title: `Memory: wrote ${params.path}`, metadata: {} }
          }

          case "append": {
            const relPath = validateRelativePath(params.path)
            const fp = fullPath(relPath)
            const exists = await fs.stat(fp).catch(() => null)
            if (!exists) {
              return { output: `Memory not found: ${params.path}. Use 'write' to create it first.`, title: "Memory: not found", metadata: {} }
            }
            const separator = (await fs.readFile(fp, "utf-8")).endsWith("\n") ? "" : "\n"
            await fs.appendFile(fp, separator + params.content + "\n", "utf-8")
            log.info("memory appended", { path: relPath })
            return { output: `Memory appended: ${params.path}`, title: `Memory: appended ${params.path}`, metadata: {} }
          }

          case "delete": {
            if (!params.path || params.path === "/" || params.path === ".") {
              return { output: "Error: cannot delete memory root", title: "Memory: error", metadata: {} }
            }
            const relPath = validateRelativePath(params.path)
            const fp = fullPath(relPath)
            const exists = await fs.stat(fp).catch(() => null)
            if (!exists) {
              return { output: `Memory not found: ${params.path}`, title: "Memory: not found", metadata: {} }
            }
            await fs.rm(fp, { recursive: true })
            log.info("memory deleted", { path: relPath })
            return { output: `Memory deleted: ${params.path}`, title: `Memory: deleted ${params.path}`, metadata: {} }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log.info("memory tool error", { command: params.command, error: msg })
        return { output: `Memory error: ${msg}`, title: "Memory: error", metadata: {} }
      }
    },
  }
})
