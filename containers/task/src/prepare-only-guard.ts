/**
 * Prepare-only enforcement for Browser Use V4.
 *
 * V4 exposes no per-run domain, action or network blocklist for the agent.
 * What it does expose is session-wide Manifest V3 extensions
 * (`browserSettings.extensionIds`) and, per browser, the list of installed
 * extensions. The guard extension in `prepare-only-guard/` blocks
 * final-submission controls on *.gov.gg pages. The worker:
 *   1. refuses to start a prepare_only run when no guard extension is
 *      configured (unless BROWSER_USE_PREPARE_ONLY_GUARD_REQUIRED=false),
 *   2. requests the extension on new prepare_only sessions,
 *   3. verifies from each browser record that it is actually installed and
 *      fails closed (stops the run) when it is not, or when it cannot be
 *      verified within PREPARE_ONLY_GUARD_VERIFY_TIMEOUT_MS, and
 *   4. watches run events and cancels the run as soon as a submission attempt
 *      or a filed state is reported (defence in depth, not prevention).
 *
 * What the extension blocks (in-page, on *.gov.gg):
 *   - clicks / Enter / Space / form submission through controls labelled as a
 *     final filing action, including the GRS company-tax-ui button "Complete
 *     submission to Revenue Service", and script form.submit()/requestSubmit();
 *   - page-script fetch / XMLHttpRequest / sendBeacon with a mutating method
 *     (POST/PUT/PATCH/DELETE) issued while on the final reviewAndSubmit page,
 *     or to any company-tax-api path containing "submi" (heuristic: the real
 *     filing write endpoint has not been inspected), and POST forms from the
 *     final page.
 * Limits: this is not browser-level network enforcement. Browser Use V4 has
 * no per-run network/domain policy, and an MV3 declarativeNetRequest rule
 * cannot be scoped to the page URL, so requests from service/web workers,
 * direct CDP network calls, or a submission flow that leaves the
 * reviewAndSubmit route and uses an endpoint without "submi" are not covered.
 * The prompt rules and the event watchdog remain in force.
 */
import { isLikelySubmittedOutput, type SubmissionMode } from "./run-outcome";

/** Text the guard extension shows in the page when it blocks a submission. */
export const GUARD_BLOCK_MARKER = "lts prepare-only guard";

export type PrepareOnlyGuardStatus =
  /** Submit mode: no guard applies. */
  | "not_applicable"
  /** No extension id configured: prompt-only protection plus the watchdog. */
  | "not_configured"
  /** Extension requested; browser not provisioned/inspected yet. */
  | "requested"
  /** The run's browser reports the extension installed. */
  | "verified_installed"
  /** The run's browser does not have the extension: fail closed. */
  | "missing_from_browser";

/** Max time after dispatch for the run's browser to be verified. */
export const PREPARE_ONLY_GUARD_VERIFY_TIMEOUT_MS = 90_000;

/**
 * Whether a prepare_only run must have a verified guard. Defaults to true;
 * only an explicit "false"/"0"/"no"/"off" opts out (e.g. local development).
 */
export function isPrepareOnlyGuardRequired(
  value: string | null | undefined,
): boolean {
  const normalized = value?.trim().toLowerCase();
  return !(
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off"
  );
}

/**
 * Fail-closed decision for a prepare_only run. Returns the reason to stop
 * the run, or null to keep going.
 */
export function prepareOnlyGuardFailure(params: {
  status: PrepareOnlyGuardStatus;
  required: boolean;
  /** ms since the current browser run was dispatched. */
  elapsedSinceDispatchMs?: number;
  timeoutMs?: number;
}): string | null {
  const { status, required } = params;
  if (status === "missing_from_browser") {
    return "Prepare-only guard extension is not installed in the Browser Use browser; run stopped before it could submit.";
  }
  if (status === "not_configured" && required) {
    return "Prepare-only guard extension is not configured (BROWSER_USE_PREPARE_ONLY_GUARD_EXTENSION_ID); refusing to run a prepare-only filing without it.";
  }
  if (
    status === "requested" &&
    (params.elapsedSinceDispatchMs ?? 0) >
      (params.timeoutMs ?? PREPARE_ONLY_GUARD_VERIFY_TIMEOUT_MS)
  ) {
    return "Prepare-only guard extension could not be verified on the Browser Use browser in time; run stopped before it could submit.";
  }
  return null;
}

export function evaluatePrepareOnlyGuard(params: {
  submissionMode: SubmissionMode;
  configuredExtensionId: string | null | undefined;
  /** Extension ids reported on the run's browser, or null if not known yet. */
  installedExtensionIds: string[] | null;
}): PrepareOnlyGuardStatus {
  if (params.submissionMode !== "prepare_only") return "not_applicable";
  const configured = params.configuredExtensionId?.trim();
  if (!configured) return "not_configured";
  if (params.installedExtensionIds === null) return "requested";
  return params.installedExtensionIds.includes(configured)
    ? "verified_installed"
    : "missing_from_browser";
}

export type PrepareOnlyBreach = {
  kind: "submission_attempt_blocked" | "submission_reported";
  evidence: string;
};

function messageText(message: {
  summary?: string | null;
  data?: Record<string, unknown>;
}): string {
  let data = "";
  try {
    data = message.data ? JSON.stringify(message.data) : "";
  } catch {}
  return `${message.summary ?? ""}\n${data}`;
}

/**
 * Scan new run events of a prepare_only run for a submission attempt (the
 * guard blocked one) or a reported filed state. Either one cancels the run.
 */
type RunMessage = {
  type?: string;
  summary?: string | null;
  data?: Record<string, unknown>;
};

/** Events that echo our own task text (which mentions submission steps). */
const ECHO_EVENT_TYPE = /(^|\.)(user|task|prompt)(\.|$)|^run\.(created|queued|started|dispatch)/i;

export function detectPrepareOnlyBreach(
  allMessages: RunMessage[],
): PrepareOnlyBreach | null {
  const messages = allMessages.filter(
    (message) => !(message.type && ECHO_EVENT_TYPE.test(message.type)),
  );
  for (const message of messages) {
    const text = messageText(message);
    if (text.toLowerCase().includes(GUARD_BLOCK_MARKER)) {
      return {
        kind: "submission_attempt_blocked",
        evidence: text.slice(0, 500),
      };
    }
  }
  for (const message of messages) {
    // Only the agent's own narration, not tool payloads (which can contain
    // page text such as "Submission complete" help copy).
    const summary = message.summary ?? "";
    if (summary && isLikelySubmittedOutput(summary)) {
      return { kind: "submission_reported", evidence: summary.slice(0, 500) };
    }
  }
  return null;
}
