import { Button } from "@/components/ui/button";
import { Loader2, Monitor, Play } from "@/lib/icons";

type BrowserFrameProps = {
  liveUrl: string | null;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  isRunning: boolean;
  isStartPending: boolean;
  onStart: () => void;
};

export function BrowserFrame({
  liveUrl,
  iframeRef,
  isRunning,
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

  return (
    <div className="relative min-h-0 flex-1 bg-neutral-950/[0.02] dark:bg-neutral-50/[0.02]">
      <div className="absolute inset-0 flex items-center justify-center">
        {isRunning ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative">
              <div className="absolute -inset-3 animate-ping rounded-full bg-blue-500/10" />
              <div className="bg-background relative rounded-2xl border p-4 shadow-sm">
                <Loader2 className="size-6 animate-spin text-blue-500" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">
                Waiting for live browser URL
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Task events are flowing, but the Browser Use monitor URL has not
                been received yet.
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
