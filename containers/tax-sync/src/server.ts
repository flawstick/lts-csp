import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createLogger } from "./logger";
import { ensureTaxSyncJobId, runTaxSyncJob } from "./run-sync";

interface ScrapeRequestBody {
  jobId?: string;
  orgId?: string;
  jurisdictionCode?: string;
  portalUsername?: string;
  portalPassword?: string;
  wait?: boolean;
}

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const AUTH_TOKEN = process.env.TAX_SYNC_HANDLER_TOKEN?.trim() || "";
const activeJobs = new Map<string, Promise<unknown>>();

function sendJson(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: Record<string, unknown>,
) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function getBearerToken(header: string | string[] | undefined) {
  if (typeof header !== "string") {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as unknown;
}

async function startJob(body: ScrapeRequestBody) {
  const orgId = normalizeString(body.orgId);
  const jurisdictionCode = normalizeString(body.jurisdictionCode)?.toUpperCase();

  if (!orgId || !jurisdictionCode) {
    throw new Error("orgId and jurisdictionCode are required");
  }

  const jobId = await ensureTaxSyncJobId({
    jobId: normalizeString(body.jobId),
    orgId,
    jurisdictionCode,
  });

  if (activeJobs.has(jobId)) {
    const error = new Error(`Job ${jobId} is already running in this handler`);
    (error as Error & { statusCode?: number }).statusCode = 409;
    throw error;
  }

  const logger = createLogger("RAILWAY", jurisdictionCode, jobId.slice(0, 8));
  const promise = runTaxSyncJob({
    jobId,
    orgId,
    jurisdictionCode,
    portalUsername: normalizeString(body.portalUsername),
    portalPassword: normalizeString(body.portalPassword),
    logger,
  }).finally(() => {
    activeJobs.delete(jobId);
  });

  activeJobs.set(jobId, promise);

  return {
    jobId,
    promise,
  };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        service: "tax-sync-handler",
        activeJobs: activeJobs.size,
      });
      return;
    }

    if (AUTH_TOKEN) {
      const bearerToken = getBearerToken(request.headers.authorization);
      if (bearerToken !== AUTH_TOKEN) {
        sendJson(response, 401, {
          error: "Unauthorized",
        });
        return;
      }
    }

    if (request.method !== "POST" || url.pathname !== "/scrape") {
      sendJson(response, 404, {
        error: "Not found",
      });
      return;
    }

    const parsedBody = await readJsonBody(request);
    if (!isRecord(parsedBody)) {
      sendJson(response, 400, {
        error: "Request body must be a JSON object",
      });
      return;
    }

    const body = parsedBody as ScrapeRequestBody;
    const wait = body.wait === true;
    const { jobId, promise } = await startJob(body);

    if (wait) {
      const result = await promise;
      sendJson(response, 200, {
        accepted: true,
        mode: "wait",
        jobId,
        result,
      });
      return;
    }

    void promise.catch(() => undefined);
    sendJson(response, 202, {
      accepted: true,
      mode: "background",
      jobId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      typeof (error as { statusCode?: unknown })?.statusCode === "number"
        ? ((error as { statusCode: number }).statusCode ?? 500)
        : 500;
    sendJson(response, statusCode, {
      error: message,
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  const logger = createLogger("RAILWAY");
  logger.info("Tax sync handler listening", {
    port: PORT,
    authEnabled: Boolean(AUTH_TOKEN),
  });
});
