/**
 * Worker side, offline: what containers/task would do with the jobs and
 * forms in the local database, without starting a browser run. It uses the
 * worker's own prompt builder and the same prepared-draft re-check it runs
 * before any Browser Use session (verifyPreparedDraftForSubmission).
 */
import type { Flow, FlowContext } from "./index";

async function loadReturn(taxReturnId: string) {
  const { db, taxReturns, eq } = await import("@repo/database");
  // Same query as the worker (containers/task/src/index.ts).
  const row = await db.query.taxReturns.findFirst({
    where: eq(taxReturns.id, taxReturnId),
    with: { substanceForm: true, jurisdiction: true },
  });
  if (!row?.substanceForm) throw new Error("return or form missing");
  return row as typeof row & { substanceForm: NonNullable<typeof row.substanceForm> };
}

async function returnJobs(taxReturnId: string) {
  const { db, jobs, tasks, eq } = await import("@repo/database");
  return db
    .select({ id: jobs.id, status: jobs.status, createdAt: jobs.createdAt, resultData: jobs.resultData })
    .from(jobs)
    .innerJoin(tasks, eq(jobs.taskId, tasks.id))
    .where(eq(tasks.taxReturnId, taxReturnId));
}

async function buildPrompt(ctx: FlowContext, key: string, submitJobId?: string) {
  const { fingerprintPreparedInputs, resolvePreparedDraft } = await import("@repo/database/prepared-draft");
  const { buildSubmitPreparedReturnPrompt, buildNoticeOfAssessmentContinuationRule } = await import(
    "@repo/task/src/prompt-builder"
  );
  const { getGuernseyNoticeOfAssessment, isGuernseyNoticeOfAssessmentDefaulted } = await import(
    "@repo/database/guernsey-filing"
  );
  const r = ctx.seeded.returns[key]!;
  const taxReturn = await loadReturn(r.taxReturnId);
  const jobs = await returnJobs(r.taxReturnId);
  const submitJob = submitJobId ? jobs.find((j) => j.id === submitJobId) : undefined;
  const resolution = resolvePreparedDraft({
    jobs,
    currentFingerprint: fingerprintPreparedInputs({
      entityName: taxReturn.entityName,
      taxYear: taxReturn.taxYear,
      link: taxReturn.link,
      files: taxReturn.files,
      substanceForm: taxReturn.substanceForm as Record<string, unknown>,
    }),
    excludeJobId: submitJobId,
    expectedPreparedJobId: (submitJob?.resultData as Record<string, unknown> | null)?.preparedJobId as string | undefined,
    requireNetBookValueReview: taxReturn.substanceForm.certificateType !== "Certificate 2",
  });
  if (!resolution.ok) return { resolution, prompt: null, rule: null };
  const prompt = buildSubmitPreparedReturnPrompt({
    taxReturn,
    substanceForm: taxReturn.substanceForm,
    portalUrl: taxReturn.jurisdiction?.portalUrl || "https://my.gov.gg",
    returnLink: taxReturn.link || undefined,
    reviewUrl: resolution.draft.reviewUrl,
    portalReference: resolution.draft.portalReference,
    contactName: "E2E Filing Contact",
    contactEmail: "filing@client-e2e.test",
  });
  const rule = buildNoticeOfAssessmentContinuationRule({
    answer: getGuernseyNoticeOfAssessment(taxReturn.substanceForm),
    defaulted: isGuernseyNoticeOfAssessmentDefaulted(taxReturn.substanceForm),
    submitPrepared: true,
  });
  return { resolution, prompt, rule };
}

