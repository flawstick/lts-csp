import crypto from "crypto";

export function normalizeClientEntityName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function hashClientAccessToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function sanitizeClientSecondaryEmails(
  values: Array<string | null | undefined> | null | undefined,
) {
  if (!values?.length) return [];

  const seen = new Set<string>();
  const emails: string[] = [];

  for (const value of values) {
    const email = value?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }

  return emails;
}

export function getClientAccessRecipientEmails(input: {
  primaryEmail?: string | null;
  secondaryEmails?: string[] | null;
  overrideEmail?: string | null;
}) {
  if (input.overrideEmail?.trim()) {
    return sanitizeClientSecondaryEmails([input.overrideEmail]);
  }

  return sanitizeClientSecondaryEmails([
    input.primaryEmail,
    ...(input.secondaryEmails ?? []),
  ]);
}
