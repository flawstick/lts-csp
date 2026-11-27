/**
 * Seeds the local e2e database with an LTS staff user, a client signatory,
 * one client organisation and Guernsey ESR 2025 returns in the states that
 * production returns reach. Job `resultData` is built with the same shared
 * helpers the worker uses (fingerprintPreparedInputs, the preparedDraft
 * record, submitPreparedDispatchedAt, PORTAL_NET_BOOK_VALUE_KEY), so the web
 * gates treat these rows exactly like real ones.
 *
 * Must only be imported after process.env.DATABASE_URL points at the local
 * e2e database (the @repo/database client connects on import).
 */
import { CLIENT_EMAIL, DATABASE_URL, STAFF_EMAIL, userIdForEmail } from "./config";

if (process.env.DATABASE_URL !== DATABASE_URL) {
  throw new Error("e2e seed: DATABASE_URL must be the local e2e database");
}

const database = await import("@repo/database");
const preparedDraft = await import("@repo/database/prepared-draft");
const { extractAgentQuestionText } = await import("@repo/database/operator-messages");
const {
  db,
  accounts,
  globalAdmins,
  organisations,
  orgSettings,
  jurisdictions,
  portalMemberships,
  taxReturns,
  substanceForms,
  tasks,
  jobs,
  eq,
} = database;
const {
  fingerprintPreparedInputs,
  SUBMIT_PREPARED_OPERATION,
  SUBMIT_PREPARED_DISPATCHED_KEY,
  PORTAL_NET_BOOK_VALUE_KEY,
} = preparedDraft;
/** The marker a submit_prepared run reports when the draft did not match (worker prompt-builder). */
const PREPARED_DRAFT_NOT_VERIFIED_MARKER = "PREPARED_DRAFT_NOT_VERIFIED";

const HOUR = 3_600_000;
const now = Date.now();
const at = (msAgo: number) => new Date(now - msAgo);

export type SeededReturn = {
  key: string;
  taxReturnId: string;
  taskId: string;
  entityName: string;
};

export type SeedResult = {
  orgId: string;
  staffAccountId: string;
  clientAccountId: string;
  returns: Record<string, SeededReturn>;
};

/** A complete Certificate 3 form with investment-only profit (out of scope). */
function certificateThreeForm(entityName: string, companyNumber: string) {
  return {
    entityName,
    entityType: "Company",
    accountingPeriodStart: "2025-01-01",
    accountingPeriodEnd: "2025-12-31",
    isCollectiveInvestmentVehicle: "No",
    companyNumber,
    taxReferenceNumber: `G${companyNumber}`,
    registeredAddress: "PO Box 1, Les Banques, St Peter Port, Guernsey GY1 1AA",
    principalPlaceOfBusiness: "Les Banques, St Peter Port, Guernsey",
    isIncorporatedInGuernsey: "Yes",
    economicClassificationCode: "64209",
    certificateType: "Certificate 3",
    entityActivity: "Holding of investments",
    areFinancialStatementsConsolidated: "No",
    accountsPreparerName: "E2E Accountants LLP",
    accountsPreparerQualification: "ICAEW",
    netBookValue: "0",
    totalProfit: "18250",
    profitAllocation: "Investment",
    isGuernseyFiFatca: "No",
    isGuernseyFiCrs: "No",
    isRegisteredOnIgor: "No",
    relevantActivity: "None of the above",
    hasMultipleRelevantActivities: "No",
    hasIntellectualPropertyHolding: "No",
    isConstituentEntity: "No",
    hasPostBalanceSheetEvent: "No",
    hasC42Association: "No",
    contractInformation: "Standard CSP administration agreement",
    directors: [{ name: "A. Director", initials: "AD" }, { name: "B. Director", initials: "BD" }],
    preparedBy: "E2E Staff",
    preparedDate: "2026-11-20",
    managerSignOff: "E2E Manager",
    managerSignOffDate: "2026-11-21",
    isComplete: true,
    missingFields: [] as string[],
    lastEditedAt: at(30 * HOUR),
  };
}

async function fingerprintFor(taxReturnId: string) {
  // Same query and inputs as the worker (containers/task index.ts) and the web gate.
  const row = await db.query.taxReturns.findFirst({
    where: eq(taxReturns.id, taxReturnId),
    with: { substanceForm: true, jurisdiction: true },
  });
  if (!row?.substanceForm) throw new Error("seed: form missing");
  return fingerprintPreparedInputs({
    entityName: row.entityName,
    taxYear: row.taxYear,
    link: row.link,
    files: row.files,
    substanceForm: row.substanceForm as Record<string, unknown>,
  });
}

