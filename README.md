# LTS Tax Engineering README

This document is the working map of the codebase. It is written to help future contributors (human or agent) get productive quickly and avoid common pitfalls.

## 1) What This System Does

LTS Tax is an automation platform for tax return processing (currently centered on Guernsey workflows).

Core capabilities:
- Sync tax returns from the external portal (`my.gov.gg`) into local DB.
- Upload source documents (PDF/Excel/images).
- Extract structured form data from documents using AI.
- Launch browser automation jobs to complete submission flows.
- Stream live job updates to the UI.

## 2) Monorepo Structure

Top-level:
- `apps/web` - Next.js app (frontend + API routes + tRPC server).
- `packages/database` - Drizzle schema + shared DB client/queries.
- `packages/redis` - Redis pub/sub helpers for job event streaming.
- `packages/shared` - currently minimal shared package.
- `containers/task` - ECS worker for browser automation.
- `containers/tax-sync` - ECS worker for portal scraping/sync.
- `scripts` - AWS/ECS helper scripts and task definitions.

## 3) High-Level Architecture

Main stack:
- Frontend: Next.js 15, React 19, Tailwind 4, shadcn/ui.
- API: tRPC (`/api/trpc`) + Next Route Handlers under `/api/*`.
- DB: PostgreSQL + Drizzle ORM (`lts_*` tables).
- Auth: Supabase SSR/browser clients.
- Realtime: Redis pub/sub + SSE endpoint.
- Storage: Vercel Blob.
- Background compute: AWS ECS Fargate.
- AI extraction: Vercel AI Gateway + Gemini model.

Key integration boundaries:
- Web app launches ECS tasks through `src/lib/ecs.ts`.
- ECS workers write status back to DB and publish events to Redis.
- UI subscribes to `/api/jobs/[jobId]/events` (SSE).

## 4) Repository Deep Dive

### 4.1 Web App (`apps/web`)

Important files:
- `src/app/layout.tsx` - global layout/providers.
- `src/middleware.ts` + `src/lib/supabase/middleware.ts` - auth/session refresh and route gating.
- `src/server/api/root.ts` - tRPC router registration.
- `src/server/api/routers/*` - business logic:
  - `tax-return.ts` - returns/tasks/jobs/sync orchestration.
  - `substance-form.ts` - form CRUD + AI extraction.
  - `invoice.ts` - invoice CRUD/admin actions.
  - `analytics.ts` - dashboard stats.
- `src/lib/ecs.ts` - launches ECS tasks for sync/browser workers.
- `src/app/api/jobs/[jobId]/events/route.ts` - SSE stream.
- `src/lib/feature-flags.ts` - Edge Config feature flags.
- `src/lib/analytics.ts` - analytics event typing + tracking wrappers.

Primary dashboard routes:
- `/org/[orgId]/returns` - tax returns list and sync controls.
- `/org/[orgId]/returns/[id]` - return detail, uploads, extraction, form editing.
- `/org/[orgId]/tasks` - task list.
- `/org/[orgId]/tasks/[taskId]` - live browser job page with SSE event feed.

### 4.2 Database Package (`packages/database`)

Important files:
- `src/schema.ts` - canonical schema.
- `src/index.ts` - shared Drizzle client and operator exports.
- `src/queries/index.ts` - helper query groups.
- `drizzle/*` - migration SQL + metadata journal.

Important entities:
- `accounts`, `global_admins`
- `organisations`, `jurisdictions`, `jurisdiction_settings`
- `tax_returns`, `substance_forms`
- `tasks`, `jobs`, `tax_sync_jobs`
- `pending_invitations`, `invoices`

### 4.3 Redis Package (`packages/redis`)

- Provides singleton Redis clients (`getRedis`, `getPub`, `getSub`).
- Defines `JOB_EVENTS` channel and event types (`job:started`, `job:step`, etc).

### 4.4 ECS Workers

`containers/task`:
- Browser Use Cloud client + polling loop.
- Handles pause/resume/cancel states.
- Publishes job events to Redis.
- Updates `jobs`/`tax_returns` statuses.

`containers/tax-sync`:
- Authenticates against `identity.gov.gg`/`my.gov.gg`.
- Scrapes paginated case list.
- Upserts `tax_returns` records.
- Updates `tax_sync_jobs`.

## 5) End-to-End Flows

### Flow A: Tax Sync
1. UI triggers `taxReturn.startSyncJob`.
2. tRPC creates `tax_sync_job` + launches ECS tax-sync worker.
3. Worker authenticates and scrapes.
4. Worker upserts `tax_returns`.
5. Job status/log stream surfaced in UI.

