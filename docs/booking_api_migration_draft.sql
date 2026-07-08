-- RKJ One: Booking API database hardening draft
-- Date: 2026-07-08
-- Scope: draft only; do not run against production until reviewed.
-- Target feature: Booking API / Booking module.

-- ============================================================
-- 0) Pre-checks: run first and fix any returned rows
-- ============================================================

-- Cross-organization or missing branch references.
select b.id, b.organization_id, b.branch_id
from public.bookings b
left join public.branches br
 on br.id = b.branch_id
where b.branch_id is not null
 and (br.id is null or br.organization_id <> b.organization_id);

-- Cross-organization, missing, or inactive assignee references.
select b.id, b.organization_id, b.assigned_to
from public.bookings b
left join public.profiles p
 on p.id = b.assigned_to
where b.assigned_to is not null
 and (p.id is null or p.organization_id <> b.organization_id or p.status <> 'ACTIVE');

-- Terminal statuses missing matching timestamps.
select id, status, confirmed_at, cancelled_at, completed_at
from public.bookings
where (status = 'CONFIRMED' and confirmed_at is null)
 or (status = 'CANCELLED' and cancelled_at is null)
 or (status = 'COMPLETED' and completed_at is null);

-- ============================================================
-- 1) Explicit Data API access posture
-- ============================================================

revoke all on table public.bookings from anon;
grant select, insert, update on table public.bookings to authenticated;

-- ============================================================
-- 2) Validate organization-scoped references
-- ============================================================

create or replace function public.validate_booking_references()
returns trigger
language plpgsql
set search_path = public
as $$
begin
 if new.branch_id is not null and not exists (
  select 1
  from public.branches br
  where br.id = new.branch_id
   and br.organization_id = new.organization_id
 ) then
  raise exception 'Booking branch must belong to the same organization'
   using errcode = '23514';
 end if;

 if new.assigned_to is not null and not exists (
  select 1
  from public.profiles p
  where p.id = new.assigned_to
   and p.organization_id = new.organization_id
   and p.status = 'ACTIVE'
 ) then
  raise exception 'Booking assignee must be an active profile in the same organization'
   using errcode = '23514';
 end if;

 return new;
end;
$$;

revoke execute on function public.validate_booking_references() from public;

drop trigger if exists validate_booking_references on public.bookings;
create trigger validate_booking_references
 before insert or update of organization_id, branch_id, assigned_to
 on public.bookings
 for each row
 execute function public.validate_booking_references();

-- ============================================================
-- 3) Keep status timestamps consistent
-- ============================================================

create or replace function public.set_booking_status_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
 if new.status = 'CONFIRMED' and new.confirmed_at is null then
  new.confirmed_at := now();
 end if;

 if new.status = 'CANCELLED' and new.cancelled_at is null then
  new.cancelled_at := now();
 end if;

 if new.status = 'COMPLETED' and new.completed_at is null then
  new.completed_at := now();
 end if;

 return new;
end;
$$;

revoke execute on function public.set_booking_status_timestamps() from public;

drop trigger if exists set_booking_status_timestamps on public.bookings;
create trigger set_booking_status_timestamps
 before insert or update of status, confirmed_at, cancelled_at, completed_at
 on public.bookings
 for each row
 execute function public.set_booking_status_timestamps();

alter table public.bookings
 drop constraint if exists bookings_status_timestamp_consistency;

alter table public.bookings
 add constraint bookings_status_timestamp_consistency
 check (
  (status <> 'CONFIRMED' or confirmed_at is not null)
  and (status <> 'CANCELLED' or cancelled_at is not null)
  and (status <> 'COMPLETED' or completed_at is not null)
  and (status <> 'PENDING' or (cancelled_at is null and completed_at is null))
 ) not valid;

-- Run after pre-check/backfill is clean:
-- alter table public.bookings validate constraint bookings_status_timestamp_consistency;

-- ============================================================
-- 4) RLS hardening
-- ============================================================

alter table public.bookings enable row level security;

drop policy if exists bookings_select_scope on public.bookings;
create policy bookings_select_scope
on public.bookings
for select
to authenticated
using (
 organization_id = public.organization_id()
 and (
  created_by = (select auth.uid())
  or public.user_role() in ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
  or (branch_id is not null and public.has_branch_access(branch_id))
 )
);

drop policy if exists bookings_insert_scope on public.bookings;
create policy bookings_insert_scope
on public.bookings
for insert
to authenticated
with check (
 organization_id = public.organization_id()
 and created_by = (select auth.uid())
 and public.user_role() in (
  'SUPER_ADMIN',
  'ADMIN',
  'OPERATION_MANAGER',
  'HR',
  'FINANCE',
  'CEO_FACTORY',
  'MAINTENANCE_MANAGER',
 'AREA_MANAGER',
  'STAFF',
  'SALES_AGENT'
 )
 and status = 'PENDING'
 and confirmed_at is null
 and cancelled_at is null
 and completed_at is null
 and (
  branch_id is null
  or public.has_branch_access(branch_id)
 )
);

drop policy if exists bookings_update_scope on public.bookings;
create policy bookings_update_scope
on public.bookings
for update
to authenticated
using (
 organization_id = public.organization_id()
 and (
  public.user_role() in ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER', 'AREA_MANAGER')
  or (created_by = (select auth.uid()) and status in ('PENDING', 'CONFIRMED'))
 )
)
with check (
 organization_id = public.organization_id()
 and (
  public.user_role() in ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER', 'AREA_MANAGER')
  or created_by = (select auth.uid())
 )
 and (
  branch_id is null
  or public.has_branch_access(branch_id)
 )
);

-- No delete policy is proposed for the API-only booking flow.

-- ============================================================
-- 5) Additional indexes for planned access patterns
-- ============================================================

create index if not exists idx_bookings_assigned_to_open
 on public.bookings(assigned_to, scheduled_date desc)
 where assigned_to is not null
  and status in ('PENDING', 'CONFIRMED');

create index if not exists idx_bookings_branch_open_date
 on public.bookings(organization_id, branch_id, scheduled_date, scheduled_time)
 where status in ('PENDING', 'CONFIRMED');

comment on table public.bookings is
 'API-only booking records for RKJ One backend workflows. Hardened plan validates same-org references and aligns RLS with API update rules.';

-- ============================================================
-- Rollback draft
-- ============================================================

-- drop index if exists public.idx_bookings_branch_open_date;
-- drop index if exists public.idx_bookings_assigned_to_open;
-- alter table public.bookings drop constraint if exists bookings_status_timestamp_consistency;
-- drop trigger if exists set_booking_status_timestamps on public.bookings;
-- drop function if exists public.set_booking_status_timestamps();
-- drop trigger if exists validate_booking_references on public.bookings;
-- drop function if exists public.validate_booking_references();
--
-- drop policy if exists bookings_update_scope on public.bookings;
-- create policy bookings_update_scope on public.bookings
-- for update using (
--  organization_id = public.organization_id()
--  and (
--   public.user_role() in ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
--   or (branch_id is not null and public.has_branch_access(branch_id))
--   or (created_by = auth.uid() and status in ('PENDING', 'CONFIRMED'))
--  )
-- ) with check (
--  organization_id = public.organization_id()
--  and (
--   branch_id is null
--   or public.user_role() in ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
--   or public.has_branch_access(branch_id)
--  )
-- );