/** resultData of a prepare_only run that reached the review page (worker shape). */
function preparedReadyResult(input: { fingerprint: string; draftId: string; reference: string; readyAt: number }) {
  const reviewUrl = `https://revenueservice.gov.gg/company-tax-ui/${input.draftId}/reviewAndSubmit/summary`;
  return {
    submissionMode: "prepare_only",
    overrideSaved: false,
    startupTimeoutMs: 45_000,
    browserUseApiVersion: 4,
    browserUseModel: "e2e-seeded",
    output: [
      "READY_FOR_MANUAL_SUBMISSION",
      `REVIEW_PAGE_URL: ${reviewUrl}`,
      `PORTAL_REFERENCE: ${input.reference}`,
      "All sections show COMPLETE on the review summary. Stopped before Submit.",
    ].join("\n"),
    prepareOnlyReadyAt: input.readyAt,
    preparedDraft: {
      version: 1,
      preparedAt: input.readyAt,
      inputFingerprint: input.fingerprint,
      reviewUrl,
      portalReference: input.reference,
    },
    [PORTAL_NET_BOOK_VALUE_KEY]: {
      policy: "verified_negative_entered_as_zero",
      decision: "as_saved",
      provenance: "form",
      status: "as_saved",
    },
    lastHeartbeatAt: input.readyAt,
  };
}

