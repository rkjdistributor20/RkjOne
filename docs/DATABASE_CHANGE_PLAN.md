# Database Change Plan - Booking API

Last updated: 2026-07-08

Feature scope: Booking API / Booking module.

Status: proposal and migration draft only. Do not run against production until Backend, QA, and Security review are complete.

## Current State

The repo already contains a booking backend table and API:

- Table: `public.bookings`
- Migration: `supabase/migrations/20260708100944_booking_api.sql`
- API routes:
  - `GET /api/bookings`
  - `POST /api/bookings`
  - `GET /api/bookings/[id]`
  - `PATCH /api/bookings/[id]`

Existing table coverage is good for the first backend slice: tenant boundary, branch link, creator, assignee, booking number, type/status/priority checks, scheduling fields, metadata, timestamps, RLS, and useful date/status indexes.

## Proposed Table And Relations

No new main table is required for the next database change. Keep `public.bookings` as the source of truth.

Recommended relations to enforce at DB level:

| Relation | Current | Recommendation |
|----------|---------|----------------|
| `bookings.organization_id -> organizations.id` | Exists | Keep cascade delete. |
| `bookings.branch_id -> branches.id` | Exists | Add DB validation trigger so branch must belong to the same organization. |
| `bookings.created_by -> profiles.id` | Exists | Keep nullable on profile delete. |
| `bookings.assigned_to -> profiles.id` | Exists | Add DB validation trigger so assignee must belong to same organization and be active. |

Future optional table, not in this draft:

- `booking_events`: immutable audit trail for create, assign, status change, cancel, complete, and integration callbacks.

## Proposed Indexes

Existing indexes:

- `idx_bookings_org_date`
- `idx_bookings_branch_date`
- `idx_bookings_status`
- `idx_bookings_created_by`

Recommended additional indexes:

| Index | Purpose |
|-------|---------|
| `idx_bookings_assigned_to_open` | Fast "my assigned open bookings" query. |
| `idx_bookings_branch_open_date` | Fast branch schedule query for pending/confirmed bookings. |

If production data becomes large, create new indexes during a maintenance window or use a concurrent index strategy outside a wrapped migration.

## RLS And Permission Changes

Problem found: current `bookings_update_scope` policy is broader than the API route. The API allows updates only for manager roles or the booking creator while the booking is still `PENDING`/`CONFIRMED`. Current RLS also allows broader branch-access updates.

Recommendation:

- Recreate booking RLS policies with explicit `TO authenticated`.
- Keep select scope similar to current behavior.
- Keep insert roles aligned with API create roles.
- Force new bookings to start as `PENDING` with no terminal timestamps.
- Narrow update scope to:
  - manager roles, or
  - creator of the booking while current status is `PENDING` or `CONFIRMED`.
- Keep branch validation in `WITH CHECK`.
- Do not grant anonymous access.

This also follows current Supabase guidance that RLS should be enabled for exposed `public` tables and access should use explicit grants plus policies.

## Data Integrity Changes

Recommended DB-level protections:

- Validate `branch_id` belongs to the same `organization_id`.
- Validate `assigned_to` profile belongs to the same `organization_id` and is `ACTIVE`.
- Prevent direct insert of final booking statuses.
- Auto-set `confirmed_at`, `cancelled_at`, and `completed_at` when status changes.
- Prevent impossible terminal status rows, for example `COMPLETED` without `completed_at`.

The API should still return user-friendly `400`/`403`/`409` messages before the DB rejects bad rows.

## Impact To Existing Data

Expected impact is low because the booking table is new and API-only.

Potential impact:

- Existing bookings with cross-organization `branch_id` or `assigned_to` will fail validation after the trigger is enabled.
- Existing terminal status rows without matching timestamps need backfill before validating strict constraints.
- Users with branch access who are not managers and not the creator may lose direct DB update ability. This is intended because it matches the API authorization rule.
- No existing booking rows should be deleted by this plan.

Pre-migration checks:

```sql
select b.id, b.organization_id, b.branch_id
from public.bookings b
left join public.branches br
 on br.id = b.branch_id
where b.branch_id is not null
 and (br.id is null or br.organization_id <> b.organization_id);

select b.id, b.organization_id, b.assigned_to
from public.bookings b
left join public.profiles p
 on p.id = b.assigned_to
where b.assigned_to is not null
 and (p.id is null or p.organization_id <> b.organization_id or p.status <> 'ACTIVE');

select id, status, confirmed_at, cancelled_at, completed_at
from public.bookings
where (status = 'CONFIRMED' and confirmed_at is null)
 or (status = 'CANCELLED' and cancelled_at is null)
 or (status = 'COMPLETED' and completed_at is null);
```

## Rollback Plan

Rollback should be a separate reviewed SQL change:

1. Drop booking validation trigger and function.
2. Drop booking status timestamp trigger and function.
3. Drop strict status timestamp constraint if applied.
4. Drop the two new indexes.
5. Restore previous `bookings_update_scope` policy from `20260708100944_booking_api.sql` only if business approves the wider access again.
6. Keep `public.bookings` table and data intact.

Rollback SQL is included as comments in `docs/booking_api_migration_draft.sql`.

## Review Required Before Running

- Backend AI: update API validation for branch/org, assignee/org, duplicate booking number, and invalid enum/date/time.
- Security AI: confirm RLS policy does not permit BOLA/IDOR.
- QA AI: test create/update/read paths with Admin, Area Manager, Staff creator, Staff non-creator, Sales Agent, and anonymous user.
- Owner/PM: approve status lifecycle behavior before enforcing terminal timestamp constraints.
