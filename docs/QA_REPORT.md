# QA Report - Booking API / Database Hardening

Last updated: 2026-07-08

Scope reviewed:

- `docs/DATABASE_CHANGE_PLAN.md`
- `docs/booking_api_migration_draft.sql`
- `app/api/bookings/route.ts`
- `app/api/bookings/[id]/route.ts`
- `lib/auth/branch-scope.ts`
- Existing RLS helper/policy references in `supabase/migrations/00009_rls_policies.sql`

No code or production data was changed during this QA review.

## Summary

The database hardening draft is directionally correct: it adds explicit grants, RLS policies with `TO authenticated`, same-organization reference validation, status timestamp controls, and targeted indexes.

Do not promote the draft SQL into a real migration yet. The highest risks are RLS/API mismatch for `AREA_MANAGER`, reference validation trigger behavior under existing `profiles` RLS, and status lifecycle inconsistencies between the current API and the proposed DB rules.

References checked:

- Supabase changelog: explicit grants for public schema Data API access become required for new projects from 2026-05-30 and existing projects on 2026-10-30.
- Supabase RLS docs: exposed `public` tables should enable RLS and grant only required role privileges.
- Supabase index docs: normal `create index` can lock writes; `create index concurrently` avoids write locks but needs special handling outside a transaction.

## Bug List By Severity

### High

| ID | Issue | Evidence | Risk | Recommendation |
|----|-------|----------|------|----------------|
| QA-BK-001 | `AREA_MANAGER` update scope is still too broad in the draft RLS update policy. | `docs/booking_api_migration_draft.sql` allows `AREA_MANAGER` in the manager role list inside `bookings_update_scope`; API calls `resolveScopedBranches()` to restrict branch/region. | Direct database/Data API updates may not match API branch-scope rules. This can become a BOLA/IDOR class risk if RLS permits broader updates than route logic. | Split HQ/global manager roles from area manager. For `AREA_MANAGER`, require `branch_id is not null and public.has_branch_access(branch_id)` in both `USING` and `WITH CHECK`. |
| QA-BK-002 | Trigger `validate_booking_references()` may falsely reject valid `assigned_to` values for non-admin users because it queries `public.profiles` under existing RLS. | Existing `profiles_select` only allows own profile or admin org reads. Draft trigger checks `public.profiles p where p.id = new.assigned_to`. | Staff, Sales Agent, or Area Manager may be unable to create/update bookings with a valid assignee because the trigger cannot see the target profile row. | Either validate assignee in server API using service-safe logic, or make a tightly controlled `SECURITY DEFINER` validation function with `search_path = public`, revoked execute, and explicit organization checks. Review with Security AI first. |
| QA-BK-003 | API currently allows/silently normalizes statuses that the draft insert RLS will reject. | `POST /api/bookings` normalizes `body.status` to any allowed status or fallback `PENDING`; draft insert policy forces `status = 'PENDING'` and terminal timestamps null. | Applying DB draft before API update can turn accepted API requests into generic DB/RLS failures. Invalid enum values may still become silent defaults instead of clear `400`. | Update API validation first: reject invalid enum/date/time with `400`; decide whether create may accept only `PENDING`; return clear message before DB write. |
| QA-BK-004 | Creator can still move active bookings to terminal statuses through API/RLS unless business explicitly allows it. | `PATCH /api/bookings/[id]` allows creator edit when existing status is `PENDING` or `CONFIRMED`, then accepts `COMPLETED`, `CANCELLED`, or `NO_SHOW`. Draft RLS `USING` also permits creator updates from active statuses. | Staff/Sales Agent creator may close, cancel, or no-show their own booking without manager review. This conflicts with the open task to decide booking status lifecycle. | Define lifecycle matrix. If terminal states are manager-only, enforce in both API and RLS `WITH CHECK`. |

### Medium

| ID | Issue | Evidence | Risk | Recommendation |
|----|-------|----------|------|----------------|
| QA-BK-005 | `NO_SHOW` has no timestamp or consistency rule. | Table statuses include `NO_SHOW`; draft only handles `confirmed_at`, `cancelled_at`, `completed_at`. | Reporting and audit trail for no-show status will be incomplete or inconsistent. | Add `no_show_at`, or document that `NO_SHOW` uses `completed_at`/`cancelled_at`; enforce consistently. |
| QA-BK-006 | Status timestamp trigger does not clear stale timestamps on status reversal. | Draft sets timestamps when status becomes terminal but does not clear `confirmed_at` when returning to `PENDING`; constraint allows `PENDING` with `confirmed_at`. | Reopened bookings can show misleading confirmation history in API responses. | Decide whether timestamps are historical audit markers or current-state markers. If current-state, clear incompatible timestamps. If historical, add event log later. |
| QA-BK-007 | Pre-check `SELECT` statements are included in the same SQL draft as migration steps. | `docs/booking_api_migration_draft.sql` starts with three `select` checks. | If copied into an actual migration, checks report rows but do not block the migration. Bad data may still proceed until later triggers/constraints fail. | Keep preflight SQL in a separate QA/runbook section, or convert blocking checks into `DO $$ ... raise exception ... $$` blocks for real migration. |
| QA-BK-008 | New indexes use plain `create index`, which can lock writes on larger production tables. | Draft creates `idx_bookings_assigned_to_open` and `idx_bookings_branch_open_date` using normal `create index`. | Low impact now if booking table is small, but risky later with live booking traffic. | For production-sized tables, create indexes concurrently in a separate non-transactional migration/runbook. |
| QA-BK-009 | API still does not validate date/time formats before DB write/filter. | `scheduled_date`, `scheduled_time`, `from`, and `to` are trimmed strings and passed to Supabase/Postgres. | Bad input can produce DB errors, inconsistent filters, or confusing API responses. | Add strict date/time validation before insert, patch, and list filters. |
| QA-BK-010 | Duplicate custom `booking_number` still returns generic failure. | Insert retry only retries duplicate generated numbers; if custom duplicate persists, response falls through as `500`. | API clients cannot distinguish conflict from server failure. | Return `409 Conflict` for duplicate user-supplied `booking_number`. |

