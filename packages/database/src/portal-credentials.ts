import crypto from "node:crypto";

export interface PortalCredentials {
  username?: string;
  password?: string;
}

const ENCRYPTION_PREFIX = "enc-v1";

function normalizeCredentials(
  value: PortalCredentials | null | undefined,
): PortalCredentials | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const username =
    typeof value.username === "string" ? value.username.trim() : undefined;
  const password =
    typeof value.password === "string" ? value.password.trim() : undefined;

  if (!username && !password) {
    return null;
  }

  return {
    username,
    password,
  };
}

function resolveEncryptionKey(secret?: string) {
  const source =
    secret?.trim() || process.env.PORTAL_CREDENTIALS_ENCRYPTION_KEY?.trim();

  if (!source) {
    throw new Error("PORTAL_CREDENTIALS_ENCRYPTION_KEY is not set");
  }

  return crypto.createHash("sha256").update(source).digest();
}

function decodeLegacy(encrypted: string): PortalCredentials | null {
  try {
    const parsed = JSON.parse(Buffer.from(encrypted, "base64").toString("utf8"));
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return normalizeCredentials(parsed as PortalCredentials);
  } catch {
    return null;
  }
}

export function encryptPortalCredentials(
  credentials: PortalCredentials | null | undefined,
  secret?: string,
): string | null {
  const normalized = normalizeCredentials(credentials);
  if (!normalized) {
    return null;
  }

  const key = resolveEncryptionKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(normalized), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptPortalCredentials(
  encrypted: string | null | undefined,
  secret?: string,
): PortalCredentials | null {
  if (!encrypted) {
    return null;
  }

  if (!encrypted.startsWith(`${ENCRYPTION_PREFIX}:`)) {
    return decodeLegacy(encrypted);
  }

  const [, ivEncoded, authTagEncoded, ciphertextEncoded] = encrypted.split(":");
  if (!ivEncoded || !authTagEncoded || !ciphertextEncoded) {
    return null;
  }

  try {
    const key = resolveEncryptionKey(secret);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivEncoded, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authTagEncoded, "base64url"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    const parsed = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return normalizeCredentials(parsed as PortalCredentials);
  } catch {
    return null;
  }
}
