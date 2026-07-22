-- Remove overlapping permissive policies without changing effective access.
-- Read access remains in one SELECT policy while management access is split
-- into explicit INSERT, UPDATE and DELETE policies.

do $$
declare
  item record;
begin
  for item in
    select *
    from (values
      ('agent_account_events', 'agent_account_events_admin',
        '((organization_id = organization_id()) AND (user_role() = ANY (ARRAY[''SUPER_ADMIN''::user_role, ''ADMIN''::user_role, ''OPERATION_MANAGER''::user_role])))'),
      ('agent_driver_routes', 'agent_driver_routes_admin',
        '((organization_id = organization_id()) AND (user_role() = ANY (ARRAY[''SUPER_ADMIN''::user_role, ''ADMIN''::user_role, ''OPERATION_MANAGER''::user_role])))'),
      ('agent_price_group_items', 'agent_price_group_items_admin',
        '((organization_id = organization_id()) AND (user_role() = ANY (ARRAY[''SUPER_ADMIN''::user_role, ''ADMIN''::user_role, ''OPERATION_MANAGER''::user_role])))'),
      ('agent_price_groups', 'agent_price_groups_admin',
        '((organization_id = organization_id()) AND (user_role() = ANY (ARRAY[''SUPER_ADMIN''::user_role, ''ADMIN''::user_role, ''OPERATION_MANAGER''::user_role])))'),
      ('agent_special_staff_assignments', 'agent_special_staff_assignments_admin',
        '((organization_id = organization_id()) AND (user_role() = ANY (ARRAY[''SUPER_ADMIN''::user_role, ''ADMIN''::user_role, ''OPERATION_MANAGER''::user_role])))'),
      ('factory_raw_material_stock_cards', 'factory_raw_cards_manage',
        '((organization_id = organization_id()) AND (user_role() = ANY (ARRAY[''SUPER_ADMIN''::user_role, ''ADMIN''::user_role, ''CEO_FACTORY''::user_role])))'),
      ('hr_leave_balances', 'hr_leave_balances_manage',
        '((organization_id = organization_id()) AND (user_role() = ANY (ARRAY[''SUPER_ADMIN''::user_role, ''ADMIN''::user_role, ''HR''::user_role])))'),
      ('products', 'org_admin_products',
        '((organization_id = organization_id()) AND (user_role() = ANY (ARRAY[''SUPER_ADMIN''::user_role, ''ADMIN''::user_role])))'),
      ('stock_items', 'org_admin_stock_items',
        '((organization_id = organization_id()) AND (user_role() = ANY (ARRAY[''SUPER_ADMIN''::user_role, ''ADMIN''::user_role, ''CEO_FACTORY''::user_role])))')
    ) as policies(table_name, policy_name, predicate)
  loop
    execute format('drop policy if exists %I on public.%I', item.policy_name, item.table_name);
    execute format(
      'create policy %I on public.%I for insert to public with check (%s)',
      item.policy_name || '_insert', item.table_name, item.predicate
    );
    execute format(
      'create policy %I on public.%I for update to public using (%s) with check (%s)',
      item.policy_name || '_update', item.table_name, item.predicate, item.predicate
    );
    execute format(
      'create policy %I on public.%I for delete to public using (%s)',
      item.policy_name || '_delete', item.table_name, item.predicate
    );
  end loop;
end
$$;

-- Agent sales staff has an additional self-management condition.
drop policy if exists agent_sales_staff_manage on public.agent_sales_staff;

