import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { taxReturns, jurisdictions, tasks } from "@repo/database";
import { count, desc, eq, ne, and, gte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ACTIVITY_RANGE_DAYS,
  activityWindowStart,
  buildDailySeries,
} from "@/lib/activity-series";

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
  
  /**
   * Daily returns added and tasks completed for the dashboard chart,
   * bucketed by UTC day and zero-filled.
   */
  getActivitySeries: publicProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        days: z
          .number()
          .int()
          .refine((days) => (ACTIVITY_RANGE_DAYS as readonly number[]).includes(days))
          .default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = activityWindowStart(input.days);
      const returnDay = sql<string>`to_char(${taxReturns.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
      // Tasks have no completion timestamp; a completed task's last update
      // is when it finished.
      const taskFinishedAt = sql<Date>`COALESCE(${tasks.updatedAt}, ${tasks.createdAt})`;
      const taskDay = sql<string>`to_char(${taskFinishedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

      const [returnRows, taskRows] = await Promise.all([
        ctx.db
          .select({ day: returnDay, count: count(taxReturns.id) })
          .from(taxReturns)
          .where(and(eq(taxReturns.orgId, input.orgId), gte(taxReturns.createdAt, since)))
          .groupBy(returnDay),
        ctx.db
          .select({ day: taskDay, count: count(tasks.id) })
          .from(tasks)
          .where(
            and(
              eq(tasks.orgId, input.orgId),
              eq(tasks.status, "completed"),
              gte(taskFinishedAt, since),
            ),
          )
          .groupBy(taskDay),
      ]);

      return buildDailySeries({ days: input.days, returns: returnRows, tasks: taskRows });
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
  }),

  getDashboardStats: publicProcedure
    .input(z.object({
      orgId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { orgId } = input;

      // Get returns stats
      const [totalReturns] = await ctx.db
        .select({ count: count(taxReturns.id) })
        .from(taxReturns)
        .where(orgId ? eq(taxReturns.orgId, orgId) : undefined);

      const [pendingReturns] = await ctx.db
        .select({ count: count(taxReturns.id) })
        .from(taxReturns)
        .where(orgId
          ? and(eq(taxReturns.orgId, orgId), eq(taxReturns.status, "pending"))
          : eq(taxReturns.status, "pending")
        );

      const [completedReturns] = await ctx.db
        .select({ count: count(taxReturns.id) })
        .from(taxReturns)
        .where(orgId
          ? and(eq(taxReturns.orgId, orgId), eq(taxReturns.status, "completed"))
          : eq(taxReturns.status, "completed")
        );

      // Get tasks stats
      const [totalTasks] = await ctx.db
        .select({ count: count(tasks.id) })
        .from(tasks)
        .where(orgId ? eq(tasks.orgId, orgId) : undefined);

      const [pendingTasks] = await ctx.db
        .select({ count: count(tasks.id) })
        .from(tasks)
        .where(orgId
          ? and(eq(tasks.orgId, orgId), eq(tasks.status, "pending"))
          : eq(tasks.status, "pending")
        );

      const [runningTasks] = await ctx.db
        .select({ count: count(tasks.id) })
        .from(tasks)
        .where(orgId
          ? and(eq(tasks.orgId, orgId), eq(tasks.status, "in_progress"))
          : eq(tasks.status, "in_progress")
        );

      const [completedTasks] = await ctx.db
        .select({ count: count(tasks.id) })
        .from(tasks)
        .where(orgId
          ? and(eq(tasks.orgId, orgId), eq(tasks.status, "completed"))
          : eq(tasks.status, "completed")
        );

      const [failedTasks] = await ctx.db
        .select({ count: count(tasks.id) })
        .from(tasks)
        .where(orgId
          ? and(eq(tasks.orgId, orgId), eq(tasks.status, "failed"))
          : eq(tasks.status, "failed")
        );

      return {
        returns: {
          total: totalReturns?.count ?? 0,
          pending: pendingReturns?.count ?? 0,
          completed: completedReturns?.count ?? 0,
        },
        tasks: {
          total: totalTasks?.count ?? 0,
          pending: pendingTasks?.count ?? 0,
          running: runningTasks?.count ?? 0,
          completed: completedTasks?.count ?? 0,
          failed: failedTasks?.count ?? 0,
        },
      };
    }),
});