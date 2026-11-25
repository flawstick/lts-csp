import { describe, expect, it } from "vitest";
import { buildTrpcErrorLogEntry, sanitizeErrorMessage } from "./trpc-error-log";

describe("buildTrpcErrorLogEntry", () => {
  it("logs a refused start with path, code and the guard's message", () => {
    expect(
      buildTrpcErrorLogEntry({
        path: "taxReturn.startJob",
        type: "mutation",
        error: {
          code: "PRECONDITION_FAILED",
          message:
            "The latest preparation did not finish on the review page. Run Prepare only again, then submit the new draft.",
        },
      }),
    ).toEqual({
      level: "warn",
      record: {
        event: "trpc_error",
        path: "taxReturn.startJob",
        type: "mutation",
        code: "PRECONDITION_FAILED",
        message:
          "The latest preparation did not finish on the review page. Run Prepare only again, then submit the new draft.",
      },
    });
  });

  it("logs server errors without SQL parameters or token-like values", () => {
    const cause = new Error("boom");
    cause.name = "DrizzleQueryError";
    const entry = buildTrpcErrorLogEntry({
      path: "taxReturn.savePortalCredentials",
      type: "mutation",
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message:
          'Failed query: update "lts_tax_return" set "portal_credentials" = $1 where "id" = $2\nparams: s3cr3t-password,6f1c',
        cause,
      },
    });
    expect(entry?.level).toBe("error");
    expect(entry?.record.message).toBe(
      'Failed query: update "lts_tax_return" set "portal_credentials" = $1 where "id" = $2',
    );
    expect(entry?.record.cause).toBe("DrizzleQueryError");
    expect(JSON.stringify(entry)).not.toContain("s3cr3t");
  });

  it("never logs validation messages, which echo input", () => {
    const entry = buildTrpcErrorLogEntry({
      path: "taxReturn.updatePortalCredentials",
      type: "mutation",
      error: { code: "BAD_REQUEST", message: 'Invalid value "hunter2"' },
    });
    expect(entry?.record).toEqual({
      event: "trpc_error",
      path: "taxReturn.updatePortalCredentials",
      type: "mutation",
      code: "BAD_REQUEST",
    });
  });

  it("skips routine codes", () => {
    for (const code of ["UNAUTHORIZED", "NOT_FOUND"]) {
      expect(
        buildTrpcErrorLogEntry({
          path: "taxReturn.getTask",
          type: "query",
          error: { code, message: "x" },
        }),
      ).toBeNull();
    }
  });
});

describe("sanitizeErrorMessage", () => {
  it("redacts long token-like strings but keeps UUIDs", () => {
    expect(
      sanitizeErrorMessage(
        `bad key ${"fake" + "Token".repeat(8)} for 6f1c2a3b-1111-2222-3333-444455556666`,
      ),
    ).toBe("bad key [redacted] for 6f1c2a3b-1111-2222-3333-444455556666");
  });

  it("shortens very long messages", () => {
    const text = sanitizeErrorMessage("word ".repeat(400));
    expect(text.length).toBeLessThanOrEqual(501);
  });
});
