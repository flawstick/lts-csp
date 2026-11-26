import { describe, expect, it } from "vitest";
import { buildSubmissionSignoffRevocation } from "@repo/database/return-readiness";
import { getFilingStartBlocker, getPossibleFilingEvidence } from "./filing-start-guard";

const guernseyReturn = {
  status: "pending",
  returnType: "economic_substance",
  jurisdiction: { code: "GG" },
  readyForSubmissionAt: null,
  metadata: null,
  substanceForm: {
    managerSignOff: "J Smith",
    managerSignOffDate: "2026-11-01",
    noticeOfAssessment: "Yes" as string | null,
  },
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
          substanceForm: {
            managerSignOff: null,
            managerSignOffDate: null,
          },
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

  describe("notice of assessment answer", () => {
    const signedOffWith = (noticeOfAssessment: string | null) => ({
      ...guernseyReturn,
      readyForSubmissionAt: new Date(),
      substanceForm: { ...guernseyReturn.substanceForm, noticeOfAssessment },
    });

    it.each([null, "", "maybe", "Yes", "No"])(
      "never blocks a signed-off submission (%j; unset means Yes)",
      (noticeOfAssessment) => {
        // Both submit operations (full submit and Submit prepared return)
        // start in submit_and_capture_pdf mode and go through this check.
        expect(
          getFilingStartBlocker({
            taxReturn: signedOffWith(noticeOfAssessment),
            submissionMode: "submit_and_capture_pdf",
          }),
        ).toBeNull();
      },
    );

    it("does not block a submission whose form has no answer field at all", () => {
      expect(
        getFilingStartBlocker({
          taxReturn: {
            ...guernseyReturn,
            readyForSubmissionAt: new Date(),
            substanceForm: { managerSignOff: "J Smith", managerSignOffDate: "2026-11-01" },
          },
          submissionMode: "submit_and_capture_pdf",
        }),
      ).toBeNull();
    });
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

  describe("operating expenditure for in-scope entities", () => {
    const signedOffInScope = {
      ...guernseyReturn,
      readyForSubmissionAt: new Date(),
      substanceForm: {
        ...guernseyReturn.substanceForm,
        certificateType: "Certificate 3",
        relevantActivity: "Banking",
        adequacyExpenditureDetails: null as string | null,
      },
    };

    it("blocks submission when it is missing, even after signoff", () => {
      expect(
        getFilingStartBlocker({
          taxReturn: signedOffInScope,
          submissionMode: "submit_and_capture_pdf",
        }),
      ).toContain("Operating Expenditure Relating to the Activity is required");
    });

    it("allows submission with zero", () => {
      expect(
        getFilingStartBlocker({
          taxReturn: {
            ...signedOffInScope,
            substanceForm: {
              ...signedOffInScope.substanceForm,
              adequacyExpenditureDetails: "0",
            },
          },
          submissionMode: "submit_and_capture_pdf",
        }),
      ).toBeNull();
    });

    it("does not block out-of-scope entities", () => {
      expect(
        getFilingStartBlocker({
          taxReturn: {
            ...signedOffInScope,
            substanceForm: {
              ...signedOffInScope.substanceForm,
              relevantActivity: "None of the above",
            },
          },
          submissionMode: "submit_and_capture_pdf",
        }),
      ).toBeNull();
    });

    it("still allows preparing a draft while it is missing", () => {
      expect(
        getFilingStartBlocker({
          taxReturn: signedOffInScope,
          submissionMode: "prepare_only",
        }),
      ).toBeNull();
    });
  });
});

describe("no resubmission of a possibly filed return", () => {
  const signedOff = {
    ...guernseyReturn,
    status: "review_required",
    readyForSubmissionAt: new Date(),
    substanceForm: {
      ...guernseyReturn.substanceForm,
      certificateType: "Certificate 2",
      relevantActivity: "None of the above",
    },
  };

  it("allows a first submission", () => {
    expect(
      getFilingStartBlocker({ taxReturn: signedOff, submissionMode: "submit_and_capture_pdf" }),
    ).toBeNull();
  });

  it.each([
    ["an attached filed-return PDF", { files: [{ url: "u", role: "filed_return_pdf" }] }],
    ["a captured receipt", { metadata: { filedReturnPdf: { status: "uploaded" } } }],
    ["a receipt gate", { metadata: { filedReturnPdf: { status: "missing", receiptGate: "receipt_missing" } } }],
    [
      "a prepare-only run that reported a submission",
      { metadata: { filedReturnPdf: { status: "missing", receiptGate: "prepare_only_submission_reported" } } },
    ],
  ])("blocks submission after %s", (_label, extra) => {
    const taxReturn = { ...signedOff, ...extra };
    expect(getPossibleFilingEvidence(taxReturn)).not.toBeNull();
    expect(
      getFilingStartBlocker({ taxReturn, submissionMode: "submit_and_capture_pdf" }),
    ).toContain("may already have filed");
    // Preparing a draft never files, so it stays allowed.
    expect(getFilingStartBlocker({ taxReturn, submissionMode: "prepare_only" })).toBeNull();
  });

  it("does not block after a failed run with no filing evidence", () => {
    expect(
      getPossibleFilingEvidence({
        metadata: { filedReturnPdf: { status: "missing", receiptGate: null } },
      }),
    ).toBeNull();
  });
});

describe("getFilingStartBlocker after signed-off data changes", () => {
  const signedOff = {
    ...guernseyReturn,
    status: "review_required",
    readyForSubmissionAt: new Date("2026-11-05T09:00:00Z"),
    readyForSubmissionBy: "signatory-1",
  };
  const edited = {
    ...signedOff,
    ...buildSubmissionSignoffRevocation({
      taxReturn: signedOff,
      changedFields: ["adequacyExpenditureDetails"],
      actor: { source: "web" },
      now: new Date("2026-11-12T14:00:00Z"),
    })!,
  };

  it("blocks final submission until the signatory approves the changed data", () => {
    expect(
      getFilingStartBlocker({
        taxReturn: edited,
        submissionMode: "submit_and_capture_pdf",
      }),
    ).toContain("Edits made after signoff require a new signoff");
  });

  it("still lets LTS prepare a draft without the fresh signoff", () => {
    expect(
      getFilingStartBlocker({ taxReturn: edited, submissionMode: "prepare_only" }),
    ).toBeNull();
  });

  it("allows final submission once the signatory approves again", () => {
    expect(
      getFilingStartBlocker({
        taxReturn: { ...edited, readyForSubmissionAt: new Date("2026-11-16T10:00:00Z") },
        submissionMode: "submit_and_capture_pdf",
      }),
    ).toBeNull();
  });
});
