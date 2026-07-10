# RKJ One Task Board

Last updated: 2026-07-10

Status key: `Todo`, `In Progress`, `Review`, `Blocked`, `Done`.

## Milestone 1 - Foundation & AI Project Governance

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| M1.1 | Done | PM/DevOps/Docs AI | Setup repo, env, and `AGENTS.md`. | Repo root verified, `.env.example` documents required variables, and `AGENTS.md` defines AI working rules. |
| M1.2 | Done | DevOps AI | Pastikan project boleh run. | `npm run build` passes and local dev server responds at `/login`. |
| M1.3 | Done | Senior Engineer AI | Fix build/lint error utama. | `npm run lint` exits with 0 errors; remaining legacy lint findings are warnings/backlog. |
| M1.4 | Done | Documentation AI | Dokumentasi struktur sistem. | Core docs exist under `docs/` and task board tracks current milestones. |
| PM-001 | Done | PM AI | Define AI leadership workflow. | Owner -> PM -> task board -> role agents -> PR/change -> QA/review -> deploy documented. |
| PM-002 | Done | Backend/Docs AI | Add core docs and AGENTS guide. | `AGENTS.md` plus core files in `docs/` exist and describe product, system, architecture, API, QA, deployment. |
| PM-003 | Done | PM AI | Keep task board updated after every accepted change. | Current HR, booking, Sales Agent guard, QA and deployment tasks are tracked with owner, status, and acceptance criteria. |

## Milestone 2 - Auth, Roles, Schema & Data Access

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| M2.1 | Done | Security/Backend AI | Semak auth flow. | Protected API routes return JSON `401`, browser pages redirect to `/login`, signed webhooks can reach route validation. |
| M2.2 | Done | Security/Backend AI | Semak role user/admin. | New auth bootstrap no longer trusts user-editable metadata for role assignment; existing admin/user route checks reviewed. |
| M2.3 | Done | Database/Security AI | Semak database schema. | Remote migration history is aligned; booking/payment hardening and production RLS advisor fix are applied; Supabase advisor error-level is clean. |
| M2.4 | Done | Backend/Security AI | Pastikan user hanya boleh akses data sendiri. | Branch scope rejects cross-organization branch IDs; booking assignee must be active and same organization; assigned users can read assigned bookings. |

## Milestone 2B - Booking API Backend

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| BK-001 | Done | Backend AI | Create API-only booking table and routes. | `GET/POST /api/bookings`, `GET/PATCH /api/bookings/[id]`, Supabase migration, build passes. |
| BK-002 | Review | QA AI | Review booking API for edge cases. | Findings recorded in this task board and QA checklist. |
| BK-003 | Done | Backend AI | Tighten booking RLS update policy. | Production `bookings_update_scope` now limits manager, Area Manager branch scope, and creator-owned active booking updates. |
| BK-004 | Done | Backend AI | Validate HQ requested `branch_id` belongs to same organization. | POST/PATCH/GET branch filters reject cross-org branch UUIDs. |
| BK-005 | Done | Backend AI | Validate `assigned_to` profile. | Assigned user must belong to same organization and allowed role/scope. |
| BK-006 | Done | Backend AI | Return explicit validation errors for invalid enum/date/time. | Invalid `status`, `priority`, date, time, metadata and pax now return `400`; duplicate custom `booking_number` returns `409`. |
| BK-007 | Done | Backend AI | Decide booking status lifecycle rules. | Create starts as `PENDING`; status changes are manager-only with `PENDING -> CONFIRMED/CANCELLED` and `CONFIRMED -> COMPLETED/CANCELLED/NO_SHOW`. |
| BK-008 | Done | PM/Frontend AI | Hold booking page to management roles until SOP is confirmed. | `/bookings` navigation/page is limited to Admin/OM while API remains documented for controlled operations use. |
| BK-008 | Done | Backend/Platform AI | Decide API auth behavior for external clients. | `/api/*` either returns JSON 401 for API clients or documents redirect-only browser behavior. |

