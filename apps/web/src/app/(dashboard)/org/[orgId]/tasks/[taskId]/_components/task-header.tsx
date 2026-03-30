import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { PageHeader } from "@/components/page-header"

type TaskHeaderProps = {
  orgId: string
  taskName: string
  taskStatus: string
  jurisdictionName: string | null
  entityName: string | null
  isConnected: boolean
  taxReturnId?: string
}

export function TaskHeader({
  orgId,
  taskName,
}: TaskHeaderProps) {
  return (
    <PageHeader>
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
    </PageHeader>
  )
}
