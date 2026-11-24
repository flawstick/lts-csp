import { NextResponse } from "next/server";
import { db, jobs } from "@repo/database";
import { eq } from "drizzle-orm";
import { mergeResultDataPatchSql } from "@repo/database/operator-messages-sql";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requireStaffAccount } from "@/server/api/staff-auth";

const persistedOptionalString = z
  .string()
  .nullish()
  .transform((value) => (typeof value === "string" ? value : undefined));

const persistedOptionalNumber = z
  .number()
  .nullish()
  .transform((value) => (typeof value === "number" ? value : undefined));

const SaveDataSchema = z.object({
  jobId: z.string().uuid(),
  chatMessages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.number(),
      }),
    )
    .optional(),
  steps: z
    .array(
      z.object({
        stepNumber: persistedOptionalNumber.optional(),
        goal: persistedOptionalString.optional(),
        memory: persistedOptionalString.optional(),
        url: persistedOptionalString.optional(),
        message: persistedOptionalString.optional(),
        timestamp: persistedOptionalNumber.optional(),
      }),
    )
    .optional(),
  liveUrl: persistedOptionalString.optional(),
});

// POST handler for saving job data (used by navigator.sendBeacon on unmount)
export async function POST(request: Request) {
  try {
    await requireStaffAccount();
    const body: unknown = await request.json();
    const input = SaveDataSchema.parse(body);

    const job = await db.query.jobs.findFirst({
      where: eq(jobs.id, input.jobId),
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Merge only these keys in SQL so a beacon never drops a reviewer message
    // or worker state written concurrently.
    const patch = {
      ...(input.chatMessages && { chatMessages: input.chatMessages }),
      ...(input.steps && { steps: input.steps }),
      ...(input.liveUrl && { liveUrl: input.liveUrl }),
    };
    if (Object.keys(patch).length > 0) {
      await db
        .update(jobs)
        .set({ resultData: mergeResultDataPatchSql(patch) })
        .where(eq(jobs.id, input.jobId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    }
    if (error instanceof TRPCError && error.code === "FORBIDDEN") {
      return NextResponse.json({ error: "LTS staff only." }, { status: 403 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid job data." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save job data." }, { status: 500 });
  }
}
