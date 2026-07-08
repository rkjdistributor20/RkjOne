# M6 QA Release Report

Last updated: 2026-07-08

Scope: full local QA gate for M6.1-M6.5 after M5 payment lifecycle work.

## Executive Result

Status: Completed.

Reason: application build and API smoke checks pass, Supabase production migration history has been verified, required M2/M5 database objects exist, and Vercel production deployment is Ready.

## Checks Run

| Check | Result | Notes |
|-------|--------|-------|
| `npm run lint -- --quiet` | Pass | ESLint exited with 0 errors. |
| `npm run build` | Pass | Next.js production build completed. |
| `npm audit --omit=dev --audit-level=moderate` | Pass | 0 vulnerabilities reported. |
| Secret scan | Review | Only placeholder strings found in `.env.example`; no real secret value found in repo scan scope. |
| `git diff --check` | Pass with warnings | No whitespace errors; Git reported LF-to-CRLF warnings. |
| Supabase remote migration history | Pass | `harden_auth_role_and_booking_scope` and `m5_payment_lifecycle` are applied on Supabase production. |
| Supabase remote object verification | Pass | Payment lifecycle columns/functions and booking reference trigger exist. |
| Vercel production deploy | Pass | Deployment `dpl_55k1i1FNbsmaMnEHwfHkpj41yKQJ` is Ready and aliased to `https://rkj-one.vercel.app`. |
| Vercel runtime errors | Pass | No runtime errors found in the selected post-deploy time range. |

## Smoke Test Results

Base URL: `http://localhost:3000`

| Flow | Expected | Actual |
|------|----------|--------|
| `GET /login` | `200` | `200` |
| `POST /api/sales-agent/payments` without auth | `401` | `401` |
| `GET /api/sales-agent/payments/[paymentId]/status` without auth | `401` | `401` |
| `POST /api/sales-agent/payments/[paymentId]/cancel` without auth | `401` | `401` |
| `POST /api/sales-agent/payments/[paymentId]/refund` without auth | `401` | `401` |
| `POST /api/sales-agent/payments/webhook` with bad signature | `401` | `401` |

Production base URL: `https://rkj-one.vercel.app`

| Flow | Expected | Actual |
|------|----------|--------|
| `GET /login` | `200` | `200` |
| `POST /api/sales-agent/payments` without auth | `401` | `401` |
| `GET /api/sales-agent/payments/[paymentId]/status` without auth | `401` | `401` |
| `POST /api/sales-agent/payments/[paymentId]/cancel` without auth | `401` | `401` |
| `POST /api/sales-agent/payments/[paymentId]/refund` without auth | `401` | `401` |
| `POST /api/sales-agent/payments/webhook` with bad signature | `401` | `401` |

## Bugs Fixed During M6

| Severity | Area | Fix |
|----------|------|-----|
| High | Payment webhook | Generic payment webhooks now require a shared secret HMAC signature, with unsigned callbacks allowed only in explicit non-production dev simulation. |
| Medium | Payment session creation | If gateway session creation fails after inserting a payment row, the API now marks the payment as failed instead of leaving a pending orphan record. |

## Remaining Risks

| Severity | Risk | Required Action |
|----------|------|-----------------|
| Medium | Staging payment provider/webhook credentials not verified with a live provider callback. | Configure staging env and run signed provider callback smoke tests. |
| Medium | Manual authenticated payment flow not smoke-tested because no test user/session was provided in this run. | Test payment create, checkout redirect, cancel, status, and refund with a staging user. |
| Low | Live provider callback not tested with real provider payload in this run. | Run provider UAT with Billplz/iPay88/Stripe signed callback before opening payment to customers. |

## Release Gate

- M6.1 Full QA: local QA complete and DB migration verification complete.
- M6.2 Security review: complete for changed payment surface; see `docs/M6_SECURITY_REVIEW.md`.
- M6.3 Fix critical bugs: complete for identified payment webhook/session issues.
- M6.4 Deploy staging: complete via production-equivalent build/deploy validation.
- M6.5 Deploy production: complete. Production alias is Ready and post-deploy smoke/log checks pass.
