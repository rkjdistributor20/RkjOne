# Security Review - RKJ One

Last updated: 2026-07-10

Scope:

- Booking API, booking database hardening, and `/bookings` access boundary.
- HRMIS AM leave coverage workflow.
- Sales Agent service-role API route guards.
- Auth/session middleware, role helpers, env/config, webhook access, security headers, and npm production dependency posture.

Overall risk level: **Medium**

Reason: no confirmed hardcoded production secret in tracked source was found, and the previous High booking/RLS findings are mitigated. Remaining risks are mostly defense-in-depth, live provider UAT, and real-account role verification items.

## Controls Observed

- Protected API routes use `getCurrentProfile()` and return JSON `401` for anonymous API callers.
- Browser pages without a session redirect to `/login`.
- Public webhook paths are allowlisted in middleware and still rely on route-level signature verification/rate limiting.
- `.env.local`, `.vercel/`, temporary password files, and mobile reviewer credentials are ignored by Git.
- Security headers exist in `next.config.ts`, including HSTS, frame denial, no-sniff, referrer policy, permissions policy, and CSP.
- API/dashboard cache control is set to `no-store`.
- Booking create/update validates enum/date/time/number/object inputs before DB write.

References:

- Supabase requires RLS on exposed `public` tables and only required role grants.
- Service-role Supabase clients bypass RLS and must only be used after explicit route-level role/scope checks.

## Active Findings

### Critical

No active Critical finding confirmed.

### High

No active High finding confirmed after the booking/RLS and Sales Agent route-guard mitigations.

### Medium

| ID | Risk | Evidence | Impact | Fix |
|----|------|----------|--------|-----|
| SEC-005 | Service-role client can still be created with SSR cookie handling. | `lib/supabase/server.ts` exposes `createServiceClient()` through `createServerClient()` with cookie handlers. | Service role bypasses RLS; mixing privileged clients with cookie plumbing increases accidental misuse risk. | Prefer `createAdminClient()` from `lib/supabase/admin.ts` for service-role operations, then migrate routes gradually. |
| SEC-010 | Temporary/generated passwords may be returned to admin UI responses. | User-management reset/provisioning flows intentionally show one-time credentials to authorized admins. | Passwords can appear in browser devtools, support screenshots, proxy logs, or screen recordings. | Keep `no-store`, avoid logs, add audit events, and move toward one-time secure reveal/download with forced password change. |
| SEC-011 | CSP still allows `unsafe-inline` and `unsafe-eval`. | `next.config.ts` includes inline/eval allowances. | XSS impact is higher if any injection bug appears. | Move toward nonce/hash CSP and remove `unsafe-eval` in production if framework/tooling permits. |
| SEC-012 | Rate limit is in-memory only. | `lib/security/rate-limit.ts` stores buckets in a process-local `Map`. | Serverless/multi-instance limits are not globally enforced and reset with cold starts. | Use durable/edge-backed rate limiting for auth, password, admin, and webhook endpoints. |
| SEC-016 | Live payment provider UAT is not complete. | Payment routes and signed webhooks exist, but live merchant callback has not been verified with real/sandbox provider credentials in this session. | Payment status drift can occur if provider callback shape/signature differs from expectation. | Run Billplz/iPay88/Stripe UAT with valid merchant credentials before opening live payment volume. |

### Low

| ID | Risk | Evidence | Impact | Fix |
|----|------|----------|--------|-----|
| SEC-015 | No generated DB type for `bookings`. | Booking routes still cast `.from('bookings' as never)`. | Security-sensitive fields lose type-level review support. | Regenerate Supabase TypeScript types after booking schema stabilizes. |
| SEC-017 | Authenticated RLS tests still need real role sessions. | Anonymous smoke checks pass, but direct authenticated Data API/RLS checks require real/staging accounts per role. | A role-specific policy gap may only appear with live user claims. | Run real-account UAT for Owner/Admin/OM/AM/Staff/Sales Agent before broad rollout. |

## Mitigated Findings

| ID | Status | Mitigation |
|----|--------|------------|
| SEC-001 | Mitigated | `bookings_update_scope` was tightened so normal branch-access users cannot update all branch bookings. |
| SEC-002 | Mitigated | HQ branch selection now validates `branches.organization_id`, and DB trigger rejects cross-organization booking branch references. |
| SEC-003 | Mitigated | Area Manager booking update scope is split from HQ/global manager roles and requires `public.has_branch_access(branch_id)`. |
| SEC-004 | Mitigated | Booking status lifecycle is explicit; create starts as `PENDING`, terminal transitions are manager-only, and invalid transitions return `400`. |
| SEC-006 | Mitigated | Sales Agent service-role portal routes now check `canAccessSalesAgent(profile.role)` before service-role reads/writes. |
| SEC-007 | Mitigated | Signed payment webhook paths are public at middleware level and protected by route-level signature checks. |
| SEC-008 | Mitigated | Booking enum/date/time/metadata/pax validation now returns explicit `400`; duplicate custom booking numbers return `409`. |
| SEC-009 | Mitigated | Booking assignee validation is enforced through server API and DB-side same-organization active-profile checks. |
| SEC-013 | Mitigated | `.env.example` uses blank/non-secret placeholders rather than real token-shaped values. |
| SEC-014 | Mitigated | `/pos` now includes explicit page-level unauthenticated redirect in addition to middleware protection. |

## Env And Config Review

- `.env.local`: present locally and ignored by `.gitignore`; never commit real values.
- `.vercel/.env.production.local`: ignored through `.vercel/`.
- `NEXT_PUBLIC_*`: public by design. Do not put secrets in any `NEXT_PUBLIC_` key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only. Every runtime usage must have route-level role, organization, branch, or legal-entity checks.

## API Access Review

- Public unauthenticated routes include `/`, `/login`, `/auth*`, `/offline`, `/privacy`, static assets, `/api/health`, and signed webhook paths.
- Authenticated service-role endpoint pattern:
  1. `getCurrentProfile()`
  2. role/module permission check
  3. organization/branch/legal-entity scope validation
  4. service/admin client query
- Booking page navigation is limited to `SUPER_ADMIN`, `ADMIN`, and `OPERATION_MANAGER` until owner confirms broader booking SOP.
- AM leave approval remains blocked until OM cover is recorded.

## Required Fix Order

1. Run real-account role UAT for authenticated RLS and page/action access.
2. Run live payment provider UAT with valid signed callback.
3. Gradually migrate service-role operations from cookie-based `createServiceClient()` to no-cookie `createAdminClient()`.
4. Add durable rate limiting for auth/admin/webhook flows.
5. Add audit events for password reset, booking status changes, Sales Agent payment actions, and HR approval/coverage actions.
6. Regenerate Supabase TypeScript types after schema stabilizes.

## Verification Checklist

- Run `npm run verify:workflow`.
- Run `npm run smoke:production` after deployment.
- Test direct Supabase/Data API updates for Admin, OM, AM, Staff creator, Staff non-creator, Sales Agent, and anonymous user.
- Test cross-organization `branch_id` and `assigned_to` attempts.
- Test HR/Admin cannot approve AM leave before OM coverage.
- Test signed payment webhooks without user cookies.
- Re-run `npm audit --omit=dev --audit-level=moderate`.
- Confirm Vercel environment variables do not expose service-role keys to client bundles.
