"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
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
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

export const description = "An interactive area chart"

const chartData = [
  { date: "2024-04-01", returns: 12, tasks: 8 },
  { date: "2024-04-02", returns: 8, tasks: 5 },
  { date: "2024-04-03", returns: 15, tasks: 10 },
  { date: "2024-04-04", returns: 22, tasks: 18 },
  { date: "2024-04-05", returns: 18, tasks: 12 },
  { date: "2024-04-06", returns: 5, tasks: 3 },
  { date: "2024-04-07", returns: 3, tasks: 2 },
  { date: "2024-04-08", returns: 25, tasks: 20 },
  { date: "2024-04-09", returns: 19, tasks: 15 },
  { date: "2024-04-10", returns: 21, tasks: 17 },
  { date: "2024-04-11", returns: 28, tasks: 22 },
  { date: "2024-04-12", returns: 24, tasks: 19 },
  { date: "2024-04-13", returns: 6, tasks: 4 },
  { date: "2024-04-14", returns: 4, tasks: 2 },
  { date: "2024-04-15", returns: 30, tasks: 25 },
  { date: "2024-04-16", returns: 26, tasks: 21 },
  { date: "2024-04-17", returns: 32, tasks: 28 },
  { date: "2024-04-18", returns: 29, tasks: 24 },
  { date: "2024-04-19", returns: 23, tasks: 18 },
  { date: "2024-04-20", returns: 7, tasks: 5 },
  { date: "2024-04-21", returns: 5, tasks: 3 },
  { date: "2024-04-22", returns: 35, tasks: 30 },
  { date: "2024-04-23", returns: 31, tasks: 26 },
  { date: "2024-04-24", returns: 28, tasks: 23 },
  { date: "2024-04-25", returns: 33, tasks: 28 },
  { date: "2024-04-26", returns: 27, tasks: 22 },
  { date: "2024-04-27", returns: 8, tasks: 6 },
  { date: "2024-04-28", returns: 6, tasks: 4 },
  { date: "2024-04-29", returns: 38, tasks: 32 },
  { date: "2024-04-30", returns: 34, tasks: 29 },
  { date: "2024-05-01", returns: 29, tasks: 24 },
  { date: "2024-05-02", returns: 36, tasks: 31 },
  { date: "2024-05-03", returns: 32, tasks: 27 },
  { date: "2024-05-04", returns: 9, tasks: 7 },
  { date: "2024-05-05", returns: 7, tasks: 5 },
  { date: "2024-05-06", returns: 40, tasks: 35 },
  { date: "2024-05-07", returns: 37, tasks: 32 },
  { date: "2024-05-08", returns: 33, tasks: 28 },
  { date: "2024-05-09", returns: 39, tasks: 34 },
  { date: "2024-05-10", returns: 35, tasks: 30 },
  { date: "2024-05-11", returns: 10, tasks: 8 },
  { date: "2024-05-12", returns: 8, tasks: 6 },
  { date: "2024-05-13", returns: 42, tasks: 37 },
  { date: "2024-05-14", returns: 38, tasks: 33 },
  { date: "2024-05-15", returns: 36, tasks: 31 },
  { date: "2024-05-16", returns: 41, tasks: 36 },
  { date: "2024-05-17", returns: 37, tasks: 32 },
  { date: "2024-05-18", returns: 11, tasks: 9 },
  { date: "2024-05-19", returns: 9, tasks: 7 },
  { date: "2024-05-20", returns: 44, tasks: 39 },
  { date: "2024-05-21", returns: 40, tasks: 35 },
  { date: "2024-05-22", returns: 38, tasks: 33 },
  { date: "2024-05-23", returns: 43, tasks: 38 },
  { date: "2024-05-24", returns: 39, tasks: 34 },
  { date: "2024-05-25", returns: 12, tasks: 10 },
  { date: "2024-05-26", returns: 10, tasks: 8 },
  { date: "2024-05-27", returns: 46, tasks: 41 },
  { date: "2024-05-28", returns: 42, tasks: 37 },
  { date: "2024-05-29", returns: 40, tasks: 35 },
  { date: "2024-05-30", returns: 45, tasks: 40 },
  { date: "2024-05-31", returns: 41, tasks: 36 },
  { date: "2024-06-01", returns: 13, tasks: 11 },
  { date: "2024-06-02", returns: 11, tasks: 9 },
  { date: "2024-06-03", returns: 48, tasks: 43 },
  { date: "2024-06-04", returns: 44, tasks: 39 },
  { date: "2024-06-05", returns: 42, tasks: 37 },
  { date: "2024-06-06", returns: 47, tasks: 42 },
  { date: "2024-06-07", returns: 43, tasks: 38 },
  { date: "2024-06-08", returns: 14, tasks: 12 },
  { date: "2024-06-09", returns: 12, tasks: 10 },
  { date: "2024-06-10", returns: 50, tasks: 45 },
  { date: "2024-06-11", returns: 46, tasks: 41 },
  { date: "2024-06-12", returns: 44, tasks: 39 },
  { date: "2024-06-13", returns: 49, tasks: 44 },
  { date: "2024-06-14", returns: 45, tasks: 40 },
  { date: "2024-06-15", returns: 15, tasks: 13 },
  { date: "2024-06-16", returns: 13, tasks: 11 },
  { date: "2024-06-17", returns: 52, tasks: 47 },
  { date: "2024-06-18", returns: 48, tasks: 43 },
  { date: "2024-06-19", returns: 46, tasks: 41 },
  { date: "2024-06-20", returns: 51, tasks: 46 },
  { date: "2024-06-21", returns: 47, tasks: 42 },
  { date: "2024-06-22", returns: 16, tasks: 14 },
  { date: "2024-06-23", returns: 14, tasks: 12 },
  { date: "2024-06-24", returns: 54, tasks: 49 },
  { date: "2024-06-25", returns: 50, tasks: 45 },
  { date: "2024-06-26", returns: 48, tasks: 43 },
  { date: "2024-06-27", returns: 53, tasks: 48 },
  { date: "2024-06-28", returns: 49, tasks: 44 },
  { date: "2024-06-29", returns: 17, tasks: 15 },
  { date: "2024-06-30", returns: 55, tasks: 50 },
]

const chartConfig = {
  activity: {
    label: "Activity",
  },
  returns: {
    label: "Returns",
    color: "var(--primary)",
  },
  tasks: {
    label: "Tasks",
    color: "var(--primary)",
  },
} satisfies ChartConfig

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("90d")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const filteredData = chartData.filter((item) => {
    const date = new Date(item.date)
    const referenceDate = new Date("2024-06-30")
    let daysToSubtract = 90
    if (timeRange === "30d") {
      daysToSubtract = 30
    } else if (timeRange === "7d") {
      daysToSubtract = 7
    }
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return date >= startDate
  })

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Activity Overview</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Returns processed and tasks completed
          </span>
          <span className="@[540px]/card:hidden">Returns & Tasks</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillReturns" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-returns)"
                  stopOpacity={1.0}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-returns)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillTasks" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-tasks)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-tasks)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="tasks"
              type="natural"
              fill="url(#fillTasks)"
              stroke="var(--color-tasks)"
              stackId="a"
            />
            <Area
              dataKey="returns"
              type="natural"
              fill="url(#fillReturns)"
              stroke="var(--color-returns)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
