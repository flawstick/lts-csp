/**
 * Starts and stops the local stack: Postgres and Redis containers, the
 * schema, and the Next.js apps. Everything binds to 127.0.0.1.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { DATABASE_URL, E2E, REPO_ROOT, appEnv } from "./config";

function run(cmd: string, args: string[], opts: { env?: Record<string, string>; cwd?: string; allowFail?: boolean } = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    env: opts.env ?? (process.env as Record<string, string>),
    encoding: "utf8",
  });
  if (result.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

async function waitFor(label: string, check: () => Promise<boolean> | boolean, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await check()) return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export function removeContainers() {
  for (const name of [E2E.pgContainer, E2E.redisContainer]) {
    run("docker", ["rm", "-f", "-v", name], { allowFail: true });
  }
}

export async function startContainers() {
  removeContainers();
  run("docker", [
    "run", "-d", "--name", E2E.pgContainer, "--label", "lts-e2e=1",
    "-e", "POSTGRES_USER=e2e", "-e", "POSTGRES_PASSWORD=e2e", "-e", "POSTGRES_DB=lts_e2e",
    "-p", `127.0.0.1:${E2E.pgPort}:5432`, "postgres:17-alpine",
  ]);
  run("docker", [
    "run", "-d", "--name", E2E.redisContainer, "--label", "lts-e2e=1",
    "-p", `127.0.0.1:${E2E.redisPort}:6379`, "redis:alpine",
  ]);
  await waitFor(
    "Postgres",
    () => run("docker", ["exec", E2E.pgContainer, "pg_isready", "-U", "e2e", "-d", "lts_e2e"], { allowFail: true }).status === 0,
    60_000,
  );
  // pg_isready can pass during the image's init restart; require a real query.
  await waitFor(
    "Postgres query",
    () => run("docker", ["exec", E2E.pgContainer, "psql", "-U", "e2e", "-d", "lts_e2e", "-c", "select 1"], { allowFail: true }).status === 0,
    60_000,
  );
}

/**
 * Applies packages/database/src/schema.ts to the empty local database with
 * `drizzle-kit push`. (`drizzle-kit migrate` cannot build a database from
 * scratch: 0001 drops a constraint that 0000 never created.)
 */
export function pushSchema() {
  const env = appEnv({ DATABASE_URL });
  run(path.join(REPO_ROOT, "packages/database/node_modules/.bin/drizzle-kit"), ["push", "--force"], {
    cwd: path.join(REPO_ROOT, "packages/database"),
    env,
  });
  // The part of Supabase's own schema the apps query directly
  // (apps/portal send-otp and portal-team read auth.users).
  run("docker", [
    "exec", E2E.pgContainer, "psql", "-v", "ON_ERROR_STOP=1", "-U", "e2e", "-d", "lts_e2e", "-c",
    `create schema if not exists auth;
     create table if not exists auth.users (
       id uuid primary key,
       email text,
       raw_user_meta_data jsonb not null default '{}'::jsonb,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now()
     );`,
  ]);
}

export type AppServer = { name: string; url: string; proc: ChildProcess; logFile: string };

/** Starts `next dev` for an app with the local-only environment. */
export async function startNextApp(input: { name: "web" | "portal"; port: number; url: string }): Promise<AppServer> {
  mkdirSync(E2E.outDir, { recursive: true });
  const logFile = path.join(E2E.outDir, `${input.name}.log`);
  const log = createWriteStream(logFile);
  const cwd = path.join(REPO_ROOT, "apps", input.name);
  const proc = spawn(path.join(cwd, "node_modules/.bin/next"), ["dev", "--port", String(input.port), "--hostname", "localhost"], {
    cwd,
    env: appEnv({ NODE_OPTIONS: "--max-http-header-size=65536", PORT: String(input.port) }),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  proc.stdout?.pipe(log);
  proc.stderr?.pipe(log);
  await waitFor(
    `${input.name} on ${input.url}`,
    async () => {
      if (proc.exitCode !== null) throw new Error(`${input.name} exited early; see ${logFile}`);
      const res = await fetch(`${input.url}/login`, { redirect: "manual" });
      return res.status < 500;
    },
    180_000,
  ).catch((error) => {
    if (proc.exitCode !== null) throw new Error(`${input.name} exited (${proc.exitCode}); see ${logFile}`);
    throw error;
  });
  return { name: input.name, url: input.url, proc, logFile };
}

export function stopApp(server: AppServer | undefined) {
  if (!server?.proc.pid) return;
  try {
    process.kill(-server.proc.pid, "SIGTERM");
  } catch {
    // already gone
  }
}
