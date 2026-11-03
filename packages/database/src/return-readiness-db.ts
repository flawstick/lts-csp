import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
  buildSubmissionSignoffRevocation,
  confirmFinancialFiguresMetadata,
  withFinancialFiguresMetadata,
  type FinancialFiguresMetadata,
} from "./return-readiness";
import * as schema from "./schema";
import { taxReturns } from "./schema";

/**
 * Apply the tax return side effects of a change to a return's filing data:
 * - revoke an existing client signoff, so the signatory re-approves what will
 *   actually be filed;
 * - record financial statement currency details from AI extraction;
 * - record that a person entered the profit / net book value figures.
 */
export async function syncTaxReturnAfterFormChange(params: {
  db: PostgresJsDatabase<typeof schema>;
  taxReturnId: string;
  changedFields: string[];
  actor: { source: "portal" | "web" | "ai_extraction"; accountId?: string | null };
  financialFiguresMetadata?: FinancialFiguresMetadata | null;
  confirmFinancialFigures?: boolean;
}) {
  const taxReturn = await params.db.query.taxReturns.findFirst({
    where: eq(taxReturns.id, params.taxReturnId),
    columns: {
      status: true,
      metadata: true,
      readyForSubmissionAt: true,
      readyForSubmissionBy: true,
    },
  });

  if (!taxReturn) {
    return { signoffRevoked: false };
  }

  let metadata: Record<string, unknown> | null = taxReturn.metadata ?? null;
  let metadataChanged = false;

  if (params.financialFiguresMetadata) {
    metadata = withFinancialFiguresMetadata(
      metadata,
      params.financialFiguresMetadata,
    );
    metadataChanged = true;
  }

  if (params.confirmFinancialFigures) {
    const confirmed = confirmFinancialFiguresMetadata(
      metadata,
      params.changedFields,
    );
    if (confirmed) {
      metadata = confirmed;
      metadataChanged = true;
    }
  }

  const revocation = buildSubmissionSignoffRevocation({
    taxReturn: { ...taxReturn, metadata },
    changedFields: params.changedFields,
    actor: params.actor,
  });

  if (revocation) {
    await params.db
      .update(taxReturns)
      .set(revocation)
      .where(eq(taxReturns.id, params.taxReturnId));
  } else if (metadataChanged) {
    await params.db
      .update(taxReturns)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(taxReturns.id, params.taxReturnId));
  }

  return { signoffRevoked: Boolean(revocation) };
}
