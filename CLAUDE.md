# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **The `@AGENTS.md` import above is load-bearing.** This is Next.js **16** + React **19** + Tailwind **v4** — APIs and conventions differ from older training data. Before writing framework code, read the relevant guide under `node_modules/next/dist/docs/` (`01-app`, `03-architecture`) and heed deprecation notices.

## What this is

A self-hostable WhatsApp CRM **template** (fork → customise → deploy, not a collaborative product). Next.js App Router front+back end, Supabase for data/auth/storage, and the Meta WhatsApp Cloud API for messaging. The marketing site and self-host docs live in a separate repo (`ArnasDon/wacrm-site`).

## Commands

```bash
npm run dev          # next dev (http://localhost:3000)
npm run build        # next build
npm run lint         # eslint (next/core-web-vitals + next/typescript)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (one-shot)
npm run test:watch   # vitest watch
npm run format       # prettier --write .
```

Run a single test file or test: `npx vitest run src/lib/whatsapp/encryption.test.ts` or `npx vitest run -t "decrypts GCM"`.

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on every PR to `main`. Match that order locally before pushing. Tests run with `environment: node` and dummy `ENCRYPTION_KEY` / `META_APP_SECRET` injected by `vitest.config.ts` — keep those values in sync with the CI `env:` block, since `lib/whatsapp/*` reads them at module load.

## Architecture

### Three Supabase clients — pick by trust boundary
- `src/lib/supabase/client.ts` — browser client (anon key). Client components.
- `src/lib/supabase/server.ts` — server client (anon key + request cookies). Server components / route handlers acting **as the signed-in user**; RLS applies.
- `src/lib/*/admin-client.ts` (one per engine: `automations`, `flows`) — service-role client that **bypasses RLS**. Server-only, lazy-initialized. Use exclusively where there's no user session (the webhook, the automation/flow engines, cron). Never import into client code.

Auth is enforced in `src/middleware.ts`: it refreshes the Supabase session, redirects unauthenticated users away from `(dashboard)` routes to `/login`, and 401s unauthenticated `/api/whatsapp/*` calls — **except webhooks**, which are public and verified by HMAC instead.

### Route structure (`src/app`)
- `(auth)/` — login, signup, forgot-password.
- `(dashboard)/` — inbox, contacts, pipelines, broadcasts, automations, flows, dashboard, settings.
- `api/whatsapp/` — webhook (inbound), send, broadcast, templates, media proxy, react, config.
- `api/automations/`, `api/flows/` — CRUD + `cron` + engine endpoints.

### The webhook is the central nervous system
`src/app/api/whatsapp/webhook/route.ts` is where almost all inbound state originates. Critical invariants when touching it:
- **POST** verifies the `x-hub-signature-256` HMAC against the **raw body** (never re-serialize before verifying), then acks Meta with 200 immediately and processes async — don't make Meta wait.
- It resolves the tenant by `phone_number_id` (unique per migration 013), decrypts that config's access token, then find-or-creates contact + conversation and inserts the message.
- `messages.content_type` has a CHECK constraint (`text/image/document/audio/video/location/template/interactive`); incoming types outside it must be mapped (e.g. sticker→image) or the INSERT fails.
- Broadcast recipient status follows a strict forward-only ladder (`pending→sent→delivered→read→replied`); `failed` is only valid from `pending`/`sent`. See `isValidStatusTransition`. Webhook replays must never regress it.

### Two automation engines — both fired from the webhook
This repo has **two distinct, coexisting** systems. Don't conflate them:
- **Automations** (`src/lib/automations/`, migration 006) — trigger→steps rules (send message/template, tag, assign, create deal, wait, condition, webhook). Fire-and-forget from the webhook via `runAutomationsForTrigger`. `wait` steps persist to `automation_pending_executions`, drained by `GET /api/automations/cron`.
- **Flows** (`src/lib/flows/`, migration 010) — conversational button/list bots that walk a customer through a DB-stored node graph, suspending at nodes that need input. Dispatched via `dispatchInboundToFlows`, which is **awaited** before automations because if a flow *consumes* the message (advances/starts a run), the content-level automation triggers (`new_message_received`, `keyword_match`) are suppressed — relationship triggers (`new_contact_created`, `first_inbound_message`) still fire. Abandoned active runs are swept by `GET /api/flows/cron`.

Both engines share conventions: pure decision logic + DB I/O in `engine.ts`, Meta calls in `meta-send.ts`, validation in `validate.ts` (unit-tested). Concurrency safety in flows leans on DB constraints (idempotency on `meta_message_id`, optimistic update with `current_node_key` precondition, partial unique index `idx_one_active_run_per_contact`) rather than app locks.

### WhatsApp token encryption
`src/lib/whatsapp/encryption.ts` — `encrypt()` always produces AES-256-GCM (`iv:ct:tag`); `decrypt()` auto-detects and still reads legacy CBC (`iv:ct`). Call sites opportunistically re-encrypt legacy rows to GCM on read (see `isLegacyFormat`). Rotating `ENCRYPTION_KEY` orphans every stored token.

### Data model
TypeScript interfaces for every table live in `src/types/index.ts` and are the quickest map of the schema. SQL source of truth is `supabase/migrations/NNN_*.sql` — **append a new numbered migration**, never edit an applied one. Every table has RLS; the service-role clients are the only thing that bypasses it.

## Conventions
- Import alias: `@/*` → `src/*`.
- Tests are colocated as `*.test.ts(x)` next to the code under `src/`.
- Security headers (incl. a report-only CSP) are centralized in `next.config.ts`; the CSP is `Report-Only` until validated, then flip to enforce. `connect-src` only allows Supabase — all Meta API calls are server-side.
- Cron endpoints require the `x-cron-secret` header to match `AUTOMATION_CRON_SECRET` (both `/api/automations/cron` and `/api/flows/cron` reuse the same secret); they return 503 when it's unset.

## Required environment (`.env.local`, see `.env.local.example`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY` (64 hex chars), `META_APP_SECRET`. Optional: `NEXT_PUBLIC_SITE_URL`, `AUTOMATION_CRON_SECRET` (required only if using flows or automation `wait` steps).
