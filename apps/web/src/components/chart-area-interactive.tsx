"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control"
import { Skeleton } from "@/components/ui/skeleton"
import type { ActivityRangeDays } from "@/lib/activity-series"
import { api } from "@/trpc/react"

const RANGE_OPTIONS: { value: `${ActivityRangeDays}`; label: string; long: string }[] = [
  { value: "7", label: "7d", long: "Last 7 days" },
  { value: "30", label: "30d", long: "Last 30 days" },
  { value: "90", label: "90d", long: "Last 3 months" },
]

const chartConfig = {
  returns: {
    label: "Returns added",
    color: "var(--chart-4)",
  },
  tasks: {
    label: "Tasks completed",
    color: "var(--primary)",
  },
} satisfies ChartConfig

function formatDay(value: string) {
  // Dates are UTC calendar days; format them in UTC so they never shift.
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

interface ChartAreaInteractiveProps {
  orgId: string
}

export function ChartAreaInteractive({ orgId }: ChartAreaInteractiveProps) {
  const [range, setRange] = React.useState<`${ActivityRangeDays}`>("30")
  const { data, isLoading, isError } = api.analytics.getActivitySeries.useQuery(
    { orgId, days: Number(range) as ActivityRangeDays },
    { refetchOnWindowFocus: false, placeholderData: (previous) => previous },
  )

  const totals = React.useMemo(
    () =>
      (data ?? []).reduce(
        (sum, point) => ({ returns: sum.returns + point.returns, tasks: sum.tasks + point.tasks }),
        { returns: 0, tasks: 0 },
      ),
    [data],
  )
  const isEmpty = !isLoading && !isError && totals.returns === 0 && totals.tasks === 0
  const rangeLabel = RANGE_OPTIONS.find((option) => option.value === range)?.long ?? ""

  return (
    <Card className="@container/card gap-4">
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          {isLoading ? (
            <Skeleton className="mt-1 h-4 w-48" />
          ) : (
            <>
              <span className="text-foreground font-medium tabular-nums">{totals.returns}</span>{" "}
              returns added ·{" "}
              <span className="text-foreground font-medium tabular-nums">{totals.tasks}</span>{" "}
              tasks completed
              <span className="hidden @[480px]/card:inline"> · {rangeLabel.toLowerCase()}</span>
            </>
          )}
        </CardDescription>
        <CardAction>
          <SegmentedControl<`${ActivityRangeDays}`>
            value={range}
            onValueChange={setRange}
            aria-label="Activity date range"
          >
            {RANGE_OPTIONS.map((option) => (
              <SegmentedControlItem key={option.value} value={option.value} aria-label={option.long}>
                {option.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {isLoading ? (
          <Skeleton className="h-[240px] w-full rounded-lg" />
        ) : isError ? (
          <ChartMessage title="Activity is unavailable" body="Refresh the page to try again." />
        ) : (
          <div className="relative">
            <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
              <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="fillReturns" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-returns)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-returns)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="fillTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-tasks)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-tasks)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tickFormatter={formatDay}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  tickMargin={4}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent labelFormatter={formatDay} indicator="dot" />}
                />
                <Area
                  dataKey="returns"
                  type="monotone"
                  fill="url(#fillReturns)"
                  stroke="var(--color-returns)"
                  strokeWidth={2}
                />
                <Area
                  dataKey="tasks"
                  type="monotone"
                  fill="url(#fillTasks)"
                  stroke="var(--color-tasks)"
                  strokeWidth={2}
                />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center pb-8">
                <ChartMessage
                  title="No activity in this period"
                  body="Synced returns and completed automation tasks will appear here."
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ChartMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-card/90 mx-auto flex max-w-xs flex-col items-center gap-1 rounded-lg px-4 py-3 text-center backdrop-blur-sm">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground text-xs">{body}</p>
    </div>
  )
}
