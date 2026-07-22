-- Harden API-facing tables identified by the Supabase Security Advisor.
-- Service-role operations continue to bypass RLS; client access is tenant scoped.

-- Audit data is readable only by administrators in the same organization.
CREATE POLICY audit_logs_admin_select
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.user_role()) IN ('SUPER_ADMIN', 'ADMIN')
);

-- Financial routing configuration is visible to the tenant and writable by admins.
CREATE POLICY finance_flow_config_tenant_select
ON public.finance_flow_config
FOR SELECT
TO authenticated
USING (organization_id = (SELECT public.organization_id()));

CREATE POLICY finance_flow_config_admin_insert
ON public.finance_flow_config
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.can_admin_settings())
);

CREATE POLICY finance_flow_config_admin_update
ON public.finance_flow_config
FOR UPDATE
TO authenticated
USING (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.can_admin_settings())
)
WITH CHECK (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.can_admin_settings())
);

CREATE POLICY finance_flow_config_admin_delete
ON public.finance_flow_config
FOR DELETE
TO authenticated
USING (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.can_admin_settings())
);

-- Offline queue processing is server-side only. This explicit deny documents intent.
CREATE POLICY offline_sync_queue_service_only
ON public.offline_sync_queue
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY organizations_tenant_select
ON public.organizations
FOR SELECT
TO authenticated
USING (id = (SELECT public.organization_id()));

CREATE POLICY organizations_admin_update
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  id = (SELECT public.organization_id())
  AND (SELECT public.can_admin_settings())
)
WITH CHECK (
  id = (SELECT public.organization_id())
  AND (SELECT public.can_admin_settings())
);

-- POS stock deductions inherit access from their transaction and branch.
CREATE POLICY pos_stock_deductions_tenant_select
ON public.pos_stock_deductions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pos_transactions tx
    WHERE tx.id = pos_stock_deductions.transaction_id
      AND tx.organization_id = (SELECT public.organization_id())
      AND public.has_branch_access(tx.branch_id)
  )
);

CREATE POLICY product_bom_tenant_select
ON public.product_bom
FOR SELECT
TO authenticated
USING (organization_id = (SELECT public.organization_id()));

CREATE POLICY product_bom_factory_insert
ON public.product_bom
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.user_role()) IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY')
);

CREATE POLICY product_bom_factory_update
ON public.product_bom
FOR UPDATE
TO authenticated
USING (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.user_role()) IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY')
)
WITH CHECK (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.user_role()) IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY')
);

CREATE POLICY product_bom_factory_delete
ON public.product_bom
FOR DELETE
TO authenticated
USING (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.user_role()) IN ('SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY')
);

-- A user may see their own branch grants; personnel managers may manage their tenant.
CREATE POLICY profile_branch_access_tenant_select
ON public.profile_branch_access
FOR SELECT
TO authenticated
USING (
  profile_id = (SELECT auth.uid())
  OR (
    (SELECT public.can_manage_personnel())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = profile_branch_access.profile_id
        AND p.organization_id = (SELECT public.organization_id())
    )
  )
);

CREATE POLICY profile_branch_access_manager_insert
ON public.profile_branch_access
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.can_manage_personnel())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_branch_access.profile_id
      AND p.organization_id = (SELECT public.organization_id())
  )
  AND EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = profile_branch_access.branch_id
      AND b.organization_id = (SELECT public.organization_id())
      AND public.has_branch_access(b.id)
  )
);

CREATE POLICY profile_branch_access_manager_delete
ON public.profile_branch_access
FOR DELETE
TO authenticated
USING (
  (SELECT public.can_manage_personnel())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_branch_access.profile_id
      AND p.organization_id = (SELECT public.organization_id())
  )
  AND public.has_branch_access(branch_id)
);

-- Runtime permission lookup is restricted to the current role unless an admin is editing it.
CREATE POLICY role_permissions_tenant_select
ON public.role_permissions
FOR SELECT
TO authenticated
USING (
  organization_id = (SELECT public.organization_id())
  AND (
    role = (SELECT public.user_role())
    OR (SELECT public.can_admin_settings())
  )
);

