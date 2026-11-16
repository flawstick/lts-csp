/**
 * Package the prepare-only guard extension and (with --upload) register it
 * with Browser Use V4. Prints the extension id to set as
 * BROWSER_USE_PREPARE_ONLY_GUARD_EXTENSION_ID on the task worker.
 *
 *   bun scripts/upload-prepare-only-guard.ts            # build zip only
 *   BROWSER_USE_API_KEY=... bun scripts/upload-prepare-only-guard.ts --upload
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BrowserUse } from "browser-use-sdk/v4";

const guardDir = resolve(import.meta.dirname, "../prepare-only-guard");
const zipPath = join(mkdtempSync(join(tmpdir(), "lts-guard-")), "guard.zip");
execFileSync(
  "zip",
  ["-j", "-X", zipPath, "manifest.json", "rules.json", "guard-core.js", "guard-isolated.js", "guard-main.js"],
  { cwd: guardDir, stdio: "inherit" },
);
console.log(`Packaged ${zipPath}`);

if (process.argv.includes("--upload")) {
  const apiKey = process.env.BROWSER_USE_API_KEY;
  if (!apiKey) throw new Error("BROWSER_USE_API_KEY is required to upload");
  const client = new BrowserUse({ apiKey, maxRetries: 0 });
  const extension = await client.extensions.create(
    new Uint8Array(readFileSync(zipPath)),
  );
  console.log(
    `Uploaded ${extension.name} ${extension.version}: BROWSER_USE_PREPARE_ONLY_GUARD_EXTENSION_ID=${extension.id}`,
  );
}
