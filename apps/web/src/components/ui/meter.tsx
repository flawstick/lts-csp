"use client"

import * as React from "react"
import { Meter as MeterPrimitive } from "@base-ui/react/meter"

import { cn } from "@/lib/utils"

/**
 * Accessible meter (role="meter") built on Base UI. Use it for a known
 * quantity within a range, such as a completion rate, not for progress.
 */
function Meter({
  className,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof MeterPrimitive.Root> & {
  indicatorClassName?: string
}) {
  return (
    <MeterPrimitive.Root data-slot="meter" className={cn("w-full", className)} {...props}>
      <MeterPrimitive.Track
        data-slot="meter-track"
        className="bg-muted block h-1.5 w-full overflow-hidden rounded-full"
      >
        <MeterPrimitive.Indicator
          data-slot="meter-indicator"
          className={cn("bg-primary block h-full rounded-full transition-[width] duration-500", indicatorClassName)}
        />
      </MeterPrimitive.Track>
    </MeterPrimitive.Root>
  )
}

export { Meter }
