import { describe, expect, it } from "vitest";

import { DEFAULT_PORTAL_CONTACT_INFO } from "@repo/database";

import { decideFilingContactStartup } from "./filing-contact-policy";

const configured = {
  portalContactInfo: {
    name: "NSM Filings Team",
    email: "filings@nsm.example",
    phone: null,
  },
};
const missingName = {
  portalContactInfo: { name: null, email: "filings@nsm.example", phone: null },
};
const invalidEmail = {
  portalContactInfo: { name: "NSM Filings Team", email: "not-an-email" },
};

describe("decideFilingContactStartup", () => {
  it("lets a prepare-only run start without a contact (the reported Riversong case)", () => {
    const decision = decideFilingContactStartup("prepare_only", missingName);

    expect(decision.kind).toBe("prepare_without_contact");
    if (decision.kind === "prepare_without_contact") {
      expect(decision.problem).toContain("missing contact name");
    }
  });

  it("lets prepare-only start with no settings, an empty contact, or an invalid email", () => {
    for (const settings of [null, undefined, {}, invalidEmail]) {
      expect(decideFilingContactStartup("prepare_only", settings).kind).toBe(
        "prepare_without_contact",
      );
    }
  });

  it("refuses to start a submit run without a valid configured contact", () => {
    for (const settings of [null, {}, missingName, invalidEmail]) {
      const decision = decideFilingContactStartup(
        "submit_and_capture_pdf",
        settings,
      );
      expect(decision.kind).toBe("refuse");
      if (decision.kind === "refuse") {
        expect(decision.error).toContain(
          "Organisation filing contact is not configured",
        );
        expect(decision.error).toContain("Submit return");
      }
    }
  });

  it("uses the organisation's configured contact in both modes", () => {
    for (const mode of ["prepare_only", "submit_and_capture_pdf"] as const) {
      expect(decideFilingContactStartup(mode, configured)).toEqual({
        kind: "configured",
        contact: {
          name: "NSM Filings Team",
          email: "filings@nsm.example",
          phone: null,
        },
      });
    }
  });

  it("never falls back to the LTS default or any personal contact", () => {
    for (const mode of ["prepare_only", "submit_and_capture_pdf"] as const) {
      const serialized = JSON.stringify(decideFilingContactStartup(mode, {}));
      expect(serialized).not.toContain(DEFAULT_PORTAL_CONTACT_INFO.name);
      expect(serialized).not.toContain(DEFAULT_PORTAL_CONTACT_INFO.email);
      expect(serialized).not.toContain(DEFAULT_PORTAL_CONTACT_INFO.phone);
    }
  });
});
