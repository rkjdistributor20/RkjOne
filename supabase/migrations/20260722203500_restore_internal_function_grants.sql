-- Keep internal helpers, payment callbacks, and scheduled maintenance off the
-- authenticated PostgREST surface. They remain callable by their owning
-- SECURITY DEFINER functions and by service_role APIs.
DO $migration$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'auto_fulfill_acknowledged_factory_order',
        'branch_roti_daily_pcs',
        'branch_sales_potential_factor',
        'cancel_agent_payment',
        'confirm_agent_payment_and_fulfill',
        'expire_agent_subscriptions',
        'fail_agent_payment',
        'get_expired_roti_stock',
        'is_factory_order_window_open',
        'next_agent_order_number',
        'refresh_dashboard_daily_rollups',
        'refund_agent_payment',
        'split_route_plan_max_stops'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END
$migration$;
