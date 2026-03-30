export interface JobEvent {
  type:
    | "connected"
    | "job:started"
    | "job:progress"
    | "job:step"
    | "job:completed"
    | "job:failed"
    | "job:requires_attention";
  jobId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface StepEvent {
  stepNumber?: number;
  goal?: string;
  memory?: string;
  liveUrl?: string;
  url?: string;
  actions?: unknown[];
  screenshotUrl?: string;
  message?: string;
  output?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function getStatusConfig(status: string) {
  switch (status) {
    case "queued":
      return {
        label: "Queued",
        className:
          "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
      };
    case "starting":
      return {
        label: "Starting",
        className:
          "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
      };
    case "completed":
      return {
        label: "Completed",
        className:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    case "running":
    case "in_progress":
      return {
        label: "Running",
        className:
          "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
      };
    case "paused":
      return {
        label: "Paused",
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      };
    case "failed":
      return {
        label: "Failed",
        className:
          "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        className: "border-border bg-muted text-muted-foreground",
      };
    default:
      return {
        label: "Pending",
        className:
          "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
      };
  }
}

export function getJobStatusIcon(status: string) {
  return status;
}
