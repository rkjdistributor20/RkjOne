-- Run only against the linked target being verified, or after the candidate
-- migration inside a rolled-back preflight. Uses existing rows, no test sales,
-- no auth tokens, no account mutations, and emits only boolean evidence.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '45s';

DO $release$
DECLARE
 v_owner uuid;
 v_org uuid;
 v_manager uuid;
 v_owned uuid;
 v_denied uuid;
BEGIN
 SELECT p.id, p.organization_id INTO STRICT v_owner,v_org FROM public.profiles p
 WHERE p.role IN ('SUPER_ADMIN','ADMIN') AND p.status='ACTIVE'
  AND EXISTS (SELECT 1 FROM public.pos_operational_transactions t WHERE t.organization_id=p.organization_id)
 ORDER BY CASE WHEN p.role='SUPER_ADMIN' THEN 0 ELSE 1 END,p.id LIMIT 1;
 SELECT m.id,a.branch_id,b.id INTO STRICT v_manager,v_owned,v_denied
 FROM public.profiles m JOIN public.profile_branch_access a ON a.profile_id=m.id
 JOIN public.branches b ON b.organization_id=m.organization_id
 WHERE m.role='AREA_MANAGER' AND m.status='ACTIVE' AND m.organization_id=v_org
  AND NOT EXISTS(SELECT 1 FROM public.profile_branch_access g WHERE g.profile_id=m.id AND g.branch_id=b.id)
 ORDER BY m.id,a.branch_id,b.id LIMIT 1;
 PERFORM set_config('rkj.report.owner',v_owner::text,true);
 PERFORM set_config('rkj.report.manager',v_manager::text,true);
 PERFORM set_config('rkj.report.assigned',v_owned::text,true);
 PERFORM set_config('rkj.report.denied',v_denied::text,true);
END;
$release$;

