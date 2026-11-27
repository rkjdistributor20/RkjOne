-- Keep the deployed report calculations and access checks. Extend only the
-- POS read results; the original function remains an invoker in the private
-- reporting schema, not a second public RPC.
ALTER FUNCTION public.read_scoped_report(text, date, date, uuid, integer, integer, text, uuid)
  SET SCHEMA report_internal;

CREATE FUNCTION public.read_scoped_report(
  p_report text, p_from date, p_to date, p_branch_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0,
  p_movement_type text DEFAULT NULL, p_transaction_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE
  v_result jsonb := report_internal.read_scoped_report(
    CASE WHEN p_report = 'shift-closures' THEN 'scope' ELSE p_report END,
    p_from, p_to, p_branch_id, p_limit, p_offset, p_movement_type, p_transaction_id
  );
  v_org uuid;
  v_rows jsonb;
BEGIN
  IF p_report IN ('transactions', 'receipt') THEN
    IF p_report = 'receipt' AND v_result->'receipt' = 'null'::jsonb THEN RETURN v_result; END IF;
    v_org := public.organization_id();
    -- Attach reversal metadata to the original sale, not to the operator,
    -- active shift, or calendar day on which the reversal was recorded.
    SELECT coalesce(jsonb_agg(x.sale || jsonb_build_object(
      'reversed_at', CASE x.sale->>'status' WHEN 'VOIDED' THEN t.voided_at WHEN 'REFUNDED' THEN t.refunded_at END,
      'reversal_reason', CASE x.sale->>'status' WHEN 'VOIDED' THEN t.void_reason WHEN 'REFUNDED' THEN t.refund_reason END
    ) ORDER BY x.ord), '[]'::jsonb) INTO v_rows
    FROM jsonb_array_elements(CASE WHEN p_report = 'receipt' THEN jsonb_build_array(v_result->'receipt')
      ELSE v_result->'transactions' END) WITH ORDINALITY AS x(sale, ord)
    LEFT JOIN public.pos_operational_transactions t
      ON (t.id, t.organization_id, t.branch_id, t.shift_id, t.created_by) =
         ((x.sale->>'id')::uuid, v_org, (x.sale->>'branch_id')::uuid, (x.sale->>'shift_id')::uuid,
          (x.sale->>'cashier_id')::uuid);
    RETURN CASE WHEN p_report = 'receipt' THEN jsonb_build_object('receipt', v_rows->0)
      ELSE jsonb_build_object('transactions', v_rows) END;
  END IF;

  IF p_report = 'staff' THEN
    v_org := public.organization_id();
    -- A POS shift can have multiple cashiers and a cashier can rejoin it.
    -- Report the span of recorded attendance (not worked duration), on the
    -- original shift and branch; an open or missing end remains unknown.
    SELECT jsonb_build_object('staff', coalesce(jsonb_agg(x.row || jsonb_build_object(
      'shift_closed_at', sh.closed_at,
      'cashier_started_at', attendance.started_at, 'cashier_ended_at', attendance.ended_at
    ) ORDER BY x.ord), '[]'::jsonb)) INTO v_result
    FROM jsonb_array_elements(v_result->'staff') WITH ORDINALITY AS x(row, ord)
    LEFT JOIN public.pos_operational_shifts sh
      ON (sh.id, sh.organization_id, sh.branch_id) =
         ((x.row->>'shift_id')::uuid, v_org, (x.row->>'branch_id')::uuid)
    LEFT JOIN LATERAL (
      SELECT min(m.started_at) AS started_at,
        CASE WHEN bool_and(m.status = 'ENDED' AND m.ended_at IS NOT NULL) THEN max(m.ended_at) END AS ended_at
      FROM public.pos_shift_staff_members m
      WHERE (m.organization_id, m.branch_id, m.shift_id, m.profile_id) =
        (sh.organization_id, sh.branch_id, sh.id, (x.row->>'cashier_id')::uuid)
        AND m.status IN ('ACTIVE', 'ENDED')
    ) attendance ON true;
    RETURN v_result;
  END IF;

  IF p_report = 'shift-closures' THEN
    -- Cash counted minus expected as recorded at POS close. One row per
    -- closed operational shift, even with no sales or many cashiers. Never
    -- assign a shift-level variance to an individual or recompute the ledger.
    SELECT jsonb_build_object('closures', coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.closed_at DESC, x.shift_id DESC), '[]'::jsonb))
    INTO v_result FROM (
      SELECT b.branch_code, b.branch_name, sh.id AS shift_id, sh.shift_number, sh.opened_at, sh.closed_at,
        sh.actual_work_ended_at, sh.expected_cash, sh.closing_cash, sh.cash_variance
      FROM report_internal.branches(p_branch_id) b
      JOIN public.pos_operational_shifts sh ON (sh.organization_id, sh.branch_id) = (b.organization_id, b.id)
      WHERE sh.closed_at >= (p_from::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
        AND sh.closed_at < ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      ORDER BY sh.closed_at DESC, sh.id DESC LIMIT p_limit OFFSET p_offset
    ) x;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.read_scoped_report(text, date, date, uuid, integer, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_scoped_report(text, date, date, uuid, integer, integer, text, uuid)
  TO authenticated;
