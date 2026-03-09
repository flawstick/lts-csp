"use client";

import {
  useId,
  useState,
  type Dispatch,
  type DragEvent,
  type SetStateAction,
} from "react";
import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  formatBytes,
  isPdfLike,
  type PendingFiles,
  type VaultFile,
} from "./return-workspace-shared";

type UploadTarget = "esr" | "financial";

type ReturnFilesTabProps = {
  selectedReturnId: string;
  selectedFiles: VaultFile[];
  pendingEsrFiles: PendingFiles;
  setPendingEsrFiles: Dispatch<SetStateAction<PendingFiles>>;
  pendingFinancialFiles: PendingFiles;
  setPendingFinancialFiles: Dispatch<SetStateAction<PendingFiles>>;
  isDocumentsPending: boolean;
  isExtractPending: boolean;
  isAssignPending: boolean;
  onUploadEsr: () => void;
  onUploadFinancials: () => void;
  onRunAiExtraction: () => void;
  onAssignFinancialStatements: (file: VaultFile) => void;
};

export function ReturnFilesTab({
  selectedReturnId,
  selectedFiles,
  pendingEsrFiles,
  setPendingEsrFiles,
  pendingFinancialFiles,
  setPendingFinancialFiles,
  isDocumentsPending,
  isExtractPending,
  isAssignPending,
  onUploadEsr,
  onUploadFinancials,
  onRunAiExtraction,
  onAssignFinancialStatements,
}: ReturnFilesTabProps) {
  const [activeDropTarget, setActiveDropTarget] = useState<UploadTarget>("esr");
  const [isDragging, setIsDragging] = useState(false);
  const esrInputId = useId();
  const financialInputId = useId();
  const assignedFinancialStatementsFile =
    selectedFiles.find((file) => file.role === "financial_statements") ?? null;
  const queuedEsrFile = pendingEsrFiles[selectedReturnId]?.[0] ?? null;
  const queuedFinancialFiles = pendingFinancialFiles[selectedReturnId] ?? [];

  const setQueuedEsrFile = (file: File | null) => {
    setPendingEsrFiles((previous) => ({
      ...previous,
      [selectedReturnId]: file ? [file] : [],
    }));
  };

  const setQueuedFinancialSelections = (files: File[]) => {
    setPendingFinancialFiles((previous) => ({
      ...previous,
      [selectedReturnId]: files,
    }));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(event.dataTransfer.files ?? []);
    if (!droppedFiles.length) {
      return;
    }

    if (activeDropTarget === "esr") {
      setQueuedEsrFile(droppedFiles[0] ?? null);
      return;
    }

    setQueuedFinancialSelections(droppedFiles);
  };

  return (
    <TabsContent value="files">
      <div className="space-y-4">
        {/* Upload intake */}
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
          <input
            id={esrInputId}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setQueuedEsrFile(file);
            }}
          />
          <input
            id={financialInputId}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.zip,.doc,.docx"
            className="hidden"
            onChange={(event) => {
              setQueuedFinancialSelections(
                Array.from(event.target.files ?? []),
              );
            }}
          />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground">
                <UploadCloud className="size-4.5" />
              </span>
              <div>
                <p className="text-sm font-semibold">Upload intake</p>
                <p className="text-muted-foreground mt-0.5 max-w-2xl text-sm">
                  Drop files here, then send them through ESR extraction or into the financial pack.
                </p>
              </div>
            </div>

            {assignedFinancialStatementsFile ? (
              <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Statements: {assignedFinancialStatementsFile.name}
              </span>
            ) : null}
          </div>

          {/* Drop zone */}
          <div
            className={cn(
              "mt-4 rounded-lg border-2 border-dashed px-5 py-8 transition duration-200",
              activeDropTarget === "esr"
                ? "border-border/60"
                : "border-emerald-500/25",
              isDragging &&
                (activeDropTarget === "esr"
                  ? "border-primary/40 bg-primary/[0.03]"
                  : "border-emerald-500/50 bg-emerald-500/[0.04]"),
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (
                event.currentTarget.contains(event.relatedTarget as Node)
              ) {
                return;
              }
              setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <span
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-full border bg-muted/40",
                  activeDropTarget === "esr"
                    ? "border-border/60 text-muted-foreground"
                    : "border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                )}
              >
                <UploadCloud className="size-5" />
              </span>

              <div>
                <p className="text-sm font-medium">
                  {isDragging
                    ? activeDropTarget === "esr"
                      ? "Drop the ESR file here"
                      : "Drop financial files here"
                    : "Drag files here or browse"}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {activeDropTarget === "esr"
                    ? "Excel, CSV or PDF. Only the first file is used."
                    : "PDF, Excel, CSV, ZIP, DOC accepted."}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={activeDropTarget === "esr" ? "default" : "outline"}
                  onClick={() => setActiveDropTarget("esr")}
                >
                  ESR file
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeDropTarget === "financial" ? "default" : "outline"}
                  onClick={() => setActiveDropTarget("financial")}
                >
                  Financial pack
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const targetInput = document.getElementById(
                      activeDropTarget === "esr"
                        ? esrInputId
                        : financialInputId,
                    );
                    targetInput?.click();
                  }}
                >
                  {activeDropTarget === "esr"
                    ? "Choose ESR file"
                    : "Choose financial files"}
                </Button>
                {activeDropTarget === "esr" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onUploadEsr}
                    disabled={isDocumentsPending || isExtractPending}
                  >
                    {isDocumentsPending || isExtractPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Upload ESR + Extract
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onUploadFinancials}
                    disabled={isDocumentsPending || isExtractPending}
                  >
                    {isDocumentsPending || isExtractPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <UploadCloud className="size-4" />
                    )}
                    Upload financial files
                  </Button>
                )}
              </div>

              <p className="text-muted-foreground text-xs">
                {activeDropTarget === "esr"
                  ? (queuedEsrFile?.name ?? "No ESR file selected.")
                  : queuedFinancialFiles.length > 0
                    ? `${queuedFinancialFiles.length} financial file(s) selected.`
                    : "No financial files selected."}
              </p>
            </div>
          </div>
        </div>

        {/* Uploaded files */}
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Uploaded files</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Review documents, open them, or assign the statements PDF.
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
            <p className="text-muted-foreground mt-4 rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-sm">
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
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {formatBytes(file.size)} ·{" "}
                        {file.uploadedAt
                          ? new Date(file.uploadedAt).toLocaleString()
                          : "Uploaded"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isPdfLike(file) ? (
                      <Button
                        size="sm"
                        variant={
                          file.role === "financial_statements"
                            ? "default"
                            : "outline"
                        }
                        disabled={
                          isAssignPending ||
                          isDocumentsPending ||
                          isExtractPending
                        }
                        onClick={() => {
                          onAssignFinancialStatements(file);
                        }}
                      >
                        <FileText className="size-3.5" />
                        {file.role === "financial_statements"
                          ? "Assigned"
                          : "Assign financials"}
                      </Button>
                    ) : null}

                    <Button variant="ghost" size="sm" asChild>
                      <a href={file.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5" />
                        Open
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </TabsContent>
  );
}