### Flow B: AI Extraction
1. User uploads files to `/api/upload` (Vercel Blob URL returned).
2. File URL attached to a tax return.
3. `substanceForm.extractFromFiles` fetches files and normalizes:
   - PDFs/images as file parts
   - Excel converted to CSV text
4. AI model returns structured object.
5. Data merged into `substance_forms`, `missingFields` recalculated.

### Flow C: Browser Automation Job
1. User starts a task job (`taxReturn.startJob`).
2. tRPC creates `job` + ECS launch via `launchBrowserTask`.
3. Worker creates Browser Use session/task.
4. Worker publishes live events to Redis.
5. SSE endpoint streams filtered events to UI.
6. User can pause/resume/cancel from task page.

## 6) Local Development

Prerequisites:
- Node 20+
- pnpm 9+
- Bun available (some scripts use `bun run`)
- PostgreSQL + Redis running
- Supabase project credentials
- AWS credentials if testing ECS launches

Install:
```bash
pnpm install
```

Useful commands:
```bash
pnpm dev
pnpm build
pnpm lint
pnpm test

# db helpers
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:studio
```

Run web only:
```bash
pnpm web
```

## 7) Environment Variables

The effective source of truth is:
- root `turbo.json` (`globalEnv`)
- `apps/web/src/env.js` (runtime validation)

Core required variables (web app):
- `DATABASE_URL`, `REDIS_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `ECS_CLUSTER`, `ECS_TASK_DEFINITION`, `ECS_CONTAINER_NAME`, `ECS_SUBNETS`, `ECS_SECURITY_GROUPS`, `ECS_LOG_GROUP`
- `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`
- `BROWSER_USE_API_KEY`

Optional/specialized:
- `ECS_TAX_SYNC_TASK_DEFINITION`, `ECS_TAX_SYNC_CONTAINER_NAME`
- `ECS_BROWSER_TASK_DEFINITION`, `ECS_BROWSER_TASK_CONTAINER_NAME`
- `AI_GATEWAY_API_KEY`
- `MYGOV_USERNAME`, `MYGOV_PASSWORD` (used by tax-sync worker)

Notes:
- Root `.env.example` and `apps/web/.env.example` are not perfectly aligned; prefer `apps/web/src/env.js` when in doubt.

## 8) API Surface Summary

tRPC endpoint:
- `/api/trpc/[trpc]`

Route handlers include:
- org/member management
- invitations
- uploads
- invoices upload
- feature flags
- feedback/error logging
- SSE job events
- debug endpoints under `/api/debug/*`

Debug endpoints exist and are useful for local testing, but should remain non-production tools.

## 9) Known Risks / Gotchas

1. Authz inconsistency:
- Several APIs are strictly admin-gated, but some org routes are broader.
- tRPC procedures use `publicProcedure`; authorization is handled manually per resolver.

2. Middleware behavior:
- Auth middleware skips deeper checks on `/api/*`, so each API route must enforce auth itself.

3. Credentials storage:
- `jurisdiction-settings` route currently uses base64 placeholder instead of real encryption for portal credentials.

4. Stale/legacy artifacts:
- `packages/database/src/add-flawstick.ts` references removed `orgMembers` table.
- `packages/events` exists but is currently empty.
- There is an extra migration file not in drizzle journal (`0002_fte_real.sql`).

5. Test coverage:
- No test files detected in repo currently.

## 10) Suggested Working Conventions

When adding features:
- Keep DB changes in `packages/database/src/schema.ts` and generate migration immediately.
- Prefer tRPC for internal app mutations/queries.
- Add strict auth checks inside each API/tRPC procedure.
- Keep long-running work in ECS workers, not request handlers.
- Emit structured job events for UI observability.

When debugging:
- Start at task/job records in DB.
- Check CloudWatch log group/stream fields on job rows.
- Verify SSE stream connectivity from browser network tab.
- Validate Redis pub/sub connectivity.

## 11) First-30-Minute Onboarding Checklist

1. Read this README and `apps/web/src/env.js`.
2. Start DB + Redis and run `pnpm dev`.
3. Log in through Supabase OTP flow.
4. Open an org dashboard and inspect returns/tasks pages.
5. Trace one tRPC call from UI -> router -> DB.
6. Trace one SSE stream from worker event -> UI.
7. Review `tax-return.ts` and `substance-form.ts` for business-critical logic.

---

If this README drifts, update it with every major architecture, schema, auth, or workflow change.
