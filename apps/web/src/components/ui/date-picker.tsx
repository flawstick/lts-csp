"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

function formatDateDisplay(date: Date | undefined) {
  if (!date) {
    return ""
  }
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function formatDateISO(date: Date | undefined) {
  if (!date) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseISODate(str: string | undefined): Date | undefined {
  if (!str) return undefined
  const date = new Date(str + "T00:00:00")
  return isNaN(date.getTime()) ? undefined : date
}

function isValidDate(date: Date | undefined) {
  if (!date) return false
  return !isNaN(date.getTime())
}

interface DatePickerProps {
  value?: string // ISO format YYYY-MM-DD
  onChange?: (value: string | undefined) => void
  placeholder?: string
  id?: string
}

export function DatePicker({ value, onChange, placeholder = "Select date...", id }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState<Date | undefined>(parseISODate(value))
  const [month, setMonth] = React.useState<Date | undefined>(date ?? new Date())
  const [inputValue, setInputValue] = React.useState(formatDateDisplay(date))

  // Sync with external value changes
  React.useEffect(() => {
    const parsed = parseISODate(value)
    setDate(parsed)
    setInputValue(formatDateDisplay(parsed))
    if (parsed) setMonth(parsed)
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)

    const parsed = new Date(newValue)
    if (isValidDate(parsed)) {
      setDate(parsed)
      setMonth(parsed)
      onChange?.(formatDateISO(parsed))
    }
  }

  const handleSelect = (newDate: Date | undefined) => {
    setDate(newDate)
    setInputValue(formatDateDisplay(newDate))
    onChange?.(formatDateISO(newDate))
    setOpen(false)
  }

  return (
    <div className="relative flex gap-2">
      <Input
        id={id}
        value={inputValue}
        placeholder={placeholder}
        className="bg-background pr-10"
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setOpen(true)
          }
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
            type="button"
          >
            <CalendarIcon className="size-3.5" />
            <span className="sr-only">Select date</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden p-0"
          align="end"
          alignOffset={-8}
          sideOffset={10}
        >
          <Calendar
            mode="single"
            selected={date}
            captionLayout="dropdown"
            month={month}
            onMonthChange={setMonth}
            onSelect={handleSelect}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
