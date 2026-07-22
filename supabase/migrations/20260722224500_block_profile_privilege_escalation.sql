-- Block self-service profile edits from changing authorization boundaries.
-- Personal fields remain editable through the normal profile APIs.

CREATE OR REPLACE FUNCTION public.guard_profile_authorization_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() = 'authenticated'
     AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.employee_code IS DISTINCT FROM OLD.employee_code
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.region_id IS DISTINCT FROM OLD.region_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
     )
  THEN
    RAISE EXCEPTION 'Authorization profile fields cannot be changed through self-service';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_authorization_fields
ON public.profiles;

CREATE TRIGGER guard_profile_authorization_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_authorization_fields();

REVOKE ALL ON FUNCTION public.guard_profile_authorization_fields()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_profile_authorization_fields()
TO service_role;

-- Privileged implementation functions are callable only by their validated
-- public SECURITY DEFINER wrappers (or by the service role for operations).
REVOKE ALL ON SCHEMA private_rkj FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private_rkj TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private_rkj FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private_rkj TO service_role;

ALTER FUNCTION public.adjust_route_stop_items(UUID, JSONB, TEXT)
  SECURITY DEFINER SET search_path = pg_catalog, public, private_rkj;
ALTER FUNCTION public.assign_branch_drivers(UUID, JSONB)
  SECURITY DEFINER SET search_path = pg_catalog, public, private_rkj;
ALTER FUNCTION public.close_expired_production_order_windows()
  SECURITY DEFINER SET search_path = pg_catalog, public, private_rkj;
ALTER FUNCTION public.complete_route_handoff(UUID)
  SECURITY DEFINER SET search_path = pg_catalog, public, private_rkj;
ALTER FUNCTION public.finalize_hq_factory_order(UUID)
  SECURITY DEFINER SET search_path = pg_catalog, public, private_rkj;
ALTER FUNCTION public.get_factory_order_report(UUID)
  SECURITY DEFINER SET search_path = pg_catalog, public, private_rkj;
ALTER FUNCTION public.get_roti_expiry_summary(UUID)
  SECURITY DEFINER SET search_path = pg_catalog, public, private_rkj;
ALTER FUNCTION public.optimize_delivery_route_stops(UUID)
  SECURITY DEFINER SET search_path = pg_catalog, public, private_rkj;
ALTER FUNCTION public.post_process_driver_instructions(UUID, INT)
  SECURITY DEFINER SET search_path = pg_catalog, public, private_rkj;
ALTER FUNCTION public.update_delivery_route_plan(UUID, UUID, UUID, UUID[])
  SECURITY DEFINER SET search_path = pg_catalog, public, private_rkj;
