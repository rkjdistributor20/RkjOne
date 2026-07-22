-- SECURITY DEFINER functions must not inherit PostgreSQL's default PUBLIC grant.
-- Preserve authenticated/service RPC behavior while removing anonymous execution.
DO $block$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      function_signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',
      function_signature
    );
  END LOOP;
END
$block$;

-- These functions are implementation details or trigger entry points, not RPCs.
REVOKE EXECUTE ON FUNCTION public._internal_create_dispatch_transfer(uuid, uuid, uuid, jsonb, uuid, uuid, text, uuid)
FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._internal_receive_stock(uuid, uuid, jsonb, text, text, uuid)
FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._pos_apply_receipt_stock(uuid, uuid)
FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_booking_references()
FROM authenticated;
