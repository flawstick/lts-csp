# Local end-to-end harness

Clicks through the staff dashboard (`apps/web`) and the client portal
(`apps/portal`) in a real Chromium, against a throwaway local stack, and checks
the worker side (`containers/task`) offline. It is separate from the unit
tests: `bun run test` / turbo never runs it (this package has no `test` script).

```bash
bun run e2e                      # full run; tears everything down at the end
bun run e2e -- --only=task       # only flows whose name contains "task"
bun run e2e -- --no-portal       # skip apps/portal (and the portal flows)
bun run e2e -- --keep            # run the flows, then keep the stack up
bun run e2e -- --serve           # bring the stack up with seed data, no flows
bun run e2e:down                 # remove leftover e2e containers
E2E_HEADED=1 bun run e2e         # watch the browser
```

First run on a machine: `cd containers/task && bun x playwright install chromium-headless-shell`
(Playwright 1.58, the version the worker already depends on).

A full run takes about 5 minutes (most of it is `next dev` compiling pages).
It exits non-zero if any check fails. Output goes to `e2e/.out/`
(`E2E_OUT_DIR` to change): `shots/*.png`, `results.json`, `seed.json`,
`web.log`, `portal.log`.

## What it starts

| Piece | Where | Notes |
| --- | --- | --- |
| Postgres 17 | Docker `lts-e2e-pg`, `127.0.0.1:55433` | fresh each run; schema from `packages/database/src/schema.ts` via `drizzle-kit push` (`drizzle-kit migrate` cannot build a database from scratch: `0001` drops a constraint `0000` never created), plus Supabase's `auth.users` table, which the portal queries directly |
| Redis | Docker `lts-e2e-redis`, `127.0.0.1:56380` | job events / OTP cooldown |
| Supabase stand-in | `https://127.0.0.1:54399` (in-process, `src/auth-stub.ts`) | see below |
| apps/web | `next dev` on `http://localhost:3100` | |
| apps/portal | `next dev` on `http://localhost:3101` | |

Ports and container names can be changed with `E2E_PG_PORT`, `E2E_REDIS_PORT`,
`E2E_AUTH_PORT`, `E2E_WEB_PORT`, `E2E_PORTAL_PORT`, `E2E_PG_CONTAINER`,
`E2E_REDIS_CONTAINER`.

## Safety

- The apps get an environment built from scratch (`appEnv()` in `src/config.ts`),
  never the caller's shell, so production credentials in your shell are not
  passed on. `assertLocalOnly()` refuses to run if any URL is not 127.0.0.1 or
  localhost.
- `BROWSER_TASK_EXECUTION_MODE=ecs_service`: starting a run only inserts a
  `queued` job in Postgres. No worker runs, so nothing is ever filed.
- AWS: fake keys and `AWS_ENDPOINT_URL=http://127.0.0.1:9`, so any SDK call
  fails locally. Browser Use: the key is a single space, which the app trims to
  empty, so it never calls the API. Resend: `RESEND_BASE_URL` points at the
  stand-in's inbox. The browser context aborts every request that is not to
  localhost or 127.0.0.1.
- Nothing in app code is bypassed. People sign in through the real login pages.

## Sign-in (Supabase stand-in)

`src/auth-stub.ts` serves the parts of Supabase the apps call:

- **Auth** (`/auth/v1`): `otp`, `verify` (email codes), `token?grant_type=refresh_token`,
  `user` (GET/PUT), `logout`, and the admin `generate_link` the portal uses for
  its own login emails. Sessions are real HS256 JWTs, so `@supabase/ssr` sets,
  reads and refreshes its cookies exactly as in production.
- **REST** (`/rest/v1/lts_*`): the `select` / `eq` / `limit` reads and inserts
  the two middlewares make, run against the local Postgres.
- **Inbox**: codes are not emailed. The harness reads them from
  `GET /__e2e/inbox?email=...` (portal emails sent through Resend are kept at
  `/__e2e/emails`) and types them into the login page.

It is served over HTTPS with a self-signed certificate made fresh on every run
(any certificate left in the output directory is replaced), because
the apps' Content-Security-Policy only allows `https:` connections from the
browser. The apps trust it through `NODE_EXTRA_CA_CERTS`; Playwright through
`ignoreHTTPSErrors`.

Users: `e2e.staff@lts-e2e.test` (internal account, global admin) and
`e2e.signatory@client-e2e.test` (portal admin who can approve filings).

