# Security Review - RKJ One

Last updated: 2026-07-08

Scope:

- Booking API and booking database hardening draft.
- Auth/session middleware and role helpers.
- Service-role Supabase usage in representative server pages/API routes.
- Env/config, secret exposure posture, security headers, webhook access, and npm production dependency audit.

No application code, migration, or production data was changed during this review.

Overall risk level: **High**

Reason: no confirmed hardcoded production secret in tracked source was found, but booking RLS/API scope and service-role route guard gaps can allow overbroad access or data modification if a user calls API/Data API paths directly.

## Controls Observed

- Supabase user identity is loaded with `supabase.auth.getUser()` in `lib/supabase/middleware.ts` and `getCurrentProfile()`.
- `.env.local` and `.vercel/` are ignored by Git.
- Security headers exist in `next.config.ts`, including HSTS, frame denial, no-sniff, referrer policy, permissions policy, and CSP.
- API/dashboard cache control is set to `no-store`.
- Payment webhooks include signature verification and rate limiting in route handlers.
- `npm audit --omit=dev --audit-level=moderate` returned `found 0 vulnerabilities`.

References:

- Supabase now requires explicit grants for public-schema Data API access on new projects from 2026-05-30 and existing projects from 2026-10-30.
- Supabase recommends RLS on exposed `public` tables and granting only needed role privileges.

## Findings

### Critical

No Critical finding confirmed in this review.

### High

| ID | Risk | Evidence | Impact | Fix |
|----|------|----------|--------|-----|
| SEC-001 | Booking RLS update policy is broader than API role rules. | `supabase/migrations/20260708100944_booking_api.sql` allows `(branch_id IS NOT NULL AND public.has_branch_access(branch_id))` to update bookings; API allows manager roles or creator edits only. | Branch-access users may update bookings created by other users in the same branch through direct Supabase/Data API access. | Replace `bookings_update_scope` so non-manager users can update only their own active bookings. Area Manager update should require branch/region match and an approved lifecycle action. |
| SEC-002 | HQ branch scope helper does not validate requested branch belongs to the current organization. | `lib/auth/branch-scope.ts` returns `requestedBranchId` directly for HQ roles; current booking insert RLS allows HQ roles to use any `branch_id`. | Cross-organization branch references can be written into same-organization booking rows, breaking tenant boundary and increasing data leak/confusion risk through service-role reads. | For HQ roles, look up `branches.id` with `organization_id = profile.organization_id`; reject missing/cross-org branch IDs before write. Add DB trigger/check as defense in depth. |
| SEC-003 | Draft `AREA_MANAGER` RLS remains too broad. | `docs/booking_api_migration_draft.sql` includes `AREA_MANAGER` in the same manager list for update `USING`/`WITH CHECK`. | Area Manager direct Data API updates may bypass region/branch restrictions expected by route logic. | Split HQ/global roles from `AREA_MANAGER`; require `branch_id is not null and public.has_branch_access(branch_id)` for Area Manager in both current-row and new-row checks. |
| SEC-004 | Booking status lifecycle can be abused by creators. | `app/api/bookings/[id]/route.ts` lets creator edit when current status is `PENDING`/`CONFIRMED`, then accepts terminal statuses like `COMPLETED`, `CANCELLED`, and `NO_SHOW`. | A normal creator may close, cancel, complete, or no-show their own booking without manager approval if lifecycle is not intended to allow it. | Define a lifecycle matrix. Enforce terminal status transitions as manager-only in API and RLS. |

### Medium

