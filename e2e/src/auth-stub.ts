/**
 * A local stand-in for the two Supabase services the apps call:
 *
 * - Auth (GoTrue) `/auth/v1/*`: email OTP sign-in (`otp`, `verify`), session
 *   refresh, `user` (GET/PUT) and `logout`. Codes are not emailed; the
 *   harness reads them from `GET /__e2e/inbox?email=` (like Supabase's local
 *   Inbucket), then types them into the real login page.
 * - REST (PostgREST) `/rest/v1/<lts_table>`: the select/eq/limit reads and
 *   inserts the middlewares use, run against the local e2e Postgres.
 *
 * Sessions are real HS256 JWTs signed with a local secret, so
 * @supabase/ssr stores, chunks, refreshes and validates them exactly as it
 * does in production. No app code is changed or bypassed.
 */
import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { AUTH_URL, DATABASE_URL, E2E, authCertPaths, userIdForEmail } from "./config";

let authCertThisRun: { cert: string; key: string } | undefined;

/**
 * A throwaway self-signed certificate for 127.0.0.1 / localhost, made fresh
 * once per harness run (the output directory persists between runs, so a
 * certificate left from an earlier run is never reused and cannot expire on
 * us). Later calls in the same run return the same files.
 */
export function ensureAuthCert() {
  if (authCertThisRun) return authCertThisRun;
  const { cert, key } = authCertPaths();
  mkdirSync(E2E.outDir, { recursive: true });
  rmSync(cert, { force: true });
  rmSync(key, { force: true });
  const result = spawnSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30",
    "-subj", "/CN=lts-e2e-local-auth",
    "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
    "-keyout", key, "-out", cert,
  ], { encoding: "utf8" });
  if (result.status !== 0 || !existsSync(cert) || !existsSync(key)) {
    throw new Error(`openssl failed: ${result.stderr}`);
  }
  authCertThisRun = { cert, key };
  return authCertThisRun;
}

type AuthUser = {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
  created_at: string;
};

const ACCESS_TOKEN_TTL_S = 3600;
/** Must match SUPABASE_SERVICE_ROLE_KEY in appEnv(). */
export const SERVICE_ROLE_KEY = "e2e-local-service-role-key";

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", E2E.jwtSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string): Record<string, unknown> | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const expected = createHmac("sha256", E2E.jwtSecret).update(`${header}.${body}`).digest("base64url");
  if (expected !== signature) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

