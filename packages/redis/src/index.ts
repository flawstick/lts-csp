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
    globalForRedis.pub = new Redis(process.env.REDIS_URL!);
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
  | "job:failed";

export interface JobEvent {
  type: JobEventType;
  jobId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// Publish helper
export async function publishJobEvent(event: JobEvent) {
  const pub = getPub();
  await pub.publish(CHANNELS.JOB_EVENTS, JSON.stringify(event));
}

// Subscribe helper
export function subscribeToJobEvents(
  callback: (event: JobEvent) => void
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
