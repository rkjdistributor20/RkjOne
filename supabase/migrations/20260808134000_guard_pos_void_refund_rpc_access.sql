-- Void and refund are financial mutations. The public two-argument RPCs used
-- auth.uid() but did not enforce the management roles required by the API.
-- Keep the application guards and repeat the authoritative checks here using
-- an explicit actor supplied only by a service-role server route.

CREATE OR REPLACE FUNCTION public.void_pos_transaction_internal(
  p_transaction_id UUID,
  p_reason TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_tx public.pos_transactions%ROWTYPE;
  v_deduction RECORD;
  v_branch_region_id UUID;
BEGIN
  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_id
    AND status = 'ACTIVE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active POS actor not found';
  END IF;

  SELECT * INTO v_tx
  FROM public.pos_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  IF v_tx.organization_id <> v_actor.organization_id THEN
    RAISE EXCEPTION 'Transaction organization mismatch';
  END IF;
  SELECT region_id INTO v_branch_region_id
  FROM public.branches
  WHERE id = v_tx.branch_id
    AND organization_id = v_actor.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS void branch access denied';
  END IF;
  IF v_actor.role NOT IN (
    'SUPER_ADMIN'::public.user_role,
    'ADMIN'::public.user_role,
    'OPERATION_MANAGER'::public.user_role,
    'AREA_MANAGER'::public.user_role
  ) THEN
    RAISE EXCEPTION 'POS void role not permitted';
  END IF;
  IF v_actor.role = 'AREA_MANAGER'::public.user_role THEN
    IF v_actor.region_id IS NULL
      OR v_branch_region_id IS DISTINCT FROM v_actor.region_id THEN
      RAISE EXCEPTION 'POS void branch access denied';
    END IF;
  END IF;
  IF v_tx.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Only completed transactions can be voided';
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Void reason must contain at least 5 characters';
  END IF;

  UPDATE public.pos_transactions
  SET status = 'VOIDED',
      void_reason = trim(p_reason),
      voided_by = v_actor.id,
      voided_at = now(),
      updated_at = now()
  WHERE id = v_tx.id;

  FOR v_deduction IN
    SELECT *
    FROM public.pos_stock_deductions
    WHERE transaction_id = v_tx.id
  LOOP
    INSERT INTO public.stock_movements (
      organization_id,
      movement_type,
      location_id,
      stock_item_id,
      quantity,
      unit,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      v_tx.organization_id,
      'ADJUSTMENT',
      v_deduction.location_id,
      v_deduction.stock_item_id,
      v_deduction.quantity,
      v_deduction.unit,
      'void_transaction',
      v_tx.id,
      'Void restore: ' || trim(p_reason),
      v_actor.id
    );
  END LOOP;

  UPDATE public.pos_shifts
  SET total_sales = total_sales - v_tx.total,
      total_cash = total_cash - v_tx.cash_amount,
      total_qr = total_qr - v_tx.qr_amount,
      transaction_count = GREATEST(transaction_count - 1, 0),
      updated_at = now()
  WHERE id = v_tx.shift_id;

  PERFORM public.refresh_pos_daily_summary(
    v_tx.organization_id,
    v_tx.branch_id,
    v_tx.created_at::date
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_pos_transaction_internal(
  p_transaction_id UUID,
  p_reason TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_tx public.pos_transactions%ROWTYPE;
  v_deduction RECORD;
BEGIN
  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_id
    AND status = 'ACTIVE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active POS actor not found';
  END IF;

  SELECT * INTO v_tx
  FROM public.pos_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  IF v_tx.organization_id <> v_actor.organization_id THEN
    RAISE EXCEPTION 'Transaction organization mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches
    WHERE id = v_tx.branch_id
      AND organization_id = v_actor.organization_id
  ) THEN
    RAISE EXCEPTION 'POS refund branch access denied';
  END IF;
  IF v_actor.role NOT IN (
    'SUPER_ADMIN'::public.user_role,
    'ADMIN'::public.user_role,
    'FINANCE'::public.user_role
  ) THEN
    RAISE EXCEPTION 'POS refund role not permitted';
  END IF;
  IF v_tx.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Only completed transactions can be refunded';
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Refund reason must contain at least 5 characters';
  END IF;

  UPDATE public.pos_transactions
  SET status = 'REFUNDED',
      refund_reason = trim(p_reason),
      refunded_by = v_actor.id,
      refunded_at = now(),
      updated_at = now()
  WHERE id = v_tx.id;

  FOR v_deduction IN
    SELECT *
    FROM public.pos_stock_deductions
    WHERE transaction_id = v_tx.id
  LOOP
    INSERT INTO public.stock_movements (
      organization_id,
      movement_type,
      location_id,
      stock_item_id,
      quantity,
      unit,
      reference_type,
      reference_id,
      notes,
      created_by
    ) VALUES (
      v_tx.organization_id,
      'ADJUSTMENT',
      v_deduction.location_id,
      v_deduction.stock_item_id,
      v_deduction.quantity,
      v_deduction.unit,
      'refund_transaction',
      v_tx.id,
      'Refund restore: ' || trim(p_reason),
      v_actor.id
    );
  END LOOP;

  UPDATE public.pos_shifts
  SET total_sales = total_sales - v_tx.total,
      total_cash = total_cash - v_tx.cash_amount,
      total_qr = total_qr - v_tx.qr_amount,
      updated_at = now()
  WHERE id = v_tx.shift_id;

  PERFORM public.refresh_pos_daily_summary(
    v_tx.organization_id,
    v_tx.branch_id,
    v_tx.created_at::date
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx.id);
END;
$$;

REVOKE ALL ON FUNCTION public.void_pos_transaction(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_pos_transaction(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.void_pos_transaction_internal(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_pos_transaction_internal(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.void_pos_transaction_internal(UUID, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_pos_transaction_internal(UUID, TEXT, UUID)
  TO service_role;
