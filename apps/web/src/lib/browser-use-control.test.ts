import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserUseApiVersion,
  getBrowserUseSessionStatus,
  listBrowserUseSessions,
  stopBrowserUseSession,
} from "./browser-use-control";

afterEach(() => vi.unstubAllGlobals());
function mockApi(handler: (path: string, init?: RequestInit) => unknown) {
  const mock = vi.fn(async (input: string, init?: RequestInit) => {
    const result = handler(
      input.replace("https://api.browser-use.com", ""),
      init,
    );
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("Browser Use dashboard controls", () => {
  it("keeps legacy jobs on V3 and recognises new V4 metadata", () => {
    expect(getBrowserUseApiVersion(null)).toBe(3);
    expect(getBrowserUseApiVersion({ browserUseApiVersion: 4 })).toBe(4);
  });

  it("pauses the actual latest V4 run without closing its browser", async () => {
    const mock = mockApi((path) => {
      if (path === "/api/v4/sessions/session")
        return { latestRunId: "resumed-run", status: "running" };
      if (path === "/api/v4/runs/resumed-run/cancel")
        return { status: "cancelled" };
      throw new Error(`Unexpected request: ${path}`);
    });
    await stopBrowserUseSession("session", "task", 4, "test-key");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1]![1]?.method).toBe("POST");
  });

  it("cancels pending work and closes only active browsers belonging to the session", async () => {
    const paths: string[] = [];
    mockApi((path, init) => {
      paths.push(path);
      if (path.endsWith("/queue"))
        return { queue: [{ id: 4, status: "pending" }] };
      if (path.endsWith("/queue/4")) {
        expect(init?.method).toBe("DELETE");
        return {};
      }
      if (path === "/api/v4/sessions/session")
        return { latestRunId: "run", status: "completed" };
      if (path.startsWith("/api/v4/browsers?"))
        return {
          items: [
            { id: "owned", agentSessionId: "session", status: "active" },
            { id: "foreign", agentSessionId: "other", status: "active" },
            { id: "stopped", agentSessionId: "session", status: "stopped" },
          ],
          totalItems: 3,
          pageSize: 100,
        };
      if (path === "/api/v4/browsers/owned") {
        expect(init?.body).toBe('{"action":"stop"}');
        return {};
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    await stopBrowserUseSession("session", "session", 4, "test-key");
    expect(paths).toContain("/api/v4/browsers/owned");
    expect(paths.some((path) => path.endsWith("/cancel"))).toBe(false);
    expect(paths).not.toContain("/api/v4/browsers/foreign");
  });

  it("still attempts browser shutdown if run cancellation fails", async () => {
    const mock = mockApi((path) => {
      if (path.endsWith("/queue")) return { queue: [] };
      if (path === "/api/v4/sessions/session")
        return { latestRunId: "run", status: "running" };
      if (path.endsWith("/cancel"))
        return new Response("failure", { status: 500 });
      if (path.includes("/browsers?"))
        return {
          items: [
            { id: "browser", agentSessionId: "session", status: "active" },
          ],
          totalItems: 1,
          pageSize: 100,
        };
      return {};
    });
    await expect(
      stopBrowserUseSession("session", "session", 4, "key"),
    ).rejects.toThrow("fully stop");
    expect(
      mock.mock.calls.some(([url]) => url.endsWith("/browsers/browser")),
    ).toBe(true);
  });

  it("retains the legacy stop contract", async () => {
    const mock = mockApi(() => ({ status: "stopped" }));
    await stopBrowserUseSession("legacy", "task", 3, "key");
    expect(mock.mock.calls[0]).toEqual([
      "https://api.browser-use.com/api/v3/sessions/legacy/stop",
      expect.objectContaining({ method: "POST", body: '{"strategy":"task"}' }),
    ]);
  });

  it.each([
    ["queued", "running"],
    ["dispatching", "running"],
    ["completed", "idle"],
    ["failed", "error"],
    ["cancelled", "stopped"],
  ])("maps V4 status %s to %s", async (status, expected) => {
    mockApi(() => ({ status }));
    expect(await getBrowserUseSessionStatus("session", 4, "key")).toBe(
      expected,
    );
  });
});

describe("listBrowserUseSessions", () => {
  it("reads one V4 session page by cursor", async () => {
    const mock = mockApi((path) => {
      if (path === "/api/v4/sessions?limit=100&cursor=c-2")
        return { sessions: [{ sessionId: "s", workspaceId: "w", createdAt: "2026-11-27T10:00:00Z" }], hasMore: false };
      throw new Error(`Unexpected request: ${path}`);
    });
    await expect(listBrowserUseSessions("c-2", "test-key")).resolves.toEqual({
      sessions: [{ sessionId: "s", workspaceId: "w", createdAt: "2026-11-27T10:00:00Z" }],
      hasMore: false,
    });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("never reports an empty list when it cannot search", async () => {
    await expect(listBrowserUseSessions(null, "")).rejects.toThrow(/not configured/);
  });
});
