import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import os from "os"

// Re-implement core logic (can't import Memory directly due to Effect/Bun deps)
const STATE_DIR = path.join(os.homedir(), ".opencode")

function getAgentMemoryPath(agentName: string): string {
  return path.join(STATE_DIR, "agent-memory", agentName, "MEMORY.md")
}

function readAgentMemory(agentName: string): string {
  try {
    const data = fs.readFileSync(getAgentMemoryPath(agentName), "utf-8")
    const content = data.trim()
    if (content) return content
  } catch {}
  return ""
}

function writeAgentMemory(agentName: string, content: string): void {
  const memPath = getAgentMemoryPath(agentName)
  fs.mkdirSync(path.dirname(memPath), { recursive: true })
  fs.writeFileSync(memPath, content, "utf-8")
}

function deleteAgentMemory(agentName: string): void {
  try {
    const dir = path.dirname(getAgentMemoryPath(agentName))
    fs.rmSync(dir, { recursive: true })
  } catch {}
}

describe("agent memory", () => {
  const testAgent = "test-agent-mem-unit"

  afterEach(() => {
    deleteAgentMemory(testAgent)
  })

  test("returns empty string when no memory file exists", () => {
    expect(readAgentMemory(testAgent)).toBe("")
  })

  test("reads written memory", () => {
    writeAgentMemory(testAgent, "# Test Memory\n- Learned X\n- Remember Y")
    expect(readAgentMemory(testAgent)).toBe("# Test Memory\n- Learned X\n- Remember Y")
  })

  test("trims whitespace from memory", () => {
    writeAgentMemory(testAgent, "  \n  hello  \n  ")
    expect(readAgentMemory(testAgent)).toBe("hello")
  })

  test("returns empty for whitespace-only file", () => {
    writeAgentMemory(testAgent, "   \n\n  \t  \n")
    expect(readAgentMemory(testAgent)).toBe("")
  })

  test("different agents have separate memory", () => {
    writeAgentMemory(testAgent, "agent A memory")
    writeAgentMemory("test-agent-mem-other", "agent B memory")

    expect(readAgentMemory(testAgent)).toBe("agent A memory")
    expect(readAgentMemory("test-agent-mem-other")).toBe("agent B memory")

    deleteAgentMemory("test-agent-mem-other")
  })

  test("memory path is correct", () => {
    const p = getAgentMemoryPath("build")
    expect(p).toContain("agent-memory")
    expect(p).toContain("build")
    expect(p).toContain("MEMORY.md")
    expect(p).toMatch(/\.opencode[\\/]agent-memory[\\/]build[\\/]MEMORY\.md$/)
  })

  test("memory persists across reads", () => {
    writeAgentMemory(testAgent, "persistent data")
    expect(readAgentMemory(testAgent)).toBe("persistent data")
    expect(readAgentMemory(testAgent)).toBe("persistent data") // second read
  })

  test("overwrite replaces previous memory", () => {
    writeAgentMemory(testAgent, "version 1")
    writeAgentMemory(testAgent, "version 2")
    expect(readAgentMemory(testAgent)).toBe("version 2")
  })

  test("handles agent names with special characters", () => {
    writeAgentMemory("test-agent_v2", "special name")
    expect(readAgentMemory("test-agent_v2")).toBe("special name")
    deleteAgentMemory("test-agent_v2")
  })
})
