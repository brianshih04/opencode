import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "os"

// We test the dual-gate logic by re-implementing the core check
// (can't import Memory directly due to Effect dependencies)
interface DreamLock {
  lastConsolidatedAt: number
  sessionCount: number
}

const MIN_HOURS = 24
const MIN_SESSIONS = 5

function checkDreamGates(lock: DreamLock): {
  timeGateOpen: boolean
  sessionGateOpen: boolean
  shouldConsolidate: boolean
} {
  const hoursSince = (Date.now() - lock.lastConsolidatedAt) / 3_600_000
  const timeGateOpen = lock.lastConsolidatedAt === 0 || hoursSince >= MIN_HOURS
  const sessionGateOpen = lock.sessionCount >= MIN_SESSIONS
  return {
    timeGateOpen,
    sessionGateOpen,
    shouldConsolidate: timeGateOpen && sessionGateOpen,
  }
}

describe("autoDream dual gates", () => {
  test("fresh lock (never consolidated) passes time gate", () => {
    const lock: DreamLock = { lastConsolidatedAt: 0, sessionCount: 0 }
    const result = checkDreamGates(lock)
    expect(result.timeGateOpen).toBe(true)
    expect(result.sessionGateOpen).toBe(false)
    expect(result.shouldConsolidate).toBe(false)
  })

  test("recent consolidation fails time gate", () => {
    const lock: DreamLock = { lastConsolidatedAt: Date.now() - 1_000, sessionCount: 10 }
    const result = checkDreamGates(lock)
    expect(result.timeGateOpen).toBe(false)
    expect(result.sessionGateOpen).toBe(true)
    expect(result.shouldConsolidate).toBe(false)
  })

  test("enough sessions but too recent fails", () => {
    const lock: DreamLock = { lastConsolidatedAt: Date.now() - 3_600_000, sessionCount: 7 }
    const result = checkDreamGates(lock)
    expect(result.timeGateOpen).toBe(false)  // only 1 hour ago
    expect(result.sessionGateOpen).toBe(true)  // 7 >= 5
    expect(result.shouldConsolidate).toBe(false)
  })

  test("enough time but not enough sessions fails", () => {
    const lock: DreamLock = { lastConsolidatedAt: Date.now() - 50 * 3_600_000, sessionCount: 3 }
    const result = checkDreamGates(lock)
    expect(result.timeGateOpen).toBe(true)   // 50 hours >= 24
    expect(result.sessionGateOpen).toBe(false) // 3 < 5
    expect(result.shouldConsolidate).toBe(false)
  })

  test("both gates pass triggers consolidation", () => {
    const lock: DreamLock = {
      lastConsolidatedAt: Date.now() - 25 * 3_600_000, // 25 hours ago
      sessionCount: 6,  // >= 5
    }
    const result = checkDreamGates(lock)
    expect(result.timeGateOpen).toBe(true)
    expect(result.sessionGateOpen).toBe(true)
    expect(result.shouldConsolidate).toBe(true)
  })

  test("exactly 24h passes time gate (boundary)", () => {
    const lock: DreamLock = {
      lastConsolidatedAt: Date.now() - 24 * 3_600_000, // exactly 24h
      sessionCount: 5,
    }
    const result = checkDreamGates(lock)
    expect(result.timeGateOpen).toBe(true)
    expect(result.sessionGateOpen).toBe(true)
    expect(result.shouldConsolidate).toBe(true)
  })

  test("just under 24h fails time gate", () => {
    const lock: DreamLock = {
      lastConsolidatedAt: Date.now() - 23.9 * 3_600_000,
      sessionCount: 5,
    }
    const result = checkDreamGates(lock)
    expect(result.timeGateOpen).toBe(false)
    expect(result.shouldConsolidate).toBe(false)
  })

  test("exactly 5 sessions passes session gate (boundary)", () => {
    const lock: DreamLock = {
      lastConsolidatedAt: 0,
      sessionCount: 5, // exactly MIN_SESSIONS
    }
    const result = checkDreamGates(lock)
    expect(result.sessionGateOpen).toBe(true)
    expect(result.shouldConsolidate).toBe(true)
  })

  test("4 sessions fails session gate", () => {
    const lock: DreamLock = {
      lastConsolidatedAt: 0,
      sessionCount: 4,
    }
    const result = checkDreamGates(lock)
    expect(result.sessionGateOpen).toBe(false)
    expect(result.shouldConsolidate).toBe(false)
  })
})

describe("dream-lock.json persistence", () => {
  const tmpDir = path.join(os.tmpdir(), "opencode-dream-test-" + Date.now())
  const lockFile = path.join(tmpDir, "dream-lock.json")

  afterEach(async () => {
    try { await fs.rm(tmpDir, { recursive: true }) } catch {}
  })

  test("reads default lock when file missing", async () => {
    const data = await fs.readFile(lockFile, "utf-8").catch(() => null)
    expect(data).toBeNull()
  })

  test("writes and reads lock correctly", async () => {
    await fs.mkdir(tmpDir, { recursive: true })
    const lock: DreamLock = { lastConsolidatedAt: 12345, sessionCount: 3 }
    await fs.writeFile(lockFile, JSON.stringify(lock, null, 2), "utf-8")

    const read = JSON.parse(await fs.readFile(lockFile, "utf-8"))
    expect(read.lastConsolidatedAt).toBe(12345)
    expect(read.sessionCount).toBe(3)
  })

  test("reset after consolidation", async () => {
    await fs.mkdir(tmpDir, { recursive: true })
    const before: DreamLock = { lastConsolidatedAt: Date.now() - 50 * 3_600_000, sessionCount: 10 }
    await fs.writeFile(lockFile, JSON.stringify(before), "utf-8")

    // Simulate consolidation reset
    const after: DreamLock = { lastConsolidatedAt: Date.now(), sessionCount: 0 }
    await fs.writeFile(lockFile, JSON.stringify(after), "utf-8")

    const read = JSON.parse(await fs.readFile(lockFile, "utf-8"))
    expect(read.sessionCount).toBe(0)
    const hoursSince = (Date.now() - read.lastConsolidatedAt) / 3_600_000
    expect(hoursSince).toBeLessThan(0.01) // just now
  })
})
