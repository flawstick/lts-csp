"use client"

import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Clock, Loader2, XCircle } from "@/lib/icons"

interface SyncJobStatusBadgeProps {
  status: string
}

export function SyncJobStatusBadge({ status }: SyncJobStatusBadgeProps) {
  switch (status) {
    case "completed":
      return (
        <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      )
    case "running":
      return (
        <Badge className="border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Running
        </Badge>
      )
    case "failed":
      return (
        <Badge className="border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400">
          <XCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      )
    default:
      return (
        <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      )
  }
}
