# RKJ One Database Schema

Last updated: 2026-07-10

Production database: Supabase PostgreSQL.

Primary tenant boundary: `organization_id`.

## Core Scope Model

| Field | Meaning |
|-------|---------|
| `organization_id` | Company/tenant boundary. All business tables should include it. |
| `region_id` | Area Manager scope. |
| `branch_id` | Kiosk/branch scope. |
| `profile_id`, `created_by`, `reported_by`, `assigned_to` | User/profile references linked to Supabase Auth profile rows. |

## Major Table Groups

| Group | Representative Tables |
|-------|-----------------------|
| Organization | `organizations`, `regions`, `branches`, `legal_entities` |
| Users/RBAC | `profiles`, `profile_branch_access`, `role_permissions` |
| Staff/HR | `staff`, `hr_service_requests`, `hr_leave_balances`, company HR tables |
| Inventory | `inventory_locations`, `inventory_balances`, `stock_movements`, `stock_transfers`, `stock_counts`, `stock_write_offs`, `stock_receives` |
| Products | `products`, `stock_items`, `product_bom`, product price/group tables |
| POS | `pos_shifts`, `pos_shift_staff_members`, `pos_transactions`, `pos_transaction_items`, `pos_payments`, `pos_stock_deductions` |
| Production | production calendar/order/output/route tables and RPC support |
| Fleet/Delivery | `drivers`, `vehicles`, `delivery_orders`, `delivery_legs`, `proof_of_delivery`, route tables |
| Warehouse | `warehouse_audits`, `warehouse_audit_items` |
| Finance | `finance_collections`, `finance_collection_usages`, `bank_in_records`, `cash_reconciliations`, `daily_financial_reports` |
| Payroll | `payroll_rules`, `commission_tiers`, `payroll_runs`, `payroll_line_items`, payslip tables |
| Approvals/Notifications | `approval_requests`, `notifications`, `audit_logs` |
| Maintenance | `maintenance_reports` |
| Sales Agent | agent account, outlet, order, payment, receipt, subscription, price group tables |
| Bookings | `bookings` |
| Observability | `performance_web_vitals` |

## Roles

Current application roles from `types/enums.ts`:

- `SUPER_ADMIN`
- `ADMIN`
- `HR`
- `OPERATION_MANAGER`
- `CEO_FACTORY`
- `AREA_MANAGER`
- `DRIVER`
- `STAFF`
- `FINANCE`
- `MAINTENANCE_MANAGER`
- `SALES_AGENT`

## RLS Helpers

Defined in migrations:

- `public.organization_id()`
- `public.user_role()`
- `public.user_region_id()`
- `public.user_branch_id()`
- `public.is_admin()`
- `public.has_branch_access(p_branch_id UUID)`

General policy pattern:

```sql
organization_id = public.organization_id()
AND (
  public.user_role() IN (...)
  OR public.has_branch_access(branch_id)
  OR created_by = auth.uid()
)
```

Important rule: RLS must be at least as strict as API route checks. If API allows only managers to update, DB policy must not allow all branch-access users to update the same row.

## Booking Table

Migrations:

- `20260708100944_booking_api.sql`
- `20260708111016_harden_auth_role_and_booking_scope.sql`

Purpose: API-only booking records for future scheduling/workflow integrations.

Key columns:

| Column | Notes |
|--------|-------|
| `id` | UUID primary key. |
| `organization_id` | Required tenant boundary. |
| `branch_id` | Optional branch link. API validates same-organization scope; hardening migration adds DB reference validation. |
| `created_by` | Profile that created the booking. |
| `assigned_to` | Optional profile assignment. API validates same organization and active assignee. |
| `booking_number` | Unique per organization. |
| `booking_type` | `GENERAL`, `CUSTOMER`, `EVENT`, `MAINTENANCE`, `SALES_AGENT`, `DELIVERY`, `OTHER`. |
| `status` | `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`. |
| `priority` | `LOW`, `NORMAL`, `HIGH`, `URGENT`. |
| `scheduled_date`, `scheduled_time` | Booking date/time. |
| `metadata` | JSONB for integration-specific data. |
| `confirmed_at`, `cancelled_at`, `completed_at` | Status timestamps. |

Indexes:

- `idx_bookings_org_date`
- `idx_bookings_branch_date`
- `idx_bookings_status`
- `idx_bookings_created_by`
- `idx_bookings_assigned_to`

API lifecycle rules:

