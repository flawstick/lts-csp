import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { organisations } from "@repo/database";

export const postRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}`,
      };
    }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const slugBase = input.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100);

      await ctx.db.insert(organisations).values({
        name: input.name,
        slug: `${slugBase || "org"}-${Date.now().toString(36)}`,
      });
    }),

  getLatest: publicProcedure.query(async ({ ctx }) => {
    const post = await ctx.db.query.organisations.findFirst({
      orderBy: (orgs, { desc }) => [desc(orgs.createdAt)],
    });

    return post ?? null;
  }),
});
