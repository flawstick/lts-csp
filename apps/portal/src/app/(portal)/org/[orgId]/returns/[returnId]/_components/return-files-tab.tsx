"use client";

import { useId, useMemo, useState, type DragEvent } from "react";
import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  MoreVertical,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  formatBytes,
  isPdfLike,
  type VaultFile,
} from "./return-workspace-shared";

type UploadedFile = { name: string; url: string; type: string };

type ReturnFilesTabProps = {
  selectedReturnId: string;
  selectedFiles: VaultFile[];
  hasFinancialStatements: boolean;
  isUploading: boolean;
  isExtractPending: boolean;
  isAssignPending: boolean;
  uploadedFileUrls: UploadedFile[] | null;
  onUploadFiles: (files: File[]) => void;
  onAssignFinancialStatements: (fileUrl: string) => void;
  onDismissAssignment: () => void;
  onRunAiExtraction: () => void;
  onRemoveDocument: (fileUrl: string) => void;
  onUnassignFinancialStatements: (fileUrl: string) => void;
};

export function ReturnFilesTab({
  selectedFiles,
  hasFinancialStatements,
  isUploading,
  isExtractPending,
  isAssignPending,
  uploadedFileUrls,
  onUploadFiles,
  onAssignFinancialStatements,
  onDismissAssignment,
  onRunAiExtraction,
  onRemoveDocument,
  onUnassignFinancialStatements,
}: ReturnFilesTabProps) {
  const fileInputId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedRadio, setSelectedRadio] = useState<string>("__none__");
  const [deletingFileUrl, setDeletingFileUrl] = useState<string | null>(null);

  const deletingFile = deletingFileUrl
    ? selectedFiles.find((f) => f.url === deletingFileUrl) ?? null
    : null;

  const uploadedPdfs = useMemo(
    () => (uploadedFileUrls ?? []).filter((f) => isPdfLike(f)),
    [uploadedFileUrls],
  );

  const shouldPrompt =
    uploadedFileUrls !== null &&
    !hasFinancialStatements &&
    uploadedPdfs.length > 0;

  const showSingleDialog = shouldPrompt && uploadedPdfs.length === 1;
  const showPickerDialog = shouldPrompt && uploadedPdfs.length > 1;

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) onUploadFiles(files);
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length) onUploadFiles(files);
    event.target.value = "";
  };

  const handleConfirmRadio = () => {
    if (selectedRadio === "__none__") {
      onDismissAssignment();
    } else {
      onAssignFinancialStatements(selectedRadio);
    }
  };

  return (
    <TabsContent value="files">
      <div className="space-y-4">
        {/* Upload zone */}
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
          <input
            id={fileInputId}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.zip,.doc,.docx"
            className="hidden"
            onChange={handleFileInput}
          />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground">
                <UploadCloud className="size-4.5" />
              </span>
              <div>
                <p className="text-sm font-semibold">Upload documents</p>
                <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
                  Drop files here or browse. PDFs, spreadsheets, and documents are accepted.
                </p>
              </div>
            </div>

          </div>

          <div
            className={cn(
              "mt-4 rounded-lg border-2 border-dashed px-5 py-10 transition duration-200",
              isDragging
                ? "border-primary/40 bg-primary/[0.03]"
                : "border-border/60",
            )}
            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => {
              e.preventDefault();
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <span
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-full border bg-muted/40 transition-colors",
                  isDragging
                    ? "border-primary/30 text-primary"
                    : "border-border/60 text-muted-foreground",
                )}
              >
                {isUploading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <UploadCloud className="size-5" />
                )}
              </span>

              <div>
                <p className="text-sm font-medium">
                  {isUploading
                    ? "Uploading..."
                    : isDragging
                      ? "Drop files here"
                      : "Drag files here or browse"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, Excel, CSV, ZIP, DOC accepted
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isUploading}
                onClick={() => document.getElementById(fileInputId)?.click()}
              >
                Choose files
              </Button>
            </div>
          </div>
        </div>

        {/* Uploaded files */}
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Uploaded files</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Review documents, open them, or run AI extraction.
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={onRunAiExtraction}
              disabled={!selectedFiles.length || isExtractPending}
            >
              {isExtractPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Run AI extraction
            </Button>
          </div>

          {!selectedFiles.length ? (
            <p className="mt-4 rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              No uploaded files yet.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-border/50">
              {selectedFiles.map((file) => (
                <div
                  key={`${file.url}-${file.uploadedAt ?? file.name}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                      {isPdfLike(file) ? (
                        <FileText className="size-4" />
                      ) : (
                        <FileSpreadsheet className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {file.name}
                        </p>
                        {file.role === "financial_statements" ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            Financial statements
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatBytes(file.size)} ·{" "}
                        {file.uploadedAt
                          ? new Date(file.uploadedAt).toLocaleString()
                          : "Uploaded"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={file.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5" />
                        Open
                      </a>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-w-48">
                        {file.role === "financial_statements" ? (
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => onUnassignFinancialStatements(file.url)}
                          >
                            <FileText className="size-3.5" />
                            Unassign financial statements
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => onAssignFinancialStatements(file.url)}
                          >
                            <FileText className="size-3.5" />
                            Assign as financial statements
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          className="cursor-pointer"
                          onClick={() => setDeletingFileUrl(file.url)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Single PDF prompt */}
      {showSingleDialog ? (
        <Dialog
          open
          onOpenChange={(open) => { if (!open) onDismissAssignment(); }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Financial Statements?</DialogTitle>
              <DialogDescription>
                Is <span className="font-medium text-foreground">{uploadedPdfs[0]?.name}</span> your
                financial statements for this return?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={onDismissAssignment}>No</Button>
              <Button
                disabled={isAssignPending}
                onClick={() => {
                  const pdf = uploadedPdfs[0];
                  if (pdf) onAssignFinancialStatements(pdf.url);
                }}
              >
                {isAssignPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Yes, assign it
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Multiple PDFs picker */}
      {showPickerDialog ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              onDismissAssignment();
              setSelectedRadio("__none__");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Financial Statements</DialogTitle>
              <DialogDescription>
                Which of these PDFs is the financial statements for this return?
              </DialogDescription>
            </DialogHeader>

            <RadioGroup
              value={selectedRadio}
              onValueChange={setSelectedRadio}
              className="gap-0 divide-y divide-border/50 rounded-lg border border-border/60"
            >
              {uploadedPdfs.map((file) => (
                <label
                  key={file.url}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30",
                    selectedRadio === file.url && "bg-primary/[0.04]",
                  )}
                >
                  <RadioGroupItem value={file.url} />
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-sm">{file.name}</span>
                </label>
              ))}
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30",
                  selectedRadio === "__none__" && "bg-primary/[0.04]",
                )}
              >
                <RadioGroupItem value="__none__" />
                <span className="text-sm text-muted-foreground">None of these</span>
              </label>
            </RadioGroup>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  onDismissAssignment();
                  setSelectedRadio("__none__");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleConfirmRadio} disabled={isAssignPending}>
                {isAssignPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {/* Delete confirmation */}
      {deletingFileUrl ? (
        <AlertDialog
          open
          onOpenChange={(open) => { if (!open) setDeletingFileUrl(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove file?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove{" "}
                <span className="font-medium text-foreground">
                  {deletingFile?.name ?? "this file"}
                </span>
                ? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onRemoveDocument(deletingFileUrl);
                  setDeletingFileUrl(null);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </TabsContent>
  );
}
