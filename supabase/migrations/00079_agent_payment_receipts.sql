-- Resit rasmi bayaran ejen (RKJ Distributor Sdn Bhd)

CREATE TABLE agent_payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES agent_online_payments(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  receipt_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id),
  UNIQUE (organization_id, receipt_number)
);

CREATE INDEX idx_agent_payment_receipts_org ON agent_payment_receipts(organization_id);
CREATE INDEX idx_agent_payment_receipts_payment ON agent_payment_receipts(payment_id);

CREATE OR REPLACE FUNCTION next_agent_receipt_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE v_next INT;
BEGIN
  SELECT COALESCE(MAX((regexp_match(receipt_number, 'AR-([0-9]+)$'))[1]::INT), 0) + 1
  INTO v_next FROM agent_payment_receipts WHERE organization_id = p_org_id;
  RETURN 'AR-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION confirm_agent_payment_and_fulfill(
  p_payment_id UUID,
  p_gateway_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay agent_online_payments%ROWTYPE;
  v_order agent_stock_orders%ROWTYPE;
  v_sub agent_outlet_subscriptions%ROWTYPE;
  v_outlet agent_outlets%ROWTYPE;
  v_agent sales_agent_accounts%ROWTYPE;
  v_entity legal_entities%ROWTYPE;
  v_factory_id UUID;
  v_receipt_id UUID;
  v_receipt_number TEXT;
  v_receipt_data JSONB;
  v_items JSONB := '[]'::jsonb;
  v_existing agent_payment_receipts%ROWTYPE;
