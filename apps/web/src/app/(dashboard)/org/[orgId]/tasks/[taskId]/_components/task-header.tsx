import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { getStatusConfig } from "./types"

type TaskHeaderProps = {
  orgId: string
  taskName: string
  taskStatus: string
  jurisdictionName: string | null
  entityName: string | null
  isConnected: boolean
}

export function TaskHeader({
  orgId,
  taskName,
  taskStatus,
  jurisdictionName,
  entityName,
  isConnected,
}: TaskHeaderProps) {
  const statusConfig = getStatusConfig(taskStatus)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <Breadcrumb>
        <BreadcrumbList className="text-xs">
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink href={`/org/${orgId}/tasks`}>Tasks</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[280px] truncate font-medium">
              {taskName}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        {jurisdictionName ? (
          <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
            {jurisdictionName}
          </span>
        ) : null}
        {entityName ? (
          <span className="hidden max-w-[140px] truncate text-[10px] text-muted-foreground sm:inline">
            {entityName}
          </span>
        ) : null}
        {(jurisdictionName || entityName) ? (
          <Separator orientation="vertical" className="hidden h-3.5 sm:block" />
        ) : null}

        <Badge variant="outline" className={`gap-1 text-[10px] font-semibold uppercase tracking-wider ${statusConfig.className}`}>
          {(taskStatus === "running" || taskStatus === "in_progress") ? (
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-blue-500" />
            </span>
          ) : null}
          {statusConfig.label}
        </Badge>

        {isConnected ? (
          <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/5 text-[10px] text-emerald-600 dark:text-emerald-400">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </Badge>
        ) : null}
      </div>
    </header>
  )
}
