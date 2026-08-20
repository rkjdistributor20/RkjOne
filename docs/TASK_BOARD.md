# RKJ One Task Board

Last updated: 2026-08-05

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
| M6.5 | Done | Owner/DevOps AI | Deploy production. | Latest Vercel production deployment is Ready, aliased to `https://rkj.one`, `https://rkj.my`, and `https://rotikayajunus.com`, and runtime error check is clean. |

## Milestone 7 - Production UAT & Stabilization

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| M7.1 | Done | PM/QA AI | Production UAT plan by role. | `docs/M7_PRODUCTION_UAT_PLAN.md` defines role matrix, flow checklist, severity rules, and done criteria. |
| M7.2 | Done | DevOps AI | Monitoring runbook. | `docs/MONITORING_RUNBOOK.md` defines daily production checks for Vercel, Supabase, and payments. |
| M7.3 | Done | DevOps/Owner | Backup and rollback SOP. | `docs/BACKUP_ROLLBACK_SOP.md` defines Vercel rollback, database recovery rules, and payment incident handling. |
| M7.4 | Done | QA AI | Production smoke command. | `npm run smoke:production` checks public login, booking/HR/Sales Agent auth boundaries, protected payment routes, webhook signature rejection, and API health. |
| M7.5 | Done | Documentation AI | Release note baseline. | `docs/RELEASE_NOTES_M6.md` records production deployment, verification, and known follow-up. |
| M7.6 | Blocked | Finance/DevOps | Live provider payment UAT. | Fiuu channels, including DuitNow QR Offline at 0.80%, are activated and extended payment verification is enabled. Preview official-device, STAFF, shift and stock-SOP gates pass, but a controlled sandbox pre-create returned provider HTTP 404 because a valid OPA Application Code is not yet confirmed. No provider response was received by 2026-08-17, so Ticket `2924959` was escalated again for OPA enablement, Application Code, Store/Terminal mapping and callback registration. Signed UAT, Production schema deployment and settlement reconciliation remain unconfirmed. Keep Production POS QR in manual mode. |
| M7.7 | Blocked | Owner/QA | Real user role UAT. | Production audit on 2026-08-05 found 0 active ADMIN, 68 of 107 active profiles never signed in, 2 Operation Manager profiles missing legal-entity scope, and 1 Distributor staff profile with no verified branch assignment. Legal entity can be backfilled from linked staff records; role identity, branch/region assignments and first-login UAT require owner confirmation. |
| M7.8 | Review | HR/QA AI | HRMIS 3-company UAT. | Code now blocks AM leave approval until OM cover is recorded; `docs/UAT_HRMIS_3_COMPANY.md` covers legal employer separation, staff self-service, leave, AM emergency POS, OM fallback and negative access tests. |
| M7.9 | Done | Mobile/Owner | Google Play production shell. | RKJ One Staff `1.4` (version code `5`) remains available on Google Play at 100% rollout. Internal testing `1.5` (version code `6`) was published on 2026-08-05 and is available to the configured internal tester list; Production promotion remains gated by real-device acceptance. |
| M7.10 | Review | DevOps/Database | Production migration gate. | The 11 Production-only version IDs were recovered, compared with their corrected canonical migrations, represented as reviewed no-op history markers, replayed locally, and recorded in staging. Staging is up to date and the Production dry-run now lists exactly 14 canonical pending migrations. Production execution remains blocked until a current recovery point, rollback authority, maintenance window and owner approval are confirmed. |
| M7.11 | Review | Security/Frontend | Evidence-backed readiness dashboard. | System Health now reports active ADMIN, missing legal-entity scope, missing Auth users, first-login readiness and Fiuu schema/credential/mode gates without exposing personal data or secret values. |
| M7.12 | Review | Mobile/Owner/QA | Android `1.5` internal acceptance. | Internal testing release `6 (1.5)` is active with its ReTrace mapping file. Verify upgrade from Production `1.4`, session persistence, Android 14-16 system bars, offline fallback, kiosk restrictions, and Play crash/ANR results before Production promotion. |
| M7.13 | Done | Backend/Database/QA | Stabilize POS shift staff approval. | Approved POS shift requests now activate the matching staff membership, authenticated staff can create only their own correctly scoped request, missing open-shift requests are backfilled, and Production verification found zero pending members after approval. |
| M7.14 | Done | Frontend/QA | Keep Approval Center current across devices. | Approval reads bypass browser caching, the route is force-dynamic, visible tabs refresh every 30 seconds and on tab return, and an accessible manual refresh action remains available. |
| M7.15 | Review | Mobile/POS/QA | Android 58 mm Bluetooth receipt printing. | Android 1.6.3 supports one-time pairing, saved/verified printer selection, direct/test/automatic printing, duplicate auto-print protection and system fallback for the photographed POS-5890U-L; one pilot-branch physical test remains required before Production rollout. |

