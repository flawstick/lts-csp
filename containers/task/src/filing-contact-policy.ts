/**
 * Startup policy for the Guernsey filing contact (the contact name/email the
 * GRS portal asks for on its final contact step). Pure so it can be unit
 * tested without the worker entrypoint.
 *
 * - The contact is only ever the organisation's explicitly configured contact
 *   (`resolveGuernseyFilingContactInfo`): never the LTS default, never the
 *   person launching the run, never anyone shown on the portal.
 * - Submit mode refuses to start without a valid configured contact, so a
 *   filed return can never carry an invented or pre-filled contact.
 * - Prepare-only may draft without one. The agent gets no contact values at
 *   all (no partial name-only/email-only fill), leaves the portal's contact
 *   fields untouched and stops at the contact step for a person.
 */

import {
  describeFilingContactProblem,
  resolveGuernseyFilingContactInfo,
} from "@repo/database";

import type { SubmissionMode } from "./run-outcome";

export type FilingContact = {
  name: string;
  email: string;
  phone: string | null;
};

export type FilingContactStartupDecision =
  | { kind: "configured"; contact: FilingContact }
  | { kind: "prepare_without_contact"; problem: string }
  | { kind: "refuse"; error: string };

export function decideFilingContactStartup(
  submissionMode: SubmissionMode,
  orgSettings: unknown,
): FilingContactStartupDecision {
  const resolution = resolveGuernseyFilingContactInfo(orgSettings);
  if (resolution.ok) {
    return { kind: "configured", contact: resolution.contact };
  }

  const problem = describeFilingContactProblem(resolution);
  if (submissionMode === "prepare_only") {
    return { kind: "prepare_without_contact", problem };
  }
  return { kind: "refuse", error: problem };
}
