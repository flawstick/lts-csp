import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { taxReturns, jurisdictions, taxSyncJobs, organisations, tasks, substanceForms, jobs } from "@repo/database";
import { desc, sql, eq, and, lt, inArray } from "drizzle-orm";
import { CloudWatchLogsClient, GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import * as cheerio from "cheerio";
import { launchTaxSync, launchBrowserTask } from "@/lib/ecs";

export const taxReturnRouter = createTRPCRouter({
  sync: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const url = "https://my.gov.gg/revenue/employee-assigned-cases?taxReferenceType=All&year=All&formStatus=All&items_per_page=50&page=0";

      const response = await fetch(url, {
        headers: {
          "Accept": "text/html",
          "Cookie": input.token,
          "User-Agent": "Mozilla/5.0",
        },
      });

      if (!response.ok) throw new Error(`Failed: ${response.status}`);

      const html = await response.text();
      const $ = cheerio.load(html);
      const returns: { id: string; entity: string; jurisdiction: string; year: number; status: string; source: string }[] = [];

      $("table tbody tr").each((_, row) => {
        const $row = $(row);
        const entityName = $row.find(".views-field-taxReferenceOwnerName").text().replace(/\s+/g, " ").trim();
        const trn = $row.find(".views-field-taxReferenceNumber").text().replace(/\s+/g, " ").trim();
        const year = $row.find(".views-field-year").text().replace(/\s+/g, " ").trim();
        const statusText = $row.find(".views-field-formStatus").text().replace(/\s+/g, " ").trim();

        let status = "pending";
        if (statusText.includes("Submitted")) status = "completed";
        else if (statusText.includes("Prepared")) status = "in_progress";

        if (entityName && trn) {
          returns.push({
            id: `${trn}-${year}`,
            entity: entityName,
            jurisdiction: "Guernsey",
            year: parseInt(year) || 2024,
            status,
            source: "Guernsey Tax Portal",
          });
        }
      });

      return returns;
    }),

  delete: publicProcedure
    .input(z.array(z.string()))
    .mutation(async ({ ctx, input }) => {
      if (input.length === 0) return;
      await ctx.db.delete(taxReturns).where(inArray(taxReturns.id, input));
    }),

  // Get a single tax return with substance form
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.id),
        with: {
          jurisdiction: true,
          substanceForm: true,
          tasks: true,
        },
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      return taxReturn;
    }),

  // Add file to a tax return
  addFile: publicProcedure
    .input(z.object({
      taxReturnId: z.string().uuid(),
      file: z.object({
        url: z.string().url(),
        name: z.string(),
        size: z.number(),
        type: z.string(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      const currentFiles = (taxReturn.files ?? []) as Array<{
        url: string;
        name: string;
        size: number;
        type: string;
        uploadedAt: string;
      }>;

      const newFile = {
        ...input.file,
        uploadedAt: new Date().toISOString(),
      };

      const [updated] = await ctx.db
        .update(taxReturns)
        .set({
          files: [...currentFiles, newFile],
        })
        .where(eq(taxReturns.id, input.taxReturnId))
        .returning();

      return updated;
    }),

  // Remove file from a tax return
  removeFile: publicProcedure
    .input(z.object({
      taxReturnId: z.string().uuid(),
      fileUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      const currentFiles = (taxReturn.files ?? []) as Array<{
        url: string;
        name: string;
        size: number;
        type: string;
        uploadedAt: string;
      }>;

      const updatedFiles = currentFiles.filter(f => f.url !== input.fileUrl);

      const [updated] = await ctx.db
        .update(taxReturns)
        .set({
          files: updatedFiles,
        })
        .where(eq(taxReturns.id, input.taxReturnId))
        .returning();

      return updated;
    }),

  list: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.enum(["pending", "in_progress", "review_required", "completed", "failed"]).optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, status, search } = input;
      const offset = (page - 1) * pageSize;

      // Build where conditions
      const conditions = [];
      if (status) {
        conditions.push(eq(taxReturns.status, status));
      }
      if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(
          sql`(${taxReturns.entityName} ILIKE ${searchPattern} OR ${taxReturns.externalId} ILIKE ${searchPattern})`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [returns, countResult] = await Promise.all([
        ctx.db
          .select({
            id: taxReturns.id,
            entityName: taxReturns.entityName,
            taxYear: taxReturns.taxYear,
            status: taxReturns.status,
            externalId: taxReturns.externalId,
            link: taxReturns.link,
            pdfUrl: taxReturns.pdfUrl,
            createdAt: taxReturns.createdAt,
            jurisdiction: {
              name: jurisdictions.name,
              code: jurisdictions.code,
            },
          })
          .from(taxReturns)
          .leftJoin(jurisdictions, eq(taxReturns.jurisdictionId, jurisdictions.id))
          .where(whereClause)
          .orderBy(desc(taxReturns.createdAt))
          .limit(pageSize)
          .offset(offset),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(taxReturns)
          .where(whereClause),
      ]);

      const total = Number(countResult[0]?.count || 0);
      const totalPages = Math.ceil(total / pageSize);

      return {
        returns,
        total,
        page,
        pageSize,
        totalPages,
      };
    }),

  listSyncJobs: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize } = input;
      const offset = (page - 1) * pageSize;

      // Mark stale "running" jobs as failed (running for more than 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      await ctx.db
        .update(taxSyncJobs)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: "Task timed out or was stopped externally"
        })
        .where(
          and(
            eq(taxSyncJobs.status, "running"),
            lt(taxSyncJobs.startedAt, tenMinutesAgo)
          )
        );

      const [jobs, countResult] = await Promise.all([
        ctx.db
          .select({
            id: taxSyncJobs.id,
            status: taxSyncJobs.status,
            ecsTaskArn: taxSyncJobs.ecsTaskArn,
            cloudwatchLogGroup: taxSyncJobs.cloudwatchLogGroup,
            cloudwatchLogStream: taxSyncJobs.cloudwatchLogStream,
            returnsFound: taxSyncJobs.returnsFound,
            startedAt: taxSyncJobs.startedAt,
            completedAt: taxSyncJobs.completedAt,
            errorMessage: taxSyncJobs.errorMessage,
            createdAt: taxSyncJobs.createdAt,
            jurisdiction: {
              name: jurisdictions.name,
              code: jurisdictions.code,
            },
          })
          .from(taxSyncJobs)
          .leftJoin(jurisdictions, eq(taxSyncJobs.jurisdictionId, jurisdictions.id))
          .orderBy(desc(taxSyncJobs.createdAt))
          .limit(pageSize)
          .offset(offset),
        ctx.db.select({ count: sql<number>`count(*)` }).from(taxSyncJobs),
      ]);

      const total = Number(countResult[0]?.count || 0);
      const totalPages = Math.ceil(total / pageSize);

      return {
        jobs,
        total,
        page,
        pageSize,
        totalPages,
      };
    }),

  getSyncJobLogs: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      let job = await ctx.db.query.taxSyncJobs.findFirst({
        where: eq(taxSyncJobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (!job.cloudwatchLogGroup || !job.cloudwatchLogStream) {
        return { logs: [], job };
      }

      const markJobFailed = async (reason: string) => {
        await ctx.db
          .update(taxSyncJobs)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorMessage: reason
          })
          .where(eq(taxSyncJobs.id, job!.id));
        job = { ...job!, status: "failed", completedAt: new Date(), errorMessage: reason };
      };

      try {
        const client = new CloudWatchLogsClient({ region: "eu-west-2" });
        const command = new GetLogEventsCommand({
          logGroupName: job.cloudwatchLogGroup,
          logStreamName: job.cloudwatchLogStream,
          startFromHead: true,
          limit: 500,
        });

        const response = await client.send(command);
        const logs = (response.events || []).map((event) => ({
          timestamp: event.timestamp,
          message: event.message || "",
        }));

        if (job.status === "running") {
          // Detect if the job crashed from logs
          if (logs.length > 0) {
            const logText = logs.map(l => l.message).join("\n");
            const hasCrashed = logText.includes("ELIFECYCLE") ||
                              logText.includes("exit code 1") ||
                              logText.includes("SyntaxError") ||
                              logText.includes("Error:") ||
                              logText.includes("Cannot find module");

            if (hasCrashed) {
              await markJobFailed("Task crashed - check logs for details");
            }
          } else if (job.startedAt) {
            // No logs but job claims to be running - check if stale
            const ageMs = Date.now() - new Date(job.startedAt).getTime();
            if (ageMs > 60_000) {
              // Running for >1 min with no logs = dead
              await markJobFailed("Task died without producing logs");
            }
          }
        }

        return { logs, job };
      } catch (error) {
        console.error("Failed to fetch CloudWatch logs:", error);
        // CloudWatch error (ResourceNotFoundException = log stream doesn't exist)
        // Only mark as failed if running for >30s (give ECS time to create log stream)
        if (job.status === "running" && job.startedAt) {
          const ageMs = Date.now() - new Date(job.startedAt).getTime();
          if (ageMs > 30_000) {
            await markJobFailed("Task failed - log stream not found");
          }
        }
        return { logs: [], job, error: "Failed to fetch logs" };
      }
    }),

  startSyncJob: publicProcedure
    .input(z.object({ eformsCookie: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get org and jurisdiction
      const org = await ctx.db.query.organisations.findFirst();
      const jurisdiction = await ctx.db.query.jurisdictions.findFirst({
        where: eq(jurisdictions.name, "Guernsey"),
      });

      if (!org || !jurisdiction) {
        throw new Error("Organisation or Guernsey jurisdiction not found");
      }

      // Create job record
      const [job] = await ctx.db
        .insert(taxSyncJobs)
        .values({
          orgId: org.id,
          jurisdictionId: jurisdiction.id,
          status: "pending",
          cloudwatchLogGroup: "/ecs/lts-tax-sync",
        })
        .returning();

      if (!job) throw new Error("Failed to create job");

      // Launch ECS task
      const result = await launchTaxSync({
        jobId: job.id,
        eformsCookie: input.eformsCookie,
      });

      // Extract log stream from task ARN (task ID is at the end)
      const taskId = result.taskArn?.split("/").pop();
      const logStream = taskId ? `ecs/lts-tax-sync/${taskId}` : null;

      // Update job with ECS info
      await ctx.db
        .update(taxSyncJobs)
        .set({
          ecsTaskArn: result.taskArn,
          cloudwatchLogStream: logStream,
          status: "running",
          startedAt: new Date(),
        })
        .where(eq(taxSyncJobs.id, job.id));

      return { jobId: job.id, taskArn: result.taskArn };
    }),

  getActiveSyncJob: publicProcedure.query(async ({ ctx }) => {
    // First, mark stale "running" jobs as failed (running for more than 3 minutes)
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    await ctx.db
      .update(taxSyncJobs)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: "Task crashed or timed out"
      })
      .where(
        and(
          eq(taxSyncJobs.status, "running"),
          lt(taxSyncJobs.startedAt, threeMinutesAgo)
        )
      );

    const activeJob = await ctx.db.query.taxSyncJobs.findFirst({
      where: eq(taxSyncJobs.status, "running"),
      orderBy: desc(taxSyncJobs.createdAt),
    });

    // If we have an active job, check CloudWatch logs for crash indicators
    if (activeJob?.cloudwatchLogGroup && activeJob?.cloudwatchLogStream) {
      try {
        const client = new CloudWatchLogsClient({ region: "eu-west-2" });
        const command = new GetLogEventsCommand({
          logGroupName: activeJob.cloudwatchLogGroup,
          logStreamName: activeJob.cloudwatchLogStream,
          startFromHead: true,
          limit: 100,
        });

        const response = await client.send(command);
        const logText = (response.events || []).map(e => e.message || "").join("\n");

        const hasCrashed = logText.includes("ELIFECYCLE") ||
                          logText.includes("exit code 1") ||
                          logText.includes("SyntaxError") ||
                          logText.includes("Cannot find module");

        if (hasCrashed) {
          await ctx.db
            .update(taxSyncJobs)
            .set({
              status: "failed",
              completedAt: new Date(),
              errorMessage: "Task crashed - check logs for details"
            })
            .where(eq(taxSyncJobs.id, activeJob.id));

          return null; // No active job anymore
        }
      } catch {
        // Ignore CloudWatch errors here
      }
    }

    return activeJob ?? null;
  }),

  deleteTasks: publicProcedure
    .input(z.array(z.string()))
    .mutation(async ({ ctx, input }) => {
      if (input.length === 0) return;
      await ctx.db.delete(tasks).where(inArray(tasks.id, input));
    }),

  // List tasks with substance form status
  listTasks: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]).optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, status, search } = input;
      const offset = (page - 1) * pageSize;

      const conditions = [];
      if (status) {
        conditions.push(eq(tasks.status, status));
      }
      if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(
          sql`(${tasks.name} ILIKE ${searchPattern})`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [taskList, countResult] = await Promise.all([
        ctx.db
          .select({
            id: tasks.id,
            name: tasks.name,
            description: tasks.description,
            status: tasks.status,
            taskType: tasks.taskType,
            createdAt: tasks.createdAt,
            taxReturn: {
              id: taxReturns.id,
              entityName: taxReturns.entityName,
              taxYear: taxReturns.taxYear,
              externalId: taxReturns.externalId,
            },
            substanceForm: {
              id: substanceForms.id,
              isComplete: substanceForms.isComplete,
              missingFields: substanceForms.missingFields,
            },
          })
          .from(tasks)
          .leftJoin(taxReturns, eq(tasks.taxReturnId, taxReturns.id))
          .leftJoin(substanceForms, eq(taxReturns.id, substanceForms.taxReturnId))
          .where(whereClause)
          .orderBy(desc(tasks.createdAt))
          .limit(pageSize)
          .offset(offset),
        ctx.db.select({ count: sql<number>`count(*)` }).from(tasks).where(whereClause),
      ]);

      const total = Number(countResult[0]?.count || 0);
      const totalPages = Math.ceil(total / pageSize);

      return {
        tasks: taskList,
        total,
        page,
        pageSize,
        totalPages,
      };
    }),

  // Create a task for a tax return
  createTask: publicProcedure
    .input(z.object({ taxReturnId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get the tax return with substance form
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
        with: { substanceForm: true },
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      if (taxReturn.status === "completed") {
        throw new Error("Cannot create task for completed tax return");
      }

      // Check if task already exists
      const existingTask = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.taxReturnId, input.taxReturnId),
      });

      if (existingTask) {
        return existingTask;
      }

      // Create the task
      const [newTask] = await ctx.db
        .insert(tasks)
        .values({
          orgId: taxReturn.orgId,
          jurisdictionId: taxReturn.jurisdictionId,
          taxReturnId: input.taxReturnId,
          name: `${taxReturn.entityName} - ${taxReturn.taxYear}`,
          description: `Tax return processing for ${taxReturn.entityName}`,
          taskType: "tax_return",
          status: "pending",
        })
        .returning();

      // Create substance form for the tax return if it doesn't exist
      if (!taxReturn.substanceForm) {
        await ctx.db.insert(substanceForms).values({
          taxReturnId: input.taxReturnId,
          entityName: taxReturn.entityName,
          taxReferenceNumber: taxReturn.externalId ?? undefined,
          accountingPeriodStart: `${taxReturn.taxYear}-01-01`,
          accountingPeriodEnd: `${taxReturn.taxYear}-12-31`,
        });
      }

      return newTask;
    }),

  // Check if form is complete before starting task
  canStartTask: publicProcedure
    .input(z.object({ taxReturnId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const form = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (!form) {
        return {
          canStart: false,
          reason: "Substance form not found. Please create the form first.",
        };
      }

      if (!form.isComplete) {
        const missing = (form.missingFields as string[]) || [];
        return {
          canStart: false,
          reason: `Substance form incomplete. ${missing.length} fields missing.`,
          missingFields: missing,
        };
      }

      return { canStart: true };
    }),

  // Get a single task with its jobs
  getTask: publicProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
        with: {
          taxReturn: {
            with: {
              jurisdiction: true,
              substanceForm: true,
            },
          },
          jobs: {
            orderBy: desc(jobs.createdAt),
          },
        },
      });

      if (!task) {
        throw new Error("Task not found");
      }

      return task;
    }),

  // Get a single job
  getJob: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
        with: {
          task: {
            with: {
              taxReturn: {
                with: {
                  jurisdiction: true,
                  substanceForm: true,
                },
              },
            },
          },
        },
      });

      if (!job) {
        throw new Error("Job not found");
      }

      return job;
    }),

  // Start a new job for a task (launches ECS browser task)
  startJob: publicProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      overrideSaved: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get the task with tax return
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
        with: {
          taxReturn: {
            with: { substanceForm: true },
          },
          jobs: true,
        },
      });

      if (!task) {
        throw new Error("Task not found");
      }

      if (!task.taxReturn) {
        throw new Error("Task has no associated tax return");
      }

      // Check if substance form is complete
      if (!task.taxReturn.substanceForm?.isComplete) {
        throw new Error("Substance form must be complete before starting");
      }

      // Check for running jobs
      const runningJob = task.jobs.find(j => j.status === "running");
      if (runningJob) {
        throw new Error("A job is already running for this task");
      }

      // Get the next job number
      const jobNumber = task.jobs.length + 1;

      // Create job record
      const [newJob] = await ctx.db
        .insert(jobs)
        .values({
          taskId: input.taskId,
          jobNumber,
          status: "pending",
          cloudwatchLogGroup: "/ecs/lts-browser-task",
        })
        .returning();

      if (!newJob) {
        throw new Error("Failed to create job");
      }

      // Update task status
      await ctx.db
        .update(tasks)
        .set({ status: "in_progress" })
        .where(eq(tasks.id, input.taskId));

      try {
        // Launch ECS task
        const result = await launchBrowserTask({
          jobId: newJob.id,
          taxReturnId: task.taxReturn.id,
          taskId: input.taskId,
          overrideSaved: input.overrideSaved,
        });

        // Update job with ECS info
        await ctx.db
          .update(jobs)
          .set({
            ecsTaskArn: result.taskArn,
            cloudwatchLogStream: result.cloudwatchLogStream,
            status: "running",
            startedAt: new Date(),
          })
          .where(eq(jobs.id, newJob.id));

        return {
          jobId: newJob.id,
          taskArn: result.taskArn,
        };
      } catch (err) {
        // Mark job as failed
        await ctx.db
          .update(jobs)
          .set({
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "Failed to launch ECS task",
          })
          .where(eq(jobs.id, newJob.id));

        throw err;
      }
    }),

  // Pause a running job (keeps browser alive for manual intervention)
  stopJob: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.status !== "running") {
        throw new Error("Job is not running");
      }

      // Pause the job - keeps browser session alive
      await ctx.db
        .update(jobs)
        .set({
          status: "paused",
        })
        .where(eq(jobs.id, input.jobId));

      return { success: true };
    }),

  // Cancel a job completely (kills browser session)
  cancelJob: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.status !== "running" && job.status !== "paused") {
        throw new Error("Job is not active");
      }

      // TODO: Actually stop the ECS task via StopTaskCommand
      await ctx.db
        .update(jobs)
        .set({
          status: "cancelled",
          completedAt: new Date(),
        })
        .where(eq(jobs.id, input.jobId));

      return { success: true };
    }),

  // Resume a paused job (user completed required action like login)
  resumeJob: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.status !== "paused") {
        throw new Error("Job is not paused");
      }

      // Set job back to running - the ECS task is polling for this change
      await ctx.db
        .update(jobs)
        .set({
          status: "running",
        })
        .where(eq(jobs.id, input.jobId));

      return { success: true };
    }),

  // Delete a job
  deleteJob: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      // Don't allow deleting running jobs
      if (job.status === "running") {
        throw new Error("Cannot delete a running job. Stop it first.");
      }

      await ctx.db.delete(jobs).where(eq(jobs.id, input.jobId));

      return { success: true };
    }),

  // Update job chat and steps (for persistence)
  updateJobData: publicProcedure
    .input(z.object({
      jobId: z.string().uuid(),
      chatMessages: z.array(z.object({
        id: z.string(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.number(),
      })).optional(),
      steps: z.array(z.object({
        stepNumber: z.number().optional(),
        goal: z.string().optional(),
        memory: z.string().optional(),
        url: z.string().optional(),
        message: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      const currentData = (job.resultData as Record<string, unknown>) || {};

      await ctx.db
        .update(jobs)
        .set({
          resultData: {
            ...currentData,
            ...(input.chatMessages && { chatMessages: input.chatMessages }),
            ...(input.steps && { steps: input.steps }),
          },
        })
        .where(eq(jobs.id, input.jobId));

      return { success: true };
    }),
});
