import { getSub, CHANNELS, type JobEvent } from "@repo/redis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  const encoder = new TextEncoder();
  const sub = getSub();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: JobEvent) => {
        // Filter by jobId if provided
        if (jobId && event.jobId !== jobId) return;

        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      await sub.subscribe(CHANNELS.JOB_EVENTS);

      sub.on("message", (_channel, message) => {
        try {
          const event = JSON.parse(message) as JobEvent;
          sendEvent(event);
        } catch {
          // Ignore parse errors
        }
      });

      // Send keepalive every 30s
      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        sub.unsubscribe(CHANNELS.JOB_EVENTS);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
