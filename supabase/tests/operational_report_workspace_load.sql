-- Included by operational_report_workspace_local.sql in its rollback-only
-- disposable fixture. About 650 visible October sales in six months of
-- history, with real POS table constraints and a separate tenant.
RESET ROLE;
CREATE TEMP TABLE fixture_bulk_shifts ON COMMIT DROP AS
SELECT (d.n * 4 + b.n - 11) AS n, test_id(10000 + d.n * 4 + b.n - 11) AS shift_id,
  test_id(CASE WHEN b.n = 14 THEN 2 ELSE 1 END) AS organization_id, test_id(b.n) AS branch_id,
  test_id(CASE WHEN b.n = 14 THEN 28 ELSE 27 END) AS cashier_id,
  DATE '2026-10-31' - (181-d.n) AS day
FROM generate_series(0,181) d(n) CROSS JOIN generate_series(11,14) b(n);
INSERT INTO public.pos_shifts (id, organization_id, branch_id, shift_number, opened_by, status, opened_at,
  closed_at, opening_cash, expected_cash, closing_cash, cash_variance)
SELECT s.shift_id, s.organization_id, s.branch_id, 'Bulk-'||s.n, s.cashier_id, 'CLOSED',
  (s.day + TIME '08:00') AT TIME ZONE 'Asia/Kuala_Lumpur',
  (s.day + TIME '18:00') AT TIME ZONE 'Asia/Kuala_Lumpur', 50, 100, 100, 0
FROM fixture_bulk_shifts s;
INSERT INTO public.pos_transactions (id, organization_id, branch_id, shift_id, created_by, transaction_number,
  payment_method, created_at, subtotal, discount, total, cash_amount, qr_amount)
SELECT test_id(100000 + s.n * 100 + r.n), s.organization_id, s.branch_id, s.shift_id, s.cashier_id,
  'Bulk-sale-'||s.n||'-'||r.n,
  CASE WHEN r.n % 7 IN (1,3,5) THEN 'QR' ELSE 'CASH' END::public.payment_method,
  (s.day + TIME '08:05' + r.n * INTERVAL '13 minutes') AT TIME ZONE 'Asia/Kuala_Lumpur',
  5 + r.n % 11, 0.5, 4.5 + r.n % 11,
  CASE WHEN r.n % 7 IN (1,3,5) THEN 0 ELSE 4.5 + r.n % 11 END,
  CASE WHEN r.n % 7 IN (1,3,5) THEN 4.5 + r.n % 11 ELSE 0 END
FROM fixture_bulk_shifts s CROSS JOIN LATERAL generate_series(1, CASE WHEN s.day >= DATE '2026-10-01' THEN 7 ELSE 29 END) r(n);
INSERT INTO public.pos_online_payments (id, organization_id, branch_id, shift_id, created_by, transaction_id,
  status, provider, amount_rm, created_at, paid_at, sale_payload)
SELECT test_id(200000 + s.n * 100 + r.n), t.organization_id, t.branch_id, t.shift_id, t.created_by, t.id,
  CASE WHEN s.n % 25 = 0 THEN 'REPORTED' ELSE 'PAID' END,
  CASE WHEN s.n % 25 = 0 THEN 'manual_qr' ELSE 'fiuu_vt' END,
  t.qr_amount, t.created_at,
  CASE WHEN s.n % 25 <> 0 THEN t.created_at + INTERVAL '20 seconds' END, '{}'
FROM fixture_bulk_shifts s
CROSS JOIN LATERAL generate_series(1, CASE WHEN s.day >= DATE '2026-10-01' THEN 7 ELSE 29 END) r(n)
JOIN public.pos_transactions t ON t.id = test_id(100000 + s.n * 100 + r.n)
WHERE t.payment_method = 'QR';
ANALYZE public.pos_transactions;
ANALYZE public.pos_online_payments;
ANALYZE public.pos_shifts;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', test_id(23)::text, true);
DO $load$
DECLARE a jsonb; b jsonb; v text; d date := '2026-10-01'; e date := '2026-10-31';
BEGIN
  a := read_operational_report('summary',d,e,null,null,null,null,null,'operational',50,0);
  PERFORM check_report(a->'totals' @> '{"sales_count":652,"shift_count":94,"other":0}', 'month load exact counts');
  FOREACH v IN ARRAY ARRAY['daily','shifts','transactions','actions'] LOOP
    b := read_operational_report(v,d,e,null,null,null,null,null,'operational',5001,0);
    PERFORM check_report(a->'totals' = b->'totals', 'exact unpaginated month totals across ' || v);
    IF v <> 'actions' THEN
      PERFORM check_report((SELECT sum((row->>'net_sales')::numeric) FROM jsonb_array_elements(b->'rows') row)
        = (a->'totals'->>'net_sales')::numeric, 'month row-to-total net reconciliation for ' || v);
      PERFORM check_report((SELECT sum((row->>'confirmed')::numeric) FROM jsonb_array_elements(b->'rows') row)
        = (a->'totals'->>'confirmed')::numeric, 'month row-to-total collections reconciliation for ' || v);
    END IF;
  END LOOP;
END;
$load$;
-- Timings are diagnostic only; plans and hardware vary.
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
  SELECT public.read_operational_report('summary','2026-10-01','2026-10-31',null,null,null,null,null,'operational',50,0);
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
  SELECT public.read_operational_report('transactions','2026-10-01','2026-10-31',null,null,null,null,null,'operational',25,10);
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
  SELECT public.read_operational_report('shifts','2026-10-31','2026-10-31',test_id(11),null,null,test_id(10724),null,'operational',25,0);
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
  SELECT p.id FROM public.pos_online_payments p
  WHERE p.organization_id = test_id(1) AND p.branch_id = test_id(11)
    AND p.created_at >= '2026-10-01 00:00+08' AND p.created_at < '2026-11-01 00:00+08';
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
  SELECT t.id FROM public.pos_transactions t
  WHERE t.organization_id = test_id(1) AND t.branch_id = test_id(11) AND t.shift_id = test_id(10724);
