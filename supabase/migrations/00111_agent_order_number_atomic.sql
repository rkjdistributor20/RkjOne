-- Nombor order ejen: kunci transaksi supaya UAT / request serentak tidak duplicate AO-00000N
CREATE OR REPLACE FUNCTION next_agent_order_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('agent_order_no:' || p_org_id::text));

  SELECT COALESCE(MAX((regexp_match(order_number, 'AO-([0-9]+)$'))[1]::INT), 0) + 1
  INTO v_next
  FROM agent_stock_orders
  WHERE organization_id = p_org_id;

  RETURN 'AO-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;