## Milestone 3 - Booking Workflow UI

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| M3.1 | Done | Frontend AI | Bina flow create record/order/booking. | `/bookings` menyediakan dialog create booking yang menghantar `POST /api/bookings`, memaparkan validation error, dan refresh senarai selepas berjaya. |
| M3.2 | Done | Frontend AI | Bina list page. | `/bookings` memaparkan KPI ringkas, search, filter status/priority, empty state, loading state, error state, dan link ke detail. |
| M3.3 | Done | Frontend AI | Bina detail page. | `/bookings/[id]` memaparkan detail booking, customer, jadual, status, priority, remark, dan metadata create/update. |
| M3.4 | Review | Frontend/PM AI | Bina edit/cancel/delete jika perlu. | Detail page menyokong edit booking dan status cancel; hard delete belum dibuat kerana booking lebih selamat disimpan sebagai audit trail sehingga PM sahkan policy delete. |
| M3.5 | Done | Frontend AI | Tambah notification/status. | Booking UI memaparkan status badge, alert status terbuka, dan toast notification untuk create/update/status change. |

## Milestone 3B - POS Reject Stock Stability

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| POS-001 | Review | QA AI | Review latest POS reject stock changes. | No UI regression, stock count action works, role access checked. |
| POS-002 | Todo | Backend AI | Confirm DB/RPC path for POS batch reject stock count. | Migration and API behavior match stock count approval process. |

## Milestone 4 - Admin Management & Basic Analytics

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| M4.1 | Done | Frontend/Backend AI | Admin dashboard. | `/admin` tersedia untuk `SUPER_ADMIN`/`ADMIN`, memaparkan KPI user, booking, order, jualan, outstanding cash dan admin next action. |
| M4.2 | Done | Frontend AI | Manage users. | Admin dashboard memaut terus ke `/settings?tab=users` dan memaparkan ringkasan login, staf, HQ/branch user serta pecahan role. |
| M4.3 | Done | Frontend/Backend AI | Manage transactions/bookings/orders. | Admin dashboard memaparkan ringkasan transaksi POS, booking terbuka/hari ini/urgent, order ejen bulan semasa dan pautan ke modul berkaitan. |
| M4.4 | Done | Frontend/Reports AI | Reports/basic analytics. | Admin dashboard memaparkan jualan bulan semasa, jumlah transaksi, cash/QR split, void/refund dan pautan ke `/reports`, `/finance`, `/approvals`. |

## Milestone 4B - RLS and Data Integrity Audit

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| SEC-001 | Done | Security AI | Audit branch scope helper for HQ branch validation. | Shared helper cannot create cross-org references. |
| SEC-002 | Review | Security AI | Audit `assigned_to`/profile reference fields across modules. | Booking cross-org profile references are blocked in API and draft RLS migration; other modules remain backlog. |
| SEC-003 | Done | Security AI | Review RLS policies for newest migrations. | `20260708150423_production_rls_advisor_fixes.sql` applied; RLS enabled for exposed branch/fleet master tables and advisor error-level returns no issues. |
| SEC-004 | Done | Backend/Security AI | Guard Sales Agent service-role portal endpoints. | Catalog, price group, order, outlet, subscription, payment, payment status, receipt, confirm, cancel and iPay88 routes reject roles outside `canAccessSalesAgent()` before service-role access. |

## Milestone 5 - Payment Lifecycle

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| M5.1 | Done | Backend AI | Payment intent/session. | `POST /api/sales-agent/payments` creates a payment record plus provider session metadata, checkout URL, status URL, cancel URL and return URL. |
| M5.2 | Done | Backend/Security AI | Webhook. | `/api/sales-agent/payments/webhook` handles signed Billplz/iPay88/custom callbacks and Stripe signed events for paid, failed, cancelled and refunded lifecycle updates. |
| M5.3 | Done | Backend AI | Payment status update. | `GET /api/sales-agent/payments/[paymentId]/status` returns `status`, `lifecycle_status`, receipt when paid, gateway metadata, cancellation and refund data. |
| M5.4 | Done | Backend/Finance AI | Error/refund/cancel flow. | Pending payments can be cancelled; admin/finance can record refund; production migration adds lifecycle columns and service-role RPC functions. |

