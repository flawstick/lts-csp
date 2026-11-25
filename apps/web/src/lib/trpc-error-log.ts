/**
 * Production logging for tRPC errors.
 *
 * A refused start (PRECONDITION_FAILED) or a server failure must be findable
 * in the logs, with the procedure path and error code. Inputs are never
 * logged: they can carry portal credentials, client data and free text. Only
 * messages LTS code writes itself are logged in full; other messages are cut
 * to their first line, stripped of any SQL parameter list and long
 * token-like strings, and shortened.
 */

/** Codes logged in production, and how much of the message is kept. */
const LOGGED_CODES = {
  // Messages written by LTS guards for the reviewer (start gates, locks).
  PRECONDITION_FAILED: "message",
  CONFLICT: "message",
  FORBIDDEN: "message",
  // Unexpected failures: message sanitised (it may quote a SQL query or a
  // library error that echoes input).
  INTERNAL_SERVER_ERROR: "sanitized",
  TIMEOUT: "sanitized",
  // Validation errors echo input values: code and path only.
  BAD_REQUEST: "none",
  UNPROCESSABLE_CONTENT: "none",
} as const satisfies Record<string, "message" | "sanitized" | "none">;

const MAX_MESSAGE_LENGTH = 500;

// 32+ characters without separators: API keys, tokens, hashes, base64 blobs.
// UUIDs (hyphenated) and ordinary words are left alone.
const TOKEN_LIKE = /[A-Za-z0-9+/_=]{32,}/g;

export function sanitizeErrorMessage(message: string): string {
  let text = message;
  // Drizzle and pg append the bound values after "params:".
  const paramsAt = text.search(/\bparams\s*:/i);
  if (paramsAt >= 0) text = text.slice(0, paramsAt);
  text = (text.split("\n")[0] ?? "").trim();
  text = text.replace(TOKEN_LIKE, "[redacted]");
  return text.length > MAX_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…`
    : text;
}

export type TrpcErrorLogEntry = {
  level: "warn" | "error";
  record: {
    event: "trpc_error";
    path: string;
    type: string;
    code: string;
    message?: string;
    cause?: string;
  };
};

/**
 * The log entry for a tRPC error in production, or null when the code is
 * not logged (e.g. UNAUTHORIZED from signed-out polling, NOT_FOUND).
 * Never reads the procedure input.
 */
export function buildTrpcErrorLogEntry(input: {
  path: string | undefined;
  type: string;
  error: { code: string; message: string; cause?: unknown };
}): TrpcErrorLogEntry | null {
  const { error } = input;
  const policy = (LOGGED_CODES as Record<string, string>)[error.code];
  if (!policy) return null;

  const record: TrpcErrorLogEntry["record"] = {
    event: "trpc_error",
    path: input.path ?? "<no-path>",
    type: input.type,
    code: error.code,
  };
  if (policy === "message") {
    record.message = sanitizeErrorMessage(error.message);
  } else if (policy === "sanitized") {
    record.message = sanitizeErrorMessage(error.message);
    const cause = error.cause;
    if (cause instanceof Error && cause.name && cause.name !== "Error") {
      record.cause = cause.name;
    }
  }
  return {
    level: error.code === "INTERNAL_SERVER_ERROR" || error.code === "TIMEOUT"
      ? "error"
      : "warn",
    record,
  };
}