create policy agent_sales_staff_manage_insert
on public.agent_sales_staff for insert to public
with check (
  organization_id = organization_id()
  and (
    user_role() = any (array['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'CEO_FACTORY'::user_role])
    or agent_account_id in (
      select id from public.sales_agent_accounts where profile_id = (select auth.uid())
    )
  )
);

create policy agent_sales_staff_manage_update
on public.agent_sales_staff for update to public
using (
  organization_id = organization_id()
  and (
    user_role() = any (array['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'CEO_FACTORY'::user_role])
    or agent_account_id in (
      select id from public.sales_agent_accounts where profile_id = (select auth.uid())
    )
  )
)
with check (
  organization_id = organization_id()
  and (
    user_role() = any (array['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'CEO_FACTORY'::user_role])
    or agent_account_id in (
      select id from public.sales_agent_accounts where profile_id = (select auth.uid())
    )
  )
);

create policy agent_sales_staff_manage_delete
on public.agent_sales_staff for delete to public
using (
  organization_id = organization_id()
  and (
    user_role() = any (array['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'CEO_FACTORY'::user_role])
    or agent_account_id in (
      select id from public.sales_agent_accounts where profile_id = (select auth.uid())
    )
  )
);

-- Child and balance tables keep their existing organization-scoped read policy.
drop policy if exists delivery_legs_driver on public.delivery_legs;
drop policy if exists delivery_legs_org on public.delivery_legs;

create policy delivery_legs_org
on public.delivery_legs for select to public
using (
  exists (
    select 1 from public.delivery_orders d
    where d.id = delivery_legs.delivery_order_id
      and d.organization_id = organization_id()
  )
);

create policy delivery_legs_org_insert
on public.delivery_legs for insert to public
with check (
  exists (
    select 1 from public.delivery_orders d
    where d.id = delivery_legs.delivery_order_id
      and d.organization_id = organization_id()
  )
);

create policy delivery_legs_org_update
on public.delivery_legs for update to public
using (
  exists (
    select 1 from public.delivery_orders d
    where d.id = delivery_legs.delivery_order_id
      and d.organization_id = organization_id()
  )
)
with check (
  exists (
    select 1 from public.delivery_orders d
    where d.id = delivery_legs.delivery_order_id
      and d.organization_id = organization_id()
  )
);

create policy delivery_legs_org_delete
on public.delivery_legs for delete to public
using (
  exists (
    select 1 from public.delivery_orders d
    where d.id = delivery_legs.delivery_order_id
      and d.organization_id = organization_id()
  )
);

drop policy if exists inventory_balances_org_write on public.inventory_balances;

create policy inventory_balances_org_insert
on public.inventory_balances for insert to public
with check (organization_id = organization_id());

create policy inventory_balances_org_update
on public.inventory_balances for update to public
using (organization_id = organization_id())
with check (organization_id = organization_id());

create policy inventory_balances_org_delete
on public.inventory_balances for delete to public
using (organization_id = organization_id());

-- Legal documents retain organization-wide read access and scoped HR/admin writes.
drop policy if exists legal_entity_documents_admin on public.legal_entity_documents;

create policy legal_entity_documents_admin_insert
on public.legal_entity_documents for insert to public
with check (
  organization_id in (
    select organization_id from public.profiles
    where id = (select auth.uid())
      and role = any (array['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role])
  )
);

create policy legal_entity_documents_admin_update
on public.legal_entity_documents for update to public
using (
  organization_id in (
    select organization_id from public.profiles
    where id = (select auth.uid())
      and role = any (array['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role])
  )
)
with check (
  organization_id in (
    select organization_id from public.profiles
    where id = (select auth.uid())
      and role = any (array['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role])
  )
);

create policy legal_entity_documents_admin_delete
on public.legal_entity_documents for delete to public
using (
  organization_id in (
    select organization_id from public.profiles
    where id = (select auth.uid())
      and role = any (array['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role])
  )
);

-- Profiles need one combined SELECT and UPDATE path so area managers keep
-- access to their assigned branch staff while every user can update themself.
drop policy if exists profiles_admin_or_area_manager_manage on public.profiles;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select
on public.profiles for select to public
using (
  id = (select auth.uid())
  or (
    organization_id = (select organization_id())
    and (
      (select is_admin())
      or (
        (select user_role()) = 'AREA_MANAGER'::user_role
        and role = 'STAFF'::user_role
        and branch_id is not null
        and has_branch_access(branch_id)
      )
    )
  )
);

create policy profiles_admin_or_area_manager_insert
on public.profiles for insert to public
with check (
  organization_id = (select organization_id())
  and (
    (select is_admin())
    or (
      (select user_role()) = 'AREA_MANAGER'::user_role
      and role = 'STAFF'::user_role
      and branch_id is not null
      and has_branch_access(branch_id)
    )
  )
);

create policy profiles_update
on public.profiles for update to public
using (
  id = (select auth.uid())
  or (
    organization_id = (select organization_id())
    and (
      (select is_admin())
      or (
        (select user_role()) = 'AREA_MANAGER'::user_role
        and role = 'STAFF'::user_role
        and branch_id is not null
        and has_branch_access(branch_id)
      )
    )
  )
)
with check (
  id = (select auth.uid())
  or (
    organization_id = (select organization_id())
    and (
      (select is_admin())
      or (
        (select user_role()) = 'AREA_MANAGER'::user_role
        and role = 'STAFF'::user_role
        and branch_id is not null
        and has_branch_access(branch_id)
      )
    )
  )
);

create policy profiles_admin_or_area_manager_delete
on public.profiles for delete to public
using (
  organization_id = (select organization_id())
  and (
    (select is_admin())
    or (
      (select user_role()) = 'AREA_MANAGER'::user_role
      and role = 'STAFF'::user_role
      and branch_id is not null
      and has_branch_access(branch_id)
    )
  )
);

-- Staff already has an organization-wide read policy.
drop policy if exists staff_admin_or_area_manager_manage on public.staff;

create policy staff_admin_or_area_manager_insert
on public.staff for insert to public
with check (
  organization_id = (select organization_id())
  and (
    (select can_admin_settings())
    or (
      (select user_role()) = 'AREA_MANAGER'::user_role
      and branch_id is not null
      and has_branch_access(branch_id)
    )
  )
);

create policy staff_admin_or_area_manager_update
on public.staff for update to public
using (
  organization_id = (select organization_id())
  and (
    (select can_admin_settings())
    or (
      (select user_role()) = 'AREA_MANAGER'::user_role
      and branch_id is not null
      and has_branch_access(branch_id)
    )
  )
)
with check (
  organization_id = (select organization_id())
  and (
    (select can_admin_settings())
    or (
      (select user_role()) = 'AREA_MANAGER'::user_role
      and branch_id is not null
      and has_branch_access(branch_id)
    )
  )
);

create policy staff_admin_or_area_manager_delete
on public.staff for delete to public
using (
  organization_id = (select organization_id())
  and (
    (select can_admin_settings())
    or (
      (select user_role()) = 'AREA_MANAGER'::user_role
      and branch_id is not null
      and has_branch_access(branch_id)
    )
  )
);

-- Roster read predicates are combined; management writes stay branch-scoped.
drop policy if exists roster_entries_manager on public.weekly_roster_entries;
drop policy if exists roster_entries_staff_read on public.weekly_roster_entries;

create policy roster_entries_read
on public.weekly_roster_entries for select to public
using (can_access_roster_plan(plan_id) or is_own_published_roster_entry(id));

create policy roster_entries_manager_insert
on public.weekly_roster_entries for insert to public
with check (can_access_roster_plan(plan_id));

create policy roster_entries_manager_update
on public.weekly_roster_entries for update to public
using (can_access_roster_plan(plan_id))
with check (can_access_roster_plan(plan_id));

create policy roster_entries_manager_delete
on public.weekly_roster_entries for delete to public
using (can_access_roster_plan(plan_id));

drop policy if exists roster_plans_branch on public.weekly_roster_plans;
drop policy if exists roster_plans_staff_read on public.weekly_roster_plans;

create policy roster_plans_read
on public.weekly_roster_plans for select to public
using (
  (organization_id = organization_id() and has_branch_access(branch_id))
  or (
    status = 'PUBLISHED'::weekly_roster_status
    and organization_id = organization_id()
    and is_own_published_roster_plan(id)
  )
);

create policy roster_plans_branch_insert
on public.weekly_roster_plans for insert to public
with check (organization_id = organization_id() and has_branch_access(branch_id));

create policy roster_plans_branch_update
on public.weekly_roster_plans for update to public
using (organization_id = organization_id() and has_branch_access(branch_id))
with check (organization_id = organization_id() and has_branch_access(branch_id));

create policy roster_plans_branch_delete
on public.weekly_roster_plans for delete to public
using (organization_id = organization_id() and has_branch_access(branch_id));

-- Authenticated-only scheduling tables use the same split pattern.
drop policy if exists factory_prod_days_manage on public.factory_production_days;

create policy factory_prod_days_insert
on public.factory_production_days for insert to authenticated
with check (
  exists (
    select 1 from public.factory_production_weeks w
    where w.id = factory_production_days.week_id
      and w.organization_id in (select organization_id from public.profiles where id = (select auth.uid()))
      and can_manage_factory_production_schedule()
  )
);

create policy factory_prod_days_update
on public.factory_production_days for update to authenticated
using (
  exists (
    select 1 from public.factory_production_weeks w
    where w.id = factory_production_days.week_id
      and w.organization_id in (select organization_id from public.profiles where id = (select auth.uid()))
      and can_manage_factory_production_schedule()
  )
)
with check (
  exists (
    select 1 from public.factory_production_weeks w
    where w.id = factory_production_days.week_id
      and w.organization_id in (select organization_id from public.profiles where id = (select auth.uid()))
      and can_manage_factory_production_schedule()
  )
);

create policy factory_prod_days_delete
on public.factory_production_days for delete to authenticated
using (
  exists (
    select 1 from public.factory_production_weeks w
    where w.id = factory_production_days.week_id
      and w.organization_id in (select organization_id from public.profiles where id = (select auth.uid()))
      and can_manage_factory_production_schedule()
  )
);

do $$
declare
  item record;
begin
  for item in
    select *
    from (values
      ('factory_production_weeks', 'factory_prod_weeks_manage', 'can_manage_factory_production_schedule()'),
      ('hq_delivery_route_plans', 'hq_delivery_route_plans_manage', 'can_set_roti_production_date()')
    ) as policies(table_name, policy_name, permission_check)
  loop
    execute format('drop policy if exists %I on public.%I', item.policy_name, item.table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((organization_id in (select organization_id from public.profiles where id = (select auth.uid()))) and %s)',
      item.policy_name || '_insert', item.table_name, item.permission_check
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((organization_id in (select organization_id from public.profiles where id = (select auth.uid()))) and %s) with check ((organization_id in (select organization_id from public.profiles where id = (select auth.uid()))) and %s)',
      item.policy_name || '_update', item.table_name, item.permission_check, item.permission_check
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((organization_id in (select organization_id from public.profiles where id = (select auth.uid()))) and %s)',
      item.policy_name || '_delete', item.table_name, item.permission_check
    );
  end loop;
end
$$;
