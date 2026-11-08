import { describe, expect, it } from "vitest"
import { activityWindowStart, buildDailySeries } from "./activity-series"

const now = new Date("2026-11-08T15:30:00Z")

describe("activityWindowStart", () => {
  it("starts at UTC midnight, counting today as day one", () => {
    expect(activityWindowStart(7, now).toISOString()).toBe("2026-11-02T00:00:00.000Z")
    expect(activityWindowStart(1, now).toISOString()).toBe("2026-11-08T00:00:00.000Z")
  })
})

describe("buildDailySeries", () => {
  it("returns one zero-filled point per day, oldest first", () => {
    const series = buildDailySeries({
      days: 7,
      now,
      returns: [{ day: "2026-11-03", count: 4 }],
      tasks: [
        { day: "2026-11-08", count: 2 },
        { day: "2026-10-01", count: 9 },
      ],
    })

    expect(series).toHaveLength(7)
    expect(series[0]).toEqual({ date: "2026-11-02", returns: 0, tasks: 0 })
    expect(series[1]).toEqual({ date: "2026-11-03", returns: 4, tasks: 0 })
    expect(series[6]).toEqual({ date: "2026-11-08", returns: 0, tasks: 2 })
    expect(series.reduce((sum, point) => sum + point.tasks, 0)).toBe(2)
  })

  it("accepts numeric strings from the database driver", () => {
    const series = buildDailySeries({
      days: 1,
      now,
      returns: [{ day: "2026-11-08", count: "3" as unknown as number }],
      tasks: [],
    })
    expect(series[0]?.returns).toBe(3)
  })
})
