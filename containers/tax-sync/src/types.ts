export type SyncedReturnStatus = "pending" | "completed" | "in_progress";

export type SyncedReturnType =
  | "economic_substance"
  | "company"
  | "personal"
  | "partnership"
  | "notification"
  | "other";

export interface SyncedTaxReturn {
  externalId: string;
  entityName: string;
  taxYear: number;
  status: SyncedReturnStatus;
  returnType: SyncedReturnType;
  link: string;
  pdfUrl?: string | null;
  metadata: Record<string, unknown>;
}

export type SyncLogLevel = "info" | "warn" | "error";

export interface SyncLogEntry {
  timestamp: string;
  level: SyncLogLevel;
  prefix: string[];
  message: string;
  data?: Record<string, unknown>;
}

export interface SyncLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  child: (scope: string) => SyncLogger;
  flush: () => Promise<void>;
}