const workerPrompts: Flow = {
  name: "worker: submit_prepared prompts for (a) Yes default and (d) No",
  async run(ctx, c) {

    const a = await buildPrompt(ctx, "a_ready_default", ctx.shared.aQueuedJobId);
    c.ok("worker accepts the job queued from the UI for (a)", a.resolution.ok, JSON.stringify(a.resolution));
    if (a.prompt && a.rule) {
      c.ok("(a) prompt: select **Yes**", a.prompt.includes("select **Yes** for the notice of assessment question"));
      c.ok("(a) prompt: says it is LTS's default", a.prompt.includes("LTS's default answer for this return"));
      c.ok("(a) prompt: never selects No", !a.prompt.includes("select **No**"));
      c.ok("(a) prompt: targets the prepared draft", a.prompt.includes("e2eDraftA001"));
      c.ok("(a) continuation rule: Yes, default", a.rule.includes("with **Yes**") && a.rule.includes("LTS's default answer"));
    }

    const d = await buildPrompt(ctx, "d_noa_no");
    c.ok("worker resolves the prepared draft for (d)", d.resolution.ok, JSON.stringify(d.resolution));
    if (d.prompt && d.rule) {
      c.ok("(d) prompt: select **No**", d.prompt.includes("select **No** for the notice of assessment question"));
      c.ok("(d) prompt: says it is the reviewer's answer", d.prompt.includes("the reviewer's answer for this return"));
      c.ok("(d) prompt: never selects Yes", !d.prompt.includes("select **Yes**"));
      c.ok("(d) continuation rule: No, reviewer", d.rule.includes("with **No**") && d.rule.includes("the reviewer's answer"));
    }

    const b = await buildPrompt(ctx, "b_failed_prepare");
    c.ok("worker also refuses (b)", !b.resolution.ok);
  },
};

/**
 * Prepare only with a filing contact completes the declaration step (notice
 * of assessment answer and every declaration box) and stops before the final
 * button; the draft it reports on the declaration page is a valid draft.
 */
const workerPreparePrompt: Flow = {
  name: "worker: prepare_only completes the declaration step and stops before the final button",
  async run(ctx, c) {
    const { buildSubstanceFormPrompt, buildSubmitPreparedReturnPrompt } = await import("@repo/task/src/prompt-builder");
    const { parsePreparedDraftOutput } = await import("@repo/database/prepared-draft");
    for (const [key, answer] of [
      ["a_ready_default", "Yes"],
      ["d_noa_no", "No"],
    ] as const) {
      const taxReturn = await loadReturn(ctx.seeded.returns[key]!.taxReturnId);
      const prompt = buildSubstanceFormPrompt({
        taxReturn,
        substanceForm: taxReturn.substanceForm,
        portalUrl: taxReturn.jurisdiction?.portalUrl || "https://my.gov.gg",
        returnLink: taxReturn.link || undefined,
        submissionMode: "prepare_only",
        contactName: "E2E Filing Contact",
        contactEmail: "filing@client-e2e.test",
      });
      c.ok(`(${key}) prepare prompt: selects **${answer}** on the declaration step`, prompt.includes(`On the declaration step, select **${answer}** for the notice of assessment question`));
      c.ok(`(${key}) prepare prompt: ticks every declaration box`, prompt.includes("Tick every declaration confirmation box (the portal shows three"));
      c.ok(`(${key}) prepare prompt: warns a ticked box un-ticks`, prompt.includes("clicking a box that is already ticked UN-TICKS it"));
      c.ok(`(${key}) prepare prompt: stops before the final button`, prompt.includes("Do NOT click **Complete submission to Revenue Service**"));
      c.ok(`(${key}) prepare prompt: never says to click the final submit`, !prompt.includes("Click the final submit/confirm action"));
      c.ok(`(${key}) prepare prompt: reports the declaration page URL`, prompt.includes("REVIEW_PAGE_URL: <the full URL of the declaration page currently open>"));
    }

    const declarationUrl = "https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/e2eDraftA001/reviewAndSubmit/declaration";
    const parsed = parsePreparedDraftOutput(`READY_FOR_MANUAL_SUBMISSION: declaration complete.\nREVIEW_PAGE_URL: ${declarationUrl}\nPORTAL_REFERENCE: NONE`);
    c.eq("a declaration page URL is recorded as the prepared draft", parsed.reviewUrl, declarationUrl);
    const a = await loadReturn(ctx.seeded.returns.a_ready_default!.taxReturnId);
    const submit = buildSubmitPreparedReturnPrompt({
      taxReturn: a,
      substanceForm: a.substanceForm,
      portalUrl: "https://my.gov.gg",
      reviewUrl: declarationUrl,
      portalReference: null,
      contactName: "E2E Filing Contact",
      contactEmail: "filing@client-e2e.test",
    });
    c.ok(
      "submit_prepared from a declaration URL verifies on the same draft's summary",
      submit.includes("its path must be **/company-tax-ui/company-tax/tax-returns/e2eDraftA001/reviewAndSubmit/summary**"),
    );
  },
};

export const workerFlows: Flow[] = [workerPrompts, workerPreparePrompt];