CREATE POLICY role_permissions_admin_insert
ON public.role_permissions
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.can_admin_settings())
);

CREATE POLICY role_permissions_admin_update
ON public.role_permissions
FOR UPDATE
TO authenticated
USING (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.can_admin_settings())
)
WITH CHECK (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.can_admin_settings())
);

CREATE POLICY role_permissions_admin_delete
ON public.role_permissions
FOR DELETE
TO authenticated
USING (
  organization_id = (SELECT public.organization_id())
  AND (SELECT public.can_admin_settings())
);

-- Stock document items inherit read access from their tenant-scoped parent.
CREATE POLICY stock_adjustment_items_tenant_select
ON public.stock_adjustment_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.stock_adjustments parent
    WHERE parent.id = stock_adjustment_items.adjustment_id
      AND parent.organization_id = (SELECT public.organization_id())
  )
);

CREATE POLICY stock_receive_items_tenant_select
ON public.stock_receive_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.stock_receives parent
    WHERE parent.id = stock_receive_items.receive_id
      AND parent.organization_id = (SELECT public.organization_id())
  )
);

CREATE POLICY stock_write_off_items_tenant_select
ON public.stock_write_off_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.stock_write_offs parent
    WHERE parent.id = stock_write_off_items.write_off_id
      AND parent.organization_id = (SELECT public.organization_id())
  )
);

-- Replace permissive POS shift-member policies with tenant and branch checks.
DROP POLICY IF EXISTS pos_shift_staff_members_select ON public.pos_shift_staff_members;
DROP POLICY IF EXISTS pos_shift_staff_members_insert ON public.pos_shift_staff_members;
DROP POLICY IF EXISTS pos_shift_staff_members_update ON public.pos_shift_staff_members;

CREATE POLICY pos_shift_staff_members_branch_select
ON public.pos_shift_staff_members
FOR SELECT
TO authenticated
USING (
  organization_id = (SELECT public.organization_id())
  AND public.has_branch_access(branch_id)
);

CREATE POLICY pos_shift_staff_members_branch_insert
ON public.pos_shift_staff_members
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = (SELECT public.organization_id())
  AND public.has_branch_access(branch_id)
  AND started_by = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.pos_shifts s
    WHERE s.id = pos_shift_staff_members.shift_id
      AND s.organization_id = pos_shift_staff_members.organization_id
      AND s.branch_id = pos_shift_staff_members.branch_id
  )
  AND (
    profile_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = pos_shift_staff_members.profile_id
        AND p.organization_id = pos_shift_staff_members.organization_id
    )
  )
  AND (
    staff_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.staff st
      WHERE st.id = pos_shift_staff_members.staff_id
        AND st.organization_id = pos_shift_staff_members.organization_id
        AND st.branch_id = pos_shift_staff_members.branch_id
        AND st.status = 'ACTIVE'
    )
  )
);

