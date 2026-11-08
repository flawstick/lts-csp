export const ACTIVITY_RANGE_DAYS = [7, 30, 90] as const
export type ActivityRangeDays = (typeof ACTIVITY_RANGE_DAYS)[number]

export type DailyCount = { day: string; count: number }

export type ActivityPoint = {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string
  returns: number
  tasks: number
}

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Midnight UTC at the start of the first day in a window ending today. */
export function activityWindowStart(days: number, now: Date = new Date()): Date {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return start
}

/**
 * One point per UTC day in the window, oldest first. Days with no rows
 * are zero, so the chart never skips a gap.
 */
export function buildDailySeries(input: {
  days: number
  now?: Date
  returns: DailyCount[]
  tasks: DailyCount[]
}): ActivityPoint[] {
  const toMap = (rows: DailyCount[]) =>
    new Map(rows.map((row) => [row.day, Number(row.count) || 0]))
  const returns = toMap(input.returns)
  const tasks = toMap(input.tasks)
  const cursor = activityWindowStart(input.days, input.now)

  return Array.from({ length: input.days }, () => {
    const date = utcDayKey(cursor)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    return { date, returns: returns.get(date) ?? 0, tasks: tasks.get(date) ?? 0 }
  })
}
