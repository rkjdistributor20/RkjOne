# RKJ One QA Checklist

Last updated: 2026-07-11

Use this checklist for QA AI, Code Reviewer AI, and human review before merge/deploy.

## General Code Review

- [ ] Scope matches owner request.
- [ ] No unrelated UI/code changes.
- [ ] No secrets or personal credentials committed.
- [ ] TypeScript passes.
- [ ] ESLint passes for changed files.
- [ ] `npm run build` passes for production-impacting changes.
- [ ] `npm run verify:workflow` passes after HR/OM/booking/Sales Agent workflow changes.
- [ ] `npm run verify:performance` passes after dashboard/workflow performance changes.
- [ ] `npm run perf:budget` passes before/after deployment when route latency is changed.
- [ ] Existing module patterns are followed.
- [ ] Errors are returned with appropriate status codes.
- [ ] Empty/loading/error states are handled if UI changed.

## API Review

- [ ] Route calls `getCurrentProfile()` or otherwise has explicit auth design.
- [ ] Role access is checked before writes.
- [ ] Organization boundary is validated.
- [ ] Branch/region scope is validated.
- [ ] Foreign keys supplied by client belong to the same organization.
- [ ] Enum values are rejected with `400` instead of silently changed.
- [ ] Date/time/number inputs are validated before DB write.
- [ ] Duplicate conflicts return `409` where appropriate.
- [ ] Response shape is documented in `docs/API_SPEC.md`.

## Supabase/RLS Review

- [ ] New table has `organization_id` unless there is a documented reason.
- [ ] New table has RLS enabled.
- [ ] Policies cover select/insert/update/delete as needed.
- [ ] RLS is not broader than API authorization.
- [ ] Branch access uses `public.has_branch_access()` or stronger validation.
- [ ] Service role use is justified and server-only.
- [ ] New indexes support common filters.
- [ ] `updated_at` trigger exists where needed.

## Frontend Review

- [ ] Layout matches existing RKJ One operational design.
- [ ] No decorative landing-page UI for internal tools.
- [ ] Mobile viewport is usable.
- [ ] Text does not overflow buttons/cards.
- [ ] Buttons use clear action labels/icons.
- [ ] Mutations show success/error feedback.
- [ ] Client API calls handle auth redirects and JSON errors.

## HRMIS 3-Company Review

- [ ] RKJ, RKJ_DIST and RKJ_MFG are clearly separated in HR dashboard.
- [ ] Staff self-service shows the correct legal employer.
- [ ] Staff can only see their own HR requests, leave, attendance and payroll.
- [ ] HR/Admin actions are scoped to the selected legal entity unless user is group-wide.
- [ ] Leave request cannot exceed available balance unless leave type is unpaid.
- [ ] Staff can cancel only submitted/in-review requests.
- [ ] AM emergency POS requires an approved shift schedule first.
- [ ] OM fallback for AM leave is documented and does not grant sensitive admin permissions.
- [ ] AM leave approval is blocked until OM cover is recorded.
- [ ] OM can mark AM leave coverage but cannot approve/reject HR requests.
- [ ] HR/Admin can approve/reject HR requests only within their legal entity scope unless group-wide.
- [ ] Payroll, leave and documents do not mix records across legal entities.

## Deployment Review

- [ ] Migration applied to Supabase if schema changed.
- [ ] Vercel production deployment is Ready.
- [ ] Production alias points to expected deployment.
- [ ] Vercel error logs checked for the last hour.
- [ ] Smoke test performed for changed flow.
- [ ] Rollback path is known.

## Dashboard Performance Review

- [x] AM dashboard does not fetch kiosk overview twice on the same request.
- [x] POS overview only loads active/visible branch rows unless an all-branch view is explicitly requested.
- [x] Fleet overview uses count queries for delivery status and bounded latest vehicle status logs.
- [x] Workflow SOP panel renders only the first four priority steps and summarizes the rest.
- [x] `npm run verify:performance` guards the lightweight workflow/dashboard path.
- [x] Dashboard branch scope can use `get_dashboard_snapshot` RPC with code fallback.
- [x] Fleet master vehicle rows use a short 60-second per-organization cache while live status/count queries stay realtime.
- [x] Dashboard performance migration adds delivery/fleet/finance/approval/POS shift composite indexes.
- [x] `dashboard_daily_rollups` materialized view is direct-access restricted for anon/authenticated users.
- [x] Dashboard route has a `loading.tsx` fast shell for slow data waits.
- [x] `npm run perf:budget` monitors production login, health, dashboard auth gate, booking API and Sales Agent auth gate latency.
- [x] Web Vitals monitoring records sampled authenticated user metrics through RLS-protected `performance_web_vitals`.
- [x] Non-owner dashboard streams governance/POS/fleet panels after KPI shell.
- [x] Owner dashboard streams governance/POS/fleet/HR panels after hero, KPI, delegation and company shell.
- [x] HQ Distributor avoids bulk initial loading: stock balances and audits load only when their tabs are opened.
- [x] HQ Distributor summary API uses parallel reads and short private cache.
- [x] HQ factory order history is bounded to recent rows by default.
- [x] Active branch and vehicle master rows use short per-organization cache while operational counts remain live.
- [x] Master-data APIs used by POS/inventory have bounded result limits and short private browser cache.
- [x] Reports dashboard loads overview/sales first and defers branch/product/staff/inventory/fleet reports until the tab is opened.
- [x] Finance dashboard loads cash-control core first and defers QR manual, reconciliation and reports tab data until needed.
- [x] Fleet dashboard defers status logs and create-order reference data until the status tab/dialog is opened.
- [x] Finance and Reports list APIs use bounded limits plus short private cache headers for repeat user reads.

## M6 Release QA Notes

- [x] `npm run lint -- --quiet` passed.
- [x] `npm run build` passed locally.
- [x] `npm audit --omit=dev --audit-level=moderate` reported 0 vulnerabilities.
- [x] Secret scan found no committed real secrets.
- [x] Supabase migrations `harden_auth_role_and_booking_scope`, `m5_payment_lifecycle`, and `production_rls_advisor_fixes` applied and verified.
- [x] Supabase advisor error-level check returns no issues after RLS/view/function fixes.
- [x] Latest Vercel production deployment is Ready.
- [x] Production smoke tests passed 12/12 for `/login`, booking redirect/API auth, HR OM coverage auth, Sales Agent catalog/price-group auth, payment API auth, bad-signature webhook rejection, and `/api/health`.
- [ ] Run signed live-provider callback UAT with the selected payment provider before opening live customer payment volume.

## Booking API QA Notes

Current review findings to fix before UI/external integration:

- [x] RLS update policy must not allow all branch-access users to update bookings.
- [x] Booking navigation/page access is limited to Admin/OM while SOP is pending.
- [x] API rejects cross-organization `branch_id` before write.
- [x] API validates `assigned_to` against same organization and active profile.
- [x] Invalid `status`, `priority`, date, time, metadata and pax return explicit `400`.
- [x] Creating `COMPLETED`, `CANCELLED`, `CONFIRMED`, or `NO_SHOW` bookings returns `400`; create starts as `PENDING`.
- [x] Duplicate custom `booking_number` returns `409 Conflict`.
- [x] Anonymous `/api/bookings` returns JSON `401`.

## Sales Agent API QA Notes

- [x] Service-role portal routes check `canAccessSalesAgent()` before reading/writing Sales Agent data.
- [x] Anonymous Sales Agent catalog and price-group routes return JSON `401`.
- [ ] Real-account role UAT confirms Staff/AM/HR cannot access Sales Agent portal APIs and Sales Agent/Admin roles can still complete expected flows.
