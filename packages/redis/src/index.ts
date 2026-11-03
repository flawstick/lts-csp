import Redis from "ioredis";

// Singleton connections
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
  pub: Redis | undefined;
  sub: Redis | undefined;
};

export function getRedis() {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(process.env.REDIS_URL!);
  }
  return globalForRedis.redis;
}

export function getPub() {
  if (!globalForRedis.pub) {
    globalForRedis.pub = new Redis(process.env.REDIS_URL!, {
      connectTimeout: 5_000,
      commandTimeout: 2_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    globalForRedis.pub.on("error", (error: Error) => {
      console.warn("Job event publisher unavailable:", error.message);
    });
  }
  return globalForRedis.pub;
}

export function getSub() {
  if (!globalForRedis.sub) {
    globalForRedis.sub = new Redis(process.env.REDIS_URL!);
  }
  return globalForRedis.sub;
}

// Channel names
export const CHANNELS = {
  JOB_EVENTS: "job:events",
  JOB_PROGRESS: "job:progress",
  JOB_LOGS: "job:logs",
} as const;

// Event types
export type JobEventType =
  | "job:started"
  | "job:progress"
  | "job:step"
  | "job:screenshot"
  | "job:completed"
  | "job:failed"
  | "job:requires_attention";

export interface JobEvent {
  type: JobEventType;
  jobId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// Publish helper
export async function publishJobEvent(event: JobEvent) {
  const pub = getPub();
  // Events are transient notifications; durable job state lives in Postgres.
  // A disconnected publisher must never hold up browser startup or execution.
  if (pub.status !== "ready") {
    return;
  }

  try {
    await pub.publish(CHANNELS.JOB_EVENTS, JSON.stringify(event));
  } catch (error) {
    console.warn(
      "Job event publish failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

// Subscribe helper
export function subscribeToJobEvents(
  callback: (event: JobEvent) => void,
): () => void {
  const sub = getSub();

  sub.subscribe(CHANNELS.JOB_EVENTS);
  sub.on("message", (_channel, message) => {
    callback(JSON.parse(message) as JobEvent);
  });

  return () => {
    sub.unsubscribe(CHANNELS.JOB_EVENTS);
  };
}

export { Redis };
