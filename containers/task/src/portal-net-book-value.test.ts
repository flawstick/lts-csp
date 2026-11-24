import { describe, expect, it } from "vitest";
import {
  getNetBookValueSubmitBlocker,
  PORTAL_NET_BOOK_VALUE_KEY,
} from "@repo/database/prepared-draft";
import { extractAgentQuestionText } from "@repo/database/operator-messages";
import {
  buildNetBookValueQuestion,
  decidePortalNetBookValue,
  initialNetBookValueStatus,
  isNetBookValueQuestion,
  netBookValuePauseQuestion,
  netBookValueProvenanceFromMetadata,
  parseStrictAmount,
  portalNetBookValueFromReviewerReply,
  quoteSavedValueForPrompt,
} from "./portal-net-book-value";
import { buildSubstanceFormPrompt } from "./prompt-builder";

describe("parseStrictAmount", () => {
  it.each([
    ["12345", false, "12345"],
    ["12,345.67", false, "12345.67"],
    ["£12,345", false, "12345"],
    ["-2894", true, "2894"],
    ["−2894", true, "2894"],
    ["(2,894)", true, "2894"],
    ["(£2,894.50)", true, "2894.50"],
    ["-£2,894", true, "2894"],
    ["£-2,894", true, "2894"],
    ["-0", false, "0"],
    ["  0.00 ", false, "0.00"],
  ])("parses %j", (raw, negative, digits) => {
    expect(parseStrictAmount(raw)).toEqual({ negative, digits });
  });

  it.each([
    "-2894u2934",
    "2894-",
    "--2894",
    "(-2894)",
    "1,23,456",
    "12 345",
    "$12345",
    "USD 12345",
    "12345 GBP",
    "1234.",
    ".5",
    "abc",
    "",
    "-",
    "()",
  ])("rejects %j", (raw) => {
    expect(parseStrictAmount(raw)).toBeNull();
  });
});

describe("decidePortalNetBookValue", () => {
  it("never types or zeroes an extracted net assets / net liabilities figure", () => {
    expect(decidePortalNetBookValue("-2894", "extracted_net_assets")).toEqual({
      kind: "needs_review",
      reason: "source_net_assets",
    });
    expect(decidePortalNetBookValue("150000", "extracted_net_assets")).toEqual({
      kind: "needs_review",
      reason: "source_net_assets",
    });
  });

  it("asks when provenance is unknown, whatever the sign", () => {
    for (const value of ["-2894", "(2,894)", "12345"]) {
      expect(decidePortalNetBookValue(value, "unknown")).toEqual({
        kind: "needs_review",
        reason: "source_unverified",
      });
    }
  });

  it("routes a malformed value to review even when a person entered it", () => {
    expect(decidePortalNetBookValue("-2894u2934", "person_entered")).toEqual({
      kind: "needs_review",
      reason: "unparseable",
    });
  });

  it("enters a person-entered non-negative figure as saved (plain digits)", () => {
    expect(decidePortalNetBookValue("£12,345", "person_entered")).toEqual({
      kind: "as_saved",
      portalValue: "12345",
    });
    expect(decidePortalNetBookValue("0", "person_entered")).toEqual({
      kind: "as_saved",
      portalValue: "0",
    });
  });

  it("makes 0 only an unconfirmed candidate for a verified negative figure", () => {
    const decision = decidePortalNetBookValue("(2,894)", "person_entered");
    expect(decision).toEqual({
      kind: "negative_zero_candidate",
      portalValue: "0",
    });
    expect(initialNetBookValueStatus(decision)).toBe("zero_unconfirmed");
  });

  it("leaves a missing figure to the existing missing-field rules", () => {
    expect(decidePortalNetBookValue(null, "person_entered")).toEqual({
      kind: "missing",
    });
    expect(decidePortalNetBookValue("  ", "unknown")).toEqual({ kind: "missing" });
  });
});

describe("netBookValueProvenanceFromMetadata", () => {
  it("only a person's Net Book Value entry after extraction counts as verified", () => {
    expect(netBookValueProvenanceFromMetadata(null)).toBe("unknown");
    expect(
      netBookValueProvenanceFromMetadata({
        sourceNetBookValue: "-2894",
        extractedAt: "2026-11-01T00:00:00.000Z",
      }),
    ).toBe("extracted_net_assets");
    expect(
      netBookValueProvenanceFromMetadata({
        sourceNetBookValue: "-2894",
        extractedAt: "2026-11-01T00:00:00.000Z",
        netBookValueEnteredAt: "2026-11-02T00:00:00.000Z",
      }),
    ).toBe("person_entered");
  });
});

