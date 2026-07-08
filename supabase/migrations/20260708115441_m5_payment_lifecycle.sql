-- RKJ One M5: payment session, cancel, refund lifecycle.
-- Reviewed during M6 release gate on 2026-07-08.

ALTER TABLE public.agent_online_payments
 ADD COLUMN IF NOT EXISTS provider TEXT,
 ADD COLUMN IF NOT EXISTS gateway_session_id TEXT,
 ADD COLUMN IF NOT EXISTS checkout_url TEXT,
 ADD COLUMN IF NOT EXISTS failure_reason TEXT,
 ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS refund_ref TEXT,
 ADD COLUMN IF NOT EXISTS refund_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_online_payments_gateway_session
 ON public.agent_online_payments(gateway_session_id)
 WHERE gateway_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_online_payments_provider_created
 ON public.agent_online_payments(provider, created_at DESC)
 WHERE provider IS NOT NULL;

GRANT SELECT, UPDATE ON TABLE public.agent_online_payments TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_agent_payment(
 p_payment_id UUID,
 p_gateway_ref TEXT DEFAULT NULL,
 p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_pay agent_online_payments%ROWTYPE;
BEGIN
 SELECT * INTO v_pay
 FROM agent_online_payments
 WHERE id = p_payment_id
 FOR UPDATE;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Pembayaran tidak dijumpai';
 END IF;

 IF v_pay.status = 'PAID' THEN
 RAISE EXCEPTION 'Pembayaran sudah disahkan. Gunakan refund flow.';
 END IF;

 IF v_pay.status = 'REFUNDED' THEN
 RETURN jsonb_build_object('ok', true, 'already_refunded', true);
 END IF;

 IF v_pay.status = 'FAILED' AND v_pay.cancelled_at IS NOT NULL THEN
 RETURN jsonb_build_object('ok', true, 'already_cancelled', true);
 END IF;

 UPDATE agent_online_payments
 SET
 status = 'FAILED',
 gateway_ref = COALESCE(p_gateway_ref, gateway_ref),
 failure_reason = COALESCE(NULLIF(p_reason, ''), 'CANCELLED'),
 cancelled_at = now(),
 updated_at = now()
 WHERE id = p_payment_id;

 IF v_pay.purpose = 'POS_SUBSCRIPTION' THEN
 UPDATE agent_outlet_subscriptions
 SET status = 'CANCELLED'
 WHERE id = v_pay.reference_id
 AND status = 'PENDING';
 END IF;

 RETURN jsonb_build_object(
 'ok', true,
 'payment_id', p_payment_id,
 'status', 'CANCELLED',
 'purpose', v_pay.purpose
 );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_agent_payment(
 p_payment_id UUID,
 p_refund_ref TEXT DEFAULT NULL,
 p_reason TEXT DEFAULT NULL,
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
BEGIN
 SELECT * INTO v_pay
 FROM agent_online_payments
 WHERE id = p_payment_id
 FOR UPDATE;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Pembayaran tidak dijumpai';
 END IF;

 IF v_pay.status = 'REFUNDED' THEN
 RETURN jsonb_build_object('ok', true, 'already_refunded', true);
 END IF;

 IF v_pay.status <> 'PAID' THEN
 RAISE EXCEPTION 'Hanya pembayaran PAID boleh direfund (status: %)', v_pay.status;
 END IF;

 IF v_pay.purpose = 'STOCK_ORDER' THEN
 SELECT * INTO v_order
 FROM agent_stock_orders
 WHERE id = v_pay.reference_id
 FOR UPDATE;

 IF FOUND AND v_order.status = 'FULFILLED' THEN
 RAISE EXCEPTION 'Order sudah fulfilled. Refund perlu proses manual finance.';
 END IF;

 IF FOUND THEN
 UPDATE agent_stock_orders
 SET status = 'CANCELLED',
 updated_at = now()
 WHERE id = v_order.id
 AND status IN ('PAID', 'SUBMITTED_FACTORY', 'ACKNOWLEDGED');

 UPDATE factory_agent_orders
 SET status = 'CANCELLED'
 WHERE agent_order_id = v_order.id
 AND status IN ('SUBMITTED', 'ACKNOWLEDGED');
 END IF;

 ELSIF v_pay.purpose = 'POS_SUBSCRIPTION' THEN
 SELECT * INTO v_sub
 FROM agent_outlet_subscriptions
 WHERE id = v_pay.reference_id
 FOR UPDATE;

 IF FOUND THEN
 UPDATE agent_outlet_subscriptions
 SET status = 'CANCELLED'
 WHERE id = v_sub.id;

 UPDATE agent_outlets
 SET
 subscription_active = false,
 pos_enabled = false,
 updated_at = now()
 WHERE id = v_sub.outlet_id;
 END IF;
 END IF;

 UPDATE agent_online_payments
 SET
 status = 'REFUNDED',
 gateway_ref = COALESCE(p_gateway_ref, gateway_ref),
 refund_ref = p_refund_ref,
 refund_reason = p_reason,
 refunded_at = now(),
 updated_at = now()
 WHERE id = p_payment_id;

 RETURN jsonb_build_object(
 'ok', true,
 'payment_id', p_payment_id,
 'status', 'REFUNDED',
 'purpose', v_pay.purpose,
 'refund_ref', p_refund_ref
 );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_agent_payment(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_agent_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_agent_payment(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_agent_payment(UUID, TEXT, TEXT, TEXT) TO service_role;;
