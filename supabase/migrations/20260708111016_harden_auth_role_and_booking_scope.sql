-- RKJ One M2: harden auth role bootstrap and booking data access.
-- Do not trust user-editable auth.user_metadata for authorization roles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
 v_org_id uuid;
 v_full_name text;
begin
 select id into v_org_id from public.organizations where code = 'RKJ' limit 1;

 v_full_name := coalesce(
  new.raw_user_meta_data->>'full_name',
  new.raw_user_meta_data->>'name',
  split_part(new.email, '@', 1)
 );

 insert into public.profiles (id, organization_id, full_name, email, role)
 values (new.id, v_org_id, v_full_name, new.email, 'STAFF'::user_role)
 on conflict (id) do nothing;

 return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

create or replace function public.validate_booking_references()
returns trigger
language plpgsql
security definer
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

create index if not exists idx_bookings_assigned_to
 on public.bookings(assigned_to, created_at desc);

drop policy if exists bookings_select_scope on public.bookings;
create policy bookings_select_scope
on public.bookings
for select
to authenticated
using (
 organization_id = public.organization_id()
 and (
  created_by = (select auth.uid())
  or assigned_to = (select auth.uid())
  or public.user_role() in ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
  or (branch_id is not null and public.has_branch_access(branch_id))
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
  public.user_role() in ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
  or (
   public.user_role() = 'AREA_MANAGER'
   and branch_id is not null
   and public.has_branch_access(branch_id)
  )
  or (created_by = (select auth.uid()) and status in ('PENDING', 'CONFIRMED'))
 )
)
with check (
 organization_id = public.organization_id()
 and (
  public.user_role() in ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
  or (
   public.user_role() = 'AREA_MANAGER'
   and branch_id is not null
   and public.has_branch_access(branch_id)
  )
  or created_by = (select auth.uid())
 )
 and (
  branch_id is null
  or public.user_role() in ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER')
  or public.has_branch_access(branch_id)
 )
);
