import { describe, expect, test } from "bun:test"
import { CronScheduler } from "../../src/tool/cron"

const { parseCron, matchesCron } = CronScheduler

describe("cron parser", () => {
  test("rejects non-5-field expressions", () => {
    expect(parseCron("* * *")).toBeNull()
    expect(parseCron("* * * * * *")).toBeNull()
    expect(parseCron("")).toBeNull()
    expect(parseCron("hello world foo bar baz")).toBeNull()
  })

  test("parses wildcard *", () => {
    const result = parseCron("* * * * *")
    expect(result).not.toBeNull()
    expect(result![0]).toEqual(Array.from({ length: 60 }, (_, i) => i)) // 0-59
    expect(result![1]).toEqual(Array.from({ length: 24 }, (_, i) => i)) // 0-23
    expect(result![4]).toEqual([0, 1, 2, 3, 4, 5, 6]) // 0-6
  })

  test("parses single values", () => {
    const result = parseCron("30 9 1 6 1")
    expect(result).not.toBeNull()
    expect(result![0]).toEqual([30])
    expect(result![1]).toEqual([9])
    expect(result![2]).toEqual([1])
    expect(result![3]).toEqual([6])
    expect(result![4]).toEqual([1])
  })

  test("parses ranges", () => {
    const result = parseCron("1-5 * * * *")
    expect(result).not.toBeNull()
    expect(result![0]).toEqual([1, 2, 3, 4, 5])
  })

  test("parses day-of-week range (weekdays)", () => {
    const result = parseCron("* * * * 1-5")
    expect(result).not.toBeNull()
    expect(result![4]).toEqual([1, 2, 3, 4, 5])
  })

  test("parses step values */5", () => {
    const result = parseCron("*/5 * * * *")
    expect(result).not.toBeNull()
    expect(result![0]).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
  })

  test("parses step values with range 0-30/10", () => {
    const result = parseCron("0-30/10 * * * *")
    expect(result).not.toBeNull()
    expect(result![0]).toEqual([0, 10, 20, 30])
  })

  test("parses comma-separated values", () => {
    const result = parseCron("0,15,30,45 * * * *")
    expect(result).not.toBeNull()
    expect(result![0]).toEqual([0, 15, 30, 45])
  })

  test("rejects out-of-range values", () => {
    expect(parseCron("60 * * * *")).toBeNull()  // minute max 59
    expect(parseCron("* 24 * * *")).toBeNull()  // hour max 23
    expect(parseCron("* * 32 * *")).toBeNull()  // dom max 31
    expect(parseCron("* * * 13 *")).toBeNull()  // month max 12
    expect(parseCron("* * * * 7")).toBeNull()   // dow max 6
  })
})

describe("cron matches", () => {
  test("every minute matches any time", () => {
    const parsed = parseCron("* * * * *")
    expect(matchesCron(parsed!, new Date(2026, 0, 1, 0, 0))).toBe(true)
    expect(matchesCron(parsed!, new Date(2026, 5, 15, 12, 30))).toBe(true)
  })

  test("specific time matches exactly", () => {
    const parsed = parseCron("30 14 * * *")
    expect(matchesCron(parsed!, new Date(2026, 0, 1, 14, 30))).toBe(true)
    expect(matchesCron(parsed!, new Date(2026, 0, 1, 14, 31))).toBe(false)
    expect(matchesCron(parsed!, new Date(2026, 0, 1, 15, 30))).toBe(false)
  })

  test("weekdays only", () => {
    const parsed = parseCron("0 9 * * 1-5")
    // 2026-04-06 is Monday
    expect(matchesCron(parsed!, new Date(2026, 3, 6, 9, 0))).toBe(true)
    // 2026-04-05 is Sunday
    expect(matchesCron(parsed!, new Date(2026, 3, 5, 9, 0))).toBe(false)
  })

  test("every 5 minutes", () => {
    const parsed = parseCron("*/5 * * * *")
    expect(matchesCron(parsed!, new Date(2026, 0, 1, 0, 0))).toBe(true)
    expect(matchesCron(parsed!, new Date(2026, 0, 1, 0, 5))).toBe(true)
    expect(matchesCron(parsed!, new Date(2026, 0, 1, 0, 3))).toBe(false)
  })

  test("specific date", () => {
    const parsed = parseCron("0 0 1 1 *")  // Jan 1 midnight
    expect(matchesCron(parsed!, new Date(2026, 0, 1, 0, 0))).toBe(true)
    expect(matchesCron(parsed!, new Date(2026, 1, 1, 0, 0))).toBe(false) // Feb 1
  })
})
