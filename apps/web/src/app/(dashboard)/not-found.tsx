import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "@/lib/icons"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6 rounded-lg border bg-card p-8 shadow-lg text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="size-8 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-6xl font-bold tracking-tight text-foreground/80">
              404
            </h1>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Page Not Found
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The page you're looking for doesn't exist or has been moved.
            </p>
          </div>
        </div>

        <div className="pt-4">
          <Button asChild variant="default" size="lg">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