export function startAuthStub() {
  const sql = postgres(DATABASE_URL, { max: 4, onnotice: () => {} });
  const users = new Map<string, AuthUser>(); // by id
  const otpCodes = new Map<string, string>(); // email -> code
  const refreshTokens = new Map<string, string>(); // token -> user id
  const requestLog: string[] = [];

  const emails: Array<{ to: string[]; subject: string; html: string; at: string }> = [];

  /** Users live in auth.users like in Supabase (the portal queries it directly). */
  const getOrCreateUser = async (email: string, data?: Record<string, unknown>) => {
    const id = userIdForEmail(email);
    const cached = users.get(id);
    if (cached) return cached;
    const [row] = await sql<Array<{ raw_user_meta_data: Record<string, unknown>; created_at: Date }>>`
      insert into auth.users (id, email, raw_user_meta_data)
      values (${id}, ${email.toLowerCase()}, ${sql.json((data ?? {}) as never)})
      on conflict (id) do update set updated_at = now()
      returning raw_user_meta_data, created_at`;
    const user: AuthUser = {
      id,
      email: email.toLowerCase(),
      user_metadata: { ...(row?.raw_user_meta_data ?? {}) },
      created_at: (row?.created_at ?? new Date()).toISOString(),
    };
    users.set(id, user);
    return user;
  };

  const userJson = (user: AuthUser) => ({
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.created_at,
    phone: "",
    confirmed_at: user.created_at,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: user.user_metadata,
    identities: [],
    created_at: user.created_at,
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  });

  const issueSession = (user: AuthUser) => {
    const now = Math.floor(Date.now() / 1000);
    const sessionId = randomUUID();
    const accessToken = signJwt({
      aud: "authenticated",
      exp: now + ACCESS_TOKEN_TTL_S,
      iat: now,
      iss: `${AUTH_URL}/auth/v1`,
      sub: user.id,
      email: user.email,
      role: "authenticated",
      aal: "aal1",
      session_id: sessionId,
      is_anonymous: false,
    });
    const refreshToken = randomBytes(24).toString("hex");
    refreshTokens.set(refreshToken, user.id);
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL_S,
      expires_at: now + ACCESS_TOKEN_TTL_S,
      refresh_token: refreshToken,
      user: userJson(user),
    };
  };

  const bearerUser = (req: Request) => {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const claims = verifyJwt(token);
    const user = claims && typeof claims.sub === "string" ? users.get(claims.sub) : undefined;
    return user ?? null;
  };

  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers":
      "authorization,apikey,content-type,x-client-info,x-supabase-api-version,accept-profile,content-profile,prefer,range",
    "access-control-expose-headers": "content-range",
  };
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...cors, ...headers },
    });
  const authError = (status: number, code: string, message: string) =>
    json(status, { code: status, error_code: code, msg: message });

  const IDENT = /^[a-z_][a-z0-9_]*$/;

  async function rest(req: Request, table: string, url: URL) {
    if (!/^lts_[a-z_]+$/.test(table)) return json(404, { message: "unknown table" });
    const select = (url.searchParams.get("select") ?? "*").split(",").map((c) => c.trim());
    if (!select.every((c) => c === "*" || IDENT.test(c))) return json(400, { message: "bad select" });
    const filters: Array<[string, string]> = [];
    let limit: number | null = null;
    for (const [key, value] of url.searchParams) {
      if (key === "select" || key === "columns") continue;
      if (key === "limit") {
        limit = Number(value);
        continue;
      }
      if (!IDENT.test(key) || !value.startsWith("eq.")) return json(400, { message: `unsupported filter ${key}` });
      filters.push([key, value.slice(3)]);
    }
    const columns = select.includes("*") ? sql`*` : sql(select);
    let rows: Record<string, unknown>[];
    if (req.method === "GET") {
      const where = filters.length
        ? filters.reduce((acc, [col, val], i) => (i === 0 ? sql`${sql(col)} = ${val}` : sql`${acc} and ${sql(col)} = ${val}`), sql``)
        : sql`true`;
      rows = await sql`select ${columns} from ${sql(table)} where ${where} ${limit ? sql`limit ${limit}` : sql``}`;
    } else if (req.method === "POST") {
      const body = (await req.json()) as Record<string, unknown> | Record<string, unknown>[];
      const values = Array.isArray(body) ? body : [body];
      const keys = Object.keys(values[0] ?? {});
      if (!keys.every((k) => IDENT.test(k))) return json(400, { message: "bad insert" });
      try {
        rows = await sql`insert into ${sql(table)} ${sql(values as never, keys)} returning ${columns}`;
      } catch (error) {
        return json(409, { code: "23505", message: (error as Error).message });
      }
    } else {
      return json(405, { message: "method not supported by the e2e stand-in" });
    }
    const wantsObject = (req.headers.get("accept") ?? "").includes("application/vnd.pgrst.object+json");
    if (wantsObject) {
      if (rows.length !== 1) {
        return json(406, {
          code: "PGRST116",
          details: `The result contains ${rows.length} rows`,
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        });
      }
      return json(req.method === "POST" ? 201 : 200, rows[0]);
    }
    return json(req.method === "POST" ? 201 : 200, rows);
  }

  const tls = ensureAuthCert();
  const server = Bun.serve({
    port: E2E.authPort,
    hostname: "127.0.0.1",
    tls: { cert: Bun.file(tls.cert), key: Bun.file(tls.key) },
    async fetch(req) {
      const url = new URL(req.url);
      requestLog.push(`${req.method} ${url.pathname}`);
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      try {
        if (url.pathname === "/__e2e/inbox") {
          const email = (url.searchParams.get("email") ?? "").toLowerCase();
          const code = otpCodes.get(email);
          return code ? json(200, { email, code }) : json(404, { message: "no code sent" });
        }
        if (url.pathname === "/__e2e/health") return json(200, { ok: true });
        if (url.pathname === "/__e2e/emails") return json(200, emails);

        // Resend (RESEND_BASE_URL points here): keep the email in the local inbox.
        if (url.pathname === "/__resend/emails" && req.method === "POST") {
          const body = (await req.json()) as { to: string[] | string; subject: string; html?: string };
          emails.push({
            to: Array.isArray(body.to) ? body.to : [body.to],
            subject: body.subject,
            html: body.html ?? "",
            at: new Date().toISOString(),
          });
          return json(200, { id: randomUUID() });
        }

        // Supabase admin API (service role): the portal generates its own login codes.
        if (url.pathname === "/auth/v1/admin/generate_link" && req.method === "POST") {
          const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
          if (key !== SERVICE_ROLE_KEY) return authError(401, "not_admin", "service role key required");
          const body = (await req.json()) as { type?: string; email?: string };
          if (body.type !== "magiclink" || !body.email) return authError(400, "validation_failed", "magiclink only");
          const user = await getOrCreateUser(body.email);
          const code = String(randomInt(100000, 999999));
          otpCodes.set(user.email, code);
          return json(200, {
            ...userJson(user),
            action_link: `${AUTH_URL}/auth/v1/verify?type=magiclink&token=e2e`,
            email_otp: code,
            hashed_token: randomBytes(16).toString("hex"),
            redirect_to: "",
            verification_type: "magiclink",
          });
        }

        if (url.pathname === "/auth/v1/otp" && req.method === "POST") {
          const body = (await req.json()) as { email?: string; data?: Record<string, unknown> };
          if (!body.email) return authError(400, "validation_failed", "email required");
          await getOrCreateUser(body.email, body.data);
          otpCodes.set(body.email.toLowerCase(), String(randomInt(100000, 999999)));
          return json(200, {});
        }
        if (url.pathname === "/auth/v1/verify" && req.method === "POST") {
          const body = (await req.json()) as { email?: string; token?: string; type?: string };
          const email = (body.email ?? "").toLowerCase();
          const expected = otpCodes.get(email);
          if (!expected || body.token !== expected) {
            return authError(403, "otp_expired", "Token has expired or is invalid");
          }
          otpCodes.delete(email);
          return json(200, issueSession(await getOrCreateUser(email)));
        }
        if (url.pathname === "/auth/v1/token" && req.method === "POST") {
          const grant = url.searchParams.get("grant_type");
          const body = (await req.json()) as { refresh_token?: string };
          if (grant !== "refresh_token" || !body.refresh_token) {
            return authError(400, "unsupported_grant_type", "only refresh_token is supported locally");
          }
          const userId = refreshTokens.get(body.refresh_token);
          const user = userId ? users.get(userId) : undefined;
          if (!user) return authError(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
          return json(200, issueSession(user));
        }
        if (url.pathname === "/auth/v1/user") {
          const user = bearerUser(req);
          if (!user) return authError(401, "bad_jwt", "invalid JWT");
          if (req.method === "PUT") {
            const body = (await req.json()) as { data?: Record<string, unknown> };
            user.user_metadata = { ...user.user_metadata, ...(body.data ?? {}) };
          }
          return json(200, userJson(user));
        }
        if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204, headers: cors });

        const restMatch = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
        if (restMatch?.[1]) {
          if (!bearerUser(req)) return json(401, { message: "JWT required by the e2e stand-in" });
          return await rest(req, restMatch[1], url);
        }
        return json(404, { message: `e2e auth stand-in: no route for ${req.method} ${url.pathname}` });
      } catch (error) {
        console.error("[auth-stub]", error);
        return json(500, { message: (error as Error).message });
      }
    },
  });

  return {
    url: AUTH_URL,
    requestLog,
    async stop() {
      server.stop(true);
      await sql.end({ timeout: 2 });
    },
  };
}
