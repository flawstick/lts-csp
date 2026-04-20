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
  requireFinancialStatements?: boolean;
  isUploading: boolean;
  isExtractPending: boolean;
  isAssignPending: boolean;
  uploadedFileUrls: UploadedFile[] | null;
  showAiExtraction?: boolean;
  uploadDescription?: string;
  uploadedFilesDescription?: string;
  onUploadFiles: (files: File[]) => void;
  onAssignFinancialStatements: (fileUrl: string) => void;
  onDismissAssignment: () => void;
  onRunAiExtraction: () => void;
  onRemoveDocument: (fileUrl: string) => void;
  onUnassignFinancialStatements: (fileUrl: string) => void;
  isReadOnly?: boolean;
  readOnlyMessage?: string;
};

export function ReturnFilesTab({
  selectedFiles,
  hasFinancialStatements,
  requireFinancialStatements = true,
  isUploading,
  isExtractPending,
  isAssignPending,
  uploadedFileUrls,
  showAiExtraction = true,
  uploadDescription = "Drop files here or browse. PDFs, spreadsheets, and documents are accepted.",
  uploadedFilesDescription = "Review documents, open them, or run AI extraction.",
  onUploadFiles,
  onAssignFinancialStatements,
  onDismissAssignment,
  onRunAiExtraction,
  onRemoveDocument,
  onUnassignFinancialStatements,
  isReadOnly = false,
  readOnlyMessage,
}: ReturnFilesTabProps) {
  const fileInputId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedRadio, setSelectedRadio] = useState<string>("__none__");
  const [deletingFileUrl, setDeletingFileUrl] = useState<string | null>(null);

  const deletingFile = deletingFileUrl
    ? (selectedFiles.find((f) => f.url === deletingFileUrl) ?? null)
    : null;

  const isSupersededFiledReturnPdf = (file: VaultFile) =>
    file.role !== "filed_return_pdf" &&
    file.metadata?.kind === "filed_return_pdf" &&
    typeof file.metadata?.supersededAt === "string";

  const isManagedFiledReturnPdf = (file: VaultFile) =>
    file.role === "filed_return_pdf" || isSupersededFiledReturnPdf(file);

  const uploadedPdfs = useMemo(
    () => (uploadedFileUrls ?? []).filter((f) => isPdfLike(f)),
    [uploadedFileUrls],
  );

  const shouldPrompt =
    uploadedFileUrls !== null &&
    requireFinancialStatements &&
    !hasFinancialStatements &&
    uploadedPdfs.length > 0;

  const showSingleDialog = shouldPrompt && uploadedPdfs.length === 1;
  const showPickerDialog = shouldPrompt && uploadedPdfs.length > 1;

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isReadOnly) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) onUploadFiles(files);
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) {
      event.target.value = "";
      return;
    }
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
        {isReadOnly && readOnlyMessage ? (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
            {readOnlyMessage}
          </div>
        ) : null}
        {/* Upload zone */}
        <div className="border-border/70 bg-card rounded-xl border p-5 shadow-xs">
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
              <span className="border-border/70 bg-muted/60 text-foreground inline-flex size-10 items-center justify-center rounded-lg border">
                <UploadCloud className="size-4.5" />
              </span>
              <div>
                <p className="text-sm font-semibold">Upload documents</p>
                <p className="text-muted-foreground mt-0.5 max-w-2xl text-sm">
                  {uploadDescription}
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
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
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
                  "bg-muted/40 inline-flex size-11 items-center justify-center rounded-full border transition-colors",
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
                      : isReadOnly
                        ? "Uploads locked for this completed return"
                        : "Drag files here or browse"}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  PDF, Excel, CSV, ZIP, DOC accepted
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isUploading || isReadOnly}
                onClick={() => document.getElementById(fileInputId)?.click()}
              >
                Choose files
              </Button>
            </div>
          </div>
        </div>

        {/* Uploaded files */}
        <div className="border-border/70 bg-card rounded-xl border p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Uploaded files</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {uploadedFilesDescription}
              </p>
            </div>

            {showAiExtraction ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onRunAiExtraction}
                disabled={!selectedFiles.length || isExtractPending || isReadOnly}
              >
                {isExtractPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Run AI extraction
              </Button>
            ) : null}
          </div>

          {!selectedFiles.length ? (
            <p className="border-border/60 text-muted-foreground mt-4 rounded-lg border border-dashed px-4 py-10 text-center text-sm">
              No uploaded files yet.
            </p>
          ) : (
            <div className="divide-border/50 mt-4 divide-y">
              {selectedFiles.map((file) => (
                <div
                  key={`${file.url}-${file.uploadedAt ?? file.name}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="bg-muted/60 text-muted-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-lg">
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
                        {file.role === "filed_return_pdf" ? (
                          <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                            Filed return PDF
                          </span>
                        ) : null}
                        {isSupersededFiledReturnPdf(file) ? (
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            Superseded filed PDF
                          </span>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs">
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
                        {!isManagedFiledReturnPdf(file) ? (
                          file.role === "financial_statements" ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              disabled={isReadOnly}
                              onClick={() =>
                                onUnassignFinancialStatements(file.url)
                              }
                            >
                              <FileText className="size-3.5" />
                              Unassign financial statements
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              disabled={isReadOnly}
                              onClick={() =>
                                onAssignFinancialStatements(file.url)
                              }
                            >
                              <FileText className="size-3.5" />
                              Assign as financial statements
                            </DropdownMenuItem>
                          )
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          className="cursor-pointer"
                          disabled={isReadOnly}
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
          onOpenChange={(open) => {
            if (!open) onDismissAssignment();
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assign signed financial statements?</DialogTitle>
              <DialogDescription>
                Is{" "}
                <span className="text-foreground font-medium">
                  {uploadedPdfs[0]?.name}
                </span>{" "}
                the signed financial statements PDF for this return?
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
              Upload the final signed accounts only. Draft accounts should not
              be assigned here.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onDismissAssignment}>
                No
              </Button>
              <Button
                disabled={isAssignPending || isReadOnly}
                onClick={() => {
                  const pdf = uploadedPdfs[0];
                  if (pdf) onAssignFinancialStatements(pdf.url);
                }}
              >
                {isAssignPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Yes, assign signed PDF
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
              <DialogTitle>Select signed financial statements</DialogTitle>
              <DialogDescription>
                Which of these PDFs is the signed financial statements for this
                return?
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
              Choose the final signed PDF only. If none of these files are
              signed yet, leave them unassigned.
            </div>

            <RadioGroup
              value={selectedRadio}
              onValueChange={setSelectedRadio}
              className="divide-border/50 border-border/60 gap-0 divide-y rounded-lg border"
            >
              {uploadedPdfs.map((file) => (
                <label
                  key={file.url}
                  className={cn(
                    "hover:bg-muted/30 flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors",
                    selectedRadio === file.url && "bg-primary/[0.04]",
                  )}
                >
                  <RadioGroupItem value={file.url} />
                  <FileText className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 truncate text-sm">{file.name}</span>
                </label>
              ))}
              <label
                className={cn(
                  "hover:bg-muted/30 flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors",
                  selectedRadio === "__none__" && "bg-primary/[0.04]",
                )}
              >
                <RadioGroupItem value="__none__" />
                <span className="text-muted-foreground text-sm">
                  None of these
                </span>
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
              <Button
                onClick={handleConfirmRadio}
                disabled={isAssignPending || isReadOnly}
              >
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
          onOpenChange={(open) => {
            if (!open) setDeletingFileUrl(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove file?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove{" "}
                <span className="text-foreground font-medium">
                  {deletingFile?.name ?? "this file"}
                </span>
                ? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isReadOnly}
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
