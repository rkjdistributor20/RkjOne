-- Add a read-only workspace; do not replace the deployed report RPCs or change
-- any payment, POS, roster, or grant policy. Amounts are numeric MYR (not sen).
-- recorded_sales is the completed post-discount POS total, net_sales is the
-- fully confirmed subset, and confirmed is received tender (including partial
-- mixed sales). Both payment amounts are bucketed by sold_at, not paid_at.
-- As in report_internal.sales, use the recorded checkout and exact payment
-- linkage. Adapt that basis here for both datasets and for unbounded *selected*
-- shift totals, without exposing a different calculation to another view.
CREATE FUNCTION report_internal.operational_sales(
  p_branches uuid[], p_start timestamptz, p_end timestamptz, p_shifts uuid[],
  p_staff uuid, p_transaction uuid, p_trial boolean
) RETURNS TABLE (
  transaction_id uuid, branch_id uuid, shift_id uuid, cashier_id uuid,
  transaction_number text, status text, sold_at timestamptz, payment_confirmed_at timestamptz,
  reversed_at timestamptz, reversal_reason text, transaction_total numeric, discount_amount numeric, recorded_sales numeric,
  net_sales numeric, cash numeric, qr numeric, other numeric, confirmed numeric,
  sales_count integer, qr_expected numeric, tender_incomplete boolean, payment_duplicate boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $sales$
  WITH scope AS MATERIALIZED (
    SELECT b.id, b.organization_id FROM report_internal.branches(NULL) b
    WHERE b.id = ANY(p_branches) AND (SELECT public.user_role()) IN ('SUPER_ADMIN', 'ADMIN', 'AREA_MANAGER')
  ),
  candidate_ids AS (
    SELECT t.id
    FROM scope b JOIN public.pos_transactions t ON (t.organization_id, t.branch_id) = (b.organization_id, b.id)
    WHERE p_start IS NOT NULL AND t.created_at >= p_start AND t.created_at < p_end
      AND (p_shifts IS NULL OR t.shift_id = ANY(p_shifts))
      AND (p_transaction IS NULL OR t.id = p_transaction)
      AND (p_staff IS NULL OR t.created_by = p_staff)
    UNION
    -- Legacy providers posted at confirmation; recover the original checkout
    -- even if the transaction itself was inserted on a later MYT date.
    SELECT p.transaction_id
    FROM scope b JOIN public.pos_online_payments p ON (p.organization_id, p.branch_id) = (b.organization_id, b.id)
    WHERE p_start IS NOT NULL AND p.created_at >= p_start AND p.created_at < p_end
      AND p.paid_at IS NOT NULL AND p.provider <> 'manual_qr' AND p.transaction_id IS NOT NULL
      AND (p_transaction IS NULL OR p.transaction_id = p_transaction)
      AND (p_shifts IS NULL OR p.shift_id = ANY(p_shifts))
      AND (p_staff IS NULL OR p.created_by = p_staff)
    UNION
    SELECT t.id FROM public.pos_transactions t
    JOIN scope b ON (t.organization_id, t.branch_id) = (b.organization_id, b.id)
    WHERE p_start IS NULL AND p_end IS NULL AND t.shift_id = ANY(p_shifts)
      AND (p_transaction IS NULL OR t.id = p_transaction)
      AND (p_staff IS NULL OR t.created_by = p_staff)
  )
  SELECT t.id, t.branch_id, t.shift_id, t.created_by, t.transaction_number, t.status::text,
    basis.sold_at, payment.paid_at,
    CASE t.status WHEN 'VOIDED' THEN t.voided_at WHEN 'REFUNDED' THEN t.refunded_at END,
    CASE t.status WHEN 'VOIDED' THEN t.void_reason WHEN 'REFUNDED' THEN t.refund_reason END,
    t.total, t.discount, CASE WHEN t.status = 'COMPLETED' THEN t.total ELSE 0 END,
    CASE WHEN t.status = 'COMPLETED' AND valid.tender AND parts.cash + parts.qr = t.total THEN t.total ELSE 0 END,
    parts.cash, parts.qr, 0::numeric, parts.cash + parts.qr,
    (t.status = 'COMPLETED')::integer, tender.qr, t.status = 'COMPLETED' AND NOT valid.tender,
    payment.paid_matches > 1 OR payment.checkout_times > 1
  FROM candidate_ids c JOIN public.pos_transactions t ON t.id = c.id
  JOIN scope b ON (t.organization_id, t.branch_id) = (b.organization_id, b.id)
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM public.pos_trial_sale_markers m WHERE m.transaction_id = t.id)
      OR EXISTS (SELECT 1 FROM public.pos_trial_shift_markers m
        JOIN public.pos_shifts s ON s.id = m.shift_id
        WHERE (s.id, s.organization_id, s.branch_id) = (t.shift_id, t.organization_id, t.branch_id)) AS is_trial
  ) marked
  CROSS JOIN LATERAL (
    SELECT
      coalesce(bool_or(p.marked), false) AS is_trial,
      min(p.paid_at) FILTER (WHERE p.confirmed) AS paid_at,
      count(*) FILTER (WHERE p.confirmed) AS paid_matches,
      min(p.created_at) FILTER (WHERE p.original_checkout) AS first_checkout,
      count(DISTINCT p.created_at) FILTER (WHERE p.original_checkout) AS checkout_times
    FROM (
      SELECT p.paid_at, p.created_at, proof.exact_tender AND p.status = 'PAID' AND p.paid_at IS NOT NULL AS confirmed,
        proof.exact_tender AND p.provider <> 'manual_qr' AND p.paid_at IS NOT NULL
          AND p.created_by = t.created_by AND p.created_at <= t.created_at AS original_checkout,
        EXISTS (SELECT 1 FROM public.pos_trial_payment_markers m WHERE m.payment_id = p.id) AS marked
      FROM public.pos_online_payments p
      CROSS JOIN LATERAL (SELECT t.payment_method IN ('QR', 'MIXED')
        AND t.qr_amount > 0 AND p.amount_rm = t.qr_amount AS exact_tender) proof
      WHERE (p.transaction_id, p.organization_id, p.branch_id, p.shift_id) =
        (t.id, t.organization_id, t.branch_id, t.shift_id)
    ) p
  ) payment
  -- Conflicting original checkout timestamps cannot safely move a legacy
  -- sale to a different day. Keep its recorded timestamp and flag the case.
  CROSS JOIN LATERAL (
    SELECT coalesce(CASE WHEN payment.checkout_times = 1 THEN payment.first_checkout END, t.created_at) AS sold_at
  ) basis
  CROSS JOIN LATERAL (
    SELECT CASE WHEN t.payment_method IN ('CASH', 'MIXED')
      THEN greatest(0, t.cash_amount - t.change_amount) ELSE 0 END AS cash,
      CASE WHEN t.payment_method IN ('QR', 'MIXED') THEN greatest(0, t.qr_amount) ELSE 0 END AS qr
  ) tender
  CROSS JOIN LATERAL (
    SELECT t.total >= 0 AND t.cash_amount >= t.change_amount AND t.change_amount >= 0 AND t.qr_amount >= 0
      AND tender.cash + tender.qr = t.total
      AND CASE t.payment_method
        WHEN 'CASH' THEN t.qr_amount = 0
        WHEN 'QR' THEN t.cash_amount = 0 AND t.change_amount = 0
        WHEN 'MIXED' THEN tender.cash > 0 AND tender.qr > 0
        ELSE false END AS tender
  ) valid
  CROSS JOIN LATERAL (
    -- Net total already includes discounts. Reversals change the original
    -- status and write inventory movements, not a second financial sale.
    -- A part is counted once even if several payment attempts match.
    SELECT CASE WHEN t.status = 'COMPLETED' THEN greatest(0, least(t.total, tender.cash)) ELSE 0 END AS cash
  ) cash_part
  CROSS JOIN LATERAL (
    SELECT cash_part.cash, CASE WHEN t.status = 'COMPLETED' AND payment.paid_at IS NOT NULL
      THEN greatest(0, least(t.total - cash_part.cash, tender.qr)) ELSE 0 END AS qr
  ) parts
  WHERE (marked.is_trial OR payment.is_trial) = p_trial
    AND (p_start IS NULL OR (basis.sold_at >= p_start AND basis.sold_at < p_end))
    AND (p_shifts IS NULL OR t.shift_id = ANY(p_shifts))
    AND (p_staff IS NULL OR t.created_by = p_staff)
