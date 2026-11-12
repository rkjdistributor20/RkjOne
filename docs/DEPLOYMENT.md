# RKJ One Deployment Guide

Last updated: 2026-07-08

Production deployment for RKJ One on Supabase and Vercel.

Production URL: https://rkj.one

## Environments

| Environment | App | Database |
|-------------|-----|----------|
| Local | `http://localhost:3000` | Linked Supabase project or local Supabase if configured. |
| Preview | Vercel preview deployment | Staging Supabase only. Production credentials are prohibited. |
| Production | `https://rkj.one` | Production Supabase project. |

## Required Environment Variables

Never commit actual values.

| Variable | Required | Scope |
|----------|----------|-------|
| `DATABASE_URL` | Optional | Server/direct DB tooling |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser/server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser/server |
| `SUPABASE_URL` | Optional alias | Server/tools |
| `SUPABASE_ANON_KEY` | Optional alias | Server/tools |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only |
| `NEXT_PUBLIC_APP_URL` | Yes | Browser/server |
| `NEXT_PUBLIC_API_URL` | Optional | Browser/server |
| `JWT_SECRET` | Optional unless JWT feature enabled | Server only |
| `STRIPE_SECRET_KEY` | Optional unless Stripe enabled | Server only |
| `STRIPE_WEBHOOK_SECRET` | Optional unless Stripe enabled | Server only |
| `OPENAI_API_KEY` | Optional unless AI API feature enabled | Server only |

Optional/payment variables depend on the active gateway setup for Sales Agent payments.

Sales Agent payment variables:

| Variable | Required | Scope |
|----------|----------|-------|
| `SALES_AGENT_PAYMENT_MODE` | Yes | Server |
| `SALES_AGENT_PAYMENT_PROVIDER` | Yes | Server |
| `SALES_AGENT_PAYMENT_WEBHOOK_SECRET` | Yes for staging/production webhooks | Server only |
| `ALLOW_UNSIGNED_PAYMENT_WEBHOOKS` | Local dev only | Server only |
| `SALES_AGENT_FIUU_ENVIRONMENT` | When Fiuu Agent Payment enabled | Server; `sandbox` or `production` |
| `SALES_AGENT_FIUU_MERCHANT_ID` | When Fiuu Agent Payment enabled | Server only |
| `SALES_AGENT_FIUU_VERIFY_KEY` | When Fiuu Agent Payment enabled | Server secret |
| `SALES_AGENT_FIUU_SECRET_KEY` | When Fiuu Agent Payment enabled | Server secret |
| `SALES_AGENT_FIUU_PAYMENT_URL` | Optional | Server; official environment-matching Fiuu host only |

Do not set `ALLOW_UNSIGNED_PAYMENT_WEBHOOKS=true` in staging or production.

Fiuu Agent Payment is a separate merchant integration from POS Fiuu DuitNow QR.
Use Preview/staging credentials only with `SALES_AGENT_FIUU_ENVIRONMENT=sandbox`.
The adapter submits payment details to Fiuu Hosted Payment Page; RKJ One does not
render or maintain the FPX issuer-bank list. Under Fiuu's 2026-10-16 compliance
notice, issuer-list/KFH maintenance remains Fiuu's responsibility for this flow.
Reassess the 2026-12-31 compliance deadline if a direct or seamless FPX interface
is introduced.

Fiuu notified `rotikayajunus` and `rkjdistributors` on 2026-10-09 that card
payment channel services were temporarily suspended. Do not enable Fiuu card or
debit options until written reinstatement is received; this restriction is
separate from the Roti Kaya Junus DuitNow QR/VT pilot.
The provider Notification and Callback URL is
`/api/sales-agent/payments/fiuu/webhook`; the browser Return URL is
`/api/sales-agent/payments/fiuu/return` and never finalizes a payment.
For a protected Vercel Preview, set the server-only
`SALES_AGENT_FIUU_CALLBACK_URL` and `SALES_AGENT_FIUU_RETURN_URL` to the exact
staging endpoints with the Vercel automation-bypass query parameter. The code
accepts only HTTPS `*.vercel.app` endpoints in sandbox and `rkj.one` in
production; do not reuse a Preview bypass value in Production.

