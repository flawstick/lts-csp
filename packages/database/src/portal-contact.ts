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

/**
 * Contact entered on the Guernsey Tax Portal's final contact step. LTS files
 * as agent, so this is always the LTS contact. It is deliberately separate from
 * an organisation's client portal contact settings, which CSPs may point at
 * their own staff (e.g. a signatory) for client-facing communication.
 */
export const GUERNSEY_FILING_CONTACT_INFO: ResolvedOrgPortalContactInfo =
  DEFAULT_PORTAL_CONTACT_INFO;

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
