-- Make offline POS replay safe when the server commits a sale but the HTTP
-- response is lost. The same organization/offline_id must return the durable
-- receipt instead of creating a second transaction and deducting stock twice.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pos_transactions
    WHERE offline_id IS NOT NULL
    GROUP BY organization_id, offline_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate POS offline_id rows already exist. Audit them before enabling the unique replay guard.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tx_offline_org_unique
  ON public.pos_transactions (organization_id, offline_id)
  WHERE offline_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.process_pos_sale(
  p_shift_id UUID,
  p_branch_id UUID,
  p_items JSONB,
  p_payment_method payment_method,
  p_cash_amount NUMERIC,
  p_qr_amount NUMERIC,
  p_discount NUMERIC DEFAULT 0,
  p_offline_id TEXT DEFAULT NULL,
  p_receipt_email TEXT DEFAULT NULL,
  p_receipt_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_existing RECORD;
  v_existing_items JSONB;
  v_payload_items JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'No branch access';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE id = v_user_id
    AND status = 'ACTIVE';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Active sale actor not found';
  END IF;

  IF p_offline_id IS NOT NULL THEN
    IF NULLIF(btrim(p_offline_id), '') IS NULL OR length(p_offline_id) > 128 THEN
      RAISE EXCEPTION 'Invalid offline sale id';
    END IF;

    -- Serialize all retries for this organization/offline identity. The unique
    -- index is the final database guard; this lock lets the losing retry return
    -- the original receipt rather than surfacing a constraint error.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_org_id::text || ':' || p_offline_id, 0)
    );

    SELECT
      tx.*,
      receipt.receipt_number AS stored_receipt_number,
      receipt.receipt_data AS stored_receipt_data
    INTO v_existing
    FROM public.pos_transactions tx
    LEFT JOIN LATERAL (
      SELECT r.receipt_number, r.receipt_data
      FROM public.pos_receipts r
      WHERE r.transaction_id = tx.id
      ORDER BY r.created_at ASC, r.id ASC
      LIMIT 1
    ) receipt ON true
    WHERE tx.organization_id = v_org_id
      AND tx.offline_id = p_offline_id
    LIMIT 1;

    IF FOUND THEN
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'product_id', grouped.product_id::text,
            'quantity', grouped.quantity
          )
          ORDER BY grouped.product_id::text
        ),
        '[]'::jsonb
      )
      INTO v_existing_items
      FROM (
        SELECT product_id, sum(quantity)::INTEGER AS quantity
        FROM public.pos_transaction_items
        WHERE transaction_id = v_existing.id
        GROUP BY product_id
      ) grouped;

      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'product_id', grouped.product_id::text,
            'quantity', grouped.quantity
          )
          ORDER BY grouped.product_id::text
        ),
        '[]'::jsonb
      )
      INTO v_payload_items
      FROM (
        SELECT
          (item->>'product_id')::UUID AS product_id,
          sum((item->>'quantity')::INTEGER)::INTEGER AS quantity
        FROM jsonb_array_elements(p_items) item
        GROUP BY (item->>'product_id')::UUID
      ) grouped;

      IF v_existing.branch_id <> p_branch_id
        OR v_existing.shift_id <> p_shift_id
        OR v_existing.payment_method <> p_payment_method
        OR v_existing.cash_amount <> COALESCE(p_cash_amount, 0)
        OR v_existing.qr_amount <> COALESCE(p_qr_amount, 0)
        OR v_existing.discount <> COALESCE(p_discount, 0)
        OR v_existing_items <> v_payload_items THEN
        RAISE EXCEPTION
          'Offline sale id was already used with a different payload';
      END IF;

      IF v_existing.stored_receipt_data IS NULL THEN
        RAISE EXCEPTION
          'Offline sale exists but its durable receipt is unavailable';
      END IF;

      RETURN jsonb_build_object(
        'transaction_id', v_existing.id,
        'transaction_number', v_existing.transaction_number,
        'receipt_number', v_existing.stored_receipt_number
      ) || v_existing.stored_receipt_data;
    END IF;
  END IF;

  RETURN public.process_pos_sale_internal(
    v_user_id,
    p_shift_id,
    p_branch_id,
    p_items,
    p_payment_method,
    p_cash_amount,
    p_qr_amount,
    p_discount,
    p_offline_id,
    p_receipt_email,
    p_receipt_phone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_pos_sale(
  UUID, UUID, JSONB, payment_method, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_pos_sale(
  UUID, UUID, JSONB, payment_method, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) TO authenticated, service_role;
