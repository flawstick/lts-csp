import { NextRequest } from "next/server";
import { getSub, CHANNELS, type JobEvent } from "@repo/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint for streaming job events from Redis
 * GET /api/jobs/[jobId]/events
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sub = getSub();

      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", jobId })}\n\n`)
      );

      // Subscribe to job events
      sub.subscribe(CHANNELS.JOB_EVENTS);

      const messageHandler = (_channel: string, message: string) => {
        try {
          const event = JSON.parse(message) as JobEvent;

          // Only send events for this job
          if (event.jobId === jobId) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          }
        } catch (err) {
          console.error("Failed to parse job event:", err);
        }
      };

      sub.on("message", messageHandler);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        sub.off("message", messageHandler);
        sub.unsubscribe(CHANNELS.JOB_EVENTS);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
