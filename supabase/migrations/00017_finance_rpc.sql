-- RKJ One: Finance RPC functions
-- Migration 00017

CREATE OR REPLACE FUNCTION create_finance_collection(
  p_collection_type collection_type,
  p_amount NUMERIC,
  p_branch_id UUID DEFAULT NULL,
  p_shift_id UUID DEFAULT NULL,
  p_collected_from TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_id UUID;
  v_number TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'AREA_MANAGER', 'OPERATION_MANAGER') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_org_id := public.organization_id();
  IF p_branch_id IS NOT NULL AND NOT public.has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'No branch access';
  END IF;

  v_number := generate_doc_number('FC', v_org_id);

  INSERT INTO finance_collections (
    organization_id, collection_number, collection_type, branch_id, shift_id,
    amount, status, collected_from, notes
  ) VALUES (
    v_org_id, v_number, p_collection_type, p_branch_id, p_shift_id,
    p_amount, 'PENDING', p_collected_from, p_notes
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('collection_id', v_id, 'collection_number', v_number);
END;
$$;

CREATE OR REPLACE FUNCTION mark_collection_collected(
  p_collection_id UUID,
  p_collector_name TEXT DEFAULT NULL,
  p_third_party_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'AREA_MANAGER', 'OPERATION_MANAGER') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  UPDATE finance_collections SET
    status = 'COLLECTED',
    collected_by = v_user_id,
    collected_at = now(),
    collector_name = COALESCE(p_collector_name, collector_name),
    third_party_name = COALESCE(p_third_party_name, third_party_name)
  WHERE id = p_collection_id AND organization_id = public.organization_id() AND status = 'PENDING';

  IF NOT FOUND THEN RAISE EXCEPTION 'Collection not found or already collected'; END IF;

  RETURN jsonb_build_object('collection_id', p_collection_id, 'status', 'COLLECTED');
END;
$$;

CREATE OR REPLACE FUNCTION record_bank_in(
  p_amount NUMERIC,
  p_collection_id UUID DEFAULT NULL,
  p_bank_name TEXT DEFAULT NULL,
  p_reference_number TEXT DEFAULT NULL,
  p_slip_url TEXT DEFAULT NULL,
  p_banked_at TIMESTAMPTZ DEFAULT now(),
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_id UUID;
  v_number TEXT;
BEGIN
  v_user_id := auth.uid();
  IF public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_org_id := public.organization_id();
  v_number := generate_doc_number('BI', v_org_id);

  INSERT INTO bank_in_records (
    organization_id, bank_in_number, collection_id, amount,
    bank_name, reference_number, slip_url, banked_at, banked_by, notes
  ) VALUES (
    v_org_id, v_number, p_collection_id, p_amount,
    p_bank_name, p_reference_number, p_slip_url, p_banked_at, v_user_id, p_notes
  ) RETURNING id INTO v_id;

  IF p_collection_id IS NOT NULL THEN
    UPDATE finance_collections SET status = 'BANKED'
    WHERE id = p_collection_id AND organization_id = v_org_id;
  END IF;

  RETURN jsonb_build_object('bank_in_id', v_id, 'bank_in_number', v_number);
END;
$$;

CREATE OR REPLACE FUNCTION submit_cash_reconciliation(
  p_branch_id UUID,
  p_reconciliation_date DATE,
  p_expected_cash NUMERIC,
  p_actual_cash NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_id UUID;
  v_number TEXT;
BEGIN
  v_user_id := auth.uid();
  IF NOT public.has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'No branch access'; END IF;

  v_org_id := public.organization_id();
  v_number := generate_doc_number('CR', v_org_id);

  INSERT INTO cash_reconciliations (
    organization_id, reconciliation_number, branch_id, reconciliation_date,
    expected_cash, actual_cash, status, notes, reconciled_by
  ) VALUES (
    v_org_id, v_number, p_branch_id, p_reconciliation_date,
    p_expected_cash, p_actual_cash, 'PENDING', p_notes, v_user_id
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('reconciliation_id', v_id, 'reconciliation_number', v_number);
END;
$$;

CREATE OR REPLACE FUNCTION approve_cash_reconciliation(p_reconciliation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  UPDATE cash_reconciliations SET
    status = 'APPROVED',
    approved_by = v_user_id
  WHERE id = p_reconciliation_id
    AND organization_id = public.organization_id()
    AND status = 'PENDING';

  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation not found'; END IF;

  RETURN jsonb_build_object('reconciliation_id', p_reconciliation_id, 'status', 'APPROVED');
END;
$$;

CREATE OR REPLACE FUNCTION generate_daily_financial_report(
  p_report_date DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_total_qr NUMERIC := 0;
  v_total_cash NUMERIC := 0;
  v_total_banked NUMERIC := 0;
  v_outstanding NUMERIC := 0;
  v_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF public.user_role() NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_org_id := public.organization_id();

  SELECT
    COALESCE(SUM(total_qr), 0),
    COALESCE(SUM(total_cash), 0)
  INTO v_total_qr, v_total_cash
  FROM pos_daily_summaries
  WHERE organization_id = v_org_id
    AND summary_date = p_report_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_total_banked
  FROM bank_in_records
  WHERE organization_id = v_org_id
    AND banked_at::date = p_report_date;

  SELECT COALESCE(SUM(amount), 0) INTO v_outstanding
  FROM finance_collections
  WHERE organization_id = v_org_id
    AND status IN ('PENDING', 'COLLECTED')
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  INSERT INTO daily_financial_reports (
    organization_id, report_date, branch_id,
    total_qr, total_cash_collected, total_banked, total_verified,
    outstanding_cash, report_data
  ) VALUES (
    v_org_id, p_report_date, p_branch_id,
    v_total_qr, v_total_cash, v_total_banked, v_total_banked,
    v_outstanding,
    jsonb_build_object(
      'generated_by', v_user_id,
      'branch_filter', p_branch_id
    )
  )
  ON CONFLICT (organization_id, report_date, branch_id)
  DO UPDATE SET
    total_qr = EXCLUDED.total_qr,
    total_cash_collected = EXCLUDED.total_cash_collected,
    total_banked = EXCLUDED.total_banked,
    total_verified = EXCLUDED.total_verified,
    outstanding_cash = EXCLUDED.outstanding_cash,
    report_data = EXCLUDED.report_data,
    generated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'report_id', v_id,
    'report_date', p_report_date,
    'total_qr', v_total_qr,
    'total_cash', v_total_cash,
    'total_banked', v_total_banked,
    'outstanding_cash', v_outstanding
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_finance_collection TO authenticated;
GRANT EXECUTE ON FUNCTION mark_collection_collected TO authenticated;
GRANT EXECUTE ON FUNCTION record_bank_in TO authenticated;
GRANT EXECUTE ON FUNCTION submit_cash_reconciliation TO authenticated;
GRANT EXECUTE ON FUNCTION approve_cash_reconciliation TO authenticated;
GRANT EXECUTE ON FUNCTION generate_daily_financial_report TO authenticated;

CREATE POLICY finance_collections_org ON finance_collections
  FOR ALL USING (
    organization_id = public.organization_id()
    AND (
      public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER')
      OR (branch_id IS NOT NULL AND public.has_branch_access(branch_id))
    )
  );

CREATE POLICY bank_in_records_org ON bank_in_records
  FOR ALL USING (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER')
  );

CREATE POLICY cash_reconciliations_branch ON cash_reconciliations
  FOR ALL USING (
    organization_id = public.organization_id()
    AND public.has_branch_access(branch_id)
  );

CREATE POLICY daily_financial_reports_org ON daily_financial_reports
  FOR ALL USING (
    organization_id = public.organization_id()
    AND public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER')
  );
