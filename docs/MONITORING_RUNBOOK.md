# RKJ One Monitoring Runbook

Last updated: 2026-07-08

Purpose: repeatable checks for production stability after deployment.

## Production Targets

| System | Target |
|--------|--------|
| App | https://rkj.one |
| Vercel Project | `prj_ZeXMgkt8iHOSlkUeyN7r3GWdKxDz` |
| Vercel Team | `team_VZECgmW06CTmC1WuOPQLMJqb` |
| Supabase Project | `mtygxueknokcihofdttl` |

## Quick Health Check

Run:

```powershell
npm run smoke:production
```

Expected:

- `/login` returns `200`.
- Protected payment API routes return `401` without auth.
- Payment webhook rejects bad signature with `401`.

## Vercel Checks

Frequency during stabilization: daily and after every deployment.

What to check:

- Deployment state is `READY`.
- Production alias points to latest expected deployment.
- Runtime errors for last 24 hours.
- Top 4xx/5xx routes.

Escalate immediately if:

- Any new `500` spike appears.
- `/api/sales-agent/payments/*` has unexpected 5xx.
- Middleware/auth errors create login loops.
- Production alias points to an unexpected deployment.

## Supabase Checks

Frequency during stabilization: daily and before UAT payment testing.

What to check:

- Migration history contains expected latest migrations.
- Required payment lifecycle columns exist on `public.agent_online_payments`.
- `cancel_agent_payment` and `refund_agent_payment` are executable only by `service_role`.
- No unexpected RLS policy broadening was applied.

Escalate immediately if:

- Any migration is missing on production.
- Service-role-only functions become callable by `anon` or `authenticated`.
- A user can read another organization's or another agent's data.

## Payment Monitoring

Review these counts daily:

- New `PENDING` payments older than 30 minutes.
- New `FAILED` payments by failure reason.
- New `REFUNDED` payments and refund reference.
- Webhook `401` volume after provider integration.

For pending payments older than 30 minutes:

1. Confirm whether checkout URL/session exists.
2. Check provider dashboard for matching session/ref.
3. If provider says failed/cancelled, use finance/admin action to cancel.
4. Do not manually mark as paid without provider proof.

## Incident Template

Use this format for every production issue:

```text
Severity:
Module:
Role/user affected:
Time detected:
URL/route:
Expected:
Actual:
Steps to reproduce:
Recent deployment:
Vercel request/log reference:
Supabase table/function involved:
Temporary workaround:
Owner:
Status:
```

## Daily Sign-Off

```text
Date:
Checked by:
Smoke production:
Vercel runtime errors:
Supabase migration/object check:
Payment anomalies:
Open Critical/High bugs:
Decision: Continue UAT / Pause rollout
```
