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
  phone: "01481 755862",
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
