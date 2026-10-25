const BROWSER_HEARTBEAT_STALE_MS = 60_000;

function getResultDataRecord(
  resultData: unknown,
): Record<string, unknown> | null {
  if (
    !resultData ||
    typeof resultData !== "object" ||
    Array.isArray(resultData)
  ) {
    return null;
  }

  return resultData as Record<string, unknown>;
}

function getResultDataNumber(
  resultData: unknown,
  key: string,
): number | undefined {
  const record = getResultDataRecord(resultData);
  const value = record?.[key];
  return typeof value === "number" ? value : undefined;
}

export function getBrowserJobStaleReason(
  job: {
    status: string;
    createdAt: Date | string;
    startedAt?: Date | string | null;
    updatedAt?: Date | string | null;
    resultData?: unknown;
  },
  options: { startupTimeoutMs: number },
  now = Date.now(),
): string | null {
  // Queue age does not indicate worker failure: all workers may be busy.
  // Keep unclaimed jobs available until a worker claims or a user cancels them.
  if (job.status === "starting") {
    const startupStartedAt =
      getResultDataNumber(job.resultData, "startupStartedAt") ??
      (job.startedAt ? new Date(job.startedAt).getTime() : undefined) ??
      (job.updatedAt ? new Date(job.updatedAt).getTime() : undefined) ??
      new Date(job.createdAt).getTime();

    if (now - startupStartedAt > options.startupTimeoutMs) {
      return "Browser Use session failed to initialize";
    }
  }

  if (job.status === "running" || job.status === "paused") {
    const lastHeartbeatAt =
      getResultDataNumber(job.resultData, "lastHeartbeatAt") ??
      (job.updatedAt ? new Date(job.updatedAt).getTime() : undefined) ??
      (job.startedAt ? new Date(job.startedAt).getTime() : undefined);

    if (lastHeartbeatAt && now - lastHeartbeatAt > BROWSER_HEARTBEAT_STALE_MS) {
      return "Browser worker heartbeat lost";
    }
  }

  return null;
}
