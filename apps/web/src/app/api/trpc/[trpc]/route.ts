import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "@/env";
import { buildTrpcErrorLogEntry } from "@/lib/trpc-error-log";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`
            );
          }
        : ({ path, type, error }) => {
            // Path, code and a safe message only; never the input.
            const entry = buildTrpcErrorLogEntry({ path, type, error });
            if (!entry) return;
            const line = JSON.stringify(entry.record);
            if (entry.level === "error") console.error(line);
            else console.warn(line);
          },
  });

export { handler as GET, handler as POST };
