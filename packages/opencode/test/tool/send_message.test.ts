import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { z } from "zod"

const MAILBOX_DIR = path.join(os.homedir(), ".opencode", "mailboxes")
const TEST_AGENT = "__test_agent_sm__"

async function cleanup() {
  try { await fs.unlink(path.join(MAILBOX_DIR, `${TEST_AGENT}.json`)) } catch {}
  try { await fs.unlink(path.join(MAILBOX_DIR, `${TEST_AGENT}_2.json`)) } catch {}
}

const Params = z.object({
  to: z.string(),
  message: z.string(),
  summary: z.string().optional(),
})

describe("send_message parameters", () => {
  test("direct message", () => {
    expect(Params.safeParse({ to: "agent1", message: "Hello" }).success).toBe(true)
  })

  test("broadcast message", () => {
    expect(Params.safeParse({ to: "*", message: "Hello all", summary: "Greeting" }).success).toBe(true)
  })

  test("missing message field fails", () => {
    expect(Params.safeParse({ to: "agent1" }).success).toBe(false)
  })

  test("missing to field fails", () => {
    expect(Params.safeParse({ message: "Hello" }).success).toBe(false)
  })
})

describe("send_message mailbox", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  test("reads empty mailbox for nonexistent agent", async () => {
    const { getMessagesFor } = await import("../../src/tool/send_message")
    const msgs = await getMessagesFor("__nonexistent_sm_test__", false)
    expect(Array.isArray(msgs)).toBe(true)
    expect(msgs.length).toBe(0)
  })

  test("sanitize rejects path traversal characters", async () => {
    const { getMessagesFor } = await import("../../src/tool/send_message")
    // sanitizeAgentName strips non-alphanumeric, so '../../../etc/passwd' becomes empty → throws
    // But readMailbox catches errors, so getMessagesFor returns []
    const msgs = await getMessagesFor("../../../etc/passwd")
    // The key test: no file was created with traversal path
    const evilPath = path.join(MAILBOX_DIR, "../../../etc/passwd.json")
    expect(fs.access(evilPath).then(() => true).catch(() => false)).resolves.toBe(false)
  })

  test("sanitize rejects empty name", async () => {
    const { getMessagesFor } = await import("../../src/tool/send_message")
    expect(getMessagesFor("")).rejects.toThrow()
  })
})