SET LOCAL ROLE authenticated;
DO $release$
DECLARE
 v_to date := (current_timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_from date := v_to - 13;
 v_manager uuid := current_setting('rkj.report.manager')::uuid;
 v_owned uuid := current_setting('rkj.report.assigned')::uuid;
 v_denied uuid := current_setting('rkj.report.denied')::uuid;
 v_branch uuid;
 v_report jsonb;
 v_summary jsonb;
 v_totals jsonb;
 v_view text;
 v_field text;
 v_n bigint;
 v_receipt_target uuid;
 v_receipt jsonb;
 v_source public.pos_transactions%ROWTYPE;
 v_owner_scoped jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('rkj.report.owner'),true);
 IF public.user_role() NOT IN ('SUPER_ADMIN','ADMIN') THEN
  RAISE EXCEPTION 'Expected a real owner/admin profile scope';
 END IF;
 v_summary := public.read_operational_report('summary',v_from,v_to,NULL,NULL,NULL,NULL,NULL,'operational',5001,0);
 v_totals := v_summary->'totals';
 IF jsonb_array_length(v_summary->'rows') < 1 OR coalesce((v_totals->>'sales_count')::bigint,0)<1 THEN
  RAISE EXCEPTION 'Expected an existing live sale in the verification window';
 END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_summary->'rows') r GROUP BY r->>'branch_id' HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Report lists the same branch more than once';
 END IF;

 FOREACH v_view IN ARRAY ARRAY['summary','daily','shifts','transactions'] LOOP
  v_report := public.read_operational_report(v_view,v_from,v_to,NULL,NULL,NULL,NULL,NULL,'operational',5001,0);
  IF v_report->'totals' IS DISTINCT FROM v_totals THEN
   RAISE EXCEPTION 'Canonical totals differ for %',v_view;
  END IF;
  IF (v_report->>'total_rows')::bigint > 5001 THEN
   RAISE EXCEPTION 'Verification window too broad for row-by-row reconciliation';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['recorded_sales','net_sales','cash','qr','other','confirmed','sales_count'] LOOP
   IF coalesce((SELECT sum((r->>v_field)::numeric) FROM jsonb_array_elements(v_report->'rows') r),0)
      <> coalesce((v_totals->>v_field)::numeric,0) THEN
    RAISE EXCEPTION 'Row reconciliation failed for %.%',v_view,v_field;
   END IF;
  END LOOP;
 END LOOP;
 v_report := public.read_operational_report('transactions',v_from,v_to,NULL,NULL,NULL,NULL,NULL,'operational',1,1);
 IF v_report->'totals' IS DISTINCT FROM v_totals OR jsonb_array_length(v_report->'rows')>1 THEN
  RAISE EXCEPTION 'Pagination changed the total';
 END IF;
 v_receipt_target := (v_report->'rows'->0->>'transaction_id')::uuid;
 IF v_receipt_target IS NULL THEN RAISE EXCEPTION 'Could not identify sample transaction'; END IF;
 v_receipt := public.read_operational_report('receipt',v_from,v_to,NULL,NULL,NULL,NULL,v_receipt_target,'operational',1,0);
 IF (v_receipt->'receipt'->>'transaction_id')::uuid IS DISTINCT FROM v_receipt_target
    OR jsonb_typeof(v_receipt->'receipt'->'items') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Sample receipt is not attached to its original transaction';
 END IF;
 SELECT * INTO STRICT v_source FROM public.pos_transactions t
  WHERE t.id=v_receipt_target AND t.organization_id=public.organization_id();
 IF (v_receipt->'receipt'->>'branch_id')::uuid IS DISTINCT FROM v_source.branch_id
    OR (v_receipt->'receipt'->>'cashier_id')::uuid IS DISTINCT FROM v_source.created_by
    OR (v_receipt->'receipt'->>'shift_id')::uuid IS DISTINCT FROM v_source.shift_id
    OR (v_receipt->'receipt'->>'transaction_total')::numeric IS DISTINCT FROM v_source.total
    OR (v_receipt->'receipt'->>'discount_amount')::numeric IS DISTINCT FROM v_source.discount THEN
  RAISE EXCEPTION 'Receipt amount, discount, branch, cashier or shift differs from raw POS ledger';
 END IF;

 v_owner_scoped := public.read_operational_report('summary',v_from,v_to,NULL,v_manager,NULL,NULL,NULL,'operational',5001,0);
 PERFORM set_config('request.jwt.claim.sub',v_manager::text,true);
 IF public.user_role() IS DISTINCT FROM 'AREA_MANAGER' THEN RAISE EXCEPTION 'Expected AM scope'; END IF;
 v_summary := public.read_operational_report('summary',v_from,v_to,NULL,NULL,NULL,NULL,NULL,'operational',5001,0);
 IF v_summary->'totals' IS DISTINCT FROM v_owner_scoped->'totals' THEN
  RAISE EXCEPTION 'Totals differ for identical branch assignments';
 END IF;
 FOR v_branch IN SELECT (r->>'branch_id')::uuid FROM jsonb_array_elements(v_summary->'rows') r LOOP
  IF v_branch IS NULL OR NOT public.has_branch_access(v_branch) THEN
   RAISE EXCEPTION 'Combined AM view included an unassigned branch';
  END IF;
 END LOOP;
 v_report := public.read_operational_report('summary',v_from,v_to,v_owned,NULL,NULL,NULL,NULL,'operational',50,0);
 SELECT count(*) INTO v_n FROM jsonb_array_elements(v_report->'rows') r
  WHERE (r->>'branch_id')::uuid = v_owned;
 IF v_n<>1 THEN RAISE EXCEPTION 'Assigned branch missing from AM report'; END IF;
 BEGIN
  PERFORM public.read_operational_report('summary',v_from,v_to,v_denied,NULL,NULL,NULL,NULL,'operational',50,0);
  RAISE EXCEPTION 'Unassigned branch returned to AM';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.read_operational_report('summary',v_from,v_to,NULL,v_manager,NULL,NULL,NULL,'operational',50,0);
  RAISE EXCEPTION 'AM filter unexpectedly allowed for AM';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$release$;
RESET ROLE;
SELECT true AS report_read_only_reconciled, true AS am_scope_verified, true AS receipt_original_verified;
ROLLBACK;
