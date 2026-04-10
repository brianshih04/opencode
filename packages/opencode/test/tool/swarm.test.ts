import { describe, test, expect } from "bun:test"
import { z } from "zod"

// Re-create the parameter schemas for testing (same as in swarm.ts)
const LeaderParams = z.object({
  mode: z.literal("leader"),
  goal: z.string(),
  max_tasks: z.number().min(1).max(20).optional(),
  agent: z.string().optional(),
  strategy: z.enum(["depth-first", "breadth-first", "auto"]).optional(),
})

const ParallelParams = z.object({
  mode: z.literal("parallel"),
  tasks: z
    .array(z.object({
      description: z.string(),
      prompt: z.string(),
      agent: z.string(),
    }))
    .min(2)
    .max(20),
})

const ChainParams = z.object({
  mode: z.literal("chain"),
  tasks: z
    .array(z.object({
      description: z.string(),
      prompt: z.string(),
      agent: z.string().optional(),
    }))
    .min(2)
    .max(10),
})

describe("swarm parameters", () => {
  test("leader mode with goal only", () => {
    expect(LeaderParams.safeParse({ mode: "leader", goal: "Analyze code" }).success).toBe(true)
  })

  test("leader mode with strategy override", () => {
    expect(LeaderParams.safeParse({ mode: "leader", goal: "Deep analysis", strategy: "depth-first" }).success).toBe(true)
  })

  test("leader mode rejects max_tasks > 20", () => {
    expect(LeaderParams.safeParse({ mode: "leader", goal: "test", max_tasks: 25 }).success).toBe(false)
  })

  test("parallel mode requires min 2 tasks", () => {
    expect(ParallelParams.safeParse({
      mode: "parallel",
      tasks: [{ description: "A", prompt: "Do A", agent: "general" }],
    }).success).toBe(false)
  })

  test("parallel mode accepts 2-20 tasks", () => {
    expect(ParallelParams.safeParse({
      mode: "parallel",
      tasks: [
        { description: "A", prompt: "Do A", agent: "general" },
        { description: "B", prompt: "Do B", agent: "general" },
      ],
    }).success).toBe(true)
  })

  test("chain mode requires min 2 tasks", () => {
    expect(ChainParams.safeParse({
      mode: "chain",
      tasks: [{ description: "A", prompt: "Do A" }],
    }).success).toBe(false)
  })

  test("chain mode accepts 2-10 tasks", () => {
    expect(ChainParams.safeParse({
      mode: "chain",
      tasks: [
        { description: "A", prompt: "Find APIs", agent: "general" },
        { description: "B", prompt: "Analyze $PREV" },
      ],
    }).success).toBe(true)
  })

  test("chain mode max 10 tasks", () => {
    const tasks = Array.from({ length: 11 }, (_, i) => ({
      description: `Step ${i}`, prompt: `Do ${i}`,
    }))
    expect(ChainParams.safeParse({ mode: "chain", tasks }).success).toBe(false)
  })
})
