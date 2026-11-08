"use client"

import * as React from "react"
import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"

import { cn } from "@/lib/utils"

/**
 * Single-choice segmented control built on Base UI's ToggleGroup.
 * Arrow keys move focus between segments, and the pressed segment
 * cannot be cleared, so there is always exactly one value.
 */
function SegmentedControl<Value extends string>({
  value,
  onValueChange,
  className,
  children,
  ...props
}: Omit<
  React.ComponentProps<typeof ToggleGroup<Value>>,
  "value" | "defaultValue" | "onValueChange" | "multiple"
> & {
  value: Value
  onValueChange: (value: Value) => void
}) {
  return (
    <ToggleGroup<Value>
      data-slot="segmented-control"
      value={[value]}
      onValueChange={(next) => {
        const selected = next[0]
        if (selected) onValueChange(selected)
      }}
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-8 items-center gap-0.5 rounded-lg p-0.5",
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroup>
  )
}

function SegmentedControlItem<Value extends string>({
  className,
  ...props
}: React.ComponentProps<typeof Toggle<Value>>) {
  return (
    <Toggle<Value>
      data-slot="segmented-control-item"
      className={cn(
        "inline-flex h-7 min-w-11 items-center justify-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-[color,background-color,box-shadow] outline-none",
        "hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "data-[pressed]:bg-background data-[pressed]:text-foreground data-[pressed]:shadow-sm",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { SegmentedControl, SegmentedControlItem }
