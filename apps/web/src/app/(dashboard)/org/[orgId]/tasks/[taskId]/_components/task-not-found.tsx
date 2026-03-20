import { Button } from "@/components/ui/button"
import { AlertCircle, ArrowLeft } from "@/lib/icons"
import Link from "next/link"

type TaskNotFoundProps = {
  orgId: string
}

export function TaskNotFound({ orgId }: TaskNotFoundProps) {
  return (
    <div className="flex h-[80vh] flex-col items-center justify-center gap-4">
      <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 p-6">
        <AlertCircle className="size-10 text-muted-foreground/40" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Task not found</p>
        <p className="mt-1 text-xs text-muted-foreground">It may have been deleted or you don&apos;t have access.</p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/org/${orgId}/tasks`}>
          <ArrowLeft className="mr-1.5 size-3.5" />
          Back to Tasks
        </Link>
      </Button>
    </div>
  )
}
