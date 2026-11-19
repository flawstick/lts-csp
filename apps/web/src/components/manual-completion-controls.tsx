"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle, ExternalLink, Loader2, RotateCcw } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  getManualCompletionCandidates,
  getManualCompletionRecord,
  getRevertTargetStatus,
  MANUAL_COMPLETION_FROM_STATUSES,
} from "@/lib/manual-completion";

type ManualCompletionStatus = (typeof MANUAL_COMPLETION_FROM_STATUSES)[number];

function isManualCompletionStatus(
  status: string,
): status is ManualCompletionStatus {
  return (MANUAL_COMPLETION_FROM_STATUSES as readonly string[]).includes(status);
}

/**
 * Staff-only status switch on the return page: mark a return that was already
 * filed outside LTS as Completed using an attached official filed-return PDF,
 * or undo that completion if it was entered in error. The server re-checks
 * every guard (staff account, status, active runs, eligible file).
 */
export function ManualCompletionControls(props: {
  taxReturn: {
    id: string;
    entityName: string;
    taxYear: number;
    status: string;
    files: unknown;
    metadata: unknown;
  };
}) {
  const { taxReturn } = props;
  const utils = api.useUtils();
  const candidates = getManualCompletionCandidates(taxReturn.files);
  const manualRecord = getManualCompletionRecord(taxReturn.metadata);

  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [confirmFiled, setConfirmFiled] = useState(false);
  const [note, setNote] = useState("");

  const [isRevertOpen, setIsRevertOpen] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [reason, setReason] = useState("");

  const refresh = async () => {
    await Promise.all([
      utils.taxReturn.getById.invalidate({ id: taxReturn.id }),
      utils.taxReturn.list.invalidate(),
    ]);
  };

  const markCompleted = api.taxReturn.markCompletedWithFiledPdf.useMutation({
    onSuccess: async () => {
      toast.success("Filed-return PDF linked and return marked completed.");
      setIsCompleteOpen(false);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const revert = api.taxReturn.revertManualCompletion.useMutation({
    onSuccess: async () => {
      toast.success(
        "Completion reverted. Portal submission stays blocked until the receipt is checked.",
      );
      setIsRevertOpen(false);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const openComplete = () => {
    setSelectedFileUrl(candidates.length === 1 ? candidates[0]!.url : null);
    setConfirmFiled(false);
    setNote("");
    setIsCompleteOpen(true);
  };

  const openRevert = () => {
    setConfirmError(false);
    setReason("");
    setIsRevertOpen(true);
  };

  const status = taxReturn.status;
  const hasAttachedReceipt = candidates.some(
    (file) => file.role === "filed_return_pdf",
  );
  // A completed return only needs its missing receipt linked.
  const isLinkOnly = status === "completed";
  const canMarkCompleted =
    isManualCompletionStatus(status) &&
    manualRecord === null &&
    !(isLinkOnly && hasAttachedReceipt);
  const canRevert = status === "completed" && manualRecord !== null;
  const actionLabel = isLinkOnly ? "Link filed PDF" : "Mark completed";

  if (!canMarkCompleted && !canRevert) return null;

  return (
    <>
      {canMarkCompleted ? (
        <Button variant="outline" size="sm" onClick={openComplete}>
          <CheckCircle className="mr-2 h-4 w-4" />
          {actionLabel}
        </Button>
      ) : null}
      {canRevert ? (
        <Button variant="outline" size="sm" onClick={openRevert}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Revert completion
        </Button>
      ) : null}

      <AlertDialog
        open={isCompleteOpen}
        onOpenChange={(open) => {
          if (!markCompleted.isPending) setIsCompleteOpen(open);
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isLinkOnly ? "Link the filed-return PDF?" : "Mark return completed?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Use this only when {taxReturn.entityName} ({taxReturn.taxYear})
              has already been submitted on the government portal. This does
              not submit anything. The PDF you choose becomes the filed-return
              PDF shown to the client
              {isLinkOnly ? "." : ", and the return is marked Completed."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {candidates.length === 0 ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              No eligible PDF is attached. Upload the official filed-return
              PDF in the Files tab first (financial statements cannot be
              used).
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Official filed-return PDF</Label>
              <div
                role="radiogroup"
                aria-label="Official filed-return PDF"
                className="max-h-56 space-y-2 overflow-auto"
              >
                {candidates.map((file) => {
                  const selected = selectedFileUrl === file.url;
                  return (
                    <div
                      key={file.url}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md border p-3 text-sm",
                        selected && "border-primary bg-primary/5",
                      )}
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setSelectedFileUrl(file.url)}
                      >
                        <span className="block truncate font-medium">
                          {file.name}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {file.role === "filed_return_pdf"
                            ? "Already attached as the filed-return PDF"
                            : `Uploaded ${new Date(file.uploadedAt).toLocaleDateString()}`}
                        </span>
                      </button>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        aria-label={`Open ${file.name}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="manual-completion-note">Note (optional)</Label>
            <Textarea
              id="manual-completion-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Submitted on the portal by the client on 12 Nov"
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="manual-completion-confirm"
              checked={confirmFiled}
              onCheckedChange={(checked) => setConfirmFiled(checked === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="manual-completion-confirm"
              className="text-sm leading-snug font-normal"
            >
              I have checked that this return was already submitted on the
              government portal and the selected PDF is its official filed
              return.
            </Label>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={markCompleted.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !selectedFileUrl ||
                !confirmFiled ||
                !canMarkCompleted ||
                markCompleted.isPending
              }
              onClick={(event) => {
                event.preventDefault();
                if (!selectedFileUrl || !confirmFiled || !canMarkCompleted) {
                  return;
                }
                markCompleted.mutate({
                  taxReturnId: taxReturn.id,
                  fileUrl: selectedFileUrl,
                  expectedStatus: status,
                  confirmAlreadyFiled: true,
                  note: note.trim() || undefined,
                });
              }}
            >
              {markCompleted.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isRevertOpen}
        onOpenChange={(open) => {
          if (!revert.isPending) setIsRevertOpen(open);
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Revert completion?</AlertDialogTitle>
            <AlertDialogDescription>
              This undoes the completion recorded by staff
              {manualRecord ? ` using “${manualRecord.fileName}”` : ""}. The
              {manualRecord?.linkedFile
                ? "PDF is kept on the return as a superseded filed PDF. "
                : "PDF stays attached as the filed return. "}
              The return goes back to “
              {getRevertTargetStatus(
                manualRecord?.previousStatus ?? "review_required",
              ).replace("_", " ")}
              ”
              (an automation run is never resumed). Submitting this return
              through LTS stays blocked until the portal is checked and the
              correct receipt is recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="manual-completion-reason">Reason</Label>
            <Textarea
              id="manual-completion-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Wrong PDF linked; this was the 2024 return"
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="manual-completion-revert-confirm"
              checked={confirmError}
              onCheckedChange={(checked) => setConfirmError(checked === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="manual-completion-revert-confirm"
              className="text-sm leading-snug font-normal"
            >
              The completion was entered in error.
            </Label>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={revert.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !manualRecord ||
                !confirmError ||
                reason.trim().length < 5 ||
                revert.isPending
              }
              onClick={(event) => {
                event.preventDefault();
                if (!manualRecord || !confirmError || reason.trim().length < 5) {
                  return;
                }
                revert.mutate({
                  taxReturnId: taxReturn.id,
                  expectedFileUrl: manualRecord.fileUrl,
                  expectedCompletedAt: manualRecord.completedAt,
                  confirmEnteredInError: true,
                  reason: reason.trim(),
                });
              }}
            >
              {revert.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Revert completion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
