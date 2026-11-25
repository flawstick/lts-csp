"use client";

import { Button } from "@/components/ui/button";
import { TriangleAlertIcon, X } from "@/lib/icons";

export type StartError = {
  /** What the reviewer tried to start, e.g. "Submit prepared return". */
  action: string;
  /** The server's reason, shown verbatim. */
  message: string;
};

type StartVariables = {
  submissionMode?: "prepare_only" | "submit_and_capture_pdf";
  overrideSaved?: boolean;
  filingOperation?: "fill" | "submit_prepared";
};

/** The reviewer-facing name of a start request, as the toolbar labels it. */
export function describeStartAction(variables: StartVariables): string {
  if (variables.filingOperation === "submit_prepared") {
    return "Submit prepared return";
  }
  if (variables.submissionMode === "submit_and_capture_pdf") {
    return variables.overrideSaved ? "Refill answers + submit" : "Submit return";
  }
  return variables.overrideSaved ? "Refill saved answers" : "Prepare only";
}

/**
 * Why the last start request was refused. Stays until dismissed or until a
 * run starts, so a refusal never looks like a run that silently stalled.
 */
export function StartErrorAlert({
  error,
  onDismiss,
}: {
  error: StartError;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/10 flex shrink-0 items-start gap-2 border-b px-4 py-3 text-sm"
    >
      <TriangleAlertIcon className="text-destructive mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-destructive font-medium">
          {error.action} did not start
        </p>
        <p className="text-foreground/90 break-words">{error.message}</p>
        <p className="text-muted-foreground text-xs">
          No new run was created. Anything shown below is from an earlier
          run.
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground size-6 shrink-0"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
