import { Button } from "@/components/ui/button";
import { Loader2, Monitor, Play } from "@/lib/icons";

type BrowserFrameProps = {
  liveUrl: string | null;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  jobStatus: string | null;
  errorMessage?: string | null;
  isStartPending: boolean;
  onStart: () => void;
};

function ShimmerBar({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded bg-muted/60 ${className ?? ""}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.03] to-transparent" />
    </div>
  );
}

function BrowserSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col p-4">
      <div className="flex items-center gap-2 rounded-lg border bg-card/50 px-3 py-2">
        <div className="flex gap-1.5">
          <div className="size-2.5 rounded-full bg-muted" />
          <div className="size-2.5 rounded-full bg-muted" />
          <div className="size-2.5 rounded-full bg-muted" />
        </div>
        <ShimmerBar className="ml-2 h-4 flex-1" />
      </div>
      <div className="mt-4 flex flex-1 gap-4">
        <div className="hidden w-48 flex-col gap-3 sm:flex">
          <ShimmerBar className="h-8 w-full" />
          <ShimmerBar className="h-6 w-3/4" />
          <ShimmerBar className="h-6 w-5/6" />
          <ShimmerBar className="h-6 w-2/3" />
          <ShimmerBar className="h-6 w-4/5" />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <ShimmerBar className="h-8 w-2/5" />
          <ShimmerBar className="h-4 w-3/4" />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <ShimmerBar className="h-24" />
            <ShimmerBar className="h-24" />
          </div>
          <ShimmerBar className="h-4 w-1/2" />
          <ShimmerBar className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}

export function BrowserFrame({
  liveUrl,
  iframeRef,
  jobStatus,
  errorMessage,
  isStartPending,
  onStart,
}: BrowserFrameProps) {
  if (liveUrl) {
    return (
      <div className="bg-background relative min-h-0 flex-1">
        <iframe
          ref={iframeRef}
          src={liveUrl}
          className="size-full border-0"
          allow="clipboard-write"
        />
      </div>
    );
  }

  const isLoading = jobStatus === "queued" || jobStatus === "starting" || jobStatus === "running";

  return (
    <div className="relative min-h-0 flex-1 bg-muted/20 dark:bg-muted/5">
      {isLoading && <BrowserSkeleton />}

      <div className="absolute inset-0 flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card/90 px-8 py-6 text-center shadow-sm backdrop-blur-sm">
            <div className="relative flex size-10 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-blue-500" />
              <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/10" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {jobStatus === "queued"
                  ? "Waiting for worker"
                  : jobStatus === "starting"
                    ? "Connecting session"
                    : "Loading browser"}
              </p>
              <p className="text-muted-foreground mt-0.5 max-w-[260px] text-xs">
                {jobStatus === "queued"
                  ? "Queued — a warm browser worker will pick this up."
                  : jobStatus === "starting"
                    ? "Establishing the Browser Use session."
                    : "Waiting for the live browser URL."}
              </p>
            </div>
          </div>
        ) : jobStatus === "completed" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
              <svg className="size-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium">Session Complete</p>
            <p className="text-muted-foreground text-xs">Browser automation finished successfully.</p>
          </div>
        ) : jobStatus === "failed" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/5">
              <svg className="size-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-sm font-medium">Task Failed</p>
            <p className="text-muted-foreground max-w-xs text-xs">
              {errorMessage ?? "The browser session could not be established."}
            </p>
          </div>
        ) : jobStatus === "cancelled" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/50">
              <Monitor className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Cancelled</p>
            <p className="text-muted-foreground text-xs">This task was stopped.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/15">
              <Monitor className="size-5 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">Ready to start</p>
            <p className="text-muted-foreground text-xs">Initialize the task to begin automation</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 h-7 gap-1.5 text-xs"
              onClick={onStart}
              disabled={isStartPending}
            >
              {isStartPending ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
              Start Session
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
