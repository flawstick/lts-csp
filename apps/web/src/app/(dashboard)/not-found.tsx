import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "@/lib/icons";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="bg-card w-full max-w-2xl space-y-6 rounded-lg border p-8 text-center shadow-lg">
        <div className="flex flex-col items-center gap-4">
          <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-full">
            <AlertCircle className="text-muted-foreground size-8" />
          </div>
          <div>
            <h1 className="text-foreground/80 text-6xl font-bold tracking-tight">
              404
            </h1>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Page Not Found
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
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
  );
}