## Seeded returns (Guernsey ESR 2025, Certificate 3, investment-only profit)

Job `resultData` is built with the worker's own helpers
(`fingerprintPreparedInputs`, the `preparedDraft` record,
`submitPreparedDispatchedAt`, `portalNetBookValue`), and the fingerprint is
computed from the row as the worker reads it, so the web gates treat these
like production rows.

| Key | State |
| --- | --- |
| `a_ready_default` | prepared draft ready (completed prepare run with `prepareOnlyReadyAt` and a matching `preparedDraft`), notice of assessment unset, client signed off |
| `b_failed_prepare` | an older ready prepare, then a prepare run that timed out (latest) |
| `c_locked` | Submit prepared return run that reached the portal (`submitPreparedDispatchedAt`), failed with `PREPARED_DRAFT_NOT_VERIFIED`, no receipt, 30h ago (the key predates removing the submit lock; nothing is locked) |
| `d_noa_no` | like `a`, notice of assessment explicitly "No" |
| `e_awaiting_signoff` | complete, manager signed off, waiting for the client; notice of assessment unset; no runs |
| `f_edit_noa` | like `a`, used to save No / Yes from the staff editor |
| `g_needs_input` | an older ready prepare, then a Prepare only run (latest) paused on an agent question: `status` paused, `pendingQuestion` (`agent_question`, a long markdown `PREPARED_DRAFT_NOT_VERIFIED` question) and `pauseReason`, as the worker writes them |

## Flows

- **smoke**: dashboard, returns and tasks lists, every return and task page
  (web) and every return (portal) load with no 5xx and no uncaught page error.
- **web (a)**: editor shows "Yes (default)", only Yes/No offered, No then Yes
  is no change; Submit prepared return enabled, dialog shows
  "Notice of assessment: Yes (default)", confirm queues a `submit_prepared`
  job with the right `preparedJobId`; the queued run can be cancelled and
  submitted again.
- **web (b)**: Submit prepared return disabled with the reason; forced through
  stale page data, the server's refusal shows in a dialog that stays until
  dismissed, the page keeps the earlier run, no job is created; Prepare only
  queues and can be cancelled.
- **web (c)**: an earlier submit run that reached the portal without a
  receipt is a caution, not a lock: no "Submit locked" indicator or menu item
  (`c1-task-no-lock`), Submit prepared return and the full submit are enabled
  (`c2-menu-enabled`), the confirmation shows one caution line naming the
  earlier run (`c3-caution-dialog`), and confirming queues a `submit_prepared`
  job that records the earlier run (`earlierUnreceiptedSubmitJobIds`) and whose
  worker prompt opens with the not-already-submitted check
  (`REQUIRES_ATTENTION: ALREADY_SUBMITTED:`) naming that run (`c4-queued-with-check`).
- **web (d)**: dialog shows "Notice of assessment: No".
- **web (f)**: saving No clears the client sign-off and keeps the prepared
  draft valid; saving Yes over No.
- **tasks (g)**: the Tasks list shows "Needs input" with a one-line question
  preview (markers and markdown removed, full text in its title), the sidebar
  Tasks item shows a count of 1, the "Needs input" status filter keeps only
  that task, and the detail panel's "Answer in task" opens the task. No worker
  runs, so the flow first re-arms the paused run with a fresh heartbeat
  (`rearmPausedJob` in `src/db.ts`); otherwise any page that reads it after a
  minute marks it "heartbeat lost".
- **worker**: for the job queued from the UI, the worker's prepared-draft
  re-check accepts it, and the Submit prepared return prompt says Yes (LTS's
  default) for (a) and No (the reviewer's answer) for (d).
- **portal (e)**: the client sees "Yes (default)" and can sign off; staff can
  then queue a full submit, whose prompt answers Yes.
- **portal (f)**: the client re-approves; staff dialog shows an explicit "Yes".
- **portal (d)**: saving unchanged keeps the sign-off; changing No to Yes
  clears it; after re-approval the prepared draft is still valid.

Add a flow: write a `Flow` in `src/flows/*.ts` (it gets the seeded ids, the
app URLs and a `Checks` object) and add it to the list in `src/flows/index.ts`.
Add a return state in `src/seed.ts`.

## Not covered

The worker process itself is not run (it would start a Browser Use session);
its gates and prompt are exercised offline instead. Tax sync, AI extraction,
file uploads (Vercel Blob) and emails other than the portal login code are
not exercised.
