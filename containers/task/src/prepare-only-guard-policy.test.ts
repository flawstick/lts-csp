import { describe, expect, it } from "vitest";

import {
  detectPrepareOnlyBreach,
  evaluatePrepareOnlyGuard,
  isPrepareOnlyGuardRequired,
  prepareOnlyGuardFailure,
} from "./prepare-only-guard";

describe("evaluatePrepareOnlyGuard", () => {
  it("does not apply to submit mode", () => {
    expect(
      evaluatePrepareOnlyGuard({
        submissionMode: "submit_and_capture_pdf",
        configuredExtensionId: "ext",
        installedExtensionIds: [],
      }),
    ).toBe("not_applicable");
  });

  it("reports honestly when no guard is configured", () => {
    expect(
      evaluatePrepareOnlyGuard({
        submissionMode: "prepare_only",
        configuredExtensionId: " ",
        installedExtensionIds: ["other"],
      }),
    ).toBe("not_configured");
  });

  it("only claims enforcement once the browser reports the extension", () => {
    const base = {
      submissionMode: "prepare_only" as const,
      configuredExtensionId: "guard-1",
    };
    expect(
      evaluatePrepareOnlyGuard({ ...base, installedExtensionIds: null }),
    ).toBe("requested");
    expect(
      evaluatePrepareOnlyGuard({ ...base, installedExtensionIds: ["guard-1"] }),
    ).toBe("verified_installed");
    expect(
      evaluatePrepareOnlyGuard({ ...base, installedExtensionIds: ["x"] }),
    ).toBe("missing_from_browser");
  });
});

describe("detectPrepareOnlyBreach", () => {
  it("flags a blocked submission attempt seen in tool output", () => {
    expect(
      detectPrepareOnlyBreach([
        { summary: "click", data: { result: "Banner: LTS PREPARE-ONLY GUARD: final submission is blocked" } },
      ]),
    ).toMatchObject({ kind: "submission_attempt_blocked" });
  });

  it("flags an agent reporting a filed return", () => {
    expect(
      detectPrepareOnlyBreach([
        { summary: "The return was submitted successfully; downloading the receipt." },
      ]),
    ).toMatchObject({ kind: "submission_reported" });
  });

  it("ignores events that echo the task prompt", () => {
    expect(
      detectPrepareOnlyBreach([
        { type: "user.message", summary: "Wait for the post-submission confirmation page" },
        { type: "run.started", data: { task: "submitted successfully" } },
      ]),
    ).toBeNull();
  });

  it("ignores ordinary preparation and negated narration", () => {
    expect(
      detectPrepareOnlyBreach([
        { summary: "Filled the employees section and clicked Save and continue." },
        { summary: "I have not submitted successfully; stopping on the summary page." },
        { summary: "navigate", data: { pageText: "Submission complete help" } },
      ]),
    ).toBeNull();
  });
});

describe("detectPrepareOnlyBreach on the declaration step of a prepare run", () => {
  it("does not treat answering the notice of assessment and ticking the boxes as a submission", () => {
    expect(
      detectPrepareOnlyBreach([
        { summary: "Clicked Continue on the review summary; now on reviewAndSubmit/declaration." },
        { summary: "Selected 'Yes' for 'Please indicate if you wish to receive a notice of assessment'." },
        { summary: "Ticked 'I declare that the information given in this return is correct and complete'." },
        {
          summary: "Ticked 'I confirm that I am authorised to submit this return on behalf of the company'.",
          data: { pageText: "Declaration ... Complete submission to Revenue Service" },
        },
        {
          summary:
            "All three declaration confirmations are ticked and the 'Complete submission to Revenue Service' button is now enabled. Not clicking it: this is a prepare-only run.",
        },
        {
          summary:
            "READY_FOR_MANUAL_SUBMISSION: The return is prepared on the final declaration page. Notice of assessment: Yes. All 3 declaration boxes are ticked. The only remaining action is 'Complete submission to Revenue Service', which is enabled and was not clicked.",
        },
      ]),
    ).toBeNull();
  });

  it("still cancels when the guard blocked the final button on the declaration page", () => {
    expect(
      detectPrepareOnlyBreach([
        { summary: "Ticked all three declaration boxes." },
        {
          summary: "click 'Complete submission to Revenue Service'",
          data: { result: "LTS PREPARE-ONLY GUARD: final submission is blocked in this run." },
        },
      ]),
    ).toMatchObject({ kind: "submission_attempt_blocked" });
  });
});

describe("prepare-only guard fail-closed policy", () => {
  it("requires the guard unless explicitly opted out", () => {
    expect(isPrepareOnlyGuardRequired(undefined)).toBe(true);
    expect(isPrepareOnlyGuardRequired("")).toBe(true);
    expect(isPrepareOnlyGuardRequired("true")).toBe(true);
    expect(isPrepareOnlyGuardRequired("False")).toBe(false);
    expect(isPrepareOnlyGuardRequired("0")).toBe(false);
  });

  it("refuses unconfigured prepare-only runs when required", () => {
    expect(
      prepareOnlyGuardFailure({ status: "not_configured", required: true }),
    ).toMatch(/not configured/);
    expect(
      prepareOnlyGuardFailure({ status: "not_configured", required: false }),
    ).toBeNull();
  });

  it("stops runs whose browser lacks the extension even when opted out", () => {
    expect(
      prepareOnlyGuardFailure({ status: "missing_from_browser", required: false }),
    ).toMatch(/not installed/);
  });

  it("stops runs that cannot be verified in time", () => {
    expect(
      prepareOnlyGuardFailure({
        status: "requested",
        required: true,
        elapsedSinceDispatchMs: 1_000,
        timeoutMs: 5_000,
      }),
    ).toBeNull();
    expect(
      prepareOnlyGuardFailure({
        status: "requested",
        required: true,
        elapsedSinceDispatchMs: 6_000,
        timeoutMs: 5_000,
      }),
    ).toMatch(/could not be verified/);
    expect(
      prepareOnlyGuardFailure({ status: "verified_installed", required: true }),
    ).toBeNull();
    expect(
      prepareOnlyGuardFailure({ status: "not_applicable", required: true }),
    ).toBeNull();
  });
});
