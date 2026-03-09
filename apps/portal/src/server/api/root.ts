import { portalAccessRouter } from "@/server/api/routers/portal-access";
import { portalReturnsRouter } from "@/server/api/routers/portal-returns";
import { portalTeamRouter } from "@/server/api/routers/portal-team";
import { postRouter } from "@/server/api/routers/post";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  portalAccess: portalAccessRouter,
  portalReturns: portalReturnsRouter,
  portalTeam: portalTeamRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
