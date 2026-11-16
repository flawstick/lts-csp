export type OrgPortalContactInfoSettings = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type ResolvedOrgPortalContactInfo = {
  name: string;
  email: string;
  phone: string;
};

export const DEFAULT_PORTAL_CONTACT_INFO: ResolvedOrgPortalContactInfo = {
  name: "Jonny Woodgate",
  email: "taxenquiries@lts-tax.com",
  phone: "+44 1481 755862",
};


function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeContactField(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function sanitizeOrgPortalContactInfoSettings(
  value: Partial<OrgPortalContactInfoSettings> | null | undefined,
): OrgPortalContactInfoSettings {
  return {
    name: normalizeContactField(value?.name),
    email: normalizeContactField(value?.email)?.toLowerCase() ?? null,
    phone: normalizeContactField(value?.phone),
  };
}

export function parseOrgPortalContactInfoSettings(
  settings: unknown,
): OrgPortalContactInfoSettings {
  if (!isRecord(settings) || !isRecord(settings.portalContactInfo)) {
    return sanitizeOrgPortalContactInfoSettings(null);
  }

  const portalContactInfo = settings.portalContactInfo;

  return sanitizeOrgPortalContactInfoSettings({
    name:
      typeof portalContactInfo.name === "string" ? portalContactInfo.name : null,
    email:
      typeof portalContactInfo.email === "string"
        ? portalContactInfo.email
        : null,
    phone:
      typeof portalContactInfo.phone === "string"
        ? portalContactInfo.phone
        : null,
  });
}

export function resolveOrgPortalContactInfo(
  settings: unknown,
): ResolvedOrgPortalContactInfo {
  const configured = parseOrgPortalContactInfoSettings(settings);

  return {
    name: configured.name ?? DEFAULT_PORTAL_CONTACT_INFO.name,
    email: configured.email ?? DEFAULT_PORTAL_CONTACT_INFO.email,
    phone: configured.phone ?? DEFAULT_PORTAL_CONTACT_INFO.phone,
  };
}

export function mergeOrgPortalContactInfoSettings(
  settings: Record<string, unknown> | null | undefined,
  contactInfo: Partial<OrgPortalContactInfoSettings> | null | undefined,
) {
  const nextSettings = isRecord(settings) ? { ...settings } : {};
  nextSettings.portalContactInfo =
    sanitizeOrgPortalContactInfoSettings(contactInfo);
  return nextSettings;
}

export type GuernseyFilingContactResolution =
  | { ok: true; contact: { name: string; email: string; phone: string | null } }
  | { ok: false; missing: Array<"name" | "email">; invalid: Array<"email"> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Contact entered on the Guernsey Tax Portal's final contact step. It must be
 * the organisation's (e.g. NSM's) explicitly configured contact. Unlike
 * `resolveOrgPortalContactInfo`, there is NO fallback to the LTS default or to
 * the person launching the run: a missing name or email fails closed so the
 * filing never carries invented or personal contact details. Phone is
 * optional here; the agent is told to stop if the portal requires it.
 */
export function resolveGuernseyFilingContactInfo(
  settings: unknown,
): GuernseyFilingContactResolution {
  const configured = parseOrgPortalContactInfoSettings(settings);
  const missing: Array<"name" | "email"> = [];
  const invalid: Array<"email"> = [];
  if (!configured.name) missing.push("name");
  if (!configured.email) missing.push("email");
  else if (!EMAIL_PATTERN.test(configured.email)) invalid.push("email");

  if (missing.length || invalid.length || !configured.name || !configured.email) {
    return { ok: false, missing, invalid };
  }
  return {
    ok: true,
    contact: {
      name: configured.name,
      email: configured.email,
      phone: configured.phone,
    },
  };
}

export function describeFilingContactProblem(
  resolution: Extract<GuernseyFilingContactResolution, { ok: false }>,
): string {
  const parts = [
    ...resolution.missing.map((field) => `missing contact ${field}`),
    ...resolution.invalid.map((field) => `invalid contact ${field}`),
  ];
  return `Organisation filing contact is not configured (${parts.join(", ")}). "Submit return" needs the organisation's portal contact name and email set first. "Prepare only" can still draft the return and will stop at the contact step for a person.`;
}
