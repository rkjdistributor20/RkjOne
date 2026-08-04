# RKJ One API Spec

Last updated: 2026-07-10

Base URL:

- Production: `https://rkj.one`
- Local: `http://localhost:3000`

Authentication:

- Browser/session auth through Supabase cookies.
- Most `/api/*` routes are protected by global middleware and route-level `getCurrentProfile()`.
- Anonymous protected API requests return JSON `401`.
- Browser page requests without a session redirect to `/login`.
- Public webhook routes are limited to signed gateway callbacks and rate-limited route handlers.

## POS Fiuu DuitNow QR API

The POS creates a sale only after a signed Fiuu Offline Payment API notification is verified. The default remains manual mode until merchant channel activation and sandbox UAT are complete.

### POST `/api/pos/qr-payments`

Creates a pending Fiuu DuitNow QR payment for an authenticated, authorized POS shift member on an official branch device. Product prices, quantities, discount and payment split are recalculated on the server. The returned QR image URL is an authenticated RKJ One proxy; the provider image URL and credentials are not returned to the browser.

### GET `/api/pos/qr-payments/[paymentId]`

Returns branch-scoped payment status. A receipt is returned only after the payment is atomically fulfilled. Pending records are marked expired when their validity window has elapsed.

### GET `/api/pos/qr-payments/[paymentId]/image`

Returns the provider QR image through an authenticated, branch-scoped, no-store image proxy. Only HTTPS Fiuu hosts and image responses within the configured size limit are accepted.

### POST `/api/pos/qr-payments/webhook`

Public provider callback endpoint. Fiuu callbacks require a valid HMAC-SHA256 signature and must match the stored application, reference, provider transaction ID, amount, MYR currency and DuitNow channel `24`. Fulfilment, stock deduction, receipt creation and payment completion occur in one database transaction. Invalid callbacks do not create a sale.

Response convention:

```json
{ "error": "Message" }
```

or module-specific payload:

```json
{ "bookings": [] }
```

## Booking API

Status: implemented. API validation and DB/RLS hardening are applied; authenticated real-account role UAT remains tracked in `docs/TASK_BOARD.md`.

UI access note: `/bookings` navigation/page is limited to `SUPER_ADMIN`, `ADMIN`, and `OPERATION_MANAGER` while the owner confirms the full booking SOP.

### GET `/api/bookings`

Returns booking list visible to the current profile.

Query params:

| Param | Type | Notes |
|-------|------|-------|
| `branch_id` | uuid | Optional. Applies branch filter if supplied. |
| `status` | string | Optional. `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`. |
| `from` | date | Optional `YYYY-MM-DD`; filters `scheduled_date >= from`. |
| `to` | date | Optional `YYYY-MM-DD`; filters `scheduled_date <= to`. |
| `limit` | number | Optional. Defaults 50, max 100. |

Invalid `status`, `from`, or `to` returns `400`.

Response:

```json
{
  "bookings": [
    {
      "id": "uuid",
      "booking_number": "BK-20260708-ABC123",
      "booking_type": "GENERAL",
      "status": "PENDING",
      "priority": "NORMAL",
      "title": "Example booking",
      "scheduled_date": "2026-07-08",
      "scheduled_time": "10:00:00",
      "branch": {
        "id": "uuid",
        "branch_code": "B001",
        "branch_name": "Branch name"
      }
    }
  ]
}
```

### POST `/api/bookings`

Creates a booking.

Required body:

| Field | Type |
|-------|------|
| `title` | string |
| `scheduled_date` | date string |

Optional body:

| Field | Type |
|-------|------|
| `branch_id` | uuid |
| `assigned_to` | uuid |
| `booking_number` | string |
| `booking_type` | `GENERAL`, `CUSTOMER`, `EVENT`, `MAINTENANCE`, `SALES_AGENT`, `DELIVERY`, `OTHER` |
| `status` | Optional. Only `PENDING` is accepted on create. Other statuses return `400`. |
| `priority` | `LOW`, `NORMAL`, `HIGH`, `URGENT` |
| `description` | string |
| `customer_name` | string |
| `customer_phone` | string |
| `customer_email` | string |
| `scheduled_time` | time string |
| `expected_pax` | number |
| `source` | string |
| `notes` | string |
| `metadata` | object |

Validation:

- `booking_type`, `status`, and `priority` reject invalid values with `400`.
- `scheduled_date` must be `YYYY-MM-DD`.
- `scheduled_time`, when supplied, must be `HH:MM` or `HH:MM:SS`.
- `expected_pax` must be a positive number when supplied.
- Duplicate custom `booking_number` returns `409`.

Response:

