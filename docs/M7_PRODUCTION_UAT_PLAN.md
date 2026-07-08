# M7 Production UAT & Stabilization Plan

Last updated: 2026-07-08

Purpose: stabilize RKJ One after M6 production deployment before adding large new features.

Production URL: https://rkj-one.vercel.app

## Release Gate

| Gate | Status | Evidence |
|------|--------|----------|
| Production deployment Ready | Done | `dpl_55k1i1FNbsmaMnEHwfHkpj41yKQJ` |
| Supabase migrations verified | Done | `harden_auth_role_and_booking_scope`, `m5_payment_lifecycle` |
| Local lint/build/audit | Done | See `docs/M6_QA_RELEASE_REPORT.md` |
| Anonymous auth-boundary smoke | Done | Login 200, protected payment APIs 401 |
| Live provider payment callback | Pending | Needs selected provider sandbox/live test payload |

## UAT Roles

Test each role with a real account. Do not share passwords in docs, chat, screenshots, or tickets.

| Role | Main Areas | Pass Criteria |
|------|------------|---------------|
| Owner / Super Admin | Dashboard, admin, settings, users, reports | Can view company-wide data and manage users without cross-org leakage. |
| Admin | Admin dashboard, bookings, operations | Can manage operational records but cannot access server secrets or restricted finance-only actions. |
| Finance | Finance, payments, refunds, reports | Can review payments and record refunds where allowed. |
| Staff | Dashboard, profile, assigned work | Sees only own/allowed branch data. |
| Area Manager | Branch/kawasan views, inventory, operations | Sees only assigned region/branch scope. |
| Sales Agent | Catalog, stock order, payment, receipt | Can create order, initiate payment, cancel pending payment, view own receipt/status only. |

## UAT Flow Checklist

| ID | Flow | Owner | Status | Expected Result |
|----|------|-------|--------|-----------------|
| UAT-001 | Login/logout for every role | QA/Owner | Pending | Correct landing page and no auth loop. |
| UAT-002 | Role navigation visibility | QA | Pending | User sees only allowed menus/actions. |
| UAT-003 | Booking create/list/detail/edit/cancel | Operations | Pending | Booking lifecycle works and errors are clear. |
| UAT-004 | Cross-branch data access attempt | Security/QA | Pending | Unauthorized branch data is blocked. |
| UAT-005 | Admin user management | Admin | Pending | Create/update/deactivate user flow works. |
| UAT-006 | Sales agent stock order | Sales Agent Lead | Pending | Order totals, status, and factory visibility are correct. |
| UAT-007 | Payment session creation | Finance/Sales Agent Lead | Pending | Checkout/session metadata is created correctly. |
| UAT-008 | Payment cancel pending | Finance | Pending | Payment lifecycle becomes cancelled/failed as expected. |
| UAT-009 | Payment refund paid | Finance | Pending | Refund is recorded and downstream order/subscription status is correct. |
| UAT-010 | Signed provider webhook | Finance/DevOps | Pending | Invalid signature rejected; valid provider callback updates status. |
| UAT-011 | POS open shift and sale | Branch Staff | Pending | Shift and transaction sync correctly. |
| UAT-012 | Payroll read-only employee view | HR/Payroll | Pending | Staff sees own payslip/payroll only. |
| UAT-013 | Reports dashboard | Owner/Finance | Pending | Metrics match source records for the selected day/month. |
| UAT-014 | Mobile/basic responsive check | QA | Pending | Core screens usable on phone width. |
| UAT-015 | Error/log review after UAT | DevOps | Pending | No new critical runtime errors. |

## Daily Stabilization Routine

Run during the first 7 production days:

1. Run `npm run smoke:production`.
2. Check Vercel runtime errors for the last 24 hours.
3. Check Supabase migration history and API health.
4. Review failed/cancelled/refunded payments.
5. Review user login complaints.
6. Log every bug with severity, module, role, reproduction steps, and screenshot if safe.

## Severity Rules

| Severity | Meaning | Response |
|----------|---------|----------|
| Critical | Data leak, payment wrong, login outage, production down | Stop rollout and fix immediately. |
| High | Main workflow blocked for a role | Fix before broader UAT continues. |
| Medium | Workaround exists but user impact is real | Schedule in next patch. |
| Low | Copy, polish, minor UI issue | Batch into cleanup. |

## Done Criteria

M7 is done when:

- All role UAT rows are marked pass or have accepted bugs.
- Payment provider webhook UAT passes for selected provider.
- No Critical or High bug remains open.
- Monitoring routine has at least 3 clean daily checks.
- Backup and rollback SOP is reviewed by owner/admin.