| ID | Risk | Evidence | Impact | Fix |
|----|------|----------|--------|-----|
| SEC-005 | Service-role client is created with SSR cookie handling. | `lib/supabase/server.ts` uses `createServerClient()` with `SUPABASE_SERVICE_ROLE_KEY` and cookies. | Service role bypasses RLS; mixing it with cookie/session plumbing makes accidental privileged reads/writes easier to misuse. | Use the no-cookie admin client pattern from `lib/supabase/admin.ts` for service-role operations. Keep user session client separate. |
| SEC-006 | Some service-role Sales Agent GET endpoints only require authentication, not role permission. | `app/api/sales-agent/catalog/route.ts` and `app/api/sales-agent/price-groups/route.ts` use service role after only `getCurrentProfile()`. | Any authenticated user in the organization may read Sales Agent catalog/price group data, including pricing configuration. | Add `canAccessSalesAgent()` or stricter role/account checks to all service-role sales-agent endpoints. |
| SEC-007 | Payment webhook routes may be blocked by middleware before signature validation. | `lib/supabase/middleware.ts` only treats `/api/health` as public; webhook handlers expect unauthenticated signed requests. | Payment callbacks can redirect to login and fail, causing payment status drift and manual reconciliation risk. | Explicitly allowlist signed webhook paths in middleware, then rely on route-level signature verification and rate limiting. |
| SEC-008 | Booking API silently normalizes invalid enum/status values. | `app/api/bookings/route.ts` falls back invalid enums to defaults; `PATCH` ignores invalid enum values if normalization returns null. | Clients can think a requested security-sensitive status/priority change succeeded or was accepted differently than sent. | Reject invalid enum/date/time/number inputs with `400` before DB write. |
| SEC-009 | `assigned_to` validation draft may fail or be bypassed depending on RLS context. | Draft trigger queries `public.profiles`; existing `profiles_select` allows own profile or admin reads only. | Non-admin valid assignments can fail, or teams may weaken RLS to make the trigger work. | Validate assignee in server API with explicit same-org checks, or use a reviewed security-definer helper with revoked execute and narrow logic. |
| SEC-010 | Temporary passwords are returned in API responses. | `app/api/settings/users/route.ts` returns `temporary_password`; staff reset returns `portal_password`. | Passwords can be exposed in browser devtools, proxy logs, screenshots, or support recordings. | Keep no-store headers, add audit events, limit roles, avoid returning supplied passwords, consider one-time secure display/download, and ensure no logs capture response bodies. |
| SEC-011 | CSP still allows `unsafe-inline` and `unsafe-eval`. | `next.config.ts` has `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. | XSS impact is higher if any injection bug appears because inline/eval script execution is allowed. | Move toward nonce/hash CSP and remove `unsafe-eval` in production if Next/tooling permits. |
| SEC-012 | Rate limit is in-memory only. | `lib/security/rate-limit.ts` stores buckets in a process-local `Map`. | On serverless/multi-instance deployment, limits are not globally enforced and reset with cold starts. | Use durable/edge-backed rate limiting for auth, password, admin, and webhook endpoints. |

### Low

| ID | Risk | Evidence | Impact | Fix |
|----|------|----------|--------|-----|
| SEC-013 | `.env.example` contains JWT-shaped placeholder values. | `.env.example` includes example Supabase JWT-looking strings for anon/service keys. | Secret scanners may flag false positives; reviewers may miss real leaks among placeholder noise. | Replace with non-token placeholders like `YOUR_SUPABASE_ANON_KEY` and `YOUR_SUPABASE_SERVICE_ROLE_KEY`. |
| SEC-014 | POS page relies on middleware for unauthenticated access control. | `app/(dashboard)/pos/page.tsx` only special-cases `SALES_AGENT`; it does not redirect when `profile` is null. | Low direct risk because middleware covers `/pos`, but defense-in-depth is weaker if middleware changes. | Add explicit `if (!profile) redirect('/login')` in server page. |
| SEC-015 | No generated DB type for `bookings`. | Booking routes cast `.from('bookings' as never)`. | Security-sensitive fields lose type-level review support. | Regenerate Supabase types after booking schema stabilizes. |

## Env And Config Review

- `.env.local`: present, contains Supabase URL/anon/service role keys; ignored by `.gitignore`.
- `.vercel/.env.production.local`: contains secret-like values; ignored through `.vercel/`.
- `.env.example`: tracked intentionally; contains placeholders, but some are token-shaped and should be made clearly non-secret.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only usage detected. Many scripts and some server routes/pages use it; every runtime usage must have a route-level role guard because service role bypasses RLS.
- `NEXT_PUBLIC_*`: public by design. Do not put secrets in any `NEXT_PUBLIC_` key.

## API Access Review

- Public unauthenticated routes currently include `/`, `/login`, `/auth*`, `/offline`, `/privacy`, static assets, and `/api/health`.
- Signed payment webhooks should be public at middleware level but protected by route-level signature verification.
- Authenticated service-role endpoints need a consistent pattern:
  1. `getCurrentProfile()`
  2. role/module permission check
  3. organization/branch/legal-entity scope validation
  4. only then call service/admin client

## Required Fix Order

1. Fix booking RLS update policy and HQ branch same-org validation.
2. Fix Area Manager scope in the draft migration before promotion.
3. Decide booking lifecycle and enforce terminal statuses in API and RLS.
4. Add role guard to all service-role Sales Agent GET endpoints.
5. Allowlist signed webhook paths in middleware while preserving signature/rate-limit checks.
6. Separate service-role client from cookie-based SSR client.
7. Replace token-shaped placeholders in `.env.example`.

## Verification Checklist

- Run RLS tests for Admin, Area Manager, Staff creator, Staff non-creator, Sales Agent, and anonymous user.
- Test direct Supabase/Data API updates, not only Next.js API routes.
- Test cross-org `branch_id` and `assigned_to` attempts.
- Test signed webhooks without user cookies.
- Re-run `npm audit --omit=dev --audit-level=moderate`.
- Confirm Vercel environment variables do not expose service-role keys to client bundles.