## Milestone 5B - Deployment and Production Confidence

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| DEP-001 | Done | DevOps AI | Confirm production deployment after Booking API. | Vercel production alias Ready and logs clean. |
| DEP-002 | Done | DevOps AI | Keep migration index current. | `docs/DATABASE_SCHEMA.md` lists latest migration groups, booking hardening, and M5 payment lifecycle migrations. |
| DEP-003 | Done | QA AI | Add smoke checks for booking/API auth boundary after auth behavior is settled. | `npm run smoke:production` now covers anonymous `/api/bookings`, `/bookings` redirect, HR OM coverage API, Sales Agent catalog/price group, payment APIs, webhook signature rejection and health. Authenticated role UAT remains tracked under M7.7. |

## Milestone 6 - Release Gate, Security & Deploy

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| M6.1 | Done | QA AI | Full QA. | Local lint, build, audit, secret scan, diff check, anonymous API smoke tests, and Supabase remote migration verification complete. |
| M6.2 | Done | Security AI | Security review. | `docs/M6_SECURITY_REVIEW.md` records changed-surface findings, fixed issues and remaining deploy blockers. |
| M6.3 | Done | Backend/Security AI | Fix critical bugs. | Payment webhook signature verification hardened and payment session creation failure now marks payment failed. |
| M6.4 | Done | DevOps/QA AI | Deploy staging. | Vercel production-equivalent build/deploy succeeded; post-deploy smoke checks passed. |
| M6.5 | Done | Owner/DevOps AI | Deploy production. | Production deployment `dpl_55k1i1FNbsmaMnEHwfHkpj41yKQJ` is Ready, aliased to `https://rkj.one`, and runtime error check is clean. |

## Milestone 7 - Production UAT & Stabilization

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| M7.1 | Done | PM/QA AI | Production UAT plan by role. | `docs/M7_PRODUCTION_UAT_PLAN.md` defines role matrix, flow checklist, severity rules, and done criteria. |
| M7.2 | Done | DevOps AI | Monitoring runbook. | `docs/MONITORING_RUNBOOK.md` defines daily production checks for Vercel, Supabase, and payments. |
| M7.3 | Done | DevOps/Owner | Backup and rollback SOP. | `docs/BACKUP_ROLLBACK_SOP.md` defines Vercel rollback, database recovery rules, and payment incident handling. |
| M7.4 | Done | QA AI | Production smoke command. | `npm run smoke:production` checks public login, booking/HR/Sales Agent auth boundaries, protected payment routes, webhook signature rejection, and API health. |
| M7.5 | Done | Documentation AI | Release note baseline. | `docs/RELEASE_NOTES_M6.md` records production deployment, verification, and known follow-up. |
| M7.6 | Review | Finance/DevOps | Live provider payment UAT. | Pending selected provider sandbox/live callback with valid signature and finance confirmation. |
| M7.7 | Review | Owner/QA | Real user role UAT. | Pending real account testing for Owner/Admin/Finance/Staff/Area Manager/Operation Manager/Sales Agent. |
| M7.8 | Review | HR/QA AI | HRMIS 3-company UAT. | Code now blocks AM leave approval until OM cover is recorded; `docs/UAT_HRMIS_3_COMPANY.md` covers legal employer separation, staff self-service, leave, AM emergency POS, OM fallback and negative access tests. |

## Backlog

- Confirm owner SOP for booking users/lifecycle before reopening booking UI beyond Admin/OM.
- Add API tests for branch-scope and RLS edge cases.
- Regenerate Supabase TypeScript types after new tables are stable.
- Add audit log events for booking create/update/status changes.
- Add audit log events for Sales Agent payment route actions and HR OM coverage actions.
- Add owner dashboard card for open operational bookings if approved.
