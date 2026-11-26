/**
 * Local end-to-end harness configuration. Everything here points at
 * 127.0.0.1: a throwaway Postgres and Redis in Docker, a local Supabase Auth
 * stand-in, and the Next.js apps started by the harness. Nothing in this
 * harness may reach production, AWS, Vercel, Browser Use or the Guernsey
 * portal; `assertLocalOnly` enforces that before anything starts.
 */
import { createHash } from "node:crypto";
import path from "node:path";

function port(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a port`);
  return value;
}

export const REPO_ROOT = path.resolve(import.meta.dir, "../..");

export const E2E = {
  pgContainer: process.env.E2E_PG_CONTAINER ?? "lts-e2e-pg",
  redisContainer: process.env.E2E_REDIS_CONTAINER ?? "lts-e2e-redis",
  pgPort: port("E2E_PG_PORT", 55433),
  redisPort: port("E2E_REDIS_PORT", 56380),
  authPort: port("E2E_AUTH_PORT", 54399),
  webPort: port("E2E_WEB_PORT", 3100),
  portalPort: port("E2E_PORTAL_PORT", 3101),
  /** Where screenshots and server logs go. */
  outDir: path.resolve(process.env.E2E_OUT_DIR ?? path.join(REPO_ROOT, "e2e/.out")),
  /** HS256 secret of the local auth stand-in (local only, not a real secret). */
  jwtSecret: "lts-e2e-local-jwt-secret-not-for-production-000000",
};

export const DATABASE_URL = `postgresql://e2e:e2e@127.0.0.1:${E2E.pgPort}/lts_e2e`;
export const REDIS_URL = `redis://127.0.0.1:${E2E.redisPort}`;
/**
 * HTTPS, like hosted Supabase: the apps' Content-Security-Policy only allows
 * `connect-src 'self' https:`, so a plain-http auth URL would be blocked in
 * the browser. The certificate is self-signed and generated per run.
 */
export const AUTH_URL = `https://127.0.0.1:${E2E.authPort}`;
export const authCertPaths = () => ({
  cert: path.join(E2E.outDir, "auth-cert.pem"),
  key: path.join(E2E.outDir, "auth-key.pem"),
});
export const WEB_URL = `http://localhost:${E2E.webPort}`;
export const PORTAL_URL = `http://localhost:${E2E.portalPort}`;

export const STAFF_EMAIL = "e2e.staff@lts-e2e.test";
export const CLIENT_EMAIL = "e2e.signatory@client-e2e.test";

/** Deterministic auth user id for an email (shared by the seed and the auth stand-in). */
export function userIdForEmail(email: string): string {
  const hex = createHash("sha256").update(`lts-e2e:${email.toLowerCase()}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Refuses to continue unless every URL the harness hands out is local. */
export function assertLocalOnly(urls: Record<string, string> = {}) {
  const all = { DATABASE_URL, REDIS_URL, AUTH_URL, WEB_URL, PORTAL_URL, ...urls };
  for (const [name, value] of Object.entries(all)) {
    const host = new URL(value).hostname;
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(`e2e safety: ${name} points at ${host}, not this machine. Refusing to run.`);
    }
  }
}

/**
 * Environment for the apps under test. Built from scratch (never inherited
 * from the caller's shell, which may hold production credentials), with
 * placeholder values for every required secret and with external services
 * pointed at dead local ports so an accidental call fails fast and locally.
 */
export function appEnv(extra: Record<string, string> = {}): Record<string, string> {
  const passthrough = ["PATH", "HOME", "USER", "LANG", "TERM", "TMPDIR", "SHELL"];
  const env: Record<string, string> = {};
  for (const key of passthrough) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  Object.assign(env, {
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL,
    REDIS_URL,
    NEXT_PUBLIC_SUPABASE_URL: AUTH_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-local-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "e2e-local-service-role-key",
    // startJob only enqueues to Postgres in ecs_service mode (no ECS RunTask).
    BROWSER_TASK_EXECUTION_MODE: "ecs_service",
    AWS_REGION: "eu-west-2",
    AWS_ACCESS_KEY_ID: "e2e-not-a-real-key",
    AWS_SECRET_ACCESS_KEY: "e2e-not-a-real-secret",
    // Any AWS SDK call that slips through goes to a closed local port.
    AWS_ENDPOINT_URL: "http://127.0.0.1:9",
    AWS_EC2_METADATA_DISABLED: "true",
    ECS_CLUSTER: "e2e-none",
    ECS_TASK_DEFINITION: "e2e-none",
    ECS_CONTAINER_NAME: "e2e-none",
    ECS_SUBNETS: "e2e-none",
    ECS_SECURITY_GROUPS: "e2e-none",
    ECS_LOG_GROUP: "/e2e/none",
    RESEND_API_KEY: "e2e-not-a-real-key",
    // Emails (e.g. the portal's login code) go to the local stand-in's inbox.
    RESEND_BASE_URL: `${AUTH_URL}/__resend`,
    BLOB_READ_WRITE_TOKEN: "e2e-not-a-real-token",
    AI_GATEWAY_API_KEY: "e2e-not-a-real-key",
    // Whitespace satisfies the env schema, and browser-use-control trims it
    // to empty, so it never calls the Browser Use API.
    BROWSER_USE_API_KEY: " ",
    NEXT_PUBLIC_PORTAL_BASE_URL: PORTAL_URL,
    // Trust the auth stand-in's self-signed certificate (server-side fetches).
    NODE_EXTRA_CA_CERTS: authCertPaths().cert,
  });
  return { ...env, ...extra };
}