describe("reviewer replies", () => {
  it("accepts one clear amount only", () => {
    expect(portalNetBookValueFromReviewerReply(" 125,000 ")).toEqual({
      portalValue: "125000",
      negativeZeroed: false,
    });
    expect(portalNetBookValueFromReviewerReply("0")).toEqual({
      portalValue: "0",
      negativeZeroed: false,
    });
    expect(portalNetBookValueFromReviewerReply("(500)")).toEqual({
      portalValue: "0",
      negativeZeroed: true,
    });
    for (const reply of [
      "use 125000",
      "125000 and submit it",
      "same as investment property",
      "-2894u2934",
    ]) {
      expect(portalNetBookValueFromReviewerReply(reply)).toBeNull();
    }
  });

  it("matches the agent's Net Book Value question", () => {
    expect(
      isNetBookValueQuestion(
        'NET_BOOK_VALUE_CHECK: The saved Net Book Value "-2894" was read...',
      ),
    ).toBe(true);
    // As the reviewer sees it once the marker is stripped for display.
    expect(
      isNetBookValueQuestion(
        extractAgentQuestionText(
          '**REQUIRES_ATTENTION: NET_BOOK_VALUE_CHECK:** The saved Net Book Value "-2894" was read from the accounts as net assets.',
        ),
      ),
    ).toBe(true);
    expect(isNetBookValueQuestion("Please log in to continue")).toBe(false);
    expect(isNetBookValueQuestion(null)).toBe(false);
  });

  it("quotes saved values safely inside the prompt", () => {
    expect(quoteSavedValueForPrompt('-28"94`\n<x>')).toBe("-28 94 x");
    expect(quoteSavedValueForPrompt("9".repeat(100))).toHaveLength(64);
  });
});

describe("Net Book Value pause question", () => {
  const decision = decidePortalNetBookValue("-100", "extracted_net_assets");
  const question = buildNetBookValueQuestion("-100", "source_net_assets");
  const recap = [
    "Progress so far: logged in, completed Sections 1, 2 and 3, entered the preparer details.",
    "I left the Net Book Value field as the portal shows it.",
    "**REQUIRES_ATTENTION: NET_BOOK_VALUE_CHECK:** The saved value looks like net assets, so I cannot enter it.",
    "Next steps once answered: enter the value, complete Section 4 and continue to the review page.",
  ].join("\n\n");

  it("shows only the canonical question, however long the agent's output", () => {
    const text = netBookValuePauseQuestion({
      output: recap,
      decision,
      savedValue: "-100",
    });
    expect(text).toBe(question);
    expect(text).not.toContain("Progress so far");
    expect(text).not.toContain("Next steps");
    expect(text!.length).toBeLessThan(250);
    // Still matched as the Net Book Value question when the reviewer replies.
    expect(isNetBookValueQuestion(text)).toBe(true);
  });

  it("is the same question the fill prompt tells the agent to ask", () => {
    const prompt = promptFor(
      { netBookValue: "-100" },
      { decision },
    );
    expect(prompt).toContain(`REQUIRES_ATTENTION: NET_BOOK_VALUE_CHECK:`);
    expect(prompt).toContain(question);
    expect(prompt).toContain("no summary of the steps or sections you completed");
  });

  it("leaves other pauses to the agent's own words", () => {
    expect(
      netBookValuePauseQuestion({
        output: "**REQUIRES_ATTENTION:** Which relevant activity applies?",
        decision,
        savedValue: "-100",
      }),
    ).toBeNull();
    expect(
      netBookValuePauseQuestion({
        output: recap,
        decision: decidePortalNetBookValue("100", "person_entered"),
        savedValue: "100",
      }),
    ).toBeNull();
    expect(
      netBookValuePauseQuestion({ output: recap, decision: null, savedValue: "-100" }),
    ).toBeNull();
  });
});

describe("Submit prepared blocker", () => {
  it.each([
    ["unresolved", "reviewer to confirm"],
    ["zero_unconfirmed", "in place of a negative figure"],
  ])("blocks a draft whose Net Book Value is %s", (status, text) => {
    expect(
      getNetBookValueSubmitBlocker({ [PORTAL_NET_BOOK_VALUE_KEY]: { status } }),
    ).toContain(text);
  });

  it.each(["as_saved", "reviewer_confirmed", "missing", undefined])(
    "allows %s",
    (status) => {
      expect(
        getNetBookValueSubmitBlocker(
          status ? { [PORTAL_NET_BOOK_VALUE_KEY]: { status } } : {},
        ),
      ).toBeNull();
    },
  );
});

