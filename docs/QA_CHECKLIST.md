# RKJ One QA Checklist

Last updated: 2026-10-24

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
- [x] Approval Center bypasses stale browser data and refreshes pending requests created or resolved on another device.
- [x] POS shift approval activates only the matching pending member within the same organization and branch.

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

## Settings & HR Responsibility Review

- [x] `Staf HR` is described as real staff records, placement, payroll/basic HR and portal account setup.
- [x] `Login & Role` is described as Admin HQ control for system login, role and dashboard AI.
- [x] `Staf HR` shows RKJ, RKJ Distributor and RKJ Manufacturing company groups for HQ/Admin views.
- [x] Staff without branch assignment appears under `Staf syarikat / HQ` for its legal entity.
- [x] Area Manager sees staff workflow only and cannot use the separate Users panel.
- [x] `/api/settings/users` list/create/edit/delete is Admin HQ only.
- [x] Area Manager staff creation remains through `/api/settings/staff` and keeps branch/sales-staff restrictions.
- [x] HR dashboard separates management/HR actions from staff self-service actions.
- [x] `npm run verify:workflow` guards the Settings/HR responsibility boundary.

## Fiuu OPA primary / cloudECR + VT+ fallback BR001 evidence — 2026-10-26

- [x] Phone Link identifies the connected BR001 tablet as Samsung `SM-X406B` running Android 16.
- [x] Google Play account `rkjdistributor20@gmail.com` registers Samsung `SM-X406B` and HONOR `ELN2-L29`/HONOR Pad X9a; the HONOR is not `NDL2-L09`/X8b.
- [x] Standard Fiuu VT availability was checked and is unavailable on both registered devices.
- [x] Fiuu VT+ availability was checked and is offered to all devices registered on the account.
- [x] The earlier Android 10/X8b support diagnosis is recorded as a non-matching device profile, without attributing fault; future troubleshooting uses the verified inventory.
- [x] The evidence review made no Production database, environment, deployment, merchant-portal or outlet change.
- [x] OPA dynamic creation fails closed unless payment mode is `fiuu` and the explicit branch allowlist contains the hard-locked pilot `BR001`; wildcards, malformed entries and BR002-BR036 are rejected.
- [x] A verified signed OPA success is persisted as sanitized `REPORTED` evidence before receipt/stock fulfilment, and duplicate callbacks retry idempotently after a transient fulfilment failure.
- [x] The webhook and both service-role OPA RPCs independently require the actual branch, shift and stored sale payload to identify `BR001`.
- [x] Authenticated status polling retries a stranded OPA `REPORTED` fulfilment without submitting another provider charge.
- [x] OPA fulfilment locks products and compares the active catalogue with the stored pricing snapshot before creating a receipt or stock movement.
- [ ] Provider-issued BR001 OPA Application Code, Secret Key, Store ID and Terminal ID are configured only in the intended non-Production server environment.
- [ ] The Fiuu notification URL points to the exact Preview/staging webhook host and a signed sandbox callback passes end-to-end.
- [ ] BR001 OPA UAT proves one payment, one sale, one receipt, one stock movement and one shift-total increment, followed by Finance settlement reconciliation.
- [ ] Fiuu provisions or identifies the BR001 cloudECR POS account and VT+ account and supplies credentials through an approved secure channel.
- [ ] BR001 VT+ is activated, cloudECR-enabled and bound; `GET /api/terminals` confirms the expected terminal and connected state.
- [ ] Fiuu confirms the 36-submerchant mapping and whether credentials, Secret Key, POS account, MID/TID and settlement are shared or isolated per sub-merchant.
- [ ] BR001 validates token login/refresh, request and response HMAC, unique references, exact amount/currency/device matching and rejection of invalid signatures.
- [x] Local code requires exact POS ID, Device ID and Terminal SN; `getLast` uses a unique query reference plus the original SALE reference in signed metadata.
- [x] Local code uses a 180-second database claim/lease—longer than the server request window—to permit at most one `getLast` call per payment across concurrent tabs and stores signed success as `REPORTED` before receipt/stock fulfilment.
- [x] Local code permits only one unresolved SALE for the exact cloudECR POS ID, Device ID and Terminal SN across RKJ tablets, stores the exact HMAC-verified payload, and preserves a server-side pricing snapshot.
- [ ] BR001 proves that successful Fiuu `getLast` returns the original SALE reference in signed metadata; absent metadata must remain fail-closed and be escalated to Fiuu.
- [ ] BR001 validates uncertain-result recovery through `getLast`: each inquiry uses a new query reference, signed metadata contains the original SALE reference, and network/duplicate recovery creates no duplicate sale, receipt or stock movement.
- [ ] Finance reconciles the physical BR001 payment against the provider transaction, RKJ receipt, stock, shift, Fiuu settlement report and bank credit.
- [ ] Owner gives fresh confirmation immediately before any Production migration, credential, environment or deployment change.

## Deployment Review

- [ ] Migration applied to Supabase if schema changed.
- [ ] A current Production recovery point is confirmed before any Production migration.
- [ ] Production and staging project references are independently verified before linking or pushing migrations.
- [ ] Readiness dashboard reports at least one approved active ADMIN and zero active non-admin profiles without legal-entity scope.
- [ ] Every active real-user profile has an Auth user and completes role-based first-login UAT.
- [ ] Fiuu remains static/manual in Production and outside the explicit BR001 pilot until OPA signed-callback UAT, idempotency and settlement reconciliation pass.
- [ ] Fiuu POS reload, duplicate-create, QR expiry, late callback, callback replay and shift-close grace cases pass against the staging OPA application.
- [ ] The legacy standard Fiuu VT path is not promoted to the Play-incompatible Samsung `SM-X406B` or HONOR `ELN2-L29`; use it only if Fiuu later supplies an approved compatible route.
- [ ] BR001 cloudECR/VT+ passes activation/binding, sale, signed final response, failure, timeout/Get Last, pending inquiry, app-kill/reopen and mixed-payment tests.
- [ ] A valid signed OPA success first commits `REPORTED` evidence and then invokes one atomic receipt/stock fulfilment; pending, invalid-signature, mismatched or ambiguous results create no sale.
- [ ] Dynamic and static/manual mixed payment reject cash over-tender; the exact cash and QR split reconciles to sale total and expected drawer cash.
- [ ] BR002-BR036 continue to display their mapped static QR throughout the BR001-only OPA or cloudECR/VT+ pilot.
- [ ] The managed-device policy installs only the official Fiuu VT+ listing and permits the approved RKJ One ↔ VT+ flow without sideloading, extra apps or unrestricted Settings.
- [ ] Inactive profiles are denied by application session loading and all RLS identity helpers before their Auth token naturally expires.
- [ ] An HQ user cannot use a branch UUID belonging to another organization through Data API or any SECURITY DEFINER RPC.
- [ ] Authenticated branch users can read scoped POS financial rows but cannot directly insert, update or delete transaction, item, payment or receipt rows.
- [ ] Android 1.7.0 is installed from the exact Internal Testing bundle and passes printer, auto-print, drawer and BR001 Fiuu VT tests; QR-only never opens the drawer.
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
- [ ] Run the `docs/POS_BLUETOOTH_PRINTER.md` acceptance test on a physical POS-5890U-L before promoting Android 1.6.

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
