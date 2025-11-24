import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { taxReturns, jurisdictions } from "@repo/database";
import { count, desc, eq, ne } from "drizzle-orm";

export const analyticsRouter = createTRPCRouter({
  getStats: publicProcedure.query(async ({ ctx }) => {
    const [totalActive] = await ctx.db
      .select({ count: count(taxReturns.id) })
      .from(taxReturns)
      .where(ne(taxReturns.status, "completed"));

    const [totalCompleted] = await ctx.db
      .select({ count: count(taxReturns.id) })
      .from(taxReturns)
      .where(eq(taxReturns.status, "completed"));
      
    const [total] = await ctx.db
        .select({ count: count(taxReturns.id) })
        .from(taxReturns);

    const totalCount = total?.count ?? 0;
    const completedCount = totalCompleted?.count ?? 0;
    const approvalRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return {
      totalActiveReturns: totalActive?.count ?? 0,
      autoApprovalRate: approvalRate.toFixed(1),
      avgProcessingTime: "1m 42s", // Placeholder
      systemHealth: "Optimal" // Placeholder
    };
  }),

  getRecentActivity: publicProcedure.query(async ({ ctx }) => {
    const activity = await ctx.db.query.taxReturns.findMany({
      orderBy: [desc(taxReturns.updatedAt)],
      limit: 5,
      with: {
        jurisdiction: true
      }
    });
    return activity;
  }),

  getChartData: publicProcedure.query(async () => {
    // Mock data for the area chart
    return [
      { name: "Jan", returns: 400, processed: 240 },
      { name: "Feb", returns: 300, processed: 139 },
      { name: "Mar", returns: 200, processed: 180 },
      { name: "Apr", returns: 278, processed: 208 },
      { name: "May", returns: 189, processed: 140 },
      { name: "Jun", returns: 239, processed: 200 },
      { name: "Jul", returns: 349, processed: 300 },
    ];
  }),
  
  getJurisdictionStats: publicProcedure.query(async ({ ctx }) => {
      const stats = await ctx.db
        .select({
            jurisdiction: jurisdictions.name,
            count: count(taxReturns.id)
        })
        .from(taxReturns)
        .leftJoin(jurisdictions, eq(taxReturns.jurisdictionId, jurisdictions.id))
        .groupBy(jurisdictions.name);
        
      return stats;
  })
});