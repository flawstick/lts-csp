/**
 * Local end-to-end run: fresh Postgres + Redis in Docker, schema push, seed,
 * local Supabase Auth stand-in, `next dev` for web (and portal), then real
 * browser flows with Playwright, plus offline worker checks.
 *
 *   bun run e2e                 full run, tears everything down at the end
 *   bun run e2e -- --keep       leave the stack running afterwards (prints URLs)
 *   bun run e2e -- --serve      bring the stack up and wait (no flows), Ctrl-C stops
 *   bun run e2e -- --only=web   only flows whose name contains "web"
 *   bun run e2e -- --no-portal  skip starting apps/portal
 *   bun run e2e -- --down       remove leftover e2e containers and exit
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AUTH_URL,
  CLIENT_EMAIL,
  DATABASE_URL,
  E2E,
  PORTAL_URL,
  STAFF_EMAIL,
  WEB_URL,
  assertLocalOnly,
} from "./config";
import { ensureAuthCert, startAuthStub } from "./auth-stub";
import { pushSchema, removeContainers, startContainers, startNextApp, stopApp, type AppServer } from "./stack";
import { Checks } from "./browser";

const args = new Set(process.argv.slice(2));
const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const keep = args.has("--keep") || args.has("--serve");
const withPortal = !args.has("--no-portal");

if (args.has("--down")) {
  removeContainers();
  console.log("Removed e2e containers.");
  process.exit(0);
}

assertLocalOnly();
// Everything imported from here on (the @repo/database client in the seed and
// the flows) connects to the local database only.
process.env.DATABASE_URL = DATABASE_URL;
mkdirSync(E2E.outDir, { recursive: true });

let auth: ReturnType<typeof startAuthStub> | undefined;
let web: AppServer | undefined;
let portal: AppServer | undefined;

async function teardown() {
  stopApp(web);
  stopApp(portal);
  await auth?.stop().catch(() => {});
  if (!keep) removeContainers();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
  void teardown().finally(() => process.exit(130));
});

let exitCode = 0;
try {
  console.log("Starting Postgres and Redis containers...");
  await startContainers();
  console.log("Applying schema (drizzle-kit push)...");
  pushSchema();
  console.log("Seeding...");
  const { seed } = await import("./seed");
  const seeded = await seed();
  writeFileSync(path.join(E2E.outDir, "seed.json"), JSON.stringify(seeded, null, 2));

  ensureAuthCert();
  auth = startAuthStub();
  console.log(`Auth stand-in on ${AUTH_URL}`);
  console.log("Starting apps (next dev)...");
  [web, portal] = await Promise.all([
    startNextApp({ name: "web", port: E2E.webPort, url: WEB_URL }),
    withPortal ? startNextApp({ name: "portal", port: E2E.portalPort, url: PORTAL_URL }) : Promise.resolve(undefined),
  ]);
  console.log(`web ${WEB_URL}${portal ? `, portal ${PORTAL_URL}` : ""}`);

  if (args.has("--serve")) {
    console.log(
      `\nStack is up. Sign in as ${STAFF_EMAIL} (web) or ${CLIENT_EMAIL} (portal); codes at ${AUTH_URL}/__e2e/inbox?email=...\nSeed: ${path.join(E2E.outDir, "seed.json")}\nCtrl-C to stop.`,
    );
    await new Promise(() => {});
  }

  const { flows } = await import("./flows");
  const all: Checks[] = [];
  const shared: Record<string, string> = {};
  for (const flow of flows) {
    if (only && !flow.name.includes(only)) continue;
    if (flow.needsPortal && !portal) continue;
    console.log(`\n# ${flow.name}`);
    const checks = new Checks(flow.name);
    all.push(checks);
    try {
      await flow.run({ seeded, webUrl: WEB_URL, portalUrl: PORTAL_URL, shared }, checks);
    } catch (error) {
      checks.ok("flow completed", false, String((error as Error).stack ?? error));
    }
  }
  const { closeBrowser, pageErrors } = await import("./flows/session");
  await closeBrowser();
  if (pageErrors.length) console.log(`\nUncaught page errors:\n  ${pageErrors.join("\n  ")}`);
  const results = all.flatMap((c) => c.results);
  const failed = results.filter((r) => !r.ok);
  writeFileSync(path.join(E2E.outDir, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${path.join(E2E.outDir, "shots")}`);
  if (failed.length) exitCode = 1;
  if (args.has("--keep")) {
    console.log(`\nStack left running (--keep): web ${WEB_URL}${portal ? `, portal ${PORTAL_URL}` : ""}. Ctrl-C stops the apps; containers stay until \`bun run e2e:down\`.`);
    await new Promise(() => {});
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await teardown();
}
process.exit(exitCode);