### Low

| ID | Issue | Evidence | Risk | Recommendation |
|----|-------|----------|------|----------------|
| QA-BK-011 | Generated TypeScript database types do not list `bookings`; API uses `as never` casts. | `types/database.ts` has no `bookings` table entry; booking routes cast `.from('bookings' as never)`. | Future refactors/tests lose type safety around booking rows. | Regenerate Supabase types after schema is stable. |
| QA-BK-012 | SQL draft formatting has minor inconsistent indentation in role list. | `AREA_MANAGER` line in insert policy is not aligned with adjacent roles. | No runtime impact, but reduces review readability. | Format SQL before final migration. |

## Manual Test Cases

Run against local Supabase or staging only. Do not run on production until approved.

### Auth And Access

| Case | Actor | Steps | Expected Result |
|------|-------|-------|-----------------|
| BK-MT-001 | Anonymous | Call `GET /api/bookings`. | JSON `401 Unauthorized`. |
| BK-MT-002 | Admin | Create a normal `PENDING` booking for own organization branch. | `200`, booking returned, correct org/branch/creator. |
| BK-MT-003 | Staff | Create a booking for own branch. | `200`, `created_by` is staff profile, `status = PENDING`. |
| BK-MT-004 | Staff | Create booking for another branch. | `403` before DB write. |
| BK-MT-005 | Area Manager | Create booking for branch in own region. | `200`. |
| BK-MT-006 | Area Manager | Create/update booking for branch outside own region. | `403`; direct DB/Data API attempt also denied by RLS. |
| BK-MT-007 | Staff non-creator | Try to patch another user's booking. | `403`. |
| BK-MT-008 | Staff creator | Patch own `PENDING` booking title/notes. | `200`. |
| BK-MT-009 | Staff creator | Patch own `COMPLETED` booking. | `403`. |

### Validation

| Case | Input | Expected Result |
|------|-------|-----------------|
| BK-MT-010 | Empty title | `400`, clear title error. |
| BK-MT-011 | Missing `scheduled_date` | `400`, clear date error. |
| BK-MT-012 | Invalid `scheduled_date = "abc"` | `400`, not DB error. |
| BK-MT-013 | Invalid `scheduled_time = "99:99"` | `400`, not DB error. |
| BK-MT-014 | Invalid `status = "DONE"` | `400`, not silent fallback. |
| BK-MT-015 | `expected_pax = -1` | `400`, not silently set to null unless approved. |
| BK-MT-016 | Duplicate custom `booking_number` | `409 Conflict`. |
| BK-MT-017 | Cross-org `branch_id` from admin request | `403` or `400`, no row inserted. |
| BK-MT-018 | Cross-org or inactive `assigned_to` | `400` or `403`, no row inserted. |

### Status Lifecycle

| Case | Steps | Expected Result |
|------|-------|-----------------|
| BK-MT-019 | Create with `status = CONFIRMED`. | If lifecycle requires create-only pending, return `400` before DB write. |
| BK-MT-020 | Manager changes `PENDING -> CONFIRMED`. | `confirmed_at` set once, response includes timestamp. |
| BK-MT-021 | Manager changes `CONFIRMED -> CANCELLED`. | `cancelled_at` set, lifecycle allowed/blocked per approved rule. |
| BK-MT-022 | Staff creator tries `PENDING -> COMPLETED`. | Expected depends on lifecycle decision; QA recommends deny if final states are manager-only. |
| BK-MT-023 | Change status to `NO_SHOW`. | Timestamp behavior is defined and testable. |

### Database/RLS

| Case | Steps | Expected Result |
|------|-------|-----------------|
| BK-MT-024 | Run preflight checks from SQL draft. | Zero rows before migration. |
| BK-MT-025 | Direct Data API update as Area Manager for out-of-region booking. | Denied by RLS. |
| BK-MT-026 | Direct Data API insert with cross-org `branch_id`. | Denied by RLS/trigger. |
| BK-MT-027 | Direct Data API insert with valid same-org `assigned_to` as non-admin role. | Succeeds only if assignment is allowed by business rule; must not fail due trigger visibility issue. |
| BK-MT-028 | Query `bookings` as `anon`. | Permission denied/no rows; no anonymous grant. |

## Automated Test Suggestions

Recommended automated coverage:

- API integration tests for `GET/POST/PATCH /api/bookings` using mocked `getCurrentProfile()` profiles for Admin, Area Manager, Staff, Sales Agent, and anonymous user.
- Validation unit tests for enum/date/time/number parsing before DB calls.
- Local Supabase RLS tests using seeded users and role claims to verify select/insert/update policies directly.
- SQL preflight test in CI that runs the draft migration on a local Supabase database after seed data, then executes role-specific smoke tests.
- Conflict test for duplicate `booking_number` returning `409`.
- Regression test that Area Manager cannot update out-of-region bookings through both API and direct Supabase client path.

## Release Gate Recommendation

Status: Not ready for production migration.

Required before release:

1. Fix or explicitly accept `AREA_MANAGER` RLS scope behavior.
2. Decide booking status lifecycle and enforce it in API plus RLS.
3. Resolve `assigned_to` validation path so valid same-org assignment works for intended roles.
4. Add API validation for invalid enum/date/time and duplicate booking number.
5. Run local/staging RLS tests before any Supabase production push.