POS Fiuu DuitNow QR variables:

| Variable | Required | Scope |
|----------|----------|-------|
| `POS_QR_PAYMENT_MODE` | Yes | Server; `manual`, signed OPA `fiuu`, branch-gated app-to-app `fiuu_vt`, or prepared cloudECR fallback `fiuu_cloudecr` |
| `POS_FIUU_OPA_BRANCHES` | When OPA is enabled | Server; explicit canonical branch allowlist, no wildcard; keep empty in Production pending action-time approval |
| `POS_FIUU_ENVIRONMENT` | When Fiuu enabled | Server; `sandbox` or `production` |
| `POS_FIUU_APPLICATIONS_JSON` | Required for every OPA environment | Server secret; each branch entry requires seven fields: `organizationId`, `branchId`, `applicationCode`, `secretKey`, `storeId`, `terminalId` and non-secret `credentialVersion` |
| `POS_FIUU_CHANNEL_ID` | Yes when Fiuu enabled | Server; must remain `24` for DuitNow QR Offline |
| `POS_FIUU_QR_VALIDITY_SECONDS` | Optional | Server; 60-180 seconds, default 180 |
| `POS_FIUU_PRECREATE_URL` | Optional | Server; official endpoint override only |
| `FIUU_RECONCILIATION_ENABLED` | Yes for the OPA recovery worker | Server only; fail-closed default `false` |
| `FIUU_RECONCILIATION_SECRET` | When the OPA recovery worker is enabled | Server-only secret of at least 32 random characters; leave unset while disabled |
| `POS_FIUU_VT_BRANCHES` | When VT App-to-App is enabled | Server; explicit comma-separated canonical `BR001`-`BR036` allowlist, no wildcard or duplicate; each branch remains static/manual until its verified official tablet is registered |
| `POS_FIUU_VT_VALIDITY_SECONDS` | Optional | Server; 60-3600 seconds, default 180 |

The OPA mapping is keyed by canonical branch code and is tenant-bound:

```json
{
  "BR001": {
    "organizationId": "<organization-uuid>",
    "branchId": "<branch-uuid>",
    "applicationCode": "<provider-issued-code>",
    "secretKey": "<provider-issued-secret>",
    "storeId": "<provider-approved-store-id>",
    "terminalId": "<provider-approved-terminal-id>",
    "credentialVersion": "v1"
  }
}
```

The former global OPA fallbacks `POS_FIUU_APPLICATION_CODE`,
`POS_FIUU_SECRET_KEY`, `POS_FIUU_STORE_ID` and `POS_FIUU_TERMINAL_ID` are
unsupported and must remain unset. Runtime health ignores them. An allowlisted
branch without a complete seven-field mapping fails closed.

`credentialVersion` is a required non-secret generation label, not a key or
credential. The rollout configuration fingerprint is SHA-256 over the exact
versioned tuple `environment`, `applicationCode`, `storeId`, `terminalId` and
`credentialVersion`. `secretKey` is used only for provider authentication and
is never included in that fingerprint or stored in the rollout registry.

`POS_FIUU_OPA_BRANCHES` is an activation gate, not a substitute for mapping or
rollout approval. It accepts only explicit canonical branch codes and must not
contain a wildcard. Keep the Production allowlist empty and
`POS_QR_PAYMENT_MODE=manual` until the exact branch activation receives fresh
action-time approval. Each allowlisted branch must resolve to its own complete
tenant-bound seven-field mapping; never copy Store ID, Terminal ID or credentials
between branches or environments.

