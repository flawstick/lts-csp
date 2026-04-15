import crypto from "crypto";

export function normalizeClientEntityName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function hashClientAccessToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
