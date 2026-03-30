"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"

import { cn } from "@/lib/utils"

function CheckIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className="animate-in fade-in-0 zoom-in-75 duration-150"
    >
      <path
        d="M1.5 5.5L3.5 7.5L8.5 2.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="[stroke-dasharray:12] animate-[checkbox-stroke_200ms_ease-in-out_forwards]"
      />
    </svg>
  )
}

function IndeterminateIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className="animate-in fade-in-0 zoom-in-75 duration-150"
    >
      <path
        d="M2 5H8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, checked, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    checked={checked}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-all duration-150 ease-in-out ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {checked === "indeterminate" ? <IndeterminateIcon /> : <CheckIcon />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
