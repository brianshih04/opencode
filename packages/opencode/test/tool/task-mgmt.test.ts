import { describe, test, expect } from "bun:test"
import { z } from "zod"

// Re-create parameter schema matching task-mgmt.ts
const Params = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), subject: z.string(), description: z.string().optional() }),
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("update"), id: z.string(), status: z.enum(["todo", "in-progress", "done", "blocked"]).optional() }),
  z.object({ action: z.literal("delete"), id: z.string() }),
])

describe("task-mgmt parameters", () => {
  test("create action", () => {
    expect(Params.safeParse({ action: "create", subject: "Fix login bug" }).success).toBe(true)
  })

  test("list action", () => {
    expect(Params.safeParse({ action: "list" }).success).toBe(true)
  })

  test("update action with status", () => {
    expect(Params.safeParse({ action: "update", id: "1", status: "in-progress" }).success).toBe(true)
  })

  test("delete action", () => {
    expect(Params.safeParse({ action: "delete", id: "1" }).success).toBe(true)
  })

  test("rejects invalid action", () => {
    expect(Params.safeParse({ action: "destroy" }).success).toBe(false)
  })

  test("rejects invalid status", () => {
    expect(Params.safeParse({ action: "update", id: "1", status: "destroyed" }).success).toBe(false)
  })
})
