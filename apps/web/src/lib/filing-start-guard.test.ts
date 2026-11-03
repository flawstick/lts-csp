import { describe, expect, it } from "vitest";
import { getFilingStartBlocker } from "./filing-start-guard";

const guernseyReturn = {
  status: "pending",
  returnType: "economic_substance",
  jurisdiction: { code: "GG" },
  readyForSubmissionAt: null,
  metadata: null,
  substanceForm: { managerSignOff: "J Smith", managerSignOffDate: "2026-11-01" },
};

describe("getFilingStartBlocker", () => {
  it("blocks submission until the client signs off", () => {
    expect(
      getFilingStartBlocker({
        taxReturn: guernseyReturn,
        submissionMode: "submit_and_capture_pdf",
      }),
    ).toContain("not signed off");
  });

  it("blocks submission until the manager signs off, even after client signoff", () => {
    expect(
      getFilingStartBlocker({
        taxReturn: {
          ...guernseyReturn,
          readyForSubmissionAt: new Date(),
          substanceForm: { managerSignOff: null, managerSignOffDate: null },
        },
        submissionMode: "submit_and_capture_pdf",
      }),
    ).toContain("manager has not signed off");
  });

  it("allows preparing a draft before the manager signs off", () => {
    expect(
      getFilingStartBlocker({
        taxReturn: { ...guernseyReturn, substanceForm: null },
        submissionMode: "prepare_only",
      }),
    ).toBeNull();
  });

  it("allows preparing a draft for LTS review before signoff", () => {
    expect(
      getFilingStartBlocker({
        taxReturn: guernseyReturn,
        submissionMode: "prepare_only",
      }),
    ).toBeNull();
  });

  it("allows submission once signed off", () => {
    expect(
      getFilingStartBlocker({
        taxReturn: { ...guernseyReturn, readyForSubmissionAt: new Date() },
        submissionMode: "submit_and_capture_pdf",
      }),
    ).toBeNull();
  });

  it("blocks submission while financial figures still need GBP conversion", () => {
    expect(
      getFilingStartBlocker({
        taxReturn: {
          ...guernseyReturn,
          readyForSubmissionAt: new Date(),
          metadata: {
            financialFigures: {
              currency: "USD",
              gbpStated: false,
              gbpConfirmedAt: null,
            },
          },
        },
        submissionMode: "submit_and_capture_pdf",
      }),
    ).toContain("GBP");
  });

  it("refuses to submit a return that is already filed", () => {
    expect(
      getFilingStartBlocker({
        taxReturn: {
          ...guernseyReturn,
          status: "completed",
          readyForSubmissionAt: new Date(),
        },
        submissionMode: "submit_and_capture_pdf",
      }),
    ).toContain("already completed");
  });
});