export async function seed(): Promise<SeedResult> {
  const [org] = await db
    .insert(organisations)
    .values({ name: "E2E Client Services Ltd", slug: "e2e-client-services" })
    .returning();
  if (!org) throw new Error("seed: org");
  await db.insert(orgSettings).values({
    orgId: org.id,
    settings: {
      portalContactInfo: { name: "E2E Filing Contact", email: "filing@client-e2e.test", phone: "+44 1481 000000" },
    },
  });
  const [gg] = await db
    .insert(jurisdictions)
    .values([
      { code: "GG", name: "Guernsey", country: "Channel Islands", portalUrl: "https://eforms.gov.gg" },
      { code: "JE", name: "Jersey", country: "Channel Islands", portalUrl: "https://www.gov.je" },
    ])
    .returning();
  if (!gg) throw new Error("seed: jurisdiction");

  // Supabase Auth users (auth.users), as they exist before anyone signs in.
  await db.execute(database.sql`
    insert into auth.users (id, email, raw_user_meta_data) values
      (${userIdForEmail(STAFF_EMAIL)}, ${STAFF_EMAIL}, ${JSON.stringify({ full_name: "E2E Staff" })}::jsonb),
      (${userIdForEmail(CLIENT_EMAIL)}, ${CLIENT_EMAIL}, ${JSON.stringify({ full_name: "E2E Signatory" })}::jsonb)
    on conflict (id) do nothing`);

  const [staff] = await db
    .insert(accounts)
    .values({ userId: userIdForEmail(STAFF_EMAIL), fullName: "E2E Staff", accountType: "internal" })
    .returning();
  if (!staff) throw new Error("seed: staff");
  await db.insert(globalAdmins).values({ accountId: staff.id });

  const [client] = await db
    .insert(accounts)
    .values({ userId: userIdForEmail(CLIENT_EMAIL), fullName: "E2E Signatory", accountType: "portal" })
    .returning();
  if (!client) throw new Error("seed: client");
  await db.insert(portalMemberships).values({
    accountId: client.id,
    orgId: org.id,
    role: "admin",
    canApproveFilings: true,
    status: "active",
    joinedAt: at(400 * HOUR),
  });

  const returns: Record<string, SeededReturn> = {};

  async function createReturn(input: {
    key: string;
    entityName: string;
    companyNumber: string;
    status: "pending" | "review_required" | "failed" | "in_progress";
    signedOff: boolean;
    noticeOfAssessment?: "Yes" | "No" | null;
    taskStatus: "pending" | "in_progress" | "completed" | "failed";
  }) {
    const [ret] = await db
      .insert(taxReturns)
      .values({
        orgId: org!.id,
        jurisdictionId: gg!.id,
        entityName: input.entityName,
        taxYear: 2025,
        status: input.status,
        returnType: "economic_substance",
        externalId: `e2e-${input.key}`,
        link: null,
        // Signed accounts on file, as on real returns (the portal requires them
        // for Certificate 3). The URL is never fetched by these flows.
        files: [
          {
            url: `http://127.0.0.1:9/e2e-files/${input.companyNumber}-signed-financial-statements-2025.pdf`,
            name: `${input.entityName} signed financial statements 2025.pdf`,
            size: 182_344,
            type: "application/pdf",
            uploadedAt: at(200 * HOUR).toISOString(),
            category: "financial",
            role: "financial_statements",
          },
        ],
        metadata: {
          certificateTypeHint: "Certificate 3",
          certificateTypeSource: "saved_form",
          certificateTypeConfidence: 1,
          certificateTypeOverridden: false,
          ...(input.signedOff
            ? { submissionSignoff: { at: at(20 * HOUR).toISOString(), accountId: client!.id, capacity: "admin" } }
            : {}),
        },
        readyForSubmissionAt: input.signedOff ? at(20 * HOUR) : null,
        readyForSubmissionBy: input.signedOff ? client!.id : null,
        createdAt: at(500 * HOUR),
      })
      .returning();
    if (!ret) throw new Error("seed: return");
    await db.insert(substanceForms).values({
      taxReturnId: ret.id,
      ...certificateThreeForm(input.entityName, input.companyNumber),
      noticeOfAssessment: input.noticeOfAssessment ?? null,
    });
    const [task] = await db
      .insert(tasks)
      .values({
        orgId: org!.id,
        jurisdictionId: gg!.id,
        taxReturnId: ret.id,
        name: input.entityName,
        taskType: "tax_return",
        status: input.taskStatus,
        createdBy: staff!.id,
        createdAt: at(100 * HOUR),
      })
      .returning();
    if (!task) throw new Error("seed: task");
    returns[input.key] = { key: input.key, taxReturnId: ret.id, taskId: task.id, entityName: input.entityName };
    return { taxReturnId: ret.id, taskId: task.id };
  }

  async function addPreparedJob(taskId: string, taxReturnId: string, jobNumber: number, hoursAgo: number, draftId: string, reference: string) {
    const fingerprint = await fingerprintFor(taxReturnId);
    const readyAt = now - hoursAgo * HOUR + 25 * 60_000;
    const [job] = await db
      .insert(jobs)
      .values({
        taskId,
        jobNumber,
        status: "completed",
        startedAt: at(hoursAgo * HOUR),
        completedAt: new Date(readyAt),
        createdBy: staff!.id,
        createdAt: at(hoursAgo * HOUR),
        resultData: preparedReadyResult({ fingerprint, draftId, reference, readyAt }),
      })
      .returning();
    return job!;
  }

  // (a) Notclif-like: prepared draft ready, NoA unset, client signed off.
  {
    const r = await createReturn({
      key: "a_ready_default",
      entityName: "Notclif E2E Holdings Limited",
      companyNumber: "61001",
      status: "review_required",
      signedOff: true,
      noticeOfAssessment: null,
      taskStatus: "completed",
    });
    await addPreparedJob(r.taskId, r.taxReturnId, 1, 6, "e2eDraftA001", "ESR-2025-61001");
  }

  // (b) Latest Prepare only run timed out after an earlier ready one.
  {
    const r = await createReturn({
      key: "b_failed_prepare",
      entityName: "Failed Prepare E2E Limited",
      companyNumber: "61002",
      status: "failed",
      signedOff: true,
      noticeOfAssessment: null,
      taskStatus: "failed",
    });
    await addPreparedJob(r.taskId, r.taxReturnId, 1, 30, "e2eDraftB001", "ESR-2025-61002");
    await db.insert(jobs).values({
      taskId: r.taskId,
      jobNumber: 2,
      status: "failed",
      startedAt: at(5 * HOUR),
      completedAt: at(4 * HOUR),
      createdBy: staff!.id,
      createdAt: at(5 * HOUR),
      errorMessage: "Browser Use session timed out before reaching a terminal state",
      resultData: {
        submissionMode: "prepare_only",
        overrideSaved: false,
        startupTimeoutMs: 45_000,
        browserUseApiVersion: 4,
        output: "E2E seeded output of the timed-out prepare run: reached Entity Accounts.",
        lastHeartbeatAt: now - 4 * HOUR,
      },
    });
  }

  // (c) Submit prepared return reached the portal and failed without a receipt.
  {
    const r = await createReturn({
      key: "c_locked",
      entityName: "Locked Submit E2E Limited",
      companyNumber: "61003",
      status: "failed",
      signedOff: true,
      noticeOfAssessment: null,
      taskStatus: "failed",
    });
    const prepared = await addPreparedJob(r.taskId, r.taxReturnId, 1, 40, "e2eDraftC001", "ESR-2025-61003");
    const dispatchedAt = now - 30 * HOUR;
    await db.insert(jobs).values({
      taskId: r.taskId,
      jobNumber: 2,
      status: "failed",
      startedAt: at(30 * HOUR + 60_000),
      completedAt: at(29 * HOUR),
      createdBy: staff!.id,
      createdAt: at(30 * HOUR + 120_000),
      errorMessage: "Submit prepared return stopped: the agent could not verify the prepared draft.",
      resultData: {
        submissionMode: "submit_and_capture_pdf",
        overrideSaved: false,
        startupTimeoutMs: 45_000,
        filingOperation: SUBMIT_PREPARED_OPERATION,
        preparedJobId: prepared.id,
        browserUseApiVersion: 4,
        noticeOfAssessment: "Yes",
        noticeOfAssessmentDefaulted: true,
        [SUBMIT_PREPARED_DISPATCHED_KEY]: dispatchedAt,
        output: `REQUIRES_ATTENTION: ${PREPARED_DRAFT_NOT_VERIFIED_MARKER}: the review page showed a different portal reference (ESR-2025-99999), so I did not submit.`,
        lastHeartbeatAt: now - 29 * HOUR,
      },
    });
  }

  // (d) NoA explicitly "No", prepared draft ready.
  {
    const r = await createReturn({
      key: "d_noa_no",
      entityName: "Assessment Declined E2E Limited",
      companyNumber: "61004",
      status: "review_required",
      signedOff: true,
      noticeOfAssessment: "No",
      taskStatus: "completed",
    });
    await addPreparedJob(r.taskId, r.taxReturnId, 1, 6, "e2eDraftD001", "ESR-2025-61004");
  }

  // (e) Complete and manager-signed, awaiting the client's sign-off; NoA unset.
  await createReturn({
    key: "e_awaiting_signoff",
    entityName: "Awaiting Signoff E2E Limited",
    companyNumber: "61005",
    status: "pending",
    signedOff: false,
    noticeOfAssessment: null,
    taskStatus: "pending",
  });

  // (f) Like (a), used to save No / Yes from the staff editor.
  {
    const r = await createReturn({
      key: "f_edit_noa",
      entityName: "Edit Assessment E2E Limited",
      companyNumber: "61006",
      status: "review_required",
      signedOff: true,
      noticeOfAssessment: null,
      taskStatus: "completed",
    });
    await addPreparedJob(r.taskId, r.taxReturnId, 1, 6, "e2eDraftF001", "ESR-2025-61006");
  }

  // (g) The latest Prepare only run is paused on an agent question (the
  // worker's agent_question pause: status paused, pendingQuestion, pauseReason).
  // No worker runs here, so the heartbeat goes stale after a minute: the
  // tasks-attention flow refreshes it (rearmPausedJob in db.ts) before checking.
  {
    const r = await createReturn({
      key: "g_needs_input",
      entityName: "Question Pending E2E Limited",
      companyNumber: "61007",
      status: "in_progress",
      signedOff: true,
      noticeOfAssessment: null,
      taskStatus: "in_progress",
    });
    await addPreparedJob(r.taskId, r.taxReturnId, 1, 30, "e2eDraftG001", "ESR-2025-61007");
    const askedAt = now - 20 * 60_000;
    const output = [
      `**REQUIRES_ATTENTION:** ${PREPARED_DRAFT_NOT_VERIFIED_MARKER}: The draft isn't fully ready for submission. On the **Review & Submit** summary:`,
      "",
      "- **Entity Details** shows `COMPLETE`",
      "- **Entity Accounts** shows *IN PROGRESS*: the Net Book Value field is blank on the portal.",
      "",
      "Should I enter the saved Net Book Value (0) and continue, or leave the draft for you to check?",
    ].join("\n");
    await db.insert(jobs).values({
      taskId: r.taskId,
      jobNumber: 2,
      status: "paused",
      startedAt: at(40 * 60_000),
      createdBy: staff!.id,
      createdAt: at(41 * 60_000),
      resultData: {
        submissionMode: "prepare_only",
        overrideSaved: false,
        startupTimeoutMs: 45_000,
        browserUseApiVersion: 4,
        browserUseModel: "e2e-seeded",
        output,
        pausedAt: askedAt,
        pauseReason: output,
        pendingQuestion: {
          id: `q-${askedAt}-e2e001`,
          // As the worker stores it (drops the leading REQUIRES_ATTENTION only).
          text: extractAgentQuestionText(output),
          reason: "agent_question",
          askedAt,
          expiresAt: askedAt + 24 * HOUR,
        },
        lastHeartbeatAt: now,
      },
    });
  }

  return { orgId: org.id, staffAccountId: staff.id, clientAccountId: client.id, returns };
}
