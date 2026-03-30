import { createLogger } from "./logger";
import { runTaxSyncJob } from "./run-sync";

const JOB_ID = process.env.TAX_SYNC_JOB_ID || "";
const ORG_ID = process.env.ORG_ID || "";
const JURISDICTION_CODE = (process.env.JURISDICTION_CODE || "GG").trim().toUpperCase();

async function main() {
  const logger = createLogger(JURISDICTION_CODE);

  try {
    await runTaxSyncJob({
      jobId: JOB_ID,
      orgId: ORG_ID,
      jurisdictionCode: JURISDICTION_CODE,
      logger,
    });
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

main();