## Milestone 8 - Speed & Lightweight Workflow

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| PERF-001 | Done | Performance AI | Kurangkan duplicate fetch di dashboard AM. | Kiosk overview diambil sekali dan stock count dihydrate semula ke stats. |
| PERF-002 | Done | Performance AI | Ringankan POS dan fleet overview. | POS hanya ambil branch visible; fleet guna count query dan bounded latest status log. |
| PERF-003 | Done | Frontend/Performance AI | Padatkan panel Aliran Kerja & SOP. | Panel memaparkan 4 langkah utama dan ringkaskan baki langkah sokongan. |
| PERF-004 | Done | QA AI | Tambah performance guard. | `npm run verify:performance` lulus dan dimasukkan dalam QA checklist. |
| PERF-005 | Done | Database/Performance AI | Tambah index dashboard kritikal. | Migration `20260710151434_dashboard_performance_acceleration.sql` tambah composite index untuk delivery, fleet status, finance, approvals dan POS shifts. |
| PERF-006 | Done | Backend/Database AI | Tambah branch-scoped dashboard snapshot RPC. | `get_dashboard_snapshot` menggabungkan sales, approval dan outstanding cash untuk scope cawangan dengan `SECURITY INVOKER` serta fallback code jika RPC belum tersedia. |
| PERF-007 | Done | Database AI | Sediakan daily dashboard rollup materialized view. | `dashboard_daily_rollups` diwujudkan untuk admin/reporting refresh, access direct kepada anon/authenticated ditutup. |
| PERF-008 | Done | Frontend/Performance AI | Tambah fast loading shell dashboard. | `app/(dashboard)/dashboard/loading.tsx` memberi shell skeleton semasa data dashboard dimuat. |
| PERF-009 | Done | QA/DevOps AI | Tambah performance budget command. | `npm run perf:budget` ukur endpoint production penting dan fail jika status/latency melebihi budget. |
| PERF-010 | Done | Backend/Performance AI | Cache stable dashboard master data. | Senarai kenderaan aktif fleet dicache 60 saat per organisasi; delivery count dan latest status log kekal realtime/bounded. |

## Milestone 9 - Deep Speed Pass

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| PERF-011 | Done | Observability AI | Tambah real user Web Vitals monitoring. | `performance_web_vitals` table dengan RLS, `/api/monitoring/web-vitals`, `WebVitalsReporter`, dan `instrumentation-client.ts` merekod metric user login secara sampled. |
| PERF-012 | Done | Frontend/Performance AI | Stream panel dashboard berat. | Dashboard non-owner render KPI utama dahulu dan load governance/POS/fleet dalam `Suspense` melalui `DashboardOpsPanels`. |
| PERF-013 | Done | Backend/Performance AI | Cache branch master data dashboard. | Senarai cawangan aktif dashboard dicache 60 saat per organisasi dan POS overview filter locally untuk visible branch. |
| PERF-014 | Done | QA AI | Guard deep speed path. | `npm run verify:performance` cover Web Vitals, monitoring API, RLS migration, Suspense panel dan cache branch/vehicle. |
| PERF-015 | Done | Backend/Performance AI | Hadkan dan cache API master data. | POS products dan inventory stock-items ada limit 300 serta `private` cache 30s; staff grouped query dilimit 1200 rows. |

## Milestone 10 - Owner Dashboard Max Speed

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| PERF-016 | Done | Frontend/Performance AI | Stream panel berat untuk dashboard Owner. | Dashboard Owner render hero, KPI jualan, struktur syarikat dan delegation shell dahulu; governance, POS, fleet dan HR load kemudian melalui `Suspense` tanpa block paparan utama. |
| PERF-017 | Done | Frontend/Backend Performance AI | Ringankan HQ Distributor. | `/warehouse` render shell dan KPI dahulu; balances/audit hanya dimuat bila tab berkaitan dibuka; summary API query parallel; order history HQ dihadkan kepada recent rows. |
| PERF-018 | Done | Frontend/Backend Performance AI | Speed pass keseluruhan untuk Reports, Finance dan Fleet. | Reports/Finance/Fleet elak bulk initial fetch, tab berat dimuat bila dibuka, API list utama ada limit, query summary kritikal berjalan parallel, dan response read-only guna short private cache. |

## Milestone 11 - Settings & HR Responsibility Clarity

| ID | Status | Owner | Task | Acceptance |
|----|--------|-------|------|------------|
| HR-SET-001 | Done | Frontend/Security AI | Pisahkan `Staf HR` daripada `Login & Role`. | Tetapan menerangkan staf sebenar vs akaun sistem; AM melihat laluan rekod staf sahaja; panel Login & Role hanya untuk Admin HQ. |
| HR-SET-002 | Done | Backend/Security AI | Ketatkan API `settings/users` kepada Admin HQ. | List/create/edit/delete akaun pengguna memerlukan `SUPER_ADMIN`/`ADMIN`; branch assignment pengguna disahkan dalam organisasi yang sama. |
| HR-SET-003 | Done | HR/Frontend AI | Tambah panel jurang HR antara pengurusan dan staf. | HR dashboard memaparkan tindakan pengurusan/HR dan tindakan staf berasingan untuk portal, profil, cuti, permohonan dan rekod belum tetap. |
| HR-SET-004 | Done | QA AI | Tambah workflow guard untuk boundary Settings/HR. | `npm run verify:workflow` menyemak boundary Pengguna Admin-only dan panel HR pengurusan vs staf. |
| HR-SET-005 | Done | Backend/Frontend AI | Paparkan `Staf HR` ikut 3 syarikat. | API staf grouped memulangkan company grouping untuk RKJ, RKJ Distributor dan RKJ Manufacturing; UI memaparkan staf syarikat/HQ serta staf cawangan dalam company masing-masing. |

## Backlog

- Confirm owner SOP for booking users/lifecycle before reopening booking UI beyond Admin/OM.
- Add API tests for branch-scope and RLS edge cases.
- Regenerate Supabase TypeScript types after new tables are stable.
- Add audit log events for booking create/update/status changes.
- Add audit log events for Sales Agent payment route actions and HR OM coverage actions.
- Add owner dashboard card for open operational bookings if approved.
- Schedule `refresh_dashboard_daily_rollups()` through Supabase cron only after confirming refresh frequency and database load window.
