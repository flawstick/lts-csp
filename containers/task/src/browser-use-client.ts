import {
  BrowserUse,
  type BrowserSessionItemView,
  type ProxyCountryCode,
  type RunCreateBody,
  type RunEvent,
  type RunSummary,
  type WorkspaceFileInfo,
  type WorkspaceFileListResponse,
  type WorkspaceInfo,
} from "browser-use-sdk/v4";
import {
  modelParamsForProfile,
  type BrowserUseRunProfile,
} from "./browser-use-config";

export type BrowserUseSessionStatus = "running" | "idle" | "stopped" | "error";
export type BrowserUseFileInfo = WorkspaceFileInfo;
export type StopStrategy = "task" | "session";

// Keep the worker's lifecycle vocabulary separate from V4's three identities:
// an agent session has many runs, and its browser may be replaced between runs.
export type BrowserUseSession = {
  id: string;
  runId: string;
  workspaceId: string | null;
  browserId: string | null;
  liveUrl: string | null;
  status: BrowserUseSessionStatus;
  stepCount: number;
  lastStepSummary: string | null;
  output: unknown;
  isTaskSuccessful: boolean | null;
  /** Model Browser Use reported for the latest run (null after a restart until known). */
  model: string | null;
  /** The finished run's error text, if any. */
  runError: string | null;
};

export type BrowserUseSessionSpend = {
  /** LLM + search: what `maxCostUsd` limits. */
  budgetSpentUsd: number | null;
  /** Everything recorded, including browser and proxy time. */
  totalCostUsd: number | null;
};