BEGIN
  SELECT * INTO v_pay FROM agent_online_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pembayaran tidak dijumpai';
  END IF;

  SELECT * INTO v_existing FROM agent_payment_receipts WHERE payment_id = p_payment_id;
  IF v_pay.status = 'PAID' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_paid', true,
      'receipt_number', v_existing.receipt_number,
      'receipt_id', v_existing.id
    );
  END IF;

  SELECT * INTO v_agent FROM sales_agent_accounts WHERE id = v_pay.agent_account_id;
  SELECT * INTO v_entity
  FROM legal_entities
  WHERE organization_id = v_pay.organization_id AND code = 'RKJ_DIST'
  LIMIT 1;

  UPDATE agent_online_payments SET
    status = 'PAID',
    paid_at = now(),
    gateway_ref = COALESCE(p_gateway_ref, gateway_ref),
    updated_at = now()
  WHERE id = p_payment_id;

  IF v_pay.purpose = 'STOCK_ORDER' THEN
    SELECT * INTO v_order FROM agent_stock_orders WHERE id = v_pay.reference_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order stok tidak dijumpai'; END IF;

    IF NOT is_factory_order_window_open(v_order.organization_id, v_order.production_date) THEN
      RAISE EXCEPTION 'Tempoh order kilang untuk tarikh % sudah tutup', v_order.production_date;
    END IF;

    UPDATE agent_stock_orders SET
      status = 'SUBMITTED_FACTORY',
      payment_id = p_payment_id,
      submitted_at = now(),
      updated_at = now()
    WHERE id = v_order.id;

    INSERT INTO factory_agent_orders (
      organization_id, agent_order_id, agent_account_id, production_date,
      company_name, status
    ) VALUES (
      v_order.organization_id, v_order.id, v_order.agent_account_id,
      v_order.production_date, v_agent.company_name, 'SUBMITTED'
    )
    RETURNING id INTO v_factory_id;

    INSERT INTO factory_agent_order_items (factory_agent_order_id, stock_item_id, quantity, unit)
    SELECT v_factory_id, i.stock_item_id, i.quantity, i.unit
    FROM agent_stock_order_items i WHERE i.order_id = v_order.id;

    UPDATE agent_stock_orders SET factory_order_id = v_factory_id WHERE id = v_order.id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'item_code', si.item_code,
        'item_name', si.name,
        'quantity', i.quantity,
        'unit', i.unit,
        'unit_price_rm', i.unit_price_rm,
        'line_total_rm', i.line_total_rm
      ) ORDER BY si.name
    ), '[]'::jsonb)
    INTO v_items
    FROM agent_stock_order_items i
    JOIN stock_items si ON si.id = i.stock_item_id
    WHERE i.order_id = v_order.id;

    v_receipt_number := next_agent_receipt_number(v_pay.organization_id);
    v_receipt_data := jsonb_build_object(
      'receipt_number', v_receipt_number,
      'issued_at', now(),
      'issuer', jsonb_build_object(
        'code', COALESCE(v_entity.code, 'RKJ_DIST'),
        'legal_name', COALESCE(v_entity.legal_name, 'RKJ Distributor Sdn Bhd'),
        'name', COALESCE(v_entity.name, 'RKJ Distributor')
      ),
      'agent', jsonb_build_object(
        'company_name', v_agent.company_name,
        'registration_no', v_agent.registration_no,
        'contact_person', v_agent.contact_person,
        'contact_email', v_agent.contact_email
      ),
      'purpose', 'STOCK_ORDER',
      'payment', jsonb_build_object(
        'id', v_pay.id,
        'method', v_pay.payment_method,
        'amount_rm', v_pay.amount_rm,
        'gateway_ref', COALESCE(p_gateway_ref, v_pay.gateway_ref),
        'paid_at', now()
      ),
      'order', jsonb_build_object(
        'id', v_order.id,
        'order_number', v_order.order_number,
        'production_date', v_order.production_date,
        'total_amount_rm', v_order.total_amount_rm,
        'items', v_items,
        'factory_order_id', v_factory_id
      )
    );

    INSERT INTO agent_payment_receipts (organization_id, payment_id, receipt_number, receipt_data)
    VALUES (v_pay.organization_id, p_payment_id, v_receipt_number, v_receipt_data)
    RETURNING id INTO v_receipt_id;

    RETURN jsonb_build_object(
      'ok', true,
      'purpose', 'STOCK_ORDER',
      'factory_order_id', v_factory_id,
      'receipt_number', v_receipt_number,
      'receipt_id', v_receipt_id
    );

  ELSIF v_pay.purpose = 'POS_SUBSCRIPTION' THEN
    SELECT * INTO v_sub FROM agent_outlet_subscriptions WHERE id = v_pay.reference_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Langganan tidak dijumpai'; END IF;

    SELECT * INTO v_outlet FROM agent_outlets WHERE id = v_sub.outlet_id;

    UPDATE agent_outlet_subscriptions SET
      status = 'ACTIVE',
      payment_id = p_payment_id
    WHERE id = v_sub.id;

    UPDATE agent_outlets SET
      subscription_active = true,
      pos_enabled = true,
      status = 'ACTIVE',
      updated_at = now()
    WHERE id = v_sub.outlet_id;

    v_receipt_number := next_agent_receipt_number(v_pay.organization_id);
    v_receipt_data := jsonb_build_object(
      'receipt_number', v_receipt_number,
      'issued_at', now(),
      'issuer', jsonb_build_object(
        'code', COALESCE(v_entity.code, 'RKJ_DIST'),
        'legal_name', COALESCE(v_entity.legal_name, 'RKJ Distributor Sdn Bhd'),
        'name', COALESCE(v_entity.name, 'RKJ Distributor')
      ),
      'agent', jsonb_build_object(
        'company_name', v_agent.company_name,
        'registration_no', v_agent.registration_no,
        'contact_person', v_agent.contact_person,
        'contact_email', v_agent.contact_email
      ),
      'purpose', 'POS_SUBSCRIPTION',
      'payment', jsonb_build_object(
        'id', v_pay.id,
        'method', v_pay.payment_method,
        'amount_rm', v_pay.amount_rm,
        'gateway_ref', COALESCE(p_gateway_ref, v_pay.gateway_ref),
        'paid_at', now()
      ),
      'subscription', jsonb_build_object(
        'id', v_sub.id,
        'outlet_code', v_outlet.outlet_code,
        'outlet_name', v_outlet.outlet_name,
        'period_start', v_sub.period_start,
        'period_end', v_sub.period_end,
        'amount_rm', v_sub.amount_rm
      )
    );

    INSERT INTO agent_payment_receipts (organization_id, payment_id, receipt_number, receipt_data)
    VALUES (v_pay.organization_id, p_payment_id, v_receipt_number, v_receipt_data)
    RETURNING id INTO v_receipt_id;

    RETURN jsonb_build_object(
      'ok', true,
      'purpose', 'POS_SUBSCRIPTION',
      'outlet_id', v_sub.outlet_id,
      'receipt_number', v_receipt_number,
      'receipt_id', v_receipt_id
    );
  END IF;

  RAISE EXCEPTION 'Tujuan pembayaran tidak disokong';
END;
$$;

ALTER TABLE agent_payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_receipts_select ON agent_payment_receipts FOR SELECT USING (
  organization_id = public.organization_id()
  AND (
    public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER')
    OR payment_id IN (
      SELECT p.id FROM agent_online_payments p
      JOIN sales_agent_accounts a ON a.id = p.agent_account_id
      WHERE a.profile_id = auth.uid()
    )
  )
);
