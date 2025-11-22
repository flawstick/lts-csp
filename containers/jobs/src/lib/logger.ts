import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  DescribeLogStreamsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { publishJobEvent, type JobEvent } from "@repo/redis";

const LOG_GROUP = process.env.CLOUDWATCH_LOG_GROUP || "/ecs/tax-jobs";

const client = new CloudWatchLogsClient({
  region: process.env.AWS_REGION || "us-east-1",
});

let sequenceToken: string | undefined;

export async function initLogStream(jobId: string) {
  const logStreamName = `job-${jobId}-${Date.now()}`;

  try {
    await client.send(
      new CreateLogStreamCommand({
        logGroupName: LOG_GROUP,
        logStreamName,
      })
    );
  } catch (err: unknown) {
    // Stream may already exist
    if ((err as Error).name !== "ResourceAlreadyExistsException") {
      console.error("Failed to create log stream:", err);
    }
  }

  return logStreamName;
}

export async function log(
  logStreamName: string,
  message: string,
  level: "INFO" | "WARN" | "ERROR" = "INFO"
) {
  const timestamp = Date.now();
  const logMessage = `[${level}] ${message}`;

  // Always log to console
  console.log(logMessage);

  // Send to CloudWatch
  try {
    const response = await client.send(
      new PutLogEventsCommand({
        logGroupName: LOG_GROUP,
        logStreamName,
        logEvents: [{ timestamp, message: logMessage }],
        sequenceToken,
      })
    );
    sequenceToken = response.nextSequenceToken;
  } catch (err) {
    console.error("CloudWatch log failed:", err);
  }
}

export class JobLogger {
  private jobId: string;
  private logStreamName: string | null = null;

  constructor(jobId: string) {
    this.jobId = jobId;
  }

  async init() {
    this.logStreamName = await initLogStream(this.jobId);
  }

  private async logAndPublish(
    level: "INFO" | "WARN" | "ERROR",
    message: string,
    data?: Record<string, unknown>
  ) {
    if (this.logStreamName) {
      await log(this.logStreamName, message, level);
    }

    await publishJobEvent({
      type: "job:progress",
      jobId: this.jobId,
      timestamp: Date.now(),
      data: { message, level, ...data },
    });
  }

  info(message: string, data?: Record<string, unknown>) {
    return this.logAndPublish("INFO", message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    return this.logAndPublish("WARN", message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    return this.logAndPublish("ERROR", message, data);
  }

  async step(stepName: string, data?: Record<string, unknown>) {
    await publishJobEvent({
      type: "job:step",
      jobId: this.jobId,
      timestamp: Date.now(),
      data: { step: stepName, ...data },
    });
    return this.info(`Step: ${stepName}`, data);
  }

  async screenshot(base64: string, description: string) {
    await publishJobEvent({
      type: "job:screenshot",
      jobId: this.jobId,
      timestamp: Date.now(),
      data: { screenshot: base64, description },
    });
  }
}
