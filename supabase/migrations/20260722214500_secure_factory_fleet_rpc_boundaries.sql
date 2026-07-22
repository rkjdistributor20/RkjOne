-- Keep privileged implementation functions outside the exposed API schema.
-- Public wrappers validate authentication, role, and organization ownership
-- before delegating to the existing implementation.

CREATE SCHEMA IF NOT EXISTS private_rkj;
REVOKE ALL ON SCHEMA private_rkj FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private_rkj TO service_role;

ALTER FUNCTION public.adjust_route_stop_items(UUID, JSONB, TEXT)
  SET SCHEMA private_rkj;
ALTER FUNCTION public.assign_branch_drivers(UUID, JSONB)
  SET SCHEMA private_rkj;
ALTER FUNCTION public.close_expired_production_order_windows()
  SET SCHEMA private_rkj;
ALTER FUNCTION public.complete_route_handoff(UUID)
  SET SCHEMA private_rkj;
ALTER FUNCTION public.finalize_hq_factory_order(UUID)
  SET SCHEMA private_rkj;
ALTER FUNCTION public.get_factory_order_report(UUID)
  SET SCHEMA private_rkj;
ALTER FUNCTION public.get_roti_expiry_summary(UUID)
  SET SCHEMA private_rkj;
ALTER FUNCTION public.optimize_delivery_route_stops(UUID)
  SET SCHEMA private_rkj;
ALTER FUNCTION public.post_process_driver_instructions(UUID, INT)
  SET SCHEMA private_rkj;
ALTER FUNCTION public.update_delivery_route_plan(UUID, UUID, UUID, UUID[])
  SET SCHEMA private_rkj;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private_rkj FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private_rkj TO service_role;

CREATE OR REPLACE FUNCTION public.assert_rkj_authenticated()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_rkj_hq_access(p_target_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_rkj_authenticated();
  IF NOT public.can_set_roti_production_date() THEN
    RAISE EXCEPTION 'Hanya HQ dibenarkan';
  END IF;
  IF p_target_org_id IS NULL
     OR public.organization_id() IS DISTINCT FROM p_target_org_id THEN
    RAISE EXCEPTION 'Akses organisasi tidak dibenarkan';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_route_stop_items(
  p_stop_id UUID,
  p_adjustments JSONB,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private_rkj
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT p.organization_id INTO v_org_id
  FROM public.hq_delivery_route_stops s
  JOIN public.hq_delivery_route_plans p ON p.id = s.route_plan_id
  WHERE s.id = p_stop_id;
  PERFORM public.assert_rkj_hq_access(v_org_id);
  RETURN private_rkj.adjust_route_stop_items(p_stop_id, p_adjustments, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_branch_drivers(
  p_order_id UUID,
  p_assignments JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private_rkj
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.hq_factory_orders WHERE id = p_order_id;
  PERFORM public.assert_rkj_hq_access(v_org_id);
  RETURN private_rkj.assign_branch_drivers(p_order_id, p_assignments);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_expired_production_order_windows()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private_rkj
AS $$
BEGIN
  PERFORM public.assert_rkj_authenticated();
  IF NOT public.can_set_roti_production_date() THEN
    RAISE EXCEPTION 'Hanya HQ dibenarkan';
  END IF;
  RETURN private_rkj.close_expired_production_order_windows();
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_route_handoff(p_primary_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private_rkj
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.hq_delivery_route_plans WHERE id = p_primary_plan_id;
  PERFORM public.assert_rkj_hq_access(v_org_id);
  RETURN private_rkj.complete_route_handoff(p_primary_plan_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_hq_factory_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private_rkj
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.hq_factory_orders WHERE id = p_order_id;
  PERFORM public.assert_rkj_hq_access(v_org_id);
  RETURN private_rkj.finalize_hq_factory_order(p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_factory_order_report(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private_rkj
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  PERFORM public.assert_rkj_authenticated();
  SELECT organization_id INTO v_org_id
  FROM public.hq_factory_orders WHERE id = p_order_id;
  IF v_org_id IS NULL
     OR public.organization_id() IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'Akses organisasi tidak dibenarkan';
  END IF;
  RETURN private_rkj.get_factory_order_report(p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_roti_expiry_summary(p_location_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private_rkj
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  PERFORM public.assert_rkj_authenticated();
  SELECT organization_id INTO v_org_id
  FROM public.inventory_locations WHERE id = p_location_id;
  IF v_org_id IS NULL
     OR public.organization_id() IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'Akses lokasi stok tidak dibenarkan';
  END IF;
  RETURN private_rkj.get_roti_expiry_summary(p_location_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.optimize_delivery_route_stops(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private_rkj
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.hq_delivery_route_plans WHERE id = p_plan_id;
  PERFORM public.assert_rkj_hq_access(v_org_id);
  RETURN private_rkj.optimize_delivery_route_stops(p_plan_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_process_driver_instructions(
  p_order_id UUID,
  p_max_stops INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private_rkj
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.hq_factory_orders WHERE id = p_order_id;
  PERFORM public.assert_rkj_hq_access(v_org_id);
  RETURN private_rkj.post_process_driver_instructions(p_order_id, p_max_stops);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_delivery_route_plan(
  p_plan_id UUID,
  p_driver_id UUID DEFAULT NULL,
  p_vehicle_id UUID DEFAULT NULL,
  p_stop_order UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private_rkj
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.hq_delivery_route_plans WHERE id = p_plan_id;
  PERFORM public.assert_rkj_hq_access(v_org_id);
  RETURN private_rkj.update_delivery_route_plan(
    p_plan_id, p_driver_id, p_vehicle_id, p_stop_order
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assert_rkj_authenticated() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_rkj_hq_access(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_route_stop_items(UUID, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_branch_drivers(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_expired_production_order_windows() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_route_handoff(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_hq_factory_order(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_factory_order_report(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_roti_expiry_summary(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.optimize_delivery_route_stops(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_process_driver_instructions(UUID, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_delivery_route_plan(UUID, UUID, UUID, UUID[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assert_rkj_authenticated() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_rkj_hq_access(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_route_stop_items(UUID, JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_branch_drivers(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_expired_production_order_windows() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_route_handoff(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_hq_factory_order(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_factory_order_report(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_roti_expiry_summary(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.optimize_delivery_route_stops(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_process_driver_instructions(UUID, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_delivery_route_plan(UUID, UUID, UUID, UUID[]) TO authenticated, service_role;
