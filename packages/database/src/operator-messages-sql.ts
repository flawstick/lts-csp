/**
 * Race-free `jobs.result_data` writes for the human <-> agent conversation.
 * See ./operator-messages for which side owns which keys.
 */
import { sql, type SQL } from "drizzle-orm";

import {
  WEB_OWNED_RESULT_DATA_KEYS,
  type OperatorMessageReply,
} from "./operator-messages";

const RESULT_DATA_COLUMN = sql.raw(`"result_data"`);
const WEB_OWNED_KEYS_SQL = sql.raw(
  `ARRAY[${WEB_OWNED_RESULT_DATA_KEYS.map((key) => `'${key}'`).join(",")}]::text[]`,
);

/** Drop web-owned keys from a worker's in-memory result data. */
export function omitWebOwnedResultData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...data };
  for (const key of WEB_OWNED_RESULT_DATA_KEYS) delete copy[key];
  return copy;
}

/**
 * Worker write: replace result_data with the worker's copy, but keep whatever
 * the database currently holds for web-owned keys (evaluated against the row
 * at update time, so a concurrent reviewer reply is never lost).
 */
export function preserveWebOwnedResultDataSql(
  workerData: Record<string, unknown>,
): SQL {
  const json = JSON.stringify(omitWebOwnedResultData(workerData));
  return sql`(${json}::jsonb || coalesce((select jsonb_object_agg(owned.key, owned.value) from jsonb_each(coalesce(${RESULT_DATA_COLUMN}, '{}'::jsonb)) as owned where owned.key = any(${WEB_OWNED_KEYS_SQL})), '{}'::jsonb))`;
}

/** Web write: merge only the given top-level keys into result_data. */
export function mergeResultDataPatchSql(patch: Record<string, unknown>): SQL {
  return sql`(coalesce(${RESULT_DATA_COLUMN}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb)`;
}

function patchOperatorMessagesSql(ids: string[], patch: unknown, match: SQL): SQL {
  const idsJson = JSON.stringify(ids);
  const patchJson = JSON.stringify(patch);
  return sql`jsonb_set(coalesce(${RESULT_DATA_COLUMN}, '{}'::jsonb), '{operatorMessages}', coalesce((select jsonb_agg(case when item.message->>'id' in (select jsonb_array_elements_text(${idsJson}::jsonb)) and ${match} then item.message || ${patchJson}::jsonb else item.message end order by item.ordinal) from jsonb_array_elements(coalesce(${RESULT_DATA_COLUMN}->'operatorMessages', '[]'::jsonb)) with ordinality as item(message, ordinal)), '[]'::jsonb), true)`;
}

const IS_PENDING = sql`item.message->>'status' = 'pending'`;

/**
 * Worker write: mark the given pending reviewer messages as delivered to a
 * run, optionally with the reply shown under each (a status answer, or a
 * delivery acknowledgement the agent may later replace).
 */
export function markOperatorMessagesDeliveredSql(input: {
  ids: string[];
  runId: string | null;
  deliveredAt: number;
  reply?: OperatorMessageReply;
}): SQL {
  return patchOperatorMessagesSql(
    input.ids,
    {
      status: "delivered",
      deliveredAt: input.deliveredAt,
      deliveredRunId: input.runId,
      interrupt: false,
      ...(input.reply ? { reply: input.reply } : {}),
    },
    IS_PENDING,
  );
}

/**
 * Worker write: the agent's own answer to delivered reviewer questions.
 * Replaces only a missing reply or the worker's acknowledgement, never an
 * earlier agent answer.
 */
export function setAgentReplySql(input: {
  ids: string[];
  reply: OperatorMessageReply;
}): SQL {
  return patchOperatorMessagesSql(
    input.ids,
    { reply: input.reply },
    sql`item.message->>'status' = 'delivered' and coalesce(item.message->'reply'->>'source', 'worker') <> 'agent'`,
  );
}