Dynamic OPA is a database-authorized capability, not an environment-only
feature. Before `POST /api/pos/qr-payments` creates a row or contacts Fiuu, and
before `GET /api/pos/qr-config` advertises dynamic QR, the server must obtain a
positive `ACTIVE` result from `is_pos_fiuu_opa_branch_active` for the exact
tenant, branch and full configuration fingerprint. A missing RPC, RPC error,
`false` result or non-`ACTIVE` record fails closed.

Rollout lifecycle is `DRAFT -> VERIFIED -> ACTIVE -> DRAINING -> REVOKED`.
`DRAINING` forbids new payment intents but preserves signed callbacks, status
inquiries and idempotent fulfilment for intents issued while the rollout was
`ACTIVE`. Move `DRAINING` to `REVOKED` only after the unresolved-intent queue is
empty and Finance has reconciled all related settlements.

OPA recovery is separately fail-closed. Keep
`FIUU_RECONCILIATION_ENABLED=false` unless the intended environment has the
approved migration, mapping and worker secret. When enabled, call only
`POST /api/internal/pos/fiuu-opa/reconcile` with the server-only Bearer secret;
never expose that secret to a browser, `NEXT_PUBLIC_*`, logs, screenshots or
source control. Switching payment creation back to `manual` stops new OPA
intents, but the applicable allowlist, mapping and recovery configuration must
remain available until every already-issued intent, signed callback and Finance
settlement check is resolved.

Readiness is also fail-closed. Health must receive `true` from
`is_pos_fiuu_opa_rollout_control_ready()` before treating rollout controls as
installed. `FIUU_RECONCILIATION_ENABLED=true` and a configured secret prove
configuration only; they are not evidence that a scheduler is running. Record
an observed scheduler invocation, authenticated worker response, bounded retry
result and monitoring/alert evidence for the intended environment before UAT or
activation.

Never expose Fiuu Application Secret Keys as `NEXT_PUBLIC_*`. Configure the signed OPA payment notification URL as `/api/pos/qr-payments/webhook`. Fiuu VT deep-link results are not signed: they require SALE plus a fresh exact STATUS recheck on the same registered device before automatic idempotent fulfillment, and must not be treated as equivalent to the signed OPA webhook. The VT fleet release is fail-closed per branch: allowlisting a branch does not activate it unless the exact verified official tablet and current enrollment generation match. Follow `docs/FIUU_POS_SETUP.md` before changing the mode.

## Local Setup

```powershell
cp .env.example .env.local
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Pre-Deploy Validation

Run from repo root:

```powershell
npx tsc --noEmit --pretty false
npm run build
```

For changed files:

```powershell
npx eslint <changed-files>
```

Optional targeted checks:

```powershell
npm run verify:production
npm run verify:go-live
npm run verify:payroll
npm run verify:am
npm run uat:am
npm run uat:sales-agent
```

## Database Migration Flow

Create migration:

```powershell
npx supabase migration new <name>
```

Rules:

- Apply migrations before relying on deployed API code that uses new tables/columns.
- Check RLS and grants before production use.
- Regenerate database types after stable schema changes.
- If `db push` reports history mismatch, stop and inspect before manually applying SQL.

### Production migration protocol

Generic `supabase db push --yes` is **prohibited for Production**. A Production
change requires fresh action-time owner approval for the exact action and this
sequence:

1. Confirm the linked Supabase project identity is the intended Production
   project, then run `npx supabase migration list --linked` and save the output
   with the release evidence.
2. Run `npx supabase db push --dry-run` and compare every pending migration with
   an explicit, reviewed manifest containing the exact migration filenames and
   checksums approved for that release.
3. Abort if the dry-run contains any additional, missing, reordered or modified
   migration. Do not approve a directory, range, branch or generic “all pending”
   set.
4. Apply only the exact approved manifest through the controlled release job or
   reviewed SQL procedure that enforces that manifest. A direct generic
   `supabase db push --yes` is not an acceptable Production deployment method.
5. Use an announced maintenance window and establish application write
   quiescence for affected tables. The approved migration must set bounded
   `lock_timeout` and `statement_timeout` values appropriate to the reviewed
   operation; a timeout or unexpected lock aborts the release rather than being
   bypassed.
6. Monitor database locks, long-running statements, errors, API health and
   payment/reconciliation queues during the change. Verify the applied migration
   list, schema/RLS/grants and application health before restoring writes.

For the approved VT registered-device rollout, Production may use
`POS_QR_PAYMENT_MODE=fiuu_vt` with every canonical code explicitly listed in
`POS_FIUU_VT_BRANCHES` only after the exact migration and application release
have passed staging and Production preflight. This does not bulk-activate a
cawangan: an unregistered, inactive, unverified or mismatched tablet receives
the existing static/manual QR flow. Keep `POS_FIUU_OPA_BRANCHES` empty and
`FIUU_RECONCILIATION_ENABLED=false`; those controls belong to the separate
signed OPA path. Never place secrets in a migration manifest, command transcript
or release evidence.

## Vercel Deployment Flow

Standard production deployment is Git push to `master`.

Manual CLI deployment:

```powershell
npx vercel --prod
```

Inspect deployment:

```powershell
npx vercel ls --yes
npx vercel inspect https://rkj.one
npx vercel logs https://rkj.one --since 1h --level error
```

Expected result:

- Deployment status: Ready.
- Alias includes `https://rkj.one`.
- No recent error logs for changed flow.

