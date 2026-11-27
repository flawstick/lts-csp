/** Controls both legacy V3 jobs and V4 jobs recorded by the current worker. */
export type BrowserUseApiVersion = 3 | 4;
export function getBrowserUseApiVersion(
  resultData: Record<string, unknown> | null | undefined,
): BrowserUseApiVersion {
  return resultData?.browserUseApiVersion === 4 ? 4 : 3;
}

const ACTIVE_RUN_STATUSES = new Set(["queued", "dispatching", "running"]);

type SessionInfo = { status?: string; latestRunId?: string };
type BrowserItem = {
  id: string;
  agentSessionId?: string | null;
  status: string;
};

async function api<T>(
  apiKey: string,
  version: BrowserUseApiVersion,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const response = await fetch(
    `https://api.browser-use.com/api/v${version}${path}`,
    {
      ...init,
      headers: {
        "content-type": "application/json",
        "X-Browser-Use-API-Key": apiKey,
      },
    },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      `Browser Use request failed (${response.status} ${response.statusText})`,
    );
  return response.status === 204 ? null : ((await response.json()) as T);
}

export async function getBrowserUseSessionStatus(
  sessionId: string,
  version: BrowserUseApiVersion = 3,
  apiKey = process.env.BROWSER_USE_API_KEY?.trim(),
): Promise<string | null> {
  if (!apiKey) return null;
  const data = await api<SessionInfo>(
    apiKey,
    version,
    `/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (!data?.status) return null;
  if (version === 3) return data.status;
  if (ACTIVE_RUN_STATUSES.has(data.status)) return "running";
  return data.status === "completed"
    ? "idle"
    : data.status === "cancelled"
      ? "stopped"
      : "error";
}

export async function stopBrowserUseSession(
  sessionId: string,
  strategy: "task" | "session",
  version: BrowserUseApiVersion = 3,
  apiKey = process.env.BROWSER_USE_API_KEY?.trim(),
): Promise<void> {
  if (!apiKey) return;
  const id = encodeURIComponent(sessionId);
  if (version === 3) {
    await api(apiKey, 3, `/sessions/${id}/stop`, {
      method: "POST",
      body: JSON.stringify({ strategy }),
    });
    return;
  }

  const errors: unknown[] = [];
  if (strategy === "session") {
    try {
      const pending = await api<{ queue: { id: number; status: string }[] }>(
        apiKey,
        4,
        `/sessions/${id}/queue`,
      );
      for (const message of pending?.queue ?? []) {
        if (message.status === "pending")
          await api(apiKey, 4, `/sessions/${id}/queue/${message.id}`, {
            method: "DELETE",
          });
      }
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    // Fetch the authoritative latest run; persisted run IDs can lag a resume.
    const info = await api<SessionInfo>(apiKey, 4, `/sessions/${id}`);
    if (
      info?.latestRunId &&
      info.status &&
      ACTIVE_RUN_STATUSES.has(info.status)
    ) {
      await api(
        apiKey,
        4,
        `/runs/${encodeURIComponent(info.latestRunId)}/cancel`,
        { method: "POST" },
      );
    }
  } catch (error) {
    errors.push(error);
  }

  if (strategy === "session") {
    // Collect first: stopping browsers must not shift later pagination pages.
    const browsers: BrowserItem[] = [];
    try {
      for (let pageNumber = 1; ; pageNumber += 1) {
        const query = new URLSearchParams({
          agentSessionId: sessionId,
          pageSize: "100",
          pageNumber: String(pageNumber),
        });
        const page = await api<{
          items: BrowserItem[];
          totalItems: number;
          pageSize: number;
        }>(apiKey, 4, `/browsers?${query}`);
        if (!page) break;
        browsers.push(
          ...page.items.filter(
            (browser) =>
              browser.agentSessionId === sessionId &&
              browser.status === "active",
          ),
        );
        if (!page.items.length || pageNumber * page.pageSize >= page.totalItems)
          break;
      }
    } catch (error) {
      errors.push(error);
    }
    for (const browser of browsers) {
      try {
        await api(apiKey, 4, `/browsers/${encodeURIComponent(browser.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "stop" }),
        });
      } catch (error) {
        errors.push(error);
      }
    }
  }
  // Preserve audit history: cancel runs and close browsers, never delete sessions.
  if (errors.length)
    throw new AggregateError(errors, "Unable to fully stop Browser Use job");
}

export async function waitForBrowserUseSessionToPause(
  sessionId: string,
  version: BrowserUseApiVersion = 3,
  timeoutMs = 10_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let status: string | null = null;
  while (Date.now() < deadline) {
    status = await getBrowserUseSessionStatus(sessionId, version);
    if (status !== "running") return status;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return status;
}

/** One page of the account's V4 sessions, most recent first. */
export async function listBrowserUseSessions(
  cursor: string | null,
  apiKey = process.env.BROWSER_USE_API_KEY?.trim(),
): Promise<{
  sessions: {
    sessionId: string;
    workspaceId: string | null;
    createdAt: string;
    updatedAt?: string | null;
  }[];
  nextCursor?: string | null;
  hasMore?: boolean;
}> {
  // Without a key nothing can be searched: the caller must not read that as
  // "no sessions".
  if (!apiKey) throw new Error("Browser Use API key is not configured");
  const query = new URLSearchParams({ limit: "100" });
  if (cursor) query.set("cursor", cursor);
  const page = await api<{
    sessions: {
      sessionId: string;
      workspaceId: string | null;
      createdAt: string;
      updatedAt?: string | null;
    }[];
    nextCursor?: string | null;
    hasMore?: boolean;
  }>(apiKey, 4, `/sessions?${query}`);
  return page ?? { sessions: [], hasMore: false };
}
