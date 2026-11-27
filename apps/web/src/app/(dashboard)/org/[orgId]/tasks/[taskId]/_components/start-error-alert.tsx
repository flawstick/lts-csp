"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TriangleAlertIcon } from "@/lib/icons";

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
 * Why the last start request was refused, as a dialog. Stays open until
 * dismissed (or until a run starts), so a refusal never looks like a run
 * that silently stalled.
 */
export function StartErrorAlert({
  error,
  onDismiss,
}: {
  error: StartError;
  onDismiss: () => void;
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-lg sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-left leading-snug">
            <TriangleAlertIcon
              aria-hidden
              className="text-destructive size-5 shrink-0"
            />
            {error.action} did not start
          </AlertDialogTitle>
          <AlertDialogDescription className="text-foreground/90 text-left break-words">
            {error.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-muted-foreground text-xs">
          No new run was created. What the page shows is from an earlier run.
        </p>
        <AlertDialogFooter>
          {/* Closing (OK, Escape) calls onDismiss through onOpenChange. */}
          <AlertDialogAction>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