## Post-Deploy Checklist

Complete these for each new deployment; historical completion does not carry forward:

- [ ] Target Supabase project identity and recovery evidence recorded.
- [ ] Approved migrations applied to the intended environment.
- [ ] Vercel deployment is Ready and points to the intended environment.
- [ ] Production alias is unchanged during Preview/pilot validation.
- [ ] Error logs checked without exposing secrets or personal data.
- [ ] Changed API/page smoke-tested by role and branch scope.
- [ ] Payment, inventory and finance reconciliation completed where affected.
- [ ] Task board and QA evidence updated.

## M6 Release Gate

Current production checkpoint: Supabase production migrations `harden_auth_role_and_booking_scope` and `m5_payment_lifecycle` have been applied and verified. The latest Vercel production deployment is Ready and aliased to `https://rkj.one`, `https://rkj.my`, and `https://rotikayajunus.com`.

Before staging:

- [x] Confirm Supabase production project and migration target.
- [x] Apply M5 payment lifecycle migration.
- [x] Run unauthenticated/auth-boundary payment create/status/cancel/refund smoke tests.
- [ ] Run signed live-provider callback test for the selected provider.

Before production:

- [ ] Staging checks above pass.
- [x] Production DB migration applied and verified.
- [x] Production deploy completed and logs checked.
- [x] Production smoke tests completed.

## Current Production Notes

Recent Booking API deployment:

- Commit: `472d2cc Add booking API backend`
- Migration: `20260708100944_booking_api.sql`
- Deployment confirmed Ready on 2026-07-08.
- Follow-up hardening tasks are listed in `docs/TASK_BOARD.md`.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Auth redirect loop | Supabase Site URL, Redirect URLs, `NEXT_PUBLIC_APP_URL`. |
| API returns login HTML | Global middleware redirected anonymous request; authenticate or adjust API auth behavior. |
| `relation does not exist` | Migration was not applied to remote Supabase. |
| RLS blocks query | Check profile `organization_id`, role, branch/region, and policy. |
| Cross-branch data missing | Check `resolveScopedBranches()` and branch assignment. |
| Build fails on Supabase types | New table may not be in generated TypeScript types yet; regenerate types or use narrow casts temporarily. |
| Vercel deployment Ready but behavior old | Confirm production alias points to newest deployment and Git integration built the expected commit. |

## Security Notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Never paste real passwords into docs.
- Do not enable public signup unless owner approves.
- Review RLS for every new table.
- Treat payroll, HR, finance, identity, and payment data as sensitive.
