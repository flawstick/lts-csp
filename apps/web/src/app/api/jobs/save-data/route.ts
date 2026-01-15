import { NextResponse } from "next/server"
import { db, jobs } from "@repo/database"
import { eq } from "drizzle-orm"
import { z } from "zod"

const SaveDataSchema = z.object({
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
  liveUrl: z.string().optional(),
})

// POST handler for saving job data (used by navigator.sendBeacon on unmount)
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json()
    const input = SaveDataSchema.parse(body)

    const job = await db.query.jobs.findFirst({
      where: eq(jobs.id, input.jobId),
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const currentData = (job.resultData ?? {}) as Record<string, unknown>

    await db
      .update(jobs)
      .set({
        resultData: {
          ...currentData,
          ...(input.chatMessages && { chatMessages: input.chatMessages }),
          ...(input.steps && { steps: input.steps }),
          ...(input.liveUrl && { liveUrl: input.liveUrl }),
        },
      })
      .where(eq(jobs.id, input.jobId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save job data:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 }
    )
  }
}
