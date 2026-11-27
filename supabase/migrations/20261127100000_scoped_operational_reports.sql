-- Report reads only. Use the caller's session, existing RLS, and an explicit
-- branch gate even on tables whose base policies are organization-wide.
CREATE SCHEMA report_internal;
REVOKE ALL ON SCHEMA report_internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA report_internal TO authenticated;

CREATE FUNCTION report_internal.branches(p_branch_id uuid)
RETURNS TABLE (id uuid, organization_id uuid, branch_code text, branch_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
  SELECT b.id, b.organization_id, b.branch_code, b.branch_name FROM public.branches b
  WHERE b.organization_id = (SELECT public.organization_id())
    AND (p_branch_id IS NULL OR b.id = p_branch_id)
    AND (SELECT public.user_role()) IN (
      'SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE',
      'CEO_FACTORY', 'AREA_MANAGER', 'MAINTENANCE_MANAGER'
    )
    AND public.has_branch_access(b.id)
$$;

CREATE FUNCTION report_internal.sales(p_branch_id uuid, p_start timestamptz, p_end timestamptz, p_transaction_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, branch_id uuid, shift_id uuid, cashier_id uuid, transaction_number text,
  status text, sold_at timestamptz, payment_method text, total numeric, cash numeric,
  qr_confirmed numeric, qr_pending numeric, qr_unverified numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
  WITH scope AS MATERIALIZED (SELECT id, organization_id FROM report_internal.branches(p_branch_id)),
  candidate_ids AS (
    SELECT t.id
    FROM scope b JOIN public.pos_operational_transactions t
      ON (t.organization_id, t.branch_id) = (b.organization_id, b.id)
    WHERE t.created_at >= p_start AND t.created_at < p_end
      AND (p_transaction_id IS NULL OR t.id = p_transaction_id)
    UNION
    -- A provider may post later than the original checkout, even on another day.
    SELECT p.transaction_id
    FROM scope b JOIN public.pos_online_payments p
      ON (p.organization_id, p.branch_id) = (b.organization_id, b.id)
    WHERE p.paid_at IS NOT NULL AND p.provider <> 'manual_qr'
      AND p.transaction_id IS NOT NULL AND p.created_at >= p_start AND p.created_at < p_end
      AND (p_transaction_id IS NULL OR p.transaction_id = p_transaction_id)
  )
  SELECT t.id, t.branch_id, t.shift_id, t.created_by, t.transaction_number,
    t.status::text, basis.sold_at, t.payment_method::text, t.total,
    CASE WHEN t.payment_method IN ('CASH', 'MIXED')
      THEN least(t.total, greatest(0, t.cash_amount - t.change_amount)) ELSE 0 END,
    CASE WHEN evidence.confirmed THEN t.qr_amount ELSE 0 END,
    CASE WHEN NOT evidence.confirmed AND evidence.pending THEN t.qr_amount ELSE 0 END,
    CASE WHEN t.payment_method IN ('QR', 'MIXED') AND NOT evidence.confirmed AND NOT evidence.pending
      THEN t.qr_amount ELSE 0 END
  FROM candidate_ids c JOIN public.pos_operational_transactions t ON t.id = c.id
  JOIN scope b ON (t.organization_id, t.branch_id) = (b.organization_id, b.id)
  CROSS JOIN LATERAL (
    SELECT
      coalesce(bool_or(p.status = 'PAID' AND p.paid_at IS NOT NULL), false) AS confirmed,
      coalesce(bool_or(p.status IN ('PENDING', 'REPORTED', 'QUARANTINED')), false) AS pending,
      CASE WHEN count(*) FILTER (WHERE proof.original_checkout) = 1
        THEN min(p.created_at) FILTER (WHERE proof.original_checkout) END AS original_checkout_at
    FROM public.pos_online_payments p
    CROSS JOIN LATERAL (SELECT p.provider <> 'manual_qr' AND p.paid_at IS NOT NULL
      AND p.created_by = t.created_by AND p.created_at <= t.created_at AS original_checkout) proof
    WHERE (p.transaction_id, p.organization_id, p.branch_id, p.shift_id) =
      (t.id, t.organization_id, t.branch_id, t.shift_id)
      AND t.payment_method IN ('QR', 'MIXED') AND t.qr_amount > 0 AND p.amount_rm = t.qr_amount
      AND NOT EXISTS (SELECT 1 FROM public.pos_trial_payment_markers m WHERE m.payment_id = p.id)
  ) evidence
  CROSS JOIN LATERAL (SELECT coalesce(evidence.original_checkout_at, t.created_at) AS sold_at) basis
  WHERE basis.sold_at >= p_start AND basis.sold_at < p_end
$$;

CREATE FUNCTION public.read_scoped_report(
  p_report text, p_from date, p_to date, p_branch_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0,
  p_movement_type text DEFAULT NULL, p_transaction_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE
  v_org uuid := public.organization_id();
  v_role public.user_role := public.user_role();
  v_org_wide boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
BEGIN
  IF v_org IS NULL OR v_role IS NULL OR v_role NOT IN (
    'SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE',
    'CEO_FACTORY', 'AREA_MANAGER', 'MAINTENANCE_MANAGER'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Tiada akses laporan';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM report_internal.branches(p_branch_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Tiada akses cawangan ini';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to)
    OR p_from < DATE '1900-01-01' OR p_to > DATE '9999-12-31'
    OR p_to < p_from OR (p_to::timestamp - p_from::timestamp) > INTERVAL '365 days'
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5001
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Penapis laporan tidak sah';
  END IF;
  v_start := p_from::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_end := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_org_wide := p_branch_id IS NULL AND v_role IN (
    'SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'HR', 'FINANCE', 'CEO_FACTORY'
  );

  IF p_report = 'scope' THEN
    SELECT jsonb_build_object(
      'branches', coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', branch_code, 'name', branch_name)
        ORDER BY branch_code, id), '[]'::jsonb),
      'organization_wide', v_org_wide
    ) INTO v_result FROM report_internal.branches(p_branch_id);
    RETURN v_result;
  END IF;

  IF p_report = 'fleet' THEN
    IF NOT v_org_wide THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Laporan logistik hanya untuk skop organisasi';
    END IF;
    SELECT jsonb_build_object('fleet', jsonb_build_object(
      'total_orders', count(*) FILTER (WHERE d.created_at >= v_start AND d.created_at < v_end),
      'pending', count(*) FILTER (WHERE d.status = 'PENDING'),
      'in_transit', count(*) FILTER (WHERE d.status = 'IN_TRANSIT'),
      'delivered', count(*) FILTER (WHERE d.status = 'DELIVERED' AND d.created_at >= v_start AND d.created_at < v_end)
    )) INTO v_result FROM public.delivery_orders d WHERE d.organization_id = v_org;
    RETURN v_result;
  END IF;

  IF p_report IN ('inventory', 'movements', 'overview') THEN
    -- Reuse this scope for the stock list and its overview count. HQ may
    -- include its own unassigned locations only in the organization view.
    WITH locations AS MATERIALIZED (
      SELECT l.id, l.branch_id, b.branch_name, l.name
      FROM public.inventory_locations l
      LEFT JOIN report_internal.branches(p_branch_id) b ON b.id = l.branch_id
      WHERE l.organization_id = v_org AND (b.id IS NOT NULL OR (v_org_wide AND l.branch_id IS NULL))
        AND (v_role <> 'AREA_MANAGER' OR l.location_type = 'BRANCH_KIOSK')
    ),
    balances AS (
      SELECT i.id, l.branch_id, l.branch_name, l.name AS location_name,
        s.item_code, s.name, i.quantity, i.unit,
        CASE WHEN i.quantity <= s.critical_threshold THEN 'CRITICAL'
             WHEN i.quantity <= s.min_threshold THEN 'LOW' ELSE 'OK' END AS status
      FROM public.inventory_balances i JOIN locations l ON l.id = i.location_id
      JOIN public.stock_items s ON s.id = i.stock_item_id AND s.organization_id = v_org
      WHERE i.organization_id = v_org AND p_report <> 'movements'
    )
    SELECT CASE p_report
      WHEN 'overview' THEN jsonb_build_object('low_stock_count', (SELECT count(*) FROM balances WHERE status <> 'OK'))
      WHEN 'inventory' THEN jsonb_build_object('items', coalesce((
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.priority, x.quantity, x.id) FROM (
          SELECT *, CASE status WHEN 'CRITICAL' THEN 0 WHEN 'LOW' THEN 1 ELSE 2 END AS priority
          FROM balances ORDER BY priority, quantity, id LIMIT p_limit OFFSET p_offset
        ) x
      ), '[]'::jsonb))
      ELSE jsonb_build_object('movements', coalesce((
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id DESC) FROM (
          SELECT m.id, l.branch_id, l.branch_name, l.name AS location_name, s.item_code, s.name,
            m.movement_type, m.quantity, m.unit, m.balance_before, m.balance_after,
            m.reference_type, m.reference_id, m.created_by, actor.full_name AS actor_name, m.created_at
          FROM public.stock_movements m JOIN locations l ON l.id = m.location_id
          JOIN public.stock_items s ON s.id = m.stock_item_id AND s.organization_id = v_org
          LEFT JOIN public.profiles actor ON actor.id = m.created_by AND actor.organization_id = v_org
          WHERE m.organization_id = v_org AND m.created_at >= v_start AND m.created_at < v_end
            AND CASE p_movement_type
              WHEN 'INBOUND' THEN m.quantity > 0
              WHEN 'OUTBOUND' THEN m.quantity < 0
              WHEN 'TRANSFER' THEN m.movement_type IN ('TRANSFER_IN', 'TRANSFER_OUT')
              ELSE p_movement_type IS NULL OR m.movement_type::text = p_movement_type
            END
          ORDER BY m.created_at DESC, m.id DESC LIMIT p_limit OFFSET p_offset
        ) x
      ), '[]'::jsonb))
    END INTO v_result;
    IF p_report <> 'overview' THEN RETURN v_result; END IF;
  END IF;

  IF p_report = 'overview' THEN
    SELECT v_result || jsonb_build_object(
      'period_start', p_from, 'period_end', p_to, 'organization_wide', v_org_wide,
      'total_sales', coalesce(sum(s.total) FILTER (WHERE s.status = 'COMPLETED'), 0),
      'total_cash', coalesce(sum(s.cash) FILTER (WHERE s.status = 'COMPLETED'), 0),
      'total_qr', coalesce(sum(s.qr_confirmed) FILTER (WHERE s.status = 'COMPLETED'), 0),
      'pending_qr', coalesce(sum(s.qr_pending) FILTER (WHERE s.status = 'COMPLETED'), 0),
      'unverified_qr', coalesce(sum(s.qr_unverified) FILTER (WHERE s.status = 'COMPLETED'), 0),
      'transaction_count', count(*) FILTER (WHERE s.status = 'COMPLETED'),
      'void_count', count(*) FILTER (WHERE s.status = 'VOIDED'),
      'refund_count', count(*) FILTER (WHERE s.status = 'REFUNDED')
    ) INTO v_result FROM report_internal.sales(p_branch_id, v_start, v_end) s;

    IF v_org_wide THEN
      SELECT v_result || jsonb_build_object('payroll_runs', count(*), 'payroll_net', coalesce(sum(r.total_net), 0))
      INTO v_result FROM public.payroll_runs r
      WHERE r.organization_id = v_org AND r.status = 'APPROVED' AND r.period_start >= p_from AND r.period_end <= p_to;
      SELECT v_result || jsonb_build_object('outstanding_cash', coalesce(sum(c.amount), 0))
      INTO v_result FROM public.finance_collections c WHERE c.organization_id = v_org AND c.status = 'PENDING';
      SELECT v_result || jsonb_build_object(
        'deliveries_pending', count(*) FILTER (WHERE d.status IN ('PENDING', 'IN_TRANSIT')),
        'deliveries_completed', count(*) FILTER (WHERE d.status = 'DELIVERED' AND d.created_at >= v_start AND d.created_at < v_end)
      ) INTO v_result FROM public.delivery_orders d WHERE d.organization_id = v_org;
    END IF;
    RETURN jsonb_build_object('overview', v_result);
  END IF;

  IF p_report IN ('sales', 'branches') THEN
    SELECT jsonb_build_object(CASE WHEN p_report = 'sales' THEN 'trend' ELSE 'branches' END, coalesce(
      jsonb_agg(to_jsonb(x) ORDER BY x.period, x.total_sales DESC, x.branch_id), '[]'::jsonb
    )) INTO v_result FROM (
      SELECT CASE WHEN p_report = 'sales' THEN (s.sold_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date END AS period,
        b.id AS branch_id, b.branch_code, b.branch_name, r.name AS region_name,
        sum(s.total) AS total_sales, sum(s.cash) AS total_cash, sum(s.qr_confirmed) AS total_qr,
        sum(s.qr_pending) AS pending_qr, sum(s.qr_unverified) AS unverified_qr,
        count(*) AS transaction_count
      FROM report_internal.sales(p_branch_id, v_start, v_end) s
      LEFT JOIN public.branches b ON p_report = 'branches' AND b.id = s.branch_id AND b.organization_id = v_org
      LEFT JOIN public.regions r ON r.id = b.region_id AND r.organization_id = v_org
      WHERE s.status = 'COMPLETED'
      GROUP BY 1, b.id, b.branch_code, b.branch_name, r.name
      ORDER BY period, total_sales DESC, b.id
      LIMIT CASE WHEN p_report = 'branches' THEN p_limit END
    ) x;
    RETURN v_result;
  END IF;

  IF p_report = 'products' THEN
    SELECT jsonb_build_object('products', coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.revenue DESC, x.sku), '[]'::jsonb))
    INTO v_result FROM (
      SELECT min(i.product_name) AS product_name, i.sku, sum(i.quantity) AS quantity_sold, sum(i.line_total) AS revenue
      FROM report_internal.sales(p_branch_id, v_start, v_end) s
      JOIN public.pos_transaction_items i ON i.transaction_id = s.id
      WHERE s.status = 'COMPLETED'
      GROUP BY i.sku ORDER BY revenue DESC, i.sku LIMIT p_limit
    ) x;
    RETURN v_result;
  END IF;

  IF p_report = 'staff' THEN
    SELECT jsonb_build_object('staff', coalesce(
      jsonb_agg(to_jsonb(x) ORDER BY x.total_sales DESC, x.branch_id, x.shift_id, x.cashier_id), '[]'::jsonb
    )) INTO v_result FROM (
      SELECT s.branch_id, b.branch_name, s.cashier_id, actor.full_name AS cashier_name, s.shift_id,
        sh.shift_number, sh.opened_at, coalesce(sh.actual_work_ended_at, sh.closed_at) AS closed_at,
        count(*) AS transaction_count, sum(s.total) AS total_sales
      FROM report_internal.sales(p_branch_id, v_start, v_end) s
      JOIN public.branches b ON b.id = s.branch_id AND b.organization_id = v_org
      LEFT JOIN public.profiles actor ON actor.id = s.cashier_id AND actor.organization_id = v_org
      LEFT JOIN public.pos_operational_shifts sh
        ON (sh.id, sh.organization_id, sh.branch_id) = (s.shift_id, v_org, s.branch_id)
      WHERE s.status = 'COMPLETED'
      GROUP BY s.branch_id, b.branch_name, s.cashier_id, actor.full_name, s.shift_id,
        sh.shift_number, sh.opened_at, coalesce(sh.actual_work_ended_at, sh.closed_at)
      ORDER BY total_sales DESC, s.branch_id, s.shift_id, s.cashier_id LIMIT p_limit OFFSET p_offset
    ) x;
    RETURN v_result;
  END IF;

  IF p_report IN ('transactions', 'receipt') THEN
    IF p_report = 'receipt' AND p_transaction_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Transaksi diperlukan';
    END IF;
    WITH page AS MATERIALIZED (
      SELECT * FROM report_internal.sales(p_branch_id, v_start, v_end,
        CASE WHEN p_report = 'receipt' THEN p_transaction_id END) s
      ORDER BY s.sold_at DESC, s.id DESC LIMIT p_limit OFFSET p_offset
    ),
    rows AS (
      SELECT s.*, b.branch_name, b.branch_code, actor.full_name AS cashier_name,
        sh.shift_number, r.receipt_number
      FROM page s
      JOIN public.branches b ON b.id = s.branch_id AND b.organization_id = v_org
      LEFT JOIN public.profiles actor ON actor.id = s.cashier_id AND actor.organization_id = v_org
      LEFT JOIN public.pos_operational_shifts sh
        ON (sh.id, sh.organization_id, sh.branch_id) = (s.shift_id, v_org, s.branch_id)
      LEFT JOIN LATERAL (
        SELECT receipt_number FROM public.pos_receipts WHERE transaction_id = s.id
        ORDER BY created_at, id LIMIT 1
      ) r ON true
    )
    SELECT CASE p_report WHEN 'transactions' THEN jsonb_build_object(
      'transactions', coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.sold_at DESC, x.id DESC), '[]'::jsonb)
    ) ELSE jsonb_build_object('receipt', (
      SELECT to_jsonb(r) || jsonb_build_object('items', coalesce((
        SELECT jsonb_agg(jsonb_build_object('name', i.product_name, 'sku', i.sku,
          'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total) ORDER BY i.id)
        FROM public.pos_transaction_items i WHERE i.transaction_id = r.id
      ), '[]'::jsonb)) FROM rows r
    )) END INTO v_result FROM rows x;
    RETURN v_result;
  END IF;

  IF p_report = 'payments' THEN
    -- These are unposted attempts, NOT sales or a collectible balance.
    SELECT jsonb_build_object('payments', coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb))
    INTO v_result FROM (
      SELECT p.id, b.branch_name, p.shift_id, sh.shift_number, p.created_by AS cashier_id,
        actor.full_name AS cashier_name, p.created_at, p.amount_rm, p.status
      FROM report_internal.branches(p_branch_id) b
      JOIN public.pos_online_payments p ON (p.organization_id, p.branch_id) = (b.organization_id, b.id)
      LEFT JOIN public.profiles actor ON actor.id = p.created_by AND actor.organization_id = v_org
      JOIN public.pos_operational_shifts sh
        ON (sh.id, sh.organization_id, sh.branch_id) = (p.shift_id, v_org, p.branch_id)
      WHERE p.transaction_id IS NULL AND p.created_at >= v_start AND p.created_at < v_end
        AND (p.status IN ('PENDING', 'REPORTED', 'QUARANTINED') OR (p.status = 'PAID' AND p.paid_at IS NOT NULL))
        AND NOT EXISTS (SELECT 1 FROM public.pos_trial_payment_markers m WHERE m.payment_id = p.id)
      ORDER BY p.created_at DESC, p.id DESC LIMIT p_limit OFFSET p_offset
    ) x;
    RETURN v_result;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Jenis laporan tidak sah';
END;
$$;

REVOKE ALL ON FUNCTION report_internal.branches(uuid), report_internal.sales(uuid, timestamptz, timestamptz, uuid),
  public.read_scoped_report(text, date, date, uuid, integer, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION report_internal.branches(uuid), report_internal.sales(uuid, timestamptz, timestamptz, uuid),
  public.read_scoped_report(text, date, date, uuid, integer, integer, text, uuid) TO authenticated;
