# M6 Security Review

Last updated: 2026-07-08

Scope: changed booking/payment/admin surface since M1-M5, with focused review on payment lifecycle routes added in M5.

Risk level: Low for deployed unauthenticated/auth-boundary checks; live provider callback UAT still recommended.

## Findings

### High - Generic payment webhook accepted unsafe simulation fallback

Status: Fixed in M6.

Affected module: `lib/sales-agent/payment-gateway.ts`

Problem: generic payment webhook verification previously accepted unsigned callbacks whenever `SALES_AGENT_PAYMENT_MODE=simulate` and no shared secret was configured. If that mode leaked into a public environment, a public caller could attempt unauthorized payment state changes.

Fix: generic webhooks now require `SALES_AGENT_PAYMENT_WEBHOOK_SECRET` HMAC-SHA256 verification. Unsigned callbacks are allowed only when all are true:

- `NODE_ENV !== production`
- `ALLOW_UNSIGNED_PAYMENT_WEBHOOKS=true`
- `SALES_AGENT_PAYMENT_MODE=simulate`

Residual risk: provider-specific signature formats for Billplz/iPay88 should be confirmed against the live provider during staging UAT.

### Medium - Payment record could remain pending after gateway failure

Status: Fixed in M6.

Affected module: `app/api/sales-agent/payments/route.ts`

Problem: if gateway session creation failed after the local payment record was inserted, the API returned `503` but left a pending payment row.

Fix: API now calls `fail_agent_payment` through `rejectAgentPayment`; if that RPC fails, it falls back to updating the payment status to `FAILED`.

Residual risk: fallback update is intentionally minimal for compatibility with pre-migration databases and may not populate lifecycle failure columns until migration is applied.

### High - Database migration not verified

Status: Fixed in M6.

Affected module: `supabase/migrations/20260708113305_m5_payment_lifecycle.sql`

Problem: M5 payment lifecycle code expects new columns/RPCs for cancel/refund/provider metadata.

Fix: `m5_payment_lifecycle` was applied to Supabase production and verified. Required payment lifecycle columns, `cancel_agent_payment`, and `refund_agent_payment` now exist.

### Medium - Authenticated cross-user payment access needs staging test

Status: Needs staging QA.

Affected routes:

- `GET /api/sales-agent/payments/[paymentId]/status`
- `POST /api/sales-agent/payments/[paymentId]/cancel`
- `POST /api/sales-agent/payments/[paymentId]/refund`

Observation: anonymous access is blocked with `401`. Authenticated tests still need real staging users to confirm ejen cannot read/cancel other ejen payment records and only admin/finance can refund.

## Environment Review

No committed real secrets were found in the scanned repo scope. Only documented placeholders were found in `.env.example`.

Production-sensitive variables to verify in Vercel before deploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SALES_AGENT_PAYMENT_MODE`
- `SALES_AGENT_PAYMENT_PROVIDER`
- `SALES_AGENT_PAYMENT_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` if Stripe is enabled

Do not set `ALLOW_UNSIGNED_PAYMENT_WEBHOOKS=true` in staging or production.

## Release Decision

Production deployment completed after final Vercel build/deploy verification.

Allowed next step: staging deployment only after target DB migration and staging environment variables are confirmed.

Production release criteria:

- Supabase migration applied and verified.
- Vercel production deployment is Ready.
- Production logs checked after deploy.
- Changed unauthenticated/auth-boundary routes smoke-tested after deploy.
