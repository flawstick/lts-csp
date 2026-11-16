import { describe, expect, it } from "vitest";

import {
  DEFAULT_PORTAL_CONTACT_INFO,
  describeFilingContactProblem,
  resolveGuernseyFilingContactInfo,
} from "./portal-contact";

describe("resolveGuernseyFilingContactInfo", () => {
  it("uses the organisation's explicitly configured contact", () => {
    const result = resolveGuernseyFilingContactInfo({
      portalContactInfo: {
        name: "  NSM Filings Team ",
        email: "Filings@NSM.example",
        phone: "+44 1481 000000",
      },
    });
    expect(result).toEqual({
      ok: true,
      contact: {
        name: "NSM Filings Team",
        email: "filings@nsm.example",
        phone: "+44 1481 000000",
      },
    });
  });

  it("never falls back to the LTS default contact", () => {
    const result = resolveGuernseyFilingContactInfo({});
    expect(result).toEqual({ ok: false, missing: ["name", "email"], invalid: [] });
    expect(JSON.stringify(result)).not.toContain(DEFAULT_PORTAL_CONTACT_INFO.email);
    expect(resolveGuernseyFilingContactInfo(null).ok).toBe(false);
  });

  it("fails closed on a partial or invalid contact", () => {
    expect(
      resolveGuernseyFilingContactInfo({
        portalContactInfo: { name: "NSM", email: "  " },
      }),
    ).toEqual({ ok: false, missing: ["email"], invalid: [] });
    const invalid = resolveGuernseyFilingContactInfo({
      portalContactInfo: { name: "NSM", email: "not-an-email" },
    });
    expect(invalid).toEqual({ ok: false, missing: [], invalid: ["email"] });
    if (!invalid.ok) {
      expect(describeFilingContactProblem(invalid)).toContain("invalid contact email");
    }
  });

  it("allows a missing phone (agent stops if the portal requires one)", () => {
    expect(
      resolveGuernseyFilingContactInfo({
        portalContactInfo: { name: "NSM", email: "tax@nsm.example" },
      }),
    ).toMatchObject({ ok: true, contact: { phone: null } });
  });
});
