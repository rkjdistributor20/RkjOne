-- Consolidate overlapping permissive policies so each table/action is evaluated once.

drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_am_staff on public.profiles;

create policy profiles_admin_or_area_manager_manage
on public.profiles
for all
to public
using (
  organization_id = (select public.organization_id())
  and (
    (select public.is_admin())
    or (
      (select public.user_role()) = 'AREA_MANAGER'::public.user_role
      and role = 'STAFF'::public.user_role
      and branch_id is not null
      and public.has_branch_access(branch_id)
    )
  )
)
with check (
  organization_id = (select public.organization_id())
  and (
    (select public.is_admin())
    or (
      (select public.user_role()) = 'AREA_MANAGER'::public.user_role
      and role = 'STAFF'::public.user_role
      and branch_id is not null
      and public.has_branch_access(branch_id)
    )
  )
);

drop policy if exists staff_admin_manage on public.staff;
drop policy if exists staff_am_manage on public.staff;

create policy staff_admin_or_area_manager_manage
on public.staff
for all
to public
using (
  organization_id = (select public.organization_id())
  and (
    (select public.can_admin_settings())
    or (
      (select public.user_role()) = 'AREA_MANAGER'::public.user_role
      and branch_id is not null
      and public.has_branch_access(branch_id)
    )
  )
)
with check (
  organization_id = (select public.organization_id())
  and (
    (select public.can_admin_settings())
    or (
      (select public.user_role()) = 'AREA_MANAGER'::public.user_role
      and branch_id is not null
      and public.has_branch_access(branch_id)
    )
  )
);

drop policy if exists stock_movements_org on public.stock_movements;
drop policy if exists stock_movements_select on public.stock_movements;

create policy stock_movements_organization_read
on public.stock_movements
for select
to public
using (organization_id = (select public.organization_id()));
