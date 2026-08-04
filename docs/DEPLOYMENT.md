# RKJ One Deployment Guide

Last updated: 2026-07-08

Production deployment for RKJ One on Supabase and Vercel.

Production URL: https://rkj.one

## Environments

| Environment | App | Database |
|-------------|-----|----------|
| Local | `http://localhost:3000` | Linked Supabase project or local Supabase if configured. |
| Preview | Vercel preview deployment | Usually production/staging Supabase depending on env vars. |
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

Do not set `ALLOW_UNSIGNED_PAYMENT_WEBHOOKS=true` in staging or production.

POS Fiuu DuitNow QR variables:

| Variable | Required | Scope |
|----------|----------|-------|
| `POS_QR_PAYMENT_MODE` | Yes | Server; use `manual` until Fiuu UAT passes, then `fiuu` |
| `POS_FIUU_ENVIRONMENT` | When Fiuu enabled | Server; `sandbox` or `production` |
| `POS_FIUU_APPLICATIONS_JSON` | Preferred when Fiuu enabled | Server secret; Application Code/Secret Key mapping by branch code |
| `POS_FIUU_APPLICATION_CODE` | Optional pilot fallback | Server secret |
| `POS_FIUU_SECRET_KEY` | Optional pilot fallback | Server secret |
| `POS_FIUU_STORE_ID` | Optional pilot fallback | Server |
| `POS_FIUU_CHANNEL_ID` | Yes when Fiuu enabled | Server; must remain `24` for DuitNow QR Offline |
| `POS_FIUU_QR_VALIDITY_SECONDS` | Optional | Server; 60-999 seconds, default 600 |
| `POS_FIUU_PRECREATE_URL` | Optional | Server; official endpoint override only |

Never expose Fiuu Application Secret Keys as `NEXT_PUBLIC_*`. Configure the signed payment notification URL as `/api/pos/qr-payments/webhook`. Follow `docs/FIUU_POS_SETUP.md` before changing `POS_QR_PAYMENT_MODE` to `fiuu`.

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

Apply to linked remote Supabase project:

```powershell
npx supabase db push --yes
```

Rules:

- Apply migrations before relying on deployed API code that uses new tables/columns.
- Check RLS and grants before production use.
- Regenerate database types after stable schema changes.
- If `db push` reports history mismatch, stop and inspect before manually applying SQL.

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

- [x] Supabase migrations applied.
- [x] Vercel production deployment Ready.
- [x] Production alias points to latest expected deployment.
- [x] Error logs checked.
- [x] Changed API/page smoke-tested.
- [x] Performance budget checked for changed dashboard/API route.
- [x] Task board updated.
- [x] QA checklist updated for known issues.

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
