# RKJ One Product Brief

Last updated: 2026-07-08

## One-Liner

RKJ One is the operating system for Roti Kaya Junus and RKJ Distributor, connecting HQ, factory, kiosk branches, delivery, staff, finance, and owner-level AI management in one production system.

## Primary Users

| User | Need |
|------|------|
| Owner / Top management | See company health, delegate work, track AI-led project progress, and monitor risks. |
| Admin / HQ | Manage users, branches, products, stock, settings, and permissions. |
| Operation Manager | Track operations, stock flow, production, delivery, and issue resolution. |
| Area Manager | Monitor branches in assigned region, cash collection, stock movement, staff issues, and kiosk operations. |
| CEO Factory | Manage factory production, HQ stock, raw materials, and driver handoff. |
| Finance | Track collections, bank-in, reconciliations, cash use, payroll finance, and reports. |
| HR | Manage company staff records, self-service requests, leave balances, payroll support, and documents. |
| Driver | Handle delivery legs, proof of delivery, and route status. |
| Staff | Use POS, shift, stock count, attendance, profile, and self-service workflows. |
| Maintenance Manager | Receive maintenance reports and coordinate resolution. |
| Sales Agent | Order stock, pay/confirm payments, manage outlet or agent flow. |

## Business Goals

- Make RKJ operations visible from owner level down to kiosk level.
- Reduce manual follow-up by connecting POS, stock, production, delivery, finance, payroll, HR, and reports.
- Keep 36-branch operations controlled by region, branch, and role scope.
- Support daily operational work on web and mobile.
- Prepare AI leadership workflows where agents can plan, review, QA, and ship controlled improvements.

## Core Modules

| Module | Purpose |
|--------|---------|
| Dashboard | Role-based cockpit and owner/company command center. |
| POS | Kiosk sales, payments, stock checks, QR verification, reject stock, sync. |
| Inventory | HQ/kiosk stock, balances, transfers, counts, adjustments, write-offs. |
| Production | Factory schedule, stock output, branch orders, delivery preparation. |
| Fleet | Drivers, vehicles, delivery orders, dispatch, POD, route optimization. |
| Warehouse | HQ stock audits and approvals. |
| Finance | Collections, bank-in, reconciliations, QR manual, supply requests. |
| Payroll | Payroll runs, rules, commissions, payslips, weekly foreign worker pay. |
| HR | Staff profiles, companies, leave balances, self-service requests. |
| Roster/Shifts | Shift planning, attendance, clock in/out, approvals. |
| Maintenance | Maintenance reports, assignments, resolution. |
| Sales Agent | Agent catalog, orders, payments, price groups, receipts. |
| Legal Entities | Company profiles, documents, and access scope. |
| Reports | Sales, inventory, fleet, staff, product, branch, overview reporting. |
| Bookings | API-only booking records for future scheduling/workflow integrations. |

## Product Principles

- Operations first: no decorative screens where action or status is needed.
- Role-first access: every user sees only what they are allowed to act on.
- Branch-aware data: every branch/region workflow must respect organization and branch scope.
- Audit-friendly: changes should be traceable through API, DB timestamps, approvals, or logs.
- AI-assisted but owner-controlled: AI can plan, draft, review, and ship only within explicit task scope.

## Near-Term Priorities

1. Harden Booking API branch/assignee validation and RLS update policy.
2. Keep POS reject stock workflow stable after the latest changes.
3. Expand owner AI project management docs into actionable task board.
4. Continue QA checks for Supabase RLS and cross-organization references.
5. Keep deployment documentation current as migrations pass `00111` and 202607 migrations.

