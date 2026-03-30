import { useTheme } from "next-themes";
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

function useThemedUrl(url: string | null) {
  const { resolvedTheme } = useTheme();
  if (!url) return null;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}theme=${resolvedTheme === "dark" ? "dark" : "light"}`;
}

export function BrowserFrame({
  liveUrl,
  iframeRef,
  jobStatus,
  errorMessage,
  isStartPending,
  onStart,
}: BrowserFrameProps) {
  const themedUrl = useThemedUrl(liveUrl);

  const isTerminal = jobStatus === "completed" || jobStatus === "failed" || jobStatus === "cancelled";

  if (themedUrl && !isTerminal) {
    return (
      <div className="relative min-h-0 flex-1 bg-neutral-900 dark:bg-neutral-950">
        <iframe
          ref={iframeRef}
          src={themedUrl}
          className="absolute inset-0 h-full w-full border-0"
          allow="clipboard-write; autoplay"
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 bg-neutral-950/[0.02] dark:bg-neutral-50/[0.02]">
      <div className="absolute inset-0 flex items-center justify-center">
        {jobStatus === "queued" || jobStatus === "starting" || jobStatus === "running" ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative">
              <div className="absolute -inset-3 animate-ping rounded-full bg-blue-500/10" />
              <div className="bg-background relative rounded-2xl border p-4 shadow-sm">
                <Loader2 className="size-6 animate-spin text-blue-500" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">
                {jobStatus === "queued"
                  ? "Waiting for warm worker"
                  : jobStatus === "starting"
                    ? "Connecting Browser Use session"
                    : "Waiting for live browser URL"}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {jobStatus === "queued"
                  ? "Your task is queued and will start as soon as a warm browser worker is free."
                  : jobStatus === "starting"
                    ? "A worker claimed this task and is validating the Browser Use session before automation begins."
                    : "Task events are flowing, but the Browser Use monitor URL has not been received yet."}
              </p>
            </div>
          </div>
        ) : jobStatus === "failed" ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="bg-background relative rounded-2xl border border-red-500/20 p-4 shadow-sm">
              <Loader2 className="size-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Task failed to start</p>
              <p className="text-muted-foreground mt-0.5 max-w-sm text-xs">
                {errorMessage ??
                  "The browser worker did not establish a valid Browser Use session."}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center opacity-70">
            <div className="border-muted-foreground/15 rounded-2xl border-2 border-dashed p-5">
              <Monitor className="text-muted-foreground/40 size-8" />
            </div>
            <div>
              <p className="text-sm font-medium">Ready to start</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Initialize the task to begin automation
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 h-7 gap-1.5 text-xs"
              onClick={onStart}
              disabled={isStartPending}
            >
              <Play className="size-3" />
              Start Session
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
