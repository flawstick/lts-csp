import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserUseClient } from "./browser-use-client";
import {
  BROWSER_SCREEN_SIZE,
  DEFAULT_FINAL_PROFILE,
  DEFAULT_PREPARE_PROFILE,
} from "./browser-use-config";

const profile = DEFAULT_PREPARE_PROFILE;

const sdk = vi.hoisted(() => ({
  options: vi.fn(),
  runs: {
    create: vi.fn(),
    status: vi.fn(),
    get: vi.fn(),
    events: vi.fn(),
    cancel: vi.fn(),
  },
  sessions: { get: vi.fn(), queue: vi.fn(), removeMessage: vi.fn() },
  browsers: { list: vi.fn(), stop: vi.fn(), downloads: vi.fn() },
  workspaces: {
    create: vi.fn(),
    files: vi.fn(),
    uploadFiles: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("browser-use-sdk/v4", () => ({
  BrowserUse: class {
    constructor(options: unknown) {
      sdk.options(options);
    }
    runs = sdk.runs;
    sessions = sdk.sessions;
    browsers = sdk.browsers;
    workspaces = sdk.workspaces;
  },
}));

const createdRun = (runId = "run-1") => ({
  id: runId,
  sessionId: "session",
  workspaceId: "workspace",
  status: "queued",
  model: DEFAULT_PREPARE_PROFILE.model,
});
const event = (
  id: number,
  type = "tool.completed",
  data: Record<string, unknown> = {},
) => ({ id, runId: "run-1", ts: `2026-11-13T00:00:0${id}Z`, type, data });

beforeEach(() => {
  vi.resetAllMocks();
  sdk.runs.create.mockResolvedValue(createdRun());
  sdk.runs.status.mockResolvedValue({ status: "running" });
  sdk.sessions.get.mockResolvedValue({
    sessionId: "session",
    latestRunId: "run-1",
    workspaceId: "workspace",
    status: "running",
  });
  sdk.sessions.queue.mockResolvedValue({ queue: [] });
  sdk.browsers.list.mockResolvedValue({
    items: [],
    totalItems: 0,
    pageSize: 100,
  });
});

describe("Browser Use V4 lifecycle", () => {
  it("starts the prepare profile (Sonnet 5, medium, $4 session budget) without retrying create requests", async () => {
    const client = new BrowserUseClient("key");
    const state = await client.runTask("Prepare only", {
      profile,
      workspaceId: "workspace",
      proxyCountryCode: "uk",
    });
    expect(state).toMatchObject({
      id: "session",
      runId: "run-1",
      status: "running",
    });
    expect(sdk.options).toHaveBeenCalledWith({ apiKey: "key", maxRetries: 0 });
    expect(sdk.runs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-5",
        modelParams: {
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
        },
        maxCostUsd: 4,
        workspaceId: "workspace",
        keepAlive: 900,
        browserSettings: {
          proxyCountryCode: "uk",
          screenWidth: 1280,
          screenHeight: 1024,
        },
      }),
    );
    expect(sdk.runs.create.mock.calls[0]![0].sessionId).toBeUndefined();
  });

  it("continues the same session with a new run and reuses its browser", async () => {
    const client = new BrowserUseClient("key");
    await client.runTask("First", { profile });
    sdk.runs.create.mockResolvedValue(createdRun("run-2"));
    const state = await client.runTask("Continue", { sessionId: "session", profile });
    expect(state.runId).toBe("run-2");
    expect(sdk.runs.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: "session",
        workspaceId: "workspace",
      }),
    );
    expect(sdk.runs.create.mock.calls[1]![0]).not.toHaveProperty(
      "browserSettings",
    );
  });

  it("provisions new browsers at a pane-shaped standard screen size without enabling resizing", async () => {
    const client = new BrowserUseClient("key");
    await client.runTask("Prepare only", {
      profile,
      extensionIds: ["guard"],
    });
    const settings = sdk.runs.create.mock.calls[0]![0].browserSettings;
    expect(settings).toEqual({
      proxyCountryCode: null,
      screenWidth: BROWSER_SCREEN_SIZE.width,
      screenHeight: BROWSER_SCREEN_SIZE.height,
      extensionIds: ["guard"],
    });
    // Taller than 16:9 so the live view fills the task page's browser pane.
    expect(BROWSER_SCREEN_SIZE.width / BROWSER_SCREEN_SIZE.height).toBeLessThan(
      16 / 9,
    );
    expect(BROWSER_SCREEN_SIZE.width).toBeGreaterThanOrEqual(1280);
    expect(settings).not.toHaveProperty("allowResizing");
  });

  it("never resizes a running session's browser on follow-ups", async () => {
    const client = new BrowserUseClient("key");
    sdk.runs.create.mockResolvedValue(createdRun("run-2"));
    await client.runTask("Reviewer reply", { sessionId: "session", profile });
    const followUp = sdk.runs.create.mock.calls[0]![0];
    expect(followUp.sessionId).toBe("session");
    expect(followUp).not.toHaveProperty("browserSettings");
  });

  it("keeps the session budget and model on follow-ups (budget sent only at creation)", async () => {
    const client = new BrowserUseClient("key");
    await client.runTask("First", { profile });
    sdk.runs.create.mockResolvedValue(createdRun("run-2"));
    await client.runTask("Reviewer reply", { sessionId: "session", profile });
    const followUp = sdk.runs.create.mock.calls[1]![0];
    expect(sdk.runs.create.mock.calls[0]![0].maxCostUsd).toBe(4);
    // Omitted = Browser Use keeps the current session budget and spend.
    expect(followUp).not.toHaveProperty("maxCostUsd");
    expect(followUp).toMatchObject({
      model: "claude-sonnet-5",
      modelParams: { output_config: { effort: "medium" } },
    });
  });

  it("starts final filing on Opus 5.5 at high effort with the final budget", async () => {
    sdk.runs.create.mockResolvedValue({
      ...createdRun(),
      model: DEFAULT_FINAL_PROFILE.model,
    });
    const state = await new BrowserUseClient("key").runTask("Submit", {
      profile: DEFAULT_FINAL_PROFILE,
    });
    expect(state.model).toBe("claude-opus-5-5");
    expect(sdk.runs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-5-5",
        modelParams: {
          thinking: { type: "adaptive" },
          output_config: { effort: "high" },
        },
        maxCostUsd: 6,
      }),
    );
  });

  it("cancels a run started on a model other than the profile's", async () => {
    sdk.runs.create.mockResolvedValue({
      ...createdRun("other-model"),
      model: "claude-opus-5-5",
    });
    await expect(
      new BrowserUseClient("key").runTask("First", { profile }),
    ).rejects.toThrow("unexpected model");
    expect(sdk.runs.cancel).toHaveBeenCalledWith("other-model");
  });

  it("reads budgeted spend (LLM + search) separately from total cost", async () => {
    (sdk.sessions as Record<string, unknown>).cost = vi.fn().mockResolvedValue({
      llmCostUsd: "3.900000",
      searchCostUsd: "0.100000",
      browserCostUsd: "0.020000",
      proxyCostUsd: "0.010000",
      totalCostUsd: "4.030000",
    });
    const spend = await new BrowserUseClient("key").getSessionSpend("session");
    expect(spend.budgetSpentUsd).toBeCloseTo(4);
    expect(spend.totalCostUsd).toBeCloseTo(4.03);
  });

  it("does not silently continue in an unexpected session", async () => {
    const client = new BrowserUseClient("key");
    await client.runTask("First", { profile });
    sdk.runs.create.mockResolvedValue({
      ...createdRun("bad-run"),
      sessionId: "wrong-session",
    });
    await expect(
      client.runTask("Continue", { sessionId: "session", profile }),
    ).rejects.toThrow("different session");
    expect(sdk.runs.cancel).toHaveBeenCalledWith("bad-run");
  });

  it.each(["completed", "failed", "cancelled"])(
    "fetches terminal %s output once after cheap status polling",
    async (status) => {
      const client = new BrowserUseClient("key");
      await client.runTask("First", { profile });
      await client.getSession("session");
      expect(sdk.runs.get).not.toHaveBeenCalled();
      sdk.runs.status.mockResolvedValue({ status });
      sdk.runs.get.mockResolvedValue({
        status,
        result: status === "completed" ? "READY_FOR_MANUAL_SUBMISSION" : null,
        error: "failure detail",
      });
      const state = await client.getSession("session");
      expect(state.output).toBe(
        status === "completed"
          ? "READY_FOR_MANUAL_SUBMISSION"
          : "failure detail",
      );
      expect(state.isTaskSuccessful).toBe(status === "completed");
      expect(state.status).toBe(
        status === "completed"
          ? "idle"
          : status === "failed"
            ? "error"
            : "stopped",
      );
      await client.getSession("session");
      expect(sdk.runs.get).toHaveBeenCalledTimes(1);
    },
  );

  it("drains all event pages and updates browser identity from ready/reattached events", async () => {
    const client = new BrowserUseClient("key");
    const state = await client.runTask("First", { profile });
    sdk.runs.events
      .mockResolvedValueOnce({
        events: [
          event(1, "browser.ready", {
            browser_session_id: "browser-1",
            live_view_url: "https://live.example/1",
          }),
        ],
        nextAfter: 1,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        events: [
          event(2, "browser.reattached", {
            browser_session_id: "browser-2",
            live_view_url: "https://live.example/2",
          }),
        ],
        nextAfter: 2,
        hasMore: false,
      });
    const result = await client.getMessages("session");
    expect(result.messages.map((message) => message.id)).toEqual([
      "run-1:1",
      "run-1:2",
    ]);
    expect(sdk.runs.events).toHaveBeenLastCalledWith("run-1", {
      after: 1,
      limit: 100,
    });
    expect(state).toMatchObject({
      browserId: "browser-2",
      liveUrl: "https://live.example/2",
      stepCount: 2,
    });
    sdk.runs.events.mockResolvedValue({ events: [], hasMore: false });
    await client.getMessages("session", "run-1:2");
    expect(sdk.runs.events).toHaveBeenLastCalledWith("run-1", {
      after: 2,
      limit: 100,
    });
    sdk.runs.create.mockResolvedValue(createdRun("run-2"));
    await client.runTask("Continue", { sessionId: "session", profile });
    await client.getMessages("session", "run-1:2");
    expect(sdk.runs.events).toHaveBeenLastCalledWith("run-2", {
      after: 0,
      limit: 100,
    });
  });

  it("fails an event stream whose pagination cannot advance", async () => {
    const client = new BrowserUseClient("key");
    await client.runTask("First", { profile });
    sdk.runs.events.mockResolvedValue({
      events: [],
      nextAfter: 0,
      hasMore: true,
    });
    await expect(client.getMessages("session")).rejects.toThrow(
      "cursor did not advance",
    );
  });

  it("pauses the latest run without stopping the browser or deleting the session", async () => {
    const client = new BrowserUseClient("key");
    sdk.sessions.get.mockResolvedValue({
      latestRunId: "newer-run",
      status: "running",
    });
    await client.stopSession("session", "task");
    expect(sdk.runs.cancel).toHaveBeenCalledWith("newer-run");
    expect(sdk.browsers.stop).not.toHaveBeenCalled();
    expect(sdk.sessions.queue).not.toHaveBeenCalled();
  });

  it("stops only owned active browsers, preserving history and already stopped browsers", async () => {
    const client = new BrowserUseClient("key");
    sdk.sessions.queue.mockResolvedValue({
      queue: [
        { id: 1, status: "pending" },
        { id: 2, status: "consumed" },
      ],
    });
    sdk.browsers.list.mockResolvedValue({
      items: [
        { id: "owned", agentSessionId: "session", status: "active" },
        { id: "foreign", agentSessionId: "other", status: "active" },
        { id: "done", agentSessionId: "session", status: "stopped" },
      ],
      totalItems: 3,
      pageSize: 100,
    });
    await client.stopSession("session", "session");
    expect(sdk.sessions.removeMessage).toHaveBeenCalledWith("session", 1);
    expect(sdk.browsers.stop.mock.calls).toEqual([["owned"]]);
  });

  it("retrieves browser downloads separately from workspace files", async () => {
    const client = new BrowserUseClient("key");
    sdk.browsers.list.mockResolvedValue({
      items: [{ id: "browser", agentSessionId: "session" }],
      totalItems: 1,
      pageSize: 100,
    });
    sdk.browsers.downloads
      .mockResolvedValueOnce({
        files: [{ path: "receipt.pdf" }],
        nextCursor: "next",
        hasMore: true,
      })
      .mockResolvedValueOnce({
        files: [{ path: "second.pdf" }],
        hasMore: false,
      });
    expect(await client.getAllSessionFiles("session")).toEqual([
      { path: "receipt.pdf" },
      { path: "second.pdf" },
    ]);
    expect(sdk.browsers.downloads).toHaveBeenLastCalledWith("browser", {
      limit: 100,
      includeUrls: true,
      cursor: "next",
    });
    expect(sdk.workspaces.files).not.toHaveBeenCalled();
  });

  it("passes only successfully uploaded attachment IDs to the run", async () => {
    const client = new BrowserUseClient("key");
    sdk.workspaces.uploadFiles.mockResolvedValue({
      files: [
        {
          id: "upload",
          storedName: "accounts.pdf",
          path: "uploads/accounts.pdf",
          uploadUrl: "https://upload.example",
        },
      ],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    try {
      expect(
        await client.uploadFileToWorkspace("workspace", {
          name: "accounts.pdf",
          type: "application/pdf",
          buffer: Buffer.from("pdf"),
        }),
      ).toMatchObject({ id: "upload", path: "uploads/accounts.pdf" });
      await client.runTask("Read accounts", { workspaceId: "workspace", profile });
      expect(sdk.runs.create).toHaveBeenCalledWith(
        expect.objectContaining({ attachedFileIds: ["upload"] }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("cancels a run when the API reports missing source attachments", async () => {
    sdk.runs.create.mockResolvedValue({
      ...createdRun(),
      missingFileIds: ["missing"],
    });
    await expect(
      new BrowserUseClient("key").runTask("Read accounts", { profile }),
    ).rejects.toThrow("required source files");
    expect(sdk.runs.cancel).toHaveBeenCalledWith("run-1");
  });

  it("rejects a silent model substitution", async () => {
    sdk.runs.create.mockResolvedValue({
      ...createdRun(),
      model: "different-model",
    });
    await expect(new BrowserUseClient("key").runTask("First", { profile })).rejects.toThrow(
      "unexpected model",
    );
    expect(sdk.runs.cancel).toHaveBeenCalledWith("run-1");
  });

  it("still closes the browser if cancellation fails", async () => {
    sdk.runs.cancel.mockRejectedValue(new Error("cancel failed"));
    sdk.browsers.list.mockResolvedValue({
      items: [{ id: "owned", agentSessionId: "session", status: "active" }],
      totalItems: 1,
      pageSize: 100,
    });
    await expect(
      new BrowserUseClient("key").stopSession("session"),
    ).rejects.toThrow("fully stop");
    expect(sdk.browsers.stop).toHaveBeenCalledWith("owned");
  });
});

describe("bu-ultrafast prepare profile", () => {
  const ultrafast = { ...DEFAULT_PREPARE_PROFILE, model: "bu-ultrafast" as const };

  it("sends no modelParams (the preset rejects any), keeping budget and model checks", async () => {
    sdk.runs.create.mockResolvedValue({ ...createdRun(), model: "bu-ultrafast" });
    const client = new BrowserUseClient("key");
    const state = await client.runTask("Prepare only", { profile: ultrafast });
    expect(state.model).toBe("bu-ultrafast");
    const body = sdk.runs.create.mock.calls[0]![0];
    expect(body).not.toHaveProperty("modelParams");
    expect(body).toMatchObject({ model: "bu-ultrafast", maxCostUsd: 4 });

    sdk.runs.create.mockResolvedValue({ ...createdRun("run-2"), model: "bu-ultrafast" });
    await client.runTask("Reviewer reply", { sessionId: "session", profile: ultrafast });
    expect(sdk.runs.create.mock.calls[1]![0]).not.toHaveProperty("modelParams");
  });

  it("still cancels a run Browser Use started on another model", async () => {
    sdk.runs.create.mockResolvedValue({ ...createdRun("swapped"), model: "gpt-6-luna" });
    await expect(
      new BrowserUseClient("key").runTask("Prepare only", { profile: ultrafast }),
    ).rejects.toThrow("unexpected model");
    expect(sdk.runs.cancel).toHaveBeenCalledWith("swapped");
  });
});

describe("getSessionStatus", () => {
  it("reads another job's session fresh, never from the cache", async () => {
    const client = new BrowserUseClient("key");
    sdk.sessions.get.mockResolvedValueOnce({ sessionId: "other", latestRunId: "r", status: "running" });
    expect(await client.getSessionStatus("other")).toBe("running");
    sdk.sessions.get.mockResolvedValueOnce({ sessionId: "other", latestRunId: "r", status: "cancelled" });
    expect(await client.getSessionStatus("other")).toBe("stopped");
    expect(sdk.sessions.get).toHaveBeenCalledTimes(2);
  });
});