const taxReturn = {
  entityName: "Example Holdings Limited",
  taxYear: 2025,
  link: "https://my.gov.gg/revenue/case/example/process",
  jurisdiction: { portalUrl: "https://my.gov.gg" },
} as any;

function promptFor(
  form: Record<string, unknown>,
  netBookValue?: Parameters<typeof buildSubstanceFormPrompt>[0]["netBookValue"],
) {
  return buildSubstanceFormPrompt({
    taxReturn,
    substanceForm: {
      certificateType: "Certificate 3",
      relevantActivity: "Holding company",
      totalProfit: "-45000",
      ...form,
    } as any,
    portalUrl: "https://my.gov.gg",
    netBookValue,
  });
}

function lineFor(prompt: string, label: string) {
  return prompt.split("\n").find((line) => line.startsWith(`- ${label}:`));
}

describe("Net Book Value in the fill prompt", () => {
  it("asks the reviewer instead of typing an extracted net liabilities figure", () => {
    const prompt = promptFor(
      { netBookValue: "-2894" },
      { decision: decidePortalNetBookValue("-2894", "extracted_net_assets") },
    );
    expect(lineFor(prompt, "Net Book Value")).toBe(
      "- Net Book Value: [NEEDS REVIEWER ANSWER - do not enter a value]",
    );
    expect(prompt).toContain("REQUIRES_ATTENTION: NET_BOOK_VALUE_CHECK:");
    expect(prompt).toContain("net assets / net liabilities");
    expect(prompt).toContain("do not use net assets, net liabilities, total equity, investment property");
    expect(prompt).not.toContain('- Net Book Value: "0"');
    expect(prompt).not.toContain('- Net Book Value: "-2894"');
  });

  it("defaults to asking when no provenance is supplied", () => {
    const prompt = promptFor({ netBookValue: "12345" });
    expect(lineFor(prompt, "Net Book Value")).toContain("NEEDS REVIEWER ANSWER");
  });

  it("asks a short question for a malformed value and never zeroes it", () => {
    const prompt = promptFor(
      { netBookValue: "-2894u2934" },
      { decision: decidePortalNetBookValue("-2894u2934", "person_entered") },
    );
    expect(prompt).toContain('The saved Net Book Value "-2894u2934" is not a clear amount.');
    expect(prompt).not.toContain('- Net Book Value: "0"');
  });

  it("enters a reviewer-confirmed figure and keeps Total Profit signed", () => {
    const prompt = promptFor(
      { netBookValue: "-2894" },
      {
        decision: decidePortalNetBookValue("-2894", "extracted_net_assets"),
        reviewer: { portalValue: "1250000", negativeZeroed: false },
      },
    );
    expect(lineFor(prompt, "Net Book Value")).toBe('- Net Book Value: "1250000"');
    expect(lineFor(prompt, "Total Profit")).toBe('- Total Profit: "-45000"');
    expect(prompt).toContain("Do NOT replace Total Profit with 0");
    expect(prompt).not.toContain("NEEDS REVIEWER ANSWER");
  });

  it("enters 0 for a verified negative figure (field only)", () => {
    const prompt = promptFor(
      { netBookValue: "(2,894)" },
      { decision: decidePortalNetBookValue("(2,894)", "person_entered") },
    );
    expect(lineFor(prompt, "Net Book Value")).toBe('- Net Book Value: "0"');
    expect(prompt).toContain("never a negative Net Book Value");
    expect(lineFor(prompt, "Total Profit")).toBe('- Total Profit: "-45000"');
  });

  it("stops asking after repeated unclear replies", () => {
    const prompt = promptFor(
      { netBookValue: "-2894" },
      {
        decision: decidePortalNetBookValue("-2894", "unknown"),
        stopAsking: true,
      },
    );
    expect(lineFor(prompt, "Net Book Value")).toContain("NOT CONFIRMED");
    expect(prompt).toContain("do NOT ask about it again");
    expect(prompt).not.toContain("REQUIRES_ATTENTION: NET_BOOK_VALUE_CHECK:");
  });

  it("does not add Net Book Value to Certificate 2 prompts", () => {
    const prompt = promptFor({
      certificateType: "Certificate 2",
      netBookValue: "-2894",
    });
    expect(lineFor(prompt, "Net Book Value")).toBeUndefined();
  });
});