- Create starts as `PENDING`.
- Status changes are manager-only.
- Allowed transitions: `PENDING -> CONFIRMED/CANCELLED`, `CONFIRMED -> COMPLETED/CANCELLED/NO_SHOW`.
- `NO_SHOW` currently uses `completed_at` as the closure timestamp until a dedicated event log or `no_show_at` column is added.

## Sales Agent Payment Lifecycle

Base table: `agent_online_payments`.

M5 production migration: `20260708115441_m5_payment_lifecycle.sql`.

Additional lifecycle columns:

| Column | Notes |
|--------|-------|
| `provider` | Payment provider used for the session: simulate, Billplz, iPay88, Stripe, or custom. |
| `gateway_session_id` | External checkout/session id such as Billplz bill id or Stripe Checkout session id. |
| `checkout_url` | Last checkout URL returned for the payment session. |
| `failure_reason` | Failure/cancel reason from gateway or API. |
| `cancelled_at` | Timestamp when pending payment was cancelled. |
| `refunded_at` | Timestamp when admin/finance recorded refund. |
| `refund_ref` | External/manual refund reference. |
| `refund_reason` | Refund note. |

RPC functions:

- `cancel_agent_payment(p_payment_id, p_gateway_ref, p_reason)`
- `refund_agent_payment(p_payment_id, p_refund_ref, p_reason, p_gateway_ref)`

Security note: the new RPC functions are intended for service-role API routes only and should not be directly executable by `anon` or `authenticated`.

## Performance Web Vitals

Migration: `20260710153256_performance_web_vitals.sql`.

Purpose: sampled real-user speed diagnostics for signed-in users.

Key columns:

| Column | Notes |
|--------|-------|
| `organization_id` | Tenant boundary for metric row. |
| `profile_id` | Signed-in profile that reported the metric. |
| `route` | Pathname only; query string is stripped by the API. |
| `metric_name` | Web Vital or Next.js navigation metric name. |
| `metric_value`, `metric_delta` | Numeric timing/score values. |
| `metric_rating` | `good`, `needs-improvement`, or `poor`. |
| `navigation_type`, `connection_type`, `device_memory` | Optional environment context for diagnosis. |
| `user_agent` | Truncated request user agent for device/browser grouping. |

Security:

- RLS enabled.
- Authenticated users can insert only their own organization's metrics.
- Management roles can select organization metrics for diagnostics.
- `anon` has no direct table access.

## Migration Timeline

| Range | Summary |
|-------|---------|
| `00001` to `00018` | Base extensions, enums, organization, master data, inventory, POS, shifts, payroll, finance, fleet, approvals, RLS, RPCs, seed data. |
| `00019` to `00030` | Go-live fixes for fleet RLS, branch status, opening stock, staff, POS stock validation, product/menu changes. |
| `00031` to `00043` | HQ stock items, POS sync, reject stock, roti expiry, settings/admin/personnel, menu updates. |
| `00044` to `00061` | Factory production, branch orders, driver handoff, route planning, holidays, stock planning, delivery route AI, kiosk transfer, missing locations. |
| `00062` to `00075` | Roster, staff portal credentials, avatars, profile details, legal entities, maintenance role/platform, HR company permissions, payroll payslips. |
| `00076` to `00086` | Sales agent role/platform, payments, receipts, live subscriptions, price groups, sales staff, QR payments. |
| `00087` to `00100` | Factory raw stock cards, legal documents/storage, privacy hardening, performance indexes, POS staff delivery SOP, stock controls. |
| `00101` to `00111` | Area manager events, stock count RLS, POS shift timing/payroll/staff approval, finance lockdown, AM cash collection/usage, HR self-service, agent order number. |
| `20260705*` | HR service catalog and leave balances. |
| `20260708090000` | POS batch reject stock count. |
| `20260708100944` | Booking API backend table. |
| `20260708115418` | Auth role bootstrap and booking data-access hardening. |
| `20260708115441` | M5 sales-agent payment lifecycle columns and RPC functions. |
| `20260708150423` | Production RLS/advisor fixes for exposed branch/fleet master tables, dashboard view, and PL/pgSQL lint errors. |
| `20260710151434` | Dashboard performance indexes, branch-scoped dashboard snapshot RPC, and restricted daily rollup materialized view. |
| `20260710153256` | Authenticated Web Vitals observability table with RLS and indexes. |

## Database Maintenance Notes

- Add new migrations with `npx supabase migration new <name>`.
- Apply remote migrations with `npx supabase db push --yes`.
- Regenerate TypeScript database types after stable schema changes.
- Never edit already-applied production migrations unless recovering from a controlled deployment incident.