function parseUsd(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

type ProgressMessage = {
  id: string;
  type: string;
  role: string;
  createdAt: string;
  summary: string;
  data: Record<string, unknown>;
};

export function normalizeRunStatus(
  status: RunSummary["status"],
): BrowserUseSessionStatus {
  switch (status) {
    case "completed":
      return "idle";
    case "cancelled":
      return "stopped";
    case "failed":
      return "error";
    default:
      return "running";
  }
}

function eventSummary(event: RunEvent): string {
  for (const field of ["summary", "message", "text", "tool_name", "toolName"]) {
    const value = event.data[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  return event.type;
}

export class BrowserUseClient {
  private readonly client: BrowserUse;
  private readonly sessions = new Map<string, BrowserUseSession>();
  private readonly completedRuns = new Map<string, RunSummary>();
  private readonly uploads = new Map<string, string[]>();
  private readonly processedEvents = new Map<string, number>();

  constructor(apiKey: string) {
    // A lost POST response must not automatically dispatch a second filing run.
    this.client = new BrowserUse({ apiKey, maxRetries: 0 });
  }

  private async sessionState(sessionId: string): Promise<BrowserUseSession> {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const info = await this.client.sessions.get(sessionId);
    const state: BrowserUseSession = {
      id: info.sessionId,
      runId: info.latestRunId,
      workspaceId: info.workspaceId,
      browserId: null,
      liveUrl: null,
      status: normalizeRunStatus(info.status),
      stepCount: 0,
      lastStepSummary: null,
      output: null,
      isTaskSuccessful: null,
      model: null,
      runError: null,
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  async getSession(sessionId: string): Promise<BrowserUseSession> {
    const state = await this.sessionState(sessionId);
    const { status } = await this.client.runs.status(state.runId);
    state.status = normalizeRunStatus(status);
    if (state.status !== "running") {
      let result = this.completedRuns.get(state.runId);
      if (!result) {
        result = await this.client.runs.get(state.runId);
        this.completedRuns.set(state.runId, result);
      }
      state.output = result.result ?? result.output ?? result.error;
      state.isTaskSuccessful = result.status === "completed";
      state.model = result.model ?? state.model;
      state.runError = result.error ?? null;
    }
    return state;
  }

  async runTask(
    task: string,
    request: {
      sessionId?: string;
      /** Model, effort and session budget; keep it the same for a session's follow-ups. */
      profile: BrowserUseRunProfile;
      proxyCountryCode?: ProxyCountryCode | null;
      workspaceId?: string;
      /** Session-wide extensions; only sent when a new session is created. */
      extensionIds?: string[];
    },
  ): Promise<BrowserUseSession> {
    const previous = request.sessionId
      ? await this.sessionState(request.sessionId)
      : undefined;
    const workspaceId =
      request.workspaceId ?? previous?.workspaceId ?? undefined;
    const body: RunCreateBody = {
      task,
      model: request.profile.model,
      modelParams: modelParamsForProfile(request.profile),
      sessionId: request.sessionId,
      // The budget covers the whole session. Follow-ups omit it so Browser
      // Use keeps the current budget (and the spend so far) instead of
      // replacing it with a fresh allowance.
      ...(!request.sessionId ? { maxCostUsd: request.profile.maxCostUsd } : {}),
      workspaceId,
      // Match the worker's ten-minute manual-intervention window, with margin.
      keepAlive: 900,
      ...(workspaceId && this.uploads.has(workspaceId)
        ? { attachedFileIds: this.uploads.get(workspaceId) }
        : {}),
      // Omit settings on follow-ups so V4 reuses the current browser.
      ...(!request.sessionId
        ? {
            browserSettings: {
              proxyCountryCode: request.proxyCountryCode ?? null,
              ...(request.extensionIds?.length
                ? { extensionIds: request.extensionIds }
                : {}),
            },
          }
        : {}),
    };
    const run = await this.client.runs.create(body);
    if (run.model !== request.profile.model) {
      await this.client.runs.cancel(run.id);
      throw new Error(`Browser Use selected an unexpected model: ${run.model}`);
    }
    if (request.sessionId && run.sessionId !== request.sessionId) {
      await this.client.runs.cancel(run.id);
      throw new Error(
        "Browser Use created a different session for a follow-up; run cancelled",
      );
    }
    if (run.missingFileIds?.length) {
      await this.client.runs.cancel(run.id);
      throw new Error(
        "Browser Use could not attach the required source files; run cancelled",
      );
    }
    const state: BrowserUseSession = {
      id: run.sessionId,
      runId: run.id,
      workspaceId: run.workspaceId,
      browserId: previous?.browserId ?? null,
      liveUrl: previous?.liveUrl ?? null,
      status: normalizeRunStatus(run.status),
      stepCount: previous?.stepCount ?? 0,
      lastStepSummary: null,
      output: null,
      isTaskSuccessful: null,
      model: run.model,
      runError: null,
    };
    this.sessions.set(state.id, state);
    return state;
  }

  /** Recorded session spend; read-only, never changes the budget. */
  async getSessionSpend(sessionId: string): Promise<BrowserUseSessionSpend> {
    const cost = await this.client.sessions.cost(sessionId);
    const llm = parseUsd(cost.llmCostUsd);
    const search = parseUsd(cost.searchCostUsd);
    return {
      budgetSpentUsd: llm === null && search === null ? null : (llm ?? 0) + (search ?? 0),
      totalCostUsd: parseUsd(cost.totalCostUsd),
    };
  }

  async getMessages(
    sessionId: string,
    after?: string | null,
  ): Promise<{ messages: ProgressMessage[] }> {
    const state = await this.sessionState(sessionId);
    const [cursorRun, rawCursor] = after?.split(":") ?? [];
    let cursor = cursorRun === state.runId && rawCursor ? Number(rawCursor) : 0;
    if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0;
    const messages: ProgressMessage[] = [];
    for (;;) {
      const page = await this.client.runs.events(state.runId, {
        after: cursor,
        limit: 100,
      });
      for (const event of page.events) {
        if (event.id <= cursor) continue;
        const summary = eventSummary(event);
        if (event.id > (this.processedEvents.get(state.runId) ?? 0)) {
          state.stepCount += 1;
          state.lastStepSummary = summary;
          if (
            event.type === "browser.ready" ||
            event.type === "browser.reattached"
          ) {
            const browserId = event.data.browser_session_id;
            const liveUrl = event.data.live_view_url;
            if (typeof browserId === "string") state.browserId = browserId;
            if (typeof liveUrl === "string") state.liveUrl = liveUrl;
          }
          this.processedEvents.set(state.runId, event.id);
        }
        messages.push({
          id: `${state.runId}:${event.id}`,
          type: event.type,
          role: "assistant",
          createdAt: event.ts,
          summary,
          data: event.data,
        });
      }
      const next =
        page.nextAfter ??
        Math.max(cursor, ...page.events.map((event) => event.id));
      if (!page.hasMore) break;
      if (next <= cursor)
        throw new Error("Browser Use events cursor did not advance");
      cursor = next;
    }
    return { messages };
  }

  private async browsersForSession(
    sessionId: string,
  ): Promise<BrowserSessionItemView[]> {
    const browsers: BrowserSessionItemView[] = [];
    for (let pageNumber = 1; ; pageNumber += 1) {
      const page = await this.client.browsers.list({
        agentSessionId: sessionId,
        pageSize: 100,
        pageNumber,
      });
      // Also check ownership locally before performing any destructive action.
      browsers.push(
        ...page.items.filter((browser) => browser.agentSessionId === sessionId),
      );
      if (pageNumber * page.pageSize >= page.totalItems || !page.items.length)
        break;
    }
    return browsers;
  }

  /**
   * Browser ids for an agent session. Browser downloads are stored per
   * browser, so recovery must use these ids, not the agent session id.
   */
  async listBrowserIds(sessionId: string): Promise<string[]> {
    return (await this.browsersForSession(sessionId)).map(
      (browser) => browser.id,
    );
  }

  /** Extension ids (POST /extensions ids) installed on a browser. */
  async getBrowserExtensionIds(browserId: string): Promise<string[]> {
    const browser = await this.client.browsers.get(browserId);
    return (browser.extensions ?? []).map((extension) => extension.id);
  }

  async stopSession(
    sessionId: string,
    strategy: StopStrategy = "session",
  ): Promise<void> {
    const errors: unknown[] = [];
    if (strategy === "session") {
      try {
        const queue = await this.client.sessions.queue(sessionId);
        for (const message of queue.queue) {
          if (message.status === "pending")
            await this.client.sessions.removeMessage(sessionId, message.id);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      // Read the latest run after clearing queued work, even after a worker restart.
      const info = await this.client.sessions.get(sessionId);
      if (normalizeRunStatus(info.status) === "running")
        await this.client.runs.cancel(info.latestRunId);
    } catch (error) {
      errors.push(error);
    }
    if (strategy === "session") {
      try {
        const browsers = await this.browsersForSession(sessionId);
        for (const browser of browsers) {
          if (browser.status !== "active") continue;
          try {
            await this.client.browsers.stop(browser.id);
          } catch (error) {
            errors.push(error);
          }
        }
      } catch (error) {
        errors.push(error);
      }
    }
    // Preserve conversation history for audit; do not delete the agent session.
    if (errors.length)
      throw new AggregateError(
        errors,
        "Unable to fully stop Browser Use session",
      );
  }

  async createWorkspace(name?: string): Promise<WorkspaceInfo> {
    return this.client.workspaces.create(name ? { name } : {});
  }

  async getWorkspaceFiles(
    workspaceId: string,
  ): Promise<WorkspaceFileListResponse> {
    return this.client.workspaces.files(workspaceId, {
      limit: 100,
      includeUrls: true,
    });
  }

  async getAllSessionFiles(sessionId: string): Promise<BrowserUseFileInfo[]> {
    // Browser downloads are separate from the V4 workspace file namespace.
    const files: BrowserUseFileInfo[] = [];
    for (const browser of await this.browsersForSession(sessionId)) {
      let cursor: string | null | undefined;
      do {
        const page = await this.client.browsers.downloads(browser.id, {
          limit: 100,
          includeUrls: true,
          cursor,
        });
        files.push(...page.files);
        if (page.hasMore && (!page.nextCursor || page.nextCursor === cursor))
          throw new Error("Browser downloads cursor did not advance");
        cursor = page.nextCursor;
      } while (cursor);
    }
    return files;
  }

  async getAllWorkspaceFiles(
    workspaceId: string,
  ): Promise<BrowserUseFileInfo[]> {
    const files: BrowserUseFileInfo[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await this.client.workspaces.files(workspaceId, {
        limit: 100,
        includeUrls: true,
        cursor,
      });
      files.push(...page.files);
      if (page.hasMore && (!page.nextCursor || page.nextCursor === cursor))
        throw new Error("Workspace files cursor did not advance");
      cursor = page.nextCursor;
    } while (cursor);
    return files;
  }

  async uploadFileToWorkspace(
    workspaceId: string,
    file: { name: string; type: string; buffer: Buffer },
  ): Promise<{ id: string; name: string; path: string }> {
    const upload = await this.client.workspaces.uploadFiles(workspaceId, {
      files: [
        { name: file.name, contentType: file.type, size: file.buffer.length },
      ],
      allowOverrides: false,
    });
    const uploaded = upload.files[0];
    if (!uploaded)
      throw new Error("Browser Use did not return an upload target");
    const response = await fetch(uploaded.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: new Uint8Array(file.buffer),
    });
    if (!response.ok)
      throw new Error(
        `Browser Use file upload failed: ${response.status} ${response.statusText}`,
      );
    this.uploads.set(workspaceId, [
      ...(this.uploads.get(workspaceId) ?? []),
      uploaded.id,
    ]);
    return { id: uploaded.id, name: uploaded.storedName, path: uploaded.path };
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.client.workspaces.delete(workspaceId);
  }
}
