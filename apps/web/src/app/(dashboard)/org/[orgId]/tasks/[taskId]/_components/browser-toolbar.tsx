import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  Play,
  Square,
  Loader2,
  Monitor,
  ExternalLink,
  CheckCircle2,
  Maximize2,
  Minimize2,
  History,
  ChevronDown,
  XCircle,
  Clock,
  Pause,
  Trash2,
  RefreshCw,
} from "@/lib/icons"

type Job = {
  id: string
  jobNumber: number
  status: string
  createdAt: Date | string
}

type StartOptions = {
  overrideSaved?: boolean
  submissionMode?: "prepare_only" | "submit_and_capture_pdf"
}

type BrowserToolbarProps = {
  jurisdictionName: string | null
  liveUrl: string | null
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  allJobs: Job[]
  selectedJobId: string | null
  selectedJob: Job | null | undefined
  isBrowserFullscreen: boolean
  setIsBrowserFullscreen: (v: boolean) => void
  activeJob: Job | null | undefined
  runningJob: Job | null | undefined
  pausedJob: Job | null | undefined
  onSelectJob: (jobId: string) => void
  onPause: () => void
  onCancel: () => void
  onResume: (jobId: string) => void
  onStart: (options?: StartOptions) => void
  onDeleteJob: (jobId: string) => void
  isStartPending: boolean
  isPausePending: boolean
  isCancelPending: boolean
  isResumePending: boolean
  isDeletePending: boolean
}

function JobStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-3.5 text-emerald-500" />
    case "running":
      return <Loader2 className="size-3.5 text-blue-500 animate-spin" />
    case "starting":
      return <Loader2 className="size-3.5 text-sky-500 animate-spin" />
    case "queued":
      return <Clock className="size-3.5 text-yellow-500" />
    case "paused":
      return <Pause className="size-3.5 text-amber-500" />
    case "failed":
      return <XCircle className="size-3.5 text-red-500" />
    case "cancelled":
      return <XCircle className="size-3.5 text-muted-foreground" />
    default:
      return <Clock className="size-3.5 text-yellow-500" />
  }
}

export function BrowserToolbar({
  jurisdictionName,
  liveUrl,
  iframeRef,
  allJobs,
  selectedJobId,
  selectedJob,
  isBrowserFullscreen,
  setIsBrowserFullscreen,
  activeJob,
  runningJob,
  pausedJob,
  onSelectJob,
  onPause,
  onCancel,
  onResume,
  onStart,
  onDeleteJob,
  isStartPending,
  isPausePending,
  isCancelPending,
  isResumePending,
  isDeletePending,
}: BrowserToolbarProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b bg-muted/20 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <Monitor className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {jurisdictionName ? `${jurisdictionName} Portal` : "Browser"}
        </span>

        {liveUrl ? (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={() => { if (iframeRef.current) iframeRef.current.src = liveUrl }}
              title="Reload"
            >
              <RefreshCw className="size-3" />
            </Button>
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Open in new tab"
            >
              <ExternalLink className="size-3" />
            </a>
          </div>
        ) : null}

        {allJobs.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-1 h-6 gap-1 px-2 text-[11px]">
                <History className="size-3" />
                Run {selectedJob?.jobNumber ?? 1}
                <ChevronDown className="size-2.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Run History · {allJobs.length} total
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allJobs.map((job) => (
                <DropdownMenuItem
                  key={job.id}
                  onClick={() => onSelectJob(job.id)}
                  className={`gap-2 ${selectedJobId === job.id ? 'bg-accent' : ''}`}
                >
                  <JobStatusIcon status={job.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Run #{job.jobNumber}</span>
                      <span className="text-[10px] capitalize text-muted-foreground">{job.status}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {job.status !== "queued" &&
                  job.status !== "starting" &&
                  job.status !== "running" &&
                  job.status !== "paused" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteJob(job.id)
                      }}
                      disabled={isDeletePending}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => setIsBrowserFullscreen(!isBrowserFullscreen)}
          title={isBrowserFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isBrowserFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </Button>

        {runningJob ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={onPause}
              disabled={isPausePending}
            >
              {isPausePending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Pause className="size-3" />
              )}
              Pause
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={onCancel}
              disabled={isCancelPending}
              title="Cancel"
            >
              <Square className="size-3" />
            </Button>
          </>
        ) : activeJob &&
          (activeJob.status === "queued" || activeJob.status === "starting") ? (
          <>
            <Badge variant="secondary" className="h-6 px-2 text-[11px] font-medium">
              {activeJob.status === "queued" ? "Queued" : "Starting"}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={onCancel}
              disabled={isCancelPending}
              title="Cancel"
            >
              <Square className="size-3" />
            </Button>
          </>
        ) : pausedJob ? (
          <>
            <Button
              size="sm"
              className="h-6 gap-1 bg-amber-500 px-2 text-[11px] hover:bg-amber-600"
              onClick={() => onResume(pausedJob.id)}
              disabled={isResumePending}
            >
              {isResumePending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Play className="size-3" />
              )}
              Resume
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={onCancel}
              disabled={isCancelPending}
              title="Cancel"
            >
              <Square className="size-3" />
            </Button>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="h-6 gap-1 px-2.5 text-[11px]"
                disabled={isStartPending}
              >
                {isStartPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Play className="size-3" />
                )}
                Start
                <ChevronDown className="size-2.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  onStart({ submissionMode: "submit_and_capture_pdf" })
                }
              >
                <Play className="mr-2 size-3.5" />
                Submit + capture PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onStart({
                    overrideSaved: true,
                    submissionMode: "submit_and_capture_pdf",
                  })
                }
              >
                <History className="mr-2 size-3.5" />
                Override saved + submit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onStart({ submissionMode: "prepare_only" })}
              >
                <Play className="mr-2 size-3.5" />
                Prepare only
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onStart({
                    overrideSaved: true,
                    submissionMode: "prepare_only",
                  })
                }
              >
                <History className="mr-2 size-3.5" />
                Override saved only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
