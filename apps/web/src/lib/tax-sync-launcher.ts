import { launchTaxSync, type LaunchTaxSyncParams } from "@/lib/ecs";
import { env } from "@/env";

export type TaxSyncExecutionMode = "ecs" | "railway";

export interface TaxSyncLaunchResult {
  mode: TaxSyncExecutionMode;
  jobId: string;
  taskArn?: string;
  accepted?: boolean;
}

function buildRailwayHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (env.TAX_SYNC_HANDLER_TOKEN) {
    headers.Authorization = `Bearer ${env.TAX_SYNC_HANDLER_TOKEN}`;
  }

  return headers;
}

async function launchTaxSyncViaRailway(
  params: LaunchTaxSyncParams,
): Promise<TaxSyncLaunchResult> {
  if (!env.TAX_SYNC_HANDLER_URL) {
    throw new Error(
      "TAX_SYNC_HANDLER_URL must be set when TAX_SYNC_EXECUTION_MODE=railway",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    env.TAX_SYNC_HANDLER_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${env.TAX_SYNC_HANDLER_URL}/scrape`, {
      method: "POST",
      headers: buildRailwayHeaders(),
      body: JSON.stringify({
        jobId: params.jobId,
        orgId: params.orgId,
        jurisdictionCode: params.jurisdictionCode,
        portalUsername: params.portalUsername,
        portalPassword: params.portalPassword,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let payload: Record<string, unknown> | null = null;

    try {
      payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        typeof payload?.error === "string"
          ? payload.error
          : `Railway tax sync handler returned ${response.status}`;
      throw new Error(message);
    }

    return {
      mode: "railway",
      jobId:
        typeof payload?.jobId === "string" && payload.jobId.trim()
          ? payload.jobId
          : params.jobId,
      accepted: payload?.accepted === true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function triggerTaxSync(
  params: LaunchTaxSyncParams,
): Promise<TaxSyncLaunchResult> {
  if (env.TAX_SYNC_EXECUTION_MODE === "railway") {
    return launchTaxSyncViaRailway(params);
  }

  const result = await launchTaxSync(params);
  return {
    mode: "ecs",
    jobId: params.jobId,
    taskArn: result.taskArn,
  };
}
