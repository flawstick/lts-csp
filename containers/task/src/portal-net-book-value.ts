/**
 * Guernsey ESR "Net Book Value" as entered on the portal.
 *
 * The GRS field asks for the net book value of tangible assets. AI extraction
 * has historically saved the company's net assets / total equity (or net
 * liabilities) into this form field, which is a different figure. So:
 *
 * - a saved figure is typed only when a person entered it on the form
 *   (`person_entered`); an extracted or unverified figure is never typed or
 *   zeroed, and the agent never works one out from the accounts (e.g. from
 *   investment property) — a reviewer is asked instead;
 * - LTS portal-entry policy (requested by LTS; not an independently verified
 *   GRS rule): a verified negative Net Book Value is entered as 0. That is a
 *   field-only candidate, never written back to the form, and a draft holding
 *   it cannot be submitted until a person confirms the figure on the form.
 *
 * No other field (Total Profit included) is affected.
 */

export type NetBookValueProvenance =
  /** A person saved this figure on the form after the latest extraction. */
  | "person_entered"
  /** Written by AI extraction, which reads net assets / total equity. */
  | "extracted_net_assets"
  /** No record of where it came from. */
  | "unknown";

export type NetBookValueReviewReason =
  | "unparseable"
  | "source_net_assets"
  | "source_unverified";

export type PortalNetBookValue =
  | { kind: "missing" }
  /** Person-entered, clear, non-negative: entered as saved. */
  | { kind: "as_saved"; portalValue: string }
  /** Person-entered, clear, negative: 0 is a field-only, unconfirmed candidate. */
  | { kind: "negative_zero_candidate"; portalValue: "0" }
  /** Not usable as is: a reviewer must say what to enter. */
  | { kind: "needs_review"; reason: NetBookValueReviewReason };

/**
 * What a prepared draft holds for Net Book Value; recorded on the job and
 * checked before "Submit prepared return".
 */
export type PortalNetBookValueStatus =
  | "missing"
  | "as_saved"
  | "reviewer_confirmed"
  /** 0 entered in place of a verified negative figure; not yet confirmed. */
  | "zero_unconfirmed"
  /** Still waiting for a reviewer; nothing was typed. */
  | "unresolved";

export type ParsedAmount = {
  negative: boolean;
  /** The number without currency, sign or thousands separators. */
  digits: string;
};

// Plain digits, or digits with comma thousands separators; optional decimals.
const NUMBER_PATTERN = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const MINUS = /^[-−]/;

/**
 * Strictly parse one amount: optional £, one leading minus (ASCII or U+2212)
 * or accounting parentheses, then a plain number. Anything else (letters,
 * trailing minus, two signs, spaces inside the number, other currencies)
 * returns null.
 */
export function parseStrictAmount(raw: string): ParsedAmount | null {
  let text = raw.trim();
  if (!text) return null;

  let negative = false;
  const parenthesised = /^\((.*)\)$/.exec(text);
  if (parenthesised) {
    negative = true;
    text = parenthesised[1]!.trim();
  }

  let signs = 0;
  let currency = 0;
  for (;;) {
    if (MINUS.test(text)) {
      signs += 1;
      text = text.slice(1).trimStart();
    } else if (text.startsWith("£")) {
      currency += 1;
      text = text.slice(1).trimStart();
    } else {
      break;
    }
  }
  if (currency > 1 || signs > 1 || (signs === 1 && negative)) return null;
  if (signs === 1) negative = true;
  if (!NUMBER_PATTERN.test(text)) return null;

  const digits = text.replace(/,/g, "");
  if (!Number.isFinite(Number(digits))) return null;
  // "-0" is zero, not a negative figure.
  if (Number(digits) === 0) negative = false;
  return { negative, digits };
}

export function decidePortalNetBookValue(
  saved: string | null | undefined,
  provenance: NetBookValueProvenance,
): PortalNetBookValue {
  if (saved === null || saved === undefined || saved.trim() === "") {
    return { kind: "missing" };
  }
  const parsed = parseStrictAmount(saved);
  if (!parsed) return { kind: "needs_review", reason: "unparseable" };
  if (provenance === "extracted_net_assets") {
    return { kind: "needs_review", reason: "source_net_assets" };
  }
  if (provenance !== "person_entered") {
    return { kind: "needs_review", reason: "source_unverified" };
  }
  if (parsed.negative) {
    return { kind: "negative_zero_candidate", portalValue: "0" };
  }
  return { kind: "as_saved", portalValue: parsed.digits };
}

/** Status before any reviewer reply. */
export function initialNetBookValueStatus(
  decision: PortalNetBookValue,
): PortalNetBookValueStatus {
  switch (decision.kind) {
    case "missing":
      return "missing";
    case "as_saved":
      return "as_saved";
    case "negative_zero_candidate":
      return "zero_unconfirmed";
    case "needs_review":
      return "unresolved";
  }
}

export type ReviewerNetBookValue = {
  portalValue: string;
  /** The reviewer gave a negative figure; 0 is entered, unconfirmed. */
  negativeZeroed: boolean;
};

/**
 * The portal value from a reviewer's reply to the Net Book Value question.
 * The whole reply must be one clear amount; a negative answer becomes the
 * field-only 0 candidate. Returns null otherwise, so the value is never taken
 * from free text.
 */
export function portalNetBookValueFromReviewerReply(
  reply: string,
): ReviewerNetBookValue | null {
  const parsed = parseStrictAmount(reply);
  if (!parsed) return null;
  if (parsed.negative) return { portalValue: "0", negativeZeroed: true };
  return { portalValue: parsed.digits, negativeZeroed: false };
}

/** Marker the agent includes in its question, so the worker can match the reply. */
export const NET_BOOK_VALUE_QUESTION_MARKER = "NET_BOOK_VALUE_CHECK";

/** After this many unclear replies the agent stops asking (draft stays blocked). */
export const MAX_UNCLEAR_NET_BOOK_VALUE_REPLIES = 2;

export function isNetBookValueQuestion(text: string | null | undefined) {
  if (!text) return false;
  return text.includes(NET_BOOK_VALUE_QUESTION_MARKER) || /net book value/i.test(text);
}

/** Safe to quote the saved value inside the prompt's question text. */
export function quoteSavedValueForPrompt(saved: string): string {
  return saved
    .replace(/[\u0000-\u001F\u007F"`<>\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

/** Provenance from the return's financial-figures metadata. */
export function netBookValueProvenanceFromMetadata(
  figures: {
    sourceNetBookValue: string | null;
    extractedAt: string | null;
    netBookValueEnteredAt?: string | null;
  } | null,
): NetBookValueProvenance {
  if (figures?.netBookValueEnteredAt) return "person_entered";
  if (figures?.extractedAt) return "extracted_net_assets";
  return "unknown";
}