```json
{ "booking": { "id": "uuid", "booking_number": "BK-20260708-ABC123" } }
```

### GET `/api/bookings/[id]`

Returns one booking visible to the current profile.

Response:

```json
{ "booking": { "id": "uuid", "title": "Example booking" } }
```

### PATCH `/api/bookings/[id]`

Updates booking fields.

Allowed update fields:

- `branch_id`
- `assigned_to`
- `status`
- `priority`
- `title`
- `description`
- `customer_name`
- `customer_phone`
- `customer_email`
- `scheduled_date`
- `scheduled_time`
- `expected_pax`
- `notes`
- `metadata`

Status timestamps:

- New bookings start as `PENDING`.
- Status changes are manager-only.
- Allowed transitions: `PENDING -> CONFIRMED`, `PENDING -> CANCELLED`, `CONFIRMED -> COMPLETED`, `CONFIRMED -> CANCELLED`, `CONFIRMED -> NO_SHOW`.
- `CONFIRMED` sets `confirmed_at`.
- `CANCELLED` sets `cancelled_at`.
- `COMPLETED` sets `completed_at`.
- `NO_SHOW` uses `completed_at` as the closure timestamp until a dedicated `no_show_at` or event log exists.

Known hardening needed:

- Add automated API/RLS tests for cross-organization branch and assignee cases.

## HR Operations API

### GET `/api/hr/operations/am-leave-coverage`

Returns active AM leave requests that require OM operational cover before HR approval.

Allowed roles: `SUPER_ADMIN`, `ADMIN`, `HR`, `OPERATION_MANAGER`.

Response:

```json
{
  "requests": [
    {
      "id": "uuid",
      "request_number": "HR-20260710-ABC123",
      "requester_name": "Area Manager",
      "start_date": "2026-07-10",
      "end_date": "2026-07-11",
      "coverage_status": "PENDING_OM_REVIEW",
      "covered_by_name": null,
      "covered_at": null
    }
  ]
}
```

### PATCH `/api/hr/operations/am-leave-coverage`

Marks OM/Admin operational cover for one AM leave request. It updates `hr_service_requests.metadata.am_leave_cover` and keeps the HR request in `IN_REVIEW`.

Allowed roles: `SUPER_ADMIN`, `ADMIN`, `OPERATION_MANAGER`.

Body:

```json
{
  "request_id": "uuid",
  "reviewer_note": "OM cover kawasan sementara AM bercuti."
}
```

HR/Admin approval remains on `/api/hr/self-service/requests/[id]`; approving AM leave returns `400` until `covered_by` and `covered_at` are recorded.

## Sales Agent Payment API

Status: M5 implemented for Sales Agent payments. Supports simulate, Billplz, iPay88 and optional Stripe Checkout.

Access note: Sales Agent portal routes check `canAccessSalesAgent()` before service-role reads/writes. Admin-only price group mutations remain limited to `SUPER_ADMIN`, `ADMIN`, and `OPERATION_MANAGER`; refund remains limited to `SUPER_ADMIN`, `ADMIN`, and `FINANCE`.

### POST `/api/sales-agent/payments`

Creates a payment record and payment session for a stock order or POS subscription.

Body:

| Field | Type | Notes |
|-------|------|-------|
| `purpose` | `STOCK_ORDER`, `POS_SUBSCRIPTION` | Required. |
| `reference_id` | uuid | Required. Order/subscription id. |
| `payment_method` | `FPX`, `CARD`, `DEBIT` | Required. Gateway support depends on provider. |

Response includes:

```json
{
  "payment": { "id": "uuid", "status": "PENDING" },
  "checkout": {
    "mode": "live",
    "provider": "stripe",
    "checkout_url": "https://checkout.stripe.com/...",
    "gateway_session_id": "cs_..."
  },
  "session": {
    "id": "uuid",
    "status_url": "https://app/api/sales-agent/payments/uuid/status",
    "cancel_url": "https://app/api/sales-agent/payments/uuid/cancel",
    "return_url": "https://app/sales-agent/payment-return?payment=uuid"
  }
}
```

### GET `/api/sales-agent/payments/[paymentId]/status`

Returns payment status and receipt when paid.

Response includes `status`, `lifecycle_status`, gateway/session metadata, refund/cancel timestamps, and `next_action` when checkout is still pending.

### POST `/api/sales-agent/payments/[paymentId]/cancel`

Cancels a pending payment session. The payment is stored as `FAILED` with `lifecycle_status = CANCELLED`. Agent owner or admin can cancel.

### POST `/api/sales-agent/payments/[paymentId]/refund`

Records a manual refund after a payment is `PAID`. Allowed roles: `SUPER_ADMIN`, `ADMIN`, `FINANCE`.