$sales$;

REVOKE ALL ON FUNCTION report_internal.operational_sales(uuid[], timestamptz, timestamptz, uuid[], uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION report_internal.operational_sales(uuid[], timestamptz, timestamptz, uuid[], uuid, uuid, boolean)
  TO authenticated;

CREATE FUNCTION public.read_operational_report(
  p_view text, p_from date, p_to date, p_branch_id uuid, p_am_id uuid, p_staff_id uuid,
  p_shift_id uuid, p_transaction_id uuid, p_data text, p_limit integer, p_offset integer,
  p_case_type text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $report$
DECLARE
  v_org uuid := public.organization_id();
  v_role public.user_role := public.user_role();
  v_can_filter_am boolean := coalesce(v_role IN ('SUPER_ADMIN', 'ADMIN'), false);
  v_start timestamptz;
  v_end timestamptz;
  v_trial boolean := p_data = 'trial';
  v_branch_options uuid[];
  v_branches uuid[];
  v_result jsonb;
  v_bank_in jsonb;
BEGIN
  IF v_org IS NULL OR v_role IS NULL OR v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'AREA_MANAGER') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Tiada akses laporan';
  END IF;
  IF p_view IS NULL OR p_view NOT IN ('summary', 'daily', 'shifts', 'actions', 'transactions', 'receipt')
     OR p_data IS NULL OR p_data NOT IN ('operational', 'trial')
     OR p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to)
     OR p_from < DATE '1900-01-01' OR p_to > DATE '9999-12-31' OR p_to < p_from
     OR (p_to::timestamp - p_from::timestamp) > INTERVAL '365 days'
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5001
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000
     OR (p_view = 'receipt' AND p_transaction_id IS NULL)
     OR (p_case_type IS NOT NULL AND (p_view <> 'actions' OR p_case_type NOT IN (
       'payment_pending', 'payment_unmatched', 'payment_duplicate', 'qr_unverified', 'cash_variance',
       'cash_count_missing', 'shift_open', 'shift_incomplete', 'transaction_incomplete'
     ))) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Penapis laporan tidak sah';
  END IF;
  IF p_am_id IS NOT NULL AND (NOT v_can_filter_am OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_am_id AND p.organization_id = v_org AND p.role = 'AREA_MANAGER' AND p.status = 'ACTIVE'
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Tiada akses penapis AM ini';
  END IF;

  v_start := p_from::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_end := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur';
  SELECT ARRAY(
    SELECT b.id FROM report_internal.branches(NULL) b
    WHERE p_am_id IS NULL OR EXISTS (
      SELECT 1 FROM public.profile_branch_access a WHERE a.branch_id = b.id AND a.profile_id = p_am_id
    )
    ORDER BY b.id
  ) INTO v_branch_options;
  IF p_branch_id IS NOT NULL AND NOT (p_branch_id = ANY(v_branch_options)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Tiada akses cawangan ini dalam skop dipilih';
  END IF;
  v_branches := CASE WHEN p_branch_id IS NULL THEN v_branch_options ELSE ARRAY[p_branch_id] END;
  IF p_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pos_shifts s
    WHERE s.id = p_shift_id AND s.organization_id = v_org AND s.branch_id = ANY(v_branches)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Tiada akses syif ini dalam skop dipilih';
  END IF;
  -- Validate a profile ID against real branch evidence, not the employee's
  -- current branch alone. Keep a previously selected staff filter on empty days.
  IF p_staff_id IS NOT NULL AND NOT (
    EXISTS (SELECT 1 FROM public.pos_shift_staff_members m
      WHERE m.profile_id = p_staff_id AND m.organization_id = v_org AND m.branch_id = ANY(v_branches)
        AND m.status IN ('ACTIVE', 'ENDED') AND EXISTS (SELECT 1 FROM public.pos_shifts s
          WHERE (s.id, s.organization_id, s.branch_id) = (m.shift_id, m.organization_id, m.branch_id)))
    OR EXISTS (SELECT 1 FROM public.pos_transactions t
      WHERE t.created_by = p_staff_id AND t.organization_id = v_org AND t.branch_id = ANY(v_branches))
    OR EXISTS (SELECT 1 FROM public.pos_online_payments p
      WHERE p.created_by = p_staff_id AND p.organization_id = v_org AND p.branch_id = ANY(v_branches))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Tiada akses staf ini dalam skop dipilih';
  END IF;

  WITH
  branch_options AS MATERIALIZED (
    SELECT b.id, b.branch_code, b.branch_name
    FROM report_internal.branches(NULL) b WHERE b.id = ANY(v_branch_options)
  ),
  scope AS MATERIALIZED (
    SELECT * FROM branch_options b WHERE b.id = ANY(v_branches)
  ),
  managers AS MATERIALIZED (
    SELECT DISTINCT a.branch_id, p.id, p.full_name AS name
    FROM public.profile_branch_access a
    JOIN public.profiles p ON p.id = a.profile_id AND p.organization_id = v_org
      AND p.role = 'AREA_MANAGER' AND p.status = 'ACTIVE'
    WHERE a.branch_id = ANY(v_branch_options)
  ),
  branch_info AS MATERIALIZED (
    SELECT b.*, ARRAY(SELECT DISTINCT m.name FROM managers m
      WHERE m.branch_id = b.id AND m.name IS NOT NULL ORDER BY m.name) AS manager_names
    FROM scope b
  ),
  known_shifts AS NOT MATERIALIZED (
    SELECT s.id, s.branch_id, s.shift_number, s.opened_at, s.closed_at, s.status::text AS shift_status,
      s.opening_cash, s.expected_cash, s.closing_cash,
      EXISTS (SELECT 1 FROM public.pos_trial_shift_markers m WHERE m.shift_id = s.id) AS marked
    FROM public.pos_shifts s
    WHERE s.organization_id = v_org AND s.branch_id = ANY(v_branches)
      AND (p_shift_id IS NULL OR s.id = p_shift_id)
  ),
  sales AS MATERIALIZED (
    SELECT s.*, (s.sold_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS day, sh.id AS matched_shift_id
    FROM report_internal.operational_sales(v_branches, v_start, v_end,
      CASE WHEN p_shift_id IS NOT NULL THEN ARRAY[p_shift_id] END, p_staff_id, p_transaction_id, v_trial) s
    LEFT JOIN known_shifts sh ON (sh.id, sh.branch_id) = (s.shift_id, s.branch_id)
    WHERE p_shift_id IS NULL OR sh.id IS NOT NULL
  ),
  period_shifts AS MATERIALIZED (
    SELECT s.* FROM known_shifts s
    WHERE p_transaction_id IS NULL AND s.marked = v_trial AND s.opened_at < v_end
      AND (s.closed_at > v_start OR (s.opened_at = s.closed_at AND s.opened_at >= v_start)
        OR (s.closed_at IS NULL AND CASE WHEN s.shift_status = 'OPEN'
          THEN statement_timestamp() >= greatest(s.opened_at, v_start) ELSE s.opened_at >= v_start END))
  ),
  attendance_candidates AS MATERIALIZED (
    SELECT s.id AS shift_id, s.branch_id, m.profile_id AS cashier_id,
      max(nullif(m.full_name, '')) AS cashier_name
    FROM period_shifts s
    JOIN public.pos_shift_staff_members m ON (m.shift_id, m.organization_id, m.branch_id) = (s.id, v_org, s.branch_id)
    WHERE m.profile_id IS NOT NULL AND m.status IN ('ACTIVE', 'ENDED')
      AND m.started_at < v_end AND (m.ended_at > v_start OR m.ended_at IS NULL)
      AND (p_staff_id IS NULL OR m.profile_id = p_staff_id)
    GROUP BY s.id, s.branch_id, m.profile_id
  ),
  -- Scope attempts by their own branch first. Attach them to an original
  -- sale only on an exact organization/branch/shift link. A dangling or
  -- mismatched link must not borrow a different branch's cashier/transaction.
  attempt_ids AS (
    SELECT p.id FROM public.pos_online_payments p
    WHERE p.organization_id = v_org AND p.branch_id = ANY(v_branches)
      AND p.created_at >= v_start AND p.created_at < v_end
      AND (p_shift_id IS NULL OR p.shift_id = p_shift_id)
      AND (p_transaction_id IS NULL OR p.transaction_id = p_transaction_id)
      AND (p.status IN ('PENDING', 'REPORTED', 'QUARANTINED', 'PAID') OR p.fiuu_vt_review_required)
    UNION
    SELECT p.id FROM sales s JOIN public.pos_online_payments p ON
      (p.transaction_id, p.organization_id, p.branch_id, p.shift_id) = (s.transaction_id, v_org, s.branch_id, s.shift_id)
    WHERE p.status IN ('PENDING', 'REPORTED', 'QUARANTINED', 'PAID') OR p.fiuu_vt_review_required
  ),
  attempt_cases AS MATERIALIZED (
    -- One case per type and linked order; without a trustworthy order link,
    -- payment IDs are attempt identities, not provably distinct orders.
    -- Expose the evidence amount on a case, never as a pending money total.
    SELECT DISTINCT ON (flags.case_type, s.transaction_id, CASE WHEN s.transaction_id IS NULL THEN p.id END)
      flags.case_type, p.id AS case_id,
      p.branch_id, ps.id AS shift_id, CASE WHEN s.transaction_id IS NULL THEN p.created_by ELSE s.cashier_id END AS cashier_id,
      s.transaction_id, coalesce(s.sold_at, p.created_at) AS bucket_at, p.created_at AS case_at,
      p.status, p.amount_rm AS amount, p.id::text AS reference,
      CASE WHEN p.status = 'PAID' THEN p.paid_at END AS payment_confirmed_at
    FROM attempt_ids a JOIN public.pos_online_payments p ON p.id = a.id
    LEFT JOIN public.pos_transactions linked ON
      (linked.id, linked.organization_id, linked.branch_id, linked.shift_id) = (p.transaction_id, v_org, p.branch_id, p.shift_id)
    LEFT JOIN sales s ON s.transaction_id = linked.id
    LEFT JOIN known_shifts ps ON (ps.id, ps.branch_id) = (p.shift_id, p.branch_id)
    CROSS JOIN LATERAL (SELECT CASE
      WHEN p.status IN ('PENDING', 'REPORTED', 'QUARANTINED') OR p.fiuu_vt_review_required THEN 'payment_pending'
      WHEN p.status = 'PAID' AND (linked.id IS NULL OR p.paid_at IS NULL OR linked.payment_method NOT IN ('QR', 'MIXED')
        OR linked.qr_amount IS DISTINCT FROM p.amount_rm) THEN 'payment_unmatched'
    END AS case_type) flags
    WHERE flags.case_type IS NOT NULL
      AND (linked.id IS NULL OR s.transaction_id IS NOT NULL)
      AND (p_shift_id IS NULL OR ps.id IS NOT NULL)
      AND (p_transaction_id IS NULL OR s.transaction_id = p_transaction_id)
      AND (p_staff_id IS NULL OR coalesce(s.cashier_id, p.created_by) = p_staff_id)
      AND (s.transaction_id IS NOT NULL OR (
        coalesce(ps.marked, false) OR EXISTS (SELECT 1 FROM public.pos_trial_payment_markers m WHERE m.payment_id = p.id)
      ) = v_trial)
    ORDER BY flags.case_type, s.transaction_id, CASE WHEN s.transaction_id IS NULL THEN p.id END,
      CASE WHEN p.fiuu_vt_review_required THEN 0
        WHEN p.status = 'QUARANTINED' THEN 1 WHEN p.status = 'REPORTED' THEN 2 ELSE 3 END, p.created_at DESC, p.id
  ),
  cases AS MATERIALIZED (
    SELECT * FROM attempt_cases
    UNION ALL
    SELECT 'payment_duplicate', s.transaction_id, s.branch_id, s.matched_shift_id, s.cashier_id, s.transaction_id,
      s.sold_at, s.sold_at, s.status, NULL, s.transaction_number, s.payment_confirmed_at
    FROM sales s WHERE s.payment_duplicate
    UNION ALL
    SELECT 'qr_unverified', s.transaction_id, s.branch_id, s.matched_shift_id, s.cashier_id, s.transaction_id,
      s.sold_at, s.sold_at, s.status, s.qr_expected, s.transaction_number, NULL::timestamptz
    FROM sales s
    WHERE s.sales_count = 1 AND s.qr_expected > 0 AND s.payment_confirmed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM attempt_cases a WHERE a.transaction_id = s.transaction_id)
    UNION ALL
    SELECT 'transaction_incomplete', s.transaction_id, s.branch_id, s.matched_shift_id, s.cashier_id, s.transaction_id,
      s.sold_at, s.sold_at, s.status, NULL, s.transaction_number, s.payment_confirmed_at
    FROM sales s WHERE s.cashier_id IS NULL OR s.matched_shift_id IS NULL OR s.tender_incomplete
    UNION ALL
    SELECT flag.case_type, s.id, s.branch_id, s.id, NULL::uuid, NULL::uuid,
      CASE WHEN s.shift_status = 'OPEN' THEN greatest(v_start, s.opened_at) ELSE flag.case_at END,
      flag.case_at, s.shift_status, flag.amount, s.shift_number, NULL::timestamptz
    FROM known_shifts s
    CROSS JOIN LATERAL (SELECT
      CASE WHEN s.shift_status = 'OPEN' THEN 'shift_open'
           WHEN s.closed_at IS NOT NULL AND s.closing_cash IS NULL THEN 'cash_count_missing'
           WHEN s.shift_status = 'CLOSED' AND (s.closed_at IS NULL OR s.expected_cash IS NULL) THEN 'shift_incomplete'
           WHEN s.closed_at IS NOT NULL AND s.closing_cash <> s.expected_cash THEN 'cash_variance' END AS case_type,
      coalesce(CASE WHEN s.shift_status <> 'OPEN' THEN s.closed_at END, s.opened_at) AS case_at,
      CASE WHEN s.shift_status = 'CLOSED' THEN s.closing_cash - s.expected_cash END AS amount
    ) flag
    WHERE p_staff_id IS NULL AND p_transaction_id IS NULL AND s.marked = v_trial
      AND flag.case_type IS NOT NULL AND (
        (s.shift_status <> 'OPEN' AND flag.case_at >= v_start AND flag.case_at < v_end)
        OR (s.shift_status = 'OPEN' AND greatest(v_start, s.opened_at) <= statement_timestamp()
          AND EXISTS (SELECT 1 FROM period_shifts ps WHERE (ps.id, ps.branch_id) = (s.id, s.branch_id)))
      )
  ),
  selected_cases AS MATERIALIZED (
    SELECT c.*, (c.bucket_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS day
    FROM cases c WHERE p_case_type IS NULL OR c.case_type = p_case_type
  ),
  -- Represent sales, cases, and shift presence independently. No join between
  -- their one-to-many relations can multiply money or action counts.
  events AS (
    SELECT s.branch_id, s.day, s.matched_shift_id AS shift_id, s.cashier_id,
      s.matched_shift_id AS counted_shift_id, s.net_sales, s.cash, s.qr, s.other, s.confirmed,
      s.recorded_sales, s.sales_count, 0 AS review_count,
      greatest(s.sold_at, s.payment_confirmed_at, s.reversed_at) AS last_activity_at
    FROM sales s
    UNION ALL
    SELECT c.branch_id, c.day, c.shift_id, c.cashier_id,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 1, greatest(c.case_at, c.payment_confirmed_at)
    FROM selected_cases c
    -- Shift-level cases use the unattributed row, never a cashier's row.
    UNION ALL
    SELECT s.branch_id, d.day, s.id, a.cashier_id,
      s.id, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0,
      CASE WHEN coalesce(d.day, (s.closed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date) =
          (s.closed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AND s.closed_at >= v_start AND s.closed_at < v_end
        THEN s.closed_at
        WHEN coalesce(d.day, (s.opened_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date) =
          (s.opened_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AND s.opened_at >= v_start THEN s.opened_at END
    FROM period_shifts s
    LEFT JOIN attendance_candidates a ON (p_view = 'shifts' OR p_staff_id IS NOT NULL)
      AND (a.shift_id, a.branch_id) = (s.id, s.branch_id)
    CROSS JOIN LATERAL (
      SELECT NULL::date AS day WHERE p_view <> 'daily'
      UNION ALL
      SELECT x::date FROM generate_series(
        greatest(p_from, (s.opened_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::timestamp,
        least(p_to, (coalesce(s.closed_at, CASE WHEN s.shift_status = 'OPEN' THEN statement_timestamp()
          ELSE s.opened_at END) AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::timestamp,
        INTERVAL '1 day'
      ) x WHERE p_view = 'daily' AND (
        s.closed_at IS NULL OR s.closed_at > (x AT TIME ZONE 'Asia/Kuala_Lumpur')
        OR s.opened_at = s.closed_at
      )
    ) d
    WHERE (p_staff_id IS NULL OR (a.cashier_id IS NOT NULL AND (
      d.day IS NULL OR EXISTS (
        SELECT 1 FROM public.pos_shift_staff_members m
        WHERE (m.organization_id, m.branch_id, m.shift_id, m.profile_id) = (v_org, s.branch_id, s.id, a.cashier_id)
          AND m.status IN ('ACTIVE', 'ENDED')
          AND m.started_at < ((d.day + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
          AND (m.ended_at IS NULL OR m.ended_at > (d.day::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur'))
      )
    ))) AND (p_view <> 'shifts' OR a.cashier_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM sales x WHERE x.matched_shift_id = s.id
    ))
  ),
  dimensions AS (
    SELECT e.branch_id, CASE WHEN p_view = 'daily' THEN e.day END AS day,
      CASE WHEN p_view = 'shifts' THEN e.shift_id END AS shift_id,
      CASE WHEN p_view = 'shifts' THEN e.cashier_id END AS cashier_id,
      e.counted_shift_id, e.net_sales, e.cash, e.qr, e.other, e.confirmed, e.recorded_sales,
      e.sales_count, e.review_count, e.last_activity_at
    FROM events e
    WHERE p_view IN ('summary', 'daily', 'shifts')
  ),
  rollup AS MATERIALIZED (
    SELECT d.branch_id, d.day, d.shift_id, d.cashier_id, sum(d.net_sales) AS net_sales,
      sum(d.cash) AS cash, sum(d.qr) AS qr, sum(d.other) AS other, sum(d.confirmed) AS confirmed,
      sum(d.recorded_sales) AS recorded_sales, sum(d.sales_count) AS sales_count,
      count(DISTINCT d.counted_shift_id) AS shift_count, sum(d.review_count) AS review_count,
      max(d.last_activity_at) AS last_activity_at
    FROM dimensions d GROUP BY d.branch_id, d.day, d.shift_id, d.cashier_id
  ),
  totals AS (
    SELECT sum(s.net_sales) AS net_sales, sum(s.cash) AS cash, sum(s.qr) AS qr, sum(s.other) AS other,
      sum(s.confirmed) AS confirmed, sum(s.recorded_sales) AS recorded_sales,
      coalesce(sum(s.sales_count), 0) AS sales_count, count(*) AS sale_records
    FROM sales s
  ),
  shift_count AS (
    -- Physical shifts are counted once, independent of view and case filter.
    -- A close event at the left boundary does not put the previous shift
    -- in this period, but a genuinely zero-duration shift inside does.
    SELECT count(*) AS n FROM (
      SELECT s.matched_shift_id FROM sales s WHERE s.matched_shift_id IS NOT NULL
      UNION
      SELECT s.id FROM period_shifts s WHERE p_staff_id IS NULL OR EXISTS (
        SELECT 1 FROM attendance_candidates a WHERE (a.shift_id, a.branch_id) = (s.id, s.branch_id)
      )
    ) s
  ),
  case_count AS (
    SELECT count(*) AS n FROM selected_cases
  ),
  row_keys AS MATERIALIZED (
    SELECT b.id AS branch_id, r.day, r.shift_id, r.cashier_id, NULL::uuid AS transaction_id,
      NULL::text AS case_type, NULL::uuid AS case_id, NULL::timestamptz AS sort_at
    FROM scope b LEFT JOIN rollup r ON r.branch_id = b.id
    WHERE p_view IN ('summary', 'daily', 'shifts') AND
      (r.branch_id IS NOT NULL OR (p_view = 'summary' AND p_staff_id IS NULL
        AND p_shift_id IS NULL AND p_transaction_id IS NULL))
    UNION ALL
    SELECT s.branch_id, s.day, s.matched_shift_id, s.cashier_id, s.transaction_id, NULL, NULL, s.sold_at
    FROM sales s WHERE p_view IN ('transactions', 'receipt')
    UNION ALL
    SELECT c.branch_id, c.day, c.shift_id, c.cashier_id, c.transaction_id, c.case_type, c.case_id, c.case_at
    FROM selected_cases c WHERE p_view = 'actions'
  ),
  page AS MATERIALIZED (
    SELECT k.*, row_number() OVER (ORDER BY k.sort_at DESC NULLS LAST, k.day DESC NULLS LAST,
      b.branch_code, k.branch_id, k.shift_id, k.cashier_id, k.transaction_id, k.case_type, k.case_id) AS ord
    FROM row_keys k JOIN scope b ON b.id = k.branch_id
    ORDER BY ord LIMIT CASE WHEN p_view = 'receipt' THEN 1 ELSE p_limit END
    OFFSET CASE WHEN p_view = 'receipt' THEN 0 ELSE p_offset END
  ),
  full_sales AS MATERIALIZED (
    -- Read complete history only for physical shifts displayed on this page.
    -- The selected transaction/date must not restrict the full-shift amount.
    SELECT s.* FROM report_internal.operational_sales(v_branches, NULL, NULL, ARRAY(
      SELECT DISTINCT k.shift_id FROM page k WHERE k.shift_id IS NOT NULL
        AND (p_view = 'shifts' OR k.case_type IN ('cash_variance', 'cash_count_missing', 'shift_incomplete'))
    ), p_staff_id, NULL, v_trial) s
  ),
  full_by_cashier AS (
    SELECT f.branch_id, f.shift_id, f.cashier_id, sum(f.net_sales) AS net_sales,
      sum(f.confirmed) AS confirmed, min(f.sold_at) AS first_sale
    FROM full_sales f GROUP BY f.branch_id, f.shift_id, f.cashier_id
  ),
  full_by_shift AS (
    SELECT f.branch_id, f.shift_id, sum(f.cash) AS cash FROM full_sales f GROUP BY f.branch_id, f.shift_id
  ),
  rows AS MATERIALIZED (
    SELECT k.ord, jsonb_strip_nulls(
      jsonb_build_object(
        'branch_id', b.id, 'branch_code', b.branch_code, 'branch_name', b.branch_name, 'manager_names', b.manager_names,
        'day', k.day, 'shift_id', sh.id, 'shift_number', sh.shift_number,
        'cashier_id', k.cashier_id, 'cashier_name', coalesce(actor.full_name, attendance.name),
        'opened_at', sh.opened_at, 'closed_at', sh.closed_at, 'shift_status', sh.shift_status,
        'cashier_started_at', attendance.started_at, 'cashier_ended_at', attendance.ended_at,
        'planned_start', plan.start_at, 'planned_end', plan.end_at,
        'full_shift_net_sales', f.net_sales, 'full_shift_confirmed', f.confirmed,
        'last_activity_at', CASE WHEN p_view = 'actions' THEN greatest(c.case_at, c.payment_confirmed_at)
          ELSE greatest(r.last_activity_at, s.sold_at, s.payment_confirmed_at, s.reversed_at) END,
        'net_sales', CASE WHEN p_view <> 'actions' THEN coalesce(r.net_sales, s.net_sales) END,
        'cash', CASE WHEN p_view <> 'actions' THEN coalesce(r.cash, s.cash) END,
        'qr', CASE WHEN p_view <> 'actions' THEN coalesce(r.qr, s.qr) END,
        'other', CASE WHEN p_view <> 'actions' THEN coalesce(r.other, s.other) END,
        'confirmed', CASE WHEN p_view <> 'actions' THEN coalesce(r.confirmed, s.confirmed) END,
        'recorded_sales', CASE WHEN p_view <> 'actions' THEN coalesce(r.recorded_sales, s.recorded_sales) END,
        'sales_count', CASE WHEN p_view <> 'actions' THEN coalesce(r.sales_count, s.sales_count, CASE WHEN p_view = 'summary' THEN 0 END) END,
        'shift_count', coalesce(r.shift_count, CASE WHEN p_view = 'summary' THEN 0
          WHEN p_view IN ('transactions', 'receipt') THEN (k.shift_id IS NOT NULL)::integer END),
        'review_count', CASE WHEN p_view IN ('transactions', 'receipt') THEN
          (SELECT count(*) FROM selected_cases q WHERE q.transaction_id = s.transaction_id)
          ELSE coalesce(r.review_count, CASE WHEN p_view = 'summary' THEN 0 WHEN p_view = 'actions' THEN 1 END) END,
        'transaction_id', k.transaction_id, 'transaction_number', s.transaction_number, 'receipt_number', receipt.receipt_number,
        'transaction_total', CASE WHEN p_view IN ('transactions', 'receipt') THEN s.transaction_total END,
        'discount_amount', CASE WHEN p_view IN ('transactions', 'receipt') THEN s.discount_amount END,
        'sold_at', s.sold_at, 'payment_confirmed_at',
        CASE WHEN p_view = 'actions' THEN c.payment_confirmed_at ELSE s.payment_confirmed_at END,
        'status', coalesce(c.status, s.status), 'reversed_at', s.reversed_at, 'reversal_reason', s.reversal_reason,
        'case_type', c.case_type, 'case_at', c.case_at, 'amount', c.amount, 'reference', c.reference
      ) || CASE WHEN c.case_type IN ('cash_variance', 'cash_count_missing', 'shift_incomplete') THEN jsonb_build_object(
        'opening_float', sh.opening_cash, 'expected_cash', sh.expected_cash, 'counted_cash', sh.closing_cash,
        'cash_variance', sh.closing_cash - sh.expected_cash, 'shift_cash_sales', fs.cash
      ) ELSE '{}'::jsonb END
      || CASE WHEN c.case_type IS NOT NULL THEN jsonb_build_object(
        'case_label', CASE c.case_type
          WHEN 'payment_pending' THEN 'Bayaran dalam semakan'
          WHEN 'payment_unmatched' THEN 'Bayaran belum dipadankan'
          WHEN 'payment_duplicate' THEN 'Padanan bayaran berganda'
          WHEN 'qr_unverified' THEN 'QR belum disahkan'
          WHEN 'cash_variance' THEN 'Perbezaan tunai'
          WHEN 'cash_count_missing' THEN 'Kiraan tunai belum direkodkan'
          WHEN 'shift_open' THEN 'Syif masih terbuka'
          WHEN 'shift_incomplete' THEN 'Rekod tutup syif belum lengkap'
          WHEN 'transaction_incomplete' THEN 'Rekod transaksi belum lengkap' END,
        'action_label', CASE c.case_type
          WHEN 'payment_pending' THEN 'Semak status bayaran'
          WHEN 'payment_unmatched' THEN 'Semak padanan transaksi'
          WHEN 'payment_duplicate' THEN 'Semak bukti dan masa bayaran'
          WHEN 'qr_unverified' THEN 'Semak bukti bayaran QR'
          WHEN 'cash_variance' THEN 'Semak kiraan dan tunai dijangka'
          WHEN 'cash_count_missing' THEN 'Semak rekod tutup syif'
          WHEN 'shift_open' THEN 'Semak status syif'
          WHEN 'shift_incomplete' THEN 'Semak rekod tutup syif'
          WHEN 'transaction_incomplete' THEN 'Semak rekod asal' END
      ) ELSE '{}'::jsonb END
    ) AS row
    FROM page k JOIN branch_info b ON b.id = k.branch_id
    LEFT JOIN rollup r ON r.branch_id = k.branch_id
      AND (r.day, r.shift_id, r.cashier_id) IS NOT DISTINCT FROM (k.day, k.shift_id, k.cashier_id)
    LEFT JOIN sales s ON s.transaction_id = k.transaction_id
    LEFT JOIN selected_cases c ON (c.case_type, c.case_id) = (k.case_type, k.case_id)
    LEFT JOIN known_shifts sh ON (sh.id, sh.branch_id) = (k.shift_id, k.branch_id)
    LEFT JOIN public.profiles actor ON (actor.id, actor.organization_id) = (k.cashier_id, v_org)
    LEFT JOIN full_by_cashier f ON p_view = 'shifts' AND (f.branch_id, f.shift_id) = (k.branch_id, k.shift_id)
      AND f.cashier_id IS NOT DISTINCT FROM k.cashier_id
    LEFT JOIN full_by_shift fs ON (fs.branch_id, fs.shift_id) = (k.branch_id, k.shift_id)
    LEFT JOIN LATERAL (
      SELECT min(m.started_at) AS started_at,
        CASE WHEN bool_and(m.status = 'ENDED' AND m.ended_at IS NOT NULL) THEN max(m.ended_at) END AS ended_at,
        max(nullif(m.full_name, '')) AS name
      FROM public.pos_shift_staff_members m
      WHERE (m.shift_id, m.branch_id, m.organization_id, m.profile_id) = (k.shift_id, k.branch_id, v_org, k.cashier_id)
        AND m.status IN ('ACTIVE', 'ENDED')
    ) attendance ON true
    LEFT JOIN LATERAL (
      -- Link a published plan to a cashier anchor, never to the POS opener.
      -- Ambiguous/no matching slots stay NULL. Previous-date overnight
      -- slots may contain an after-midnight start; draft schedules do not.
      SELECT min(slot.start_at) AS start_at, min(slot.end_at) AS end_at
      FROM public.roster_planned_shifts rp
      JOIN public.staff st ON (st.id, st.organization_id) = (rp.staff_id, v_org) AND st.profile_id = k.cashier_id
      CROSS JOIN LATERAL (SELECT
        (rp.shift_date + rp.scheduled_start) AT TIME ZONE 'Asia/Kuala_Lumpur' AS start_at,
        (rp.shift_date + rp.scheduled_end + CASE WHEN rp.scheduled_end < rp.scheduled_start
          THEN INTERVAL '1 day' ELSE INTERVAL '0 days' END) AT TIME ZONE 'Asia/Kuala_Lumpur' AS end_at
      ) slot
      CROSS JOIN LATERAL (SELECT coalesce(attendance.started_at, f.first_sale) AS at) anchor
      WHERE p_view = 'shifts' AND sh.id IS NOT NULL AND (rp.organization_id, rp.branch_id) = (v_org, k.branch_id)
        AND rp.status = 'PUBLISHED' AND rp.shift_date BETWEEN
          (anchor.at AT TIME ZONE 'Asia/Kuala_Lumpur')::date - 1 AND (anchor.at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
        AND rp.scheduled_start <> rp.scheduled_end AND rp.scheduled_start < TIME '24:00' AND rp.scheduled_end < TIME '24:00'
        AND anchor.at >= slot.start_at AND anchor.at < slot.end_at
      HAVING count(*) = 1
    ) plan ON true
    LEFT JOIN LATERAL (
      SELECT pr.receipt_number FROM public.pos_receipts pr
      WHERE pr.transaction_id = s.transaction_id ORDER BY pr.created_at, pr.id LIMIT 1
    ) receipt ON true
  ),
  staff_options AS (
    SELECT x.id, coalesce(p.full_name, max(x.name)) AS name
    FROM (
      SELECT s.cashier_id AS id, NULL::text AS name FROM sales s
      UNION ALL SELECT a.cashier_id, a.cashier_name FROM attendance_candidates a
      UNION ALL SELECT c.cashier_id, NULL FROM cases c
    ) x LEFT JOIN public.profiles p ON (p.id, p.organization_id) = (x.id, v_org)
    WHERE x.id IS NOT NULL GROUP BY x.id, p.full_name
  ),
  shift_options AS (
    SELECT s.id, s.shift_number AS number, s.branch_id FROM known_shifts s
    WHERE EXISTS (SELECT 1 FROM events e WHERE (e.shift_id, e.branch_id) = (s.id, s.branch_id))
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(r.row ORDER BY r.ord) FROM rows r), '[]'::jsonb),
    'total_rows', (SELECT count(*) FROM row_keys),
    'generated_at', statement_timestamp(),
    'totals', to_jsonb(totals) - 'sale_records' || jsonb_build_object('shift_count', shift_count.n, 'review_count', case_count.n),
    'filters', jsonb_build_object(
      'branches', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'code', b.branch_code, 'name', b.branch_name)
        ORDER BY b.branch_code, b.id) FROM branch_options b), '[]'::jsonb),
      'managers', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.name, m.id)
        FROM (SELECT p.id, p.full_name AS name FROM public.profiles p
          WHERE v_can_filter_am AND p.organization_id = v_org AND p.role = 'AREA_MANAGER'
            AND p.status = 'ACTIVE' AND p.full_name IS NOT NULL) m), '[]'::jsonb),
      'staff', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.name NULLS LAST, a.id) FROM staff_options a), '[]'::jsonb),
      'shifts', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.number, s.id) FROM shift_options s), '[]'::jsonb)
    ),
    'data_state', CASE
      WHEN totals.sale_records = 0 AND shift_count.n = 0 AND case_count.n = 0 THEN 'no_data'
      WHEN EXISTS (SELECT 1 FROM selected_cases c WHERE c.case_type IN (
        'transaction_incomplete', 'qr_unverified', 'payment_unmatched', 'payment_duplicate',
        'shift_incomplete', 'cash_count_missing'
      ))
        THEN 'partial'
      ELSE 'available'
    END
  ) || CASE WHEN p_view = 'receipt' THEN jsonb_build_object('receipt', (
    SELECT r.row || jsonb_build_object('items', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name', i.product_name, 'sku', i.sku, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'line_total', i.line_total) ORDER BY i.id)
      FROM public.pos_transaction_items i WHERE i.transaction_id = p_transaction_id
    ), '[]'::jsonb)) FROM rows r
  )) ELSE '{}'::jsonb END INTO v_result
  FROM totals CROSS JOIN shift_count CROSS JOIN case_count;

  -- Deposits are a separate, branch-only ledger by deposit time, not proof
  -- of HQ handover, a cashier's proceeds, or provider settlement. Do not
  -- present them for trial, cashier, POS shift, or transaction scopes.
  IF p_view = 'summary' AND NOT v_trial AND p_staff_id IS NULL
     AND p_shift_id IS NULL AND p_transaction_id IS NULL THEN
    SELECT jsonb_build_object(
      'source', 'bank_in_records', 'label', 'Bank masuk direkodkan',
      'basis', 'banked_at', 'amount', sum(bi.amount), 'record_count', count(*),
      'banked_amount', sum(bi.amount) FILTER (WHERE bi.status = 'BANKED'),
      'verified_amount', sum(bi.amount) FILTER (WHERE bi.status = 'VERIFIED' AND bi.verified_at IS NOT NULL),
      'verified_count', count(*) FILTER (WHERE bi.status = 'VERIFIED' AND bi.verified_at IS NOT NULL),
      'provider_settlement_available', false
    ) INTO v_bank_in
    FROM public.bank_in_records bi
    JOIN public.finance_collections fc ON (fc.id, fc.organization_id) = (bi.collection_id, bi.organization_id)
    WHERE bi.organization_id = v_org AND fc.branch_id = ANY(v_branches)
      AND bi.banked_at >= v_start AND bi.banked_at < v_end AND bi.status IN ('BANKED', 'VERIFIED')
      AND (fc.shift_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pos_shifts s
        WHERE (s.id, s.organization_id, s.branch_id) = (fc.shift_id, v_org, fc.branch_id)
          AND NOT EXISTS (SELECT 1 FROM public.pos_trial_shift_markers m WHERE m.shift_id = s.id)
      ))
    HAVING count(*) > 0;
    IF v_bank_in IS NOT NULL THEN
      v_result := v_result || jsonb_build_object('settlement', v_bank_in);
    END IF;
  END IF;
  RETURN v_result;
END;
$report$;

REVOKE ALL ON FUNCTION public.read_operational_report(
  text, date, date, uuid, uuid, uuid, uuid, uuid, text, integer, integer, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_operational_report(
  text, date, date, uuid, uuid, uuid, uuid, uuid, text, integer, integer, text
) TO authenticated;