CREATE POLICY pos_shift_staff_members_branch_update
ON public.pos_shift_staff_members
FOR UPDATE
TO authenticated
USING (
  organization_id = (SELECT public.organization_id())
  AND public.has_branch_access(branch_id)
  AND (
    (SELECT public.user_role()) IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER')
    OR profile_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  organization_id = (SELECT public.organization_id())
  AND public.has_branch_access(branch_id)
  AND EXISTS (
    SELECT 1
    FROM public.pos_shifts s
    WHERE s.id = pos_shift_staff_members.shift_id
      AND s.organization_id = pos_shift_staff_members.organization_id
      AND s.branch_id = pos_shift_staff_members.branch_id
  )
  AND (
    (SELECT public.user_role()) IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER')
    OR (
      profile_id = (SELECT auth.uid())
      AND status = 'ENDED'
      AND ended_by = (SELECT auth.uid())
    )
  )
);

-- Public buckets can serve files by URL without allowing anonymous object listing.
DROP POLICY IF EXISTS profile_avatars_select ON storage.objects;

-- Pin function resolution to trusted schemas to prevent search-path hijacking.
ALTER FUNCTION public.agent_outlet_has_active_subscription(uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.apply_stock_movement() SET search_path TO public, pg_temp;
ALTER FUNCTION public.assert_published_production_date(uuid, date) SET search_path TO public, pg_temp;
ALTER FUNCTION public.branch_delivery_priority(uuid, uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.branch_supply_suggested_qty(text, text, jsonb) SET search_path TO public, pg_temp;
ALTER FUNCTION public.calculate_commission(uuid, numeric) SET search_path TO public, pg_temp;
ALTER FUNCTION public.calculate_foreign_shift_pay(uuid, numeric) SET search_path TO public, pg_temp;
ALTER FUNCTION public.can_admin_settings() SET search_path TO public, pg_temp;
ALTER FUNCTION public.can_manage_factory_production_schedule() SET search_path TO public, pg_temp;
ALTER FUNCTION public.can_manage_personnel() SET search_path TO public, pg_temp;
ALTER FUNCTION public.can_set_roti_production_date() SET search_path TO public, pg_temp;
ALTER FUNCTION public.can_set_roti_production_date_on_kiosk_transfer() SET search_path TO public, pg_temp;
ALTER FUNCTION public.check_low_stock(uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.consume_stock_batches_fifo(uuid, uuid, numeric) SET search_path TO public, pg_temp;
ALTER FUNCTION public.consume_stock_batches_targeted(uuid, uuid, numeric, date, text) SET search_path TO public, pg_temp;
ALTER FUNCTION public.create_delivery_order(uuid, jsonb, text, uuid, uuid, uuid, date) SET search_path TO public, pg_temp;
ALTER FUNCTION public.default_driver_for_region(uuid, region_code) SET search_path TO public, pg_temp;
ALTER FUNCTION public.default_driver_id_for_branch(uuid, uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.driver_route_role(text) SET search_path TO public, pg_temp;
ALTER FUNCTION public.factory_order_cutoff_at(date) SET search_path TO public, pg_temp;
ALTER FUNCTION public.generate_doc_number(text, uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.generate_fleet_number(text) SET search_path TO public, pg_temp;
ALTER FUNCTION public.generate_inv_number(text, uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.generate_pos_number(text, uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.geo_distance_km(numeric, numeric, numeric, numeric) SET search_path TO public, pg_temp;
ALTER FUNCTION public.is_published_production_date(uuid, date) SET search_path TO public, pg_temp;
ALTER FUNCTION public.is_roti_stock_item(uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.malaysia_effective_consumption_days(date, date, text) SET search_path TO public, pg_temp;
ALTER FUNCTION public.malaysia_highway_demand_multiplier(date, text) SET search_path TO public, pg_temp;
ALTER FUNCTION public.malaysia_holidays_in_range(date, date) SET search_path TO public, pg_temp;
ALTER FUNCTION public.mark_expired_roti_batches() SET search_path TO public, pg_temp;
ALTER FUNCTION public.next_agent_receipt_number(uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.next_maintenance_report_number(uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.refresh_pos_daily_summary(uuid, uuid, date) SET search_path TO public, pg_temp;
ALTER FUNCTION public.roti_shelf_life_days() SET search_path TO public, pg_temp;
ALTER FUNCTION public.route_stop_sort_key(text, text) SET search_path TO public, pg_temp;
ALTER FUNCTION public.set_pos_shift_staff_members_updated_at() SET search_path TO public, pg_temp;
ALTER FUNCTION public.sync_stock_batch_on_movement() SET search_path TO public, pg_temp;
ALTER FUNCTION public.trigger_set_updated_at() SET search_path TO public, pg_temp;
ALTER FUNCTION public.validate_pos_sale_stock(uuid, jsonb) SET search_path TO public, pg_temp;
ALTER FUNCTION public.week_start_monday(date) SET search_path TO public, pg_temp;