Body:

| Field | Type | Notes |
|-------|------|-------|
| `refund_ref` | string | Optional gateway/bank refund reference. |
| `reason` | string | Optional refund note. |

### POST `/api/sales-agent/payments/webhook`

Public signed webhook endpoint for Billplz, iPay88, custom gateway JSON/form callbacks, and Stripe signed events. Handled statuses:

- `PAID` / `checkout.session.completed`
- `FAILED`
- `CANCELLED` / `checkout.session.expired`
- `REFUNDED`

Generic gateway callbacks must provide `x-payment-signature` as HMAC-SHA256 of the raw request body using `SALES_AGENT_PAYMENT_WEBHOOK_SECRET`. The `sha256=<hex>` format is accepted. Unsigned generic callbacks are allowed only for explicit non-production simulation when `ALLOW_UNSIGNED_PAYMENT_WEBHOOKS=true`.

## API Route Inventory

| Area | Prefix | Purpose |
|------|--------|---------|
| Auth | `/api/auth` | Password and auth support. |
| Profile | `/api/profile`, `/api/me` | Current user profile, avatar, payroll, payslips. |
| Dashboard/System | `/api/system`, `/api/health` | Health and operational checks. |
| Branches | `/api/branches`, `/api/settings/branches` | Branch operations and settings. |
| POS | `/api/pos` | Products, stock, shift, payments, transactions, sync, reject stock. |
| Inventory | `/api/inventory` | Balances, stock items, receives, transfers, counts, write-offs, adjustments. |
| Production | `/api/production` | Factory calendar, orders, reports, routes, suggestions. |
| Fleet | `/api/fleet` | Drivers, vehicles, orders, dispatch, POD, route optimization. |
| Warehouse | `/api/warehouse` | Audits, summary, approvals. |
| Finance | `/api/finance` | Collections, bank-in, reconciliation, QR manual, daily report. |
| Payroll | `/api/payroll` | Rules, runs, approval, staff, payslip distribution, AI proposal. |
| HR | `/api/hr` | Companies, profiles, leave balances, self-service requests, OM cover for AM leave. |
| Roster/Shifts | `/api/roster`, `/api/shifts` | Plans, reminders, attendance, clock in/out. |
| Maintenance | `/api/maintenance` | Maintenance reports and detail updates. |
| Sales Agent | `/api/sales-agent` | Account, catalog, orders, payments, admin, receipts, subscriptions. |
| Reports | `/api/reports` | Overview, sales, inventory, fleet, products, staff, branches. |
| Approvals | `/api/approvals` | Approve/reject workflows. |
| Legal Entities | `/api/legal-entities` | Company records and document download. |
| Bookings | `/api/bookings` | API-only booking workflow. |

### GET `/api/fleet/gps/status`

Server-side Cartrack GPS bridge for transport monitoring. Requires login and is limited to HQ/operations/area manager roles. Credentials are read only from server env:

- `CARTRACK_API_BASE_URL`
- `CARTRACK_API_USERNAME`
- `CARTRACK_API_TOKEN`
- `CARTRACK_FLEETWEB_URL`

Response includes `configured`, `status`, `matched_count`, `unmatched_count`, `fleetweb_url`, and normalized `vehicles[]` with plate, location, speed, ignition, driver, timestamp and map URL when coordinates are available.

### Fleet Control Center

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/fleet/control-center` | Role-scoped KPI, live alerts, ETA, geofence coverage, active driver sessions and maintenance summary. Drivers only receive their assigned vehicles. |
| `POST` | `/api/fleet/gps/sync` | OM/admin telemetry ingestion, snapshot persistence and alert generation. |
| `PATCH` | `/api/fleet/alerts/:id` | Acknowledge or resolve a stored fleet alert with actor and timestamp audit. |
| `POST` | `/api/fleet/driver-session` | Start a driver shift after all safety checks pass. |
| `PATCH` | `/api/fleet/driver-session` | End an active driver shift with final odometer, location and notes. |

Default operational signals are GPS stale over 30 minutes, speed at or above 90 km/h, fuel at or below 20%, idle for at least 15 minutes across persisted readings, geofence entry/exit, and maintenance within 500 km or 14 days. These are coaching and exception-management signals; they do not automatically apply disciplinary action or complete a delivery.

## Error and Access Expectations

Preferred route-level status codes:

| Code | Meaning |
|------|---------|
| `400` | Bad request or validation error. |
| `401` | No authenticated user/profile. |
| `403` | Authenticated but not allowed. |
| `404` | Row not found or not visible. |
| `409` | Duplicate or conflict. |
| `500` | Unexpected server or DB error. |
