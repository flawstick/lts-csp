/** Direct reads of the local e2e database, for asserting what the apps wrote. */
import postgres from "postgres";
import { DATABASE_URL } from "./config";

export const sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });

export type JobRow = {
  id: string;
  job_number: number;
  status: string;
  result_data: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date;
};

export async function jobsForTask(taskId: string): Promise<JobRow[]> {
  return sql<JobRow[]>`
    select id, job_number, status, result_data, error_message, created_at
    from lts_job where task_id = ${taskId} order by job_number`;
}

export async function returnRow(taxReturnId: string) {
  const [row] = await sql<
    Array<{ status: string; ready_for_submission_at: Date | null; metadata: Record<string, unknown> | null }>
  >`select status, ready_for_submission_at, metadata from lts_tax_return where id = ${taxReturnId}`;
  return row!;
}

export async function formRow(taxReturnId: string) {
  const [row] = await sql<
    Array<{ notice_of_assessment: string | null; last_edited_at: Date | null; is_complete: boolean | null }>
  >`select notice_of_assessment, last_edited_at, is_complete from lts_substance_form where tax_return_id = ${taxReturnId}`;
  return row!;
}

/**
 * Puts a seeded paused run back the way a live paused worker keeps it: status
 * paused with a fresh heartbeat. No worker runs in the harness, so after a
 * minute the web app marks such a run "heartbeat lost" (failed) when any page
 * reads it; this undoes that and keeps the heartbeat fresh until `stop()`.
 */
export async function rearmPausedJob(jobId: string, taskId: string) {
  const beat = () =>
    sql`update lts_job set result_data = coalesce(result_data, '{}'::jsonb) || jsonb_build_object('lastHeartbeatAt', ${Date.now()}::bigint)
        where id = ${jobId}`;
  await sql`
    update lts_job
    set status = 'paused', completed_at = null, error_message = null,
        result_data = (coalesce(result_data, '{}'::jsonb) - 'staleFailureAt' - 'staleFailureReason')
          || jsonb_build_object('lastHeartbeatAt', ${Date.now()}::bigint)
    where id = ${jobId}`;
  await sql`update lts_task set status = 'in_progress' where id = ${taskId}`;
  await sql`update lts_tax_return set status = 'in_progress'
            where id = (select tax_return_id from lts_task where id = ${taskId}) and status <> 'completed'`;
  const timer = setInterval(() => void beat().catch(() => {}), 15_000);
  return { stop: () => clearInterval(timer) };
}
