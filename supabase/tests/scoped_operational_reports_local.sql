-- Run only in an empty, disposable PostgreSQL database:
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/scoped_operational_reports_local.sql
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TYPE public.user_role AS ENUM ('AREA_MANAGER', 'STAFF', 'ADMIN', 'SUPER_ADMIN', 'OPERATION_MANAGER',
 'HR', 'FINANCE', 'CEO_FACTORY', 'MAINTENANCE_MANAGER');
CREATE TYPE public.movement_type AS ENUM ('RECEIVE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT',
 'COUNT', 'WRITE_OFF', 'SALE_DEDUCT', 'PRODUCTION');
CREATE FUNCTION public.test_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT lpad(n::text, 32, '0')::uuid $$;
CREATE TABLE public.regions(id uuid PRIMARY KEY, organization_id uuid, name text);
CREATE TABLE public.branches(id uuid PRIMARY KEY, organization_id uuid, region_id uuid, branch_code text, branch_name text,
 status text NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE public.profiles(id uuid PRIMARY KEY, organization_id uuid, role public.user_role, status text,
 region_id uuid, branch_id uuid, full_name text);
CREATE TABLE public.profile_branch_access(profile_id uuid, branch_id uuid, UNIQUE (profile_id, branch_id));
CREATE TABLE public.audit_logs(organization_id uuid, user_id uuid, action text, entity_type text, entity_id uuid,
 old_values jsonb, new_values jsonb);
CREATE TABLE public.pos_shifts(id uuid PRIMARY KEY, organization_id uuid, branch_id uuid, shift_number text,
 opened_at timestamptz, closed_at timestamptz, actual_work_ended_at timestamptz);
CREATE TABLE public.pos_transactions(id uuid PRIMARY KEY, organization_id uuid, branch_id uuid, shift_id uuid,
 created_by uuid, transaction_number text, status text, created_at timestamptz, payment_method text,
 total numeric, cash_amount numeric, change_amount numeric, qr_amount numeric);
CREATE TABLE public.pos_transaction_items(id uuid PRIMARY KEY, transaction_id uuid,
 product_name text, sku text, quantity integer, unit_price numeric, line_total numeric);
CREATE TABLE public.pos_payments(transaction_id uuid);
CREATE TABLE public.pos_receipts(id uuid PRIMARY KEY, transaction_id uuid, receipt_number text,
 created_at timestamptz, receipt_data jsonb);
CREATE TABLE public.pos_online_payments(id uuid PRIMARY KEY, organization_id uuid, branch_id uuid, shift_id uuid,
 created_by uuid, transaction_id uuid, status text, provider text, amount_rm numeric, created_at timestamptz,
 paid_at timestamptz, sale_payload jsonb);
CREATE TABLE public.pos_trial_sale_markers(transaction_id uuid);
CREATE TABLE public.pos_trial_payment_markers(payment_id uuid);
CREATE TABLE public.pos_trial_shift_markers(shift_id uuid);
CREATE VIEW public.pos_operational_transactions WITH (security_invoker = true) AS
 SELECT t.* FROM public.pos_transactions t
 WHERE NOT EXISTS (SELECT 1 FROM public.pos_trial_sale_markers m WHERE m.transaction_id = t.id);
CREATE VIEW public.pos_operational_shifts WITH (security_invoker = true) AS
 SELECT s.* FROM public.pos_shifts s
 WHERE NOT EXISTS (SELECT 1 FROM public.pos_trial_shift_markers m WHERE m.shift_id = s.id);
CREATE TABLE public.inventory_locations(id uuid PRIMARY KEY, organization_id uuid, branch_id uuid, name text,
 location_type text NOT NULL DEFAULT 'BRANCH_KIOSK');
CREATE TABLE public.stock_items(id uuid PRIMARY KEY, organization_id uuid, item_code text, name text,
 min_threshold numeric, critical_threshold numeric);
CREATE TABLE public.inventory_balances(id uuid PRIMARY KEY, organization_id uuid, location_id uuid,
 stock_item_id uuid, quantity numeric, unit text);
CREATE TABLE public.stock_movements(id uuid PRIMARY KEY, organization_id uuid, location_id uuid,
 stock_item_id uuid, movement_type public.movement_type, quantity numeric, unit text, balance_before numeric,
 balance_after numeric, reference_type text, reference_id uuid, created_by uuid, created_at timestamptz, notes text);
CREATE TABLE public.delivery_orders(organization_id uuid, created_at timestamptz, status text);
CREATE TABLE public.payroll_runs(organization_id uuid, period_start date, period_end date, status text, total_net numeric);
CREATE TABLE public.finance_collections(organization_id uuid, status text, amount numeric);
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER TABLE public.pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_receipts ENABLE ROW LEVEL SECURITY;

\ir ../migrations/20260826234500_harden_active_tenant_pos_boundaries.sql

-- Model the broader same-tenant payment/stock policies and the restricted
-- profile-name lookup. Scope must still hold when another row is readable.
ALTER TABLE public.pos_online_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_tenant ON public.pos_online_payments FOR SELECT TO authenticated
 USING (organization_id = public.organization_id());
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_scope ON public.profiles FOR SELECT TO authenticated USING (
 id = auth.uid() OR (organization_id = public.organization_id() AND public.has_branch_access(branch_id))
);

INSERT INTO public.regions VALUES (test_id(51), test_id(1), 'North'), (test_id(52), test_id(1), 'South');
INSERT INTO public.branches(id, organization_id, region_id, branch_code, branch_name) VALUES
 (test_id(11), test_id(1), test_id(51), 'A', 'Assigned A'),
 (test_id(12), test_id(1), test_id(51), 'B', 'Assigned B'),
 (test_id(13), test_id(1), test_id(52), 'X', 'Other area'),
 (test_id(14), test_id(2), test_id(51), 'Y', 'Other tenant'),
 (test_id(15), test_id(1), test_id(52), 'G', 'Explicit grant'),
 (test_id(16), test_id(1), test_id(51), 'N', 'Unassigned in same region');
INSERT INTO public.profiles VALUES
 (test_id(21), test_id(1), 'AREA_MANAGER', 'ACTIVE', test_id(51), null, 'AM'),
 (test_id(22), test_id(1), 'STAFF', 'ACTIVE', test_id(52), test_id(13), 'Transferred cashier'),
 (test_id(23), test_id(1), 'ADMIN', 'ACTIVE', null, null, 'Admin'),
 (test_id(24), test_id(1), 'AREA_MANAGER', 'INACTIVE', test_id(51), null, 'Inactive'),
 (test_id(25), test_id(1), 'AREA_MANAGER', 'ACTIVE', null, null, 'No branches');
INSERT INTO public.profile_branch_access VALUES (test_id(21), test_id(11)), (test_id(21), test_id(12)),
 (test_id(21), test_id(15)), (test_id(21), test_id(14));
\ir ../migrations/20261127090000_pin_area_manager_branch_assignments.sql
\ir ../migrations/20261127100000_scoped_operational_reports.sql
INSERT INTO public.pos_shifts VALUES
 (test_id(31), test_id(1), test_id(11), 'Original overnight', '2026-11-27 20:00+08', '2026-11-28 04:30+08', '2026-11-28 04:00+08'),
 (test_id(32), test_id(1), test_id(12), 'Branch B shift', '2026-11-27 09:00+08', null, null),
 (test_id(33), test_id(1), test_id(13), 'Unassigned shift', '2026-11-27 09:00+08', null, null),
 (test_id(34), test_id(2), test_id(14), 'Other tenant shift', '2026-11-27 09:00+08', null, null);
INSERT INTO public.pos_transactions VALUES
 (test_id(101), test_id(1), test_id(11), test_id(31), test_id(22), 'CASH', 'COMPLETED',
  '2026-11-27 23:59:59.999999+08', 'CASH', 10, 20, 10, 0),
 (test_id(102), test_id(1), test_id(11), test_id(31), test_id(22), 'MIX', 'COMPLETED',
  '2026-11-28 00:00:00+08', 'MIXED', 12, 10, 2, 4),
 (test_id(103), test_id(1), test_id(11), test_id(31), test_id(22), 'LATE', 'COMPLETED',
  '2026-11-28 03:00+08', 'QR', 7, 0, 0, 7),
 (test_id(104), test_id(1), test_id(12), test_id(32), test_id(21), 'LEGACY', 'COMPLETED',
  '2026-11-27 12:00+08', 'QR', 3, 0, 0, 3),
 (test_id(105), test_id(1), test_id(13), test_id(33), test_id(22), 'OUT', 'COMPLETED',
  '2026-11-27 12:00+08', 'CASH', 900, 900, 0, 0),
 (test_id(106), test_id(2), test_id(14), test_id(34), test_id(22), 'FOREIGN', 'COMPLETED',
  '2026-11-27 12:00+08', 'CASH', 800, 800, 0, 0),
 (test_id(107), test_id(1), test_id(11), test_id(31), test_id(22), 'TRIAL', 'COMPLETED',
  '2026-11-27 22:00+08', 'CASH', 700, 700, 0, 0),
 (test_id(108), test_id(1), test_id(11), test_id(31), test_id(22), 'VOID', 'VOIDED',
  '2026-11-27 22:00+08', 'CASH', 100, 100, 0, 0),
 (test_id(109), test_id(1), test_id(11), test_id(31), test_id(22), 'REFUND', 'REFUNDED',
  '2026-11-27 22:00+08', 'CASH', 100, 100, 0, 0);
INSERT INTO public.pos_trial_sale_markers VALUES (test_id(107));
INSERT INTO public.pos_online_payments VALUES
 (test_id(201), test_id(1), test_id(11), test_id(31), test_id(22), test_id(102), 'PENDING', 'manual_qr', 4,
  '2026-11-28 00:00+08', null, '{"sensitive": true}'),
 (test_id(202), test_id(1), test_id(11), test_id(31), test_id(22), test_id(103), 'PAID', 'fiuu_vt', 7,
  '2026-11-27 23:58+08', '2026-11-28 03:00+08', '{}'),
 (test_id(203), test_id(1), test_id(11), test_id(31), test_id(22), test_id(103), 'FAILED', 'fiuu_vt', 7,
  '2026-11-27 23:57+08', null, '{}'),
 (test_id(204), test_id(1), test_id(13), test_id(33), test_id(22), null, 'PENDING', 'fiuu_vt', 90,
  '2026-11-27 22:00+08', null, '{}'),
 (test_id(205), test_id(1), test_id(11), test_id(31), test_id(22), null, 'QUARANTINED', 'fiuu_vt', 6,
  '2026-11-27 22:30+08', null, '{"sensitive": true}'),
 (test_id(206), test_id(1), test_id(11), test_id(31), test_id(22), null, 'PENDING', 'fiuu_vt', 60,
  '2026-11-27 22:30+08', null, '{}'),
 (test_id(207), test_id(1), test_id(13), test_id(32), test_id(21), test_id(104), 'PAID', 'fiuu_vt', 3,
  '2026-11-27 11:00+08', '2026-11-27 12:00+08', '{}');
INSERT INTO public.pos_trial_payment_markers VALUES (test_id(206));
INSERT INTO public.pos_receipts VALUES
 (test_id(301), test_id(103), 'Original receipt', '2026-11-28 03:00+08', '{"email": "private@example.invalid"}'),
 (test_id(302), test_id(103), 'Reprint', '2026-11-28 04:00+08', '{}');
INSERT INTO public.pos_transaction_items VALUES
 (test_id(401), test_id(103), 'Kaya toast', 'TOAST', 2, 3.50, 7),
 (test_id(402), test_id(105), 'Secret product', 'OUT', 90, 10, 900);
INSERT INTO public.inventory_locations(id, organization_id, branch_id, name) VALUES
 (test_id(61), test_id(1), test_id(11), 'A kiosk'), (test_id(62), test_id(1), test_id(12), 'B kiosk'),
 (test_id(63), test_id(1), test_id(13), 'Out-of-scope kiosk'), (test_id(64), test_id(1), null, 'HQ'),
 (test_id(65), test_id(2), test_id(11), 'Foreign malformed location'), (test_id(66), test_id(1), test_id(14), 'Foreign malformed branch');
INSERT INTO public.inventory_locations VALUES (test_id(67), test_id(1), test_id(11), 'Factory for branch', 'FACTORY');
INSERT INTO public.stock_items VALUES
 (test_id(71), test_id(1), 'X', 'Toast', 5, 1), (test_id(72), test_id(2), 'Y', 'Foreign item', 5, 1);
INSERT INTO public.inventory_balances VALUES
 (test_id(501), test_id(1), test_id(61), test_id(71), 4, 'PCS'),
 (test_id(502), test_id(1), test_id(62), test_id(71), 6, 'PCS'),
 (test_id(503), test_id(1), test_id(63), test_id(71), 0, 'PCS'),
 (test_id(504), test_id(1), test_id(64), test_id(71), 0, 'PCS'),
 (test_id(505), test_id(1), test_id(65), test_id(71), 0, 'PCS'),
 (test_id(506), test_id(1), test_id(66), test_id(71), 0, 'PCS'),
 (test_id(507), test_id(2), test_id(61), test_id(71), 0, 'PCS'),
 (test_id(508), test_id(1), test_id(61), test_id(72), 0, 'PCS'),
 (test_id(509), test_id(1), test_id(67), test_id(71), 6, 'PCS');
INSERT INTO public.stock_movements VALUES
 (test_id(601), test_id(1), test_id(61), test_id(71), 'TRANSFER_OUT', -2, 'PCS', 6, 4, 'stock_transfer', test_id(1),
  test_id(21), '2026-11-27 23:59:59.999999+08', 'don’t expose the other side'),
 (test_id(602), test_id(1), test_id(63), test_id(71), 'TRANSFER_IN', 2, 'PCS', 1, 3, 'stock_transfer', test_id(1),
  test_id(22), '2026-11-27 23:59:59.999999+08', 'other side'),
 (test_id(603), test_id(1), test_id(62), test_id(71), 'ADJUSTMENT', 1, 'PCS', 5, 6, null, null,
  test_id(21), '2026-11-28 00:00+08', null);
INSERT INTO public.payroll_runs VALUES (test_id(1), '2026-11-27', '2026-11-27', 'APPROVED', 400);
INSERT INTO public.finance_collections VALUES (test_id(1), 'PENDING', 500);
INSERT INTO public.delivery_orders VALUES (test_id(1), '2026-11-27 16:00+08', 'PENDING');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', test_id(21)::text, true);
DO $am$
DECLARE r jsonb;
BEGIN
 r := read_scoped_report('scope','2026-11-27','2026-11-27');
 IF jsonb_array_length(r->'branches') <> 3 OR r->>'organization_wide' <> 'false' OR r::text LIKE '%Other tenant%' THEN
  RAISE EXCEPTION 'Wrong AM branch grants: %', r;
 END IF;
 r := read_scoped_report('overview','2026-11-27','2026-11-27')->'overview';
 IF (r->>'total_sales', r->>'total_cash', r->>'total_qr', r->>'pending_qr', r->>'unverified_qr',
     r->>'transaction_count', r->>'void_count', r->>'refund_count', r->>'low_stock_count')
    IS DISTINCT FROM ('20','10','7','0','3','3','1','1','1')
    OR r ?| ARRAY['payroll_net','outstanding_cash','deliveries_pending'] THEN
  RAISE EXCEPTION 'Incorrect or leaked overview: %', r;
 END IF;
 r := read_scoped_report('sales','2026-11-27','2026-11-28')->'trend';
 IF jsonb_array_length(r) <> 2 OR r->0->>'total_sales' <> '20'
   OR r->1->>'total_sales' <> '12' OR r->1->>'pending_qr' <> '4' OR r->1->>'total_cash' <> '8' THEN
  RAISE EXCEPTION 'Bad MYT or mix totals: %', r;
 END IF;
 r := read_scoped_report('staff','2026-11-27','2026-11-28',test_id(11))->'staff';
 IF jsonb_array_length(r) <> 1 OR r->0->>'cashier_id' <> test_id(22)::text
   OR r->0->>'branch_name' <> 'Assigned A' OR r->0->>'shift_id' <> test_id(31)::text
   OR (r->0->>'closed_at')::timestamptz <> '2026-11-28 04:00+08'
   OR r->0->>'total_sales' <> '29' OR r->0->>'transaction_count' <> '3' THEN
  RAISE EXCEPTION 'Wrong historic attribution: %', r;
 END IF;
 r := read_scoped_report('branches','2026-11-27','2026-11-27')->'branches';
 IF jsonb_array_length(r) <> 2 OR r->0->>'branch_id' <> test_id(11)::text
   OR r->0->>'total_sales' <> '17' OR r->1->>'total_sales' <> '3' THEN
  RAISE EXCEPTION 'Wrong branch totals: %', r;
 END IF;
 r := read_scoped_report('products','2026-11-27','2026-11-27')->'products';
 IF jsonb_array_length(r) <> 1 OR r->0->>'sku' <> 'TOAST' OR r->0->>'quantity_sold' <> '2' THEN
  RAISE EXCEPTION 'Product tally not scoped to original checkout date: %', r;
 END IF;
 r := read_scoped_report('receipt','2026-11-27','2026-11-27',test_id(11),1,0,null,test_id(103))->'receipt';
 IF r IS NULL OR r->>'receipt_number' <> 'Original receipt' OR r->>'qr_confirmed' <> '7'
   OR jsonb_array_length(r->'items') <> 1 OR r::text LIKE '%private@%' THEN
  RAISE EXCEPTION 'Receipt duplicated or exposed private data: %', r;
 END IF;
 r := read_scoped_report('receipt','2026-11-27','2026-11-27',null,1,0,null,test_id(105))->'receipt';
 IF r IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Receipt for out-of-scope transaction: %',r; END IF;
 r := read_scoped_report('transactions','2026-11-27','2026-11-28',null,5001)->'transactions';
 IF jsonb_array_length(r) <> 6 OR r::text LIKE '%FOREIGN%' OR r::text LIKE '%TRIAL%' OR r::text LIKE '%"OUT"%' THEN
  RAISE EXCEPTION 'Incorrect transaction/export rows: %', r;
 END IF;
 r := read_scoped_report('payments','2026-11-27','2026-11-28')->'payments';
 IF jsonb_array_length(r) <> 1 OR r->0->>'status' <> 'QUARANTINED' OR r::text LIKE '%sensitive%' THEN
  RAISE EXCEPTION 'Unposted payment data not scoped: %', r;
 END IF;
 r := read_scoped_report('inventory','2026-11-27','2026-11-27',null,5001)->'items';
 IF jsonb_array_length(r) <> 2 OR r->0->>'status' <> 'LOW' OR r->1->>'status' <> 'OK' THEN
  RAISE EXCEPTION 'Inventory list/export scope: %', r;
 END IF;
 r := read_scoped_report('movements','2026-11-27','2026-11-27',null,5001,0,'TRANSFER_OUT')->'movements';
 IF jsonb_array_length(r) <> 1 OR r->0->>'branch_name' <> 'Assigned A' OR r->0->>'quantity' <> '-2'
   OR r->0 ? 'notes' THEN
  RAISE EXCEPTION 'Movement parity/filter or data leak: %', r;
 END IF;
 IF r IS DISTINCT FROM read_scoped_report('movements','2026-11-27','2026-11-28',null,50,0,'OUTBOUND')->'movements'
   OR r IS DISTINCT FROM read_scoped_report('movements','2026-11-27','2026-11-28',null,50,0,'TRANSFER')->'movements' THEN
  RAISE EXCEPTION 'Movement category or scope does not match the underlying ledger';
 END IF;
 BEGIN
  PERFORM read_scoped_report('inventory','2026-11-27','2026-11-27',test_id(13),5001);
  RAISE EXCEPTION 'Export accepted a same-tenant branch outside AM scope';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM read_scoped_report('sales','2026-11-27','2026-11-27',test_id(16));
  RAISE EXCEPTION 'An unassigned branch was accessible through the old region';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM read_scoped_report('overview','2026-11-27','2026-11-27',test_id(14));
  RAISE EXCEPTION 'Export/aggregate accepted a different-tenant branch';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM read_scoped_report('fleet','2026-11-27','2026-11-27');
  RAISE EXCEPTION 'Scoped role received fleet aggregate';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $am$;

-- No report has to wait on a coordinated role/session refresh after a grant change.
RESET ROLE;
DELETE FROM public.profile_branch_access WHERE branch_id = test_id(15);
UPDATE public.pos_online_payments SET status = 'PAID', paid_at = '2026-11-30 09:00+08' WHERE id = test_id(201);
SET LOCAL ROLE authenticated;
DO $changed$
DECLARE r jsonb;
BEGIN
 r := read_scoped_report('overview','2026-11-28','2026-11-28')->'overview';
 IF r->>'total_sales' <> '12' OR r->>'total_qr' <> '4' OR r->>'pending_qr' <> '0' THEN
  RAISE EXCEPTION 'Late manual confirmation changed date or duplicated the sale: %', r;
 END IF;
 BEGIN
  PERFORM read_scoped_report('overview','2026-11-27','2026-11-27',test_id(15));
  RAISE EXCEPTION 'Branch grant removal did not take effect';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $changed$;

DO $roles$
DECLARE r jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub', test_id(25)::text, true);
 r := read_scoped_report('overview','2026-11-27','2026-11-28')->'overview';
 IF r->>'total_sales' <> '0' OR r->>'low_stock_count' <> '0' THEN
  RAISE EXCEPTION 'Empty scope leaked totals: %', r;
 END IF;
 PERFORM set_config('request.jwt.claim.sub', test_id(24)::text, true);
 BEGIN
  PERFORM read_scoped_report('scope','2026-11-27','2026-11-27');
  RAISE EXCEPTION 'Inactive profile received report';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub', test_id(22)::text, true);
 BEGIN
  PERFORM read_scoped_report('scope','2026-11-27','2026-11-27');
  RAISE EXCEPTION 'Staff without report permission received report';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub', test_id(23)::text, true);
 r := read_scoped_report('overview','2026-11-27','2026-11-27')->'overview';
 IF r->>'total_sales' <> '920' OR r->>'payroll_net' <> '400' OR r->>'outstanding_cash' <> '500'
   OR r->>'deliveries_pending' <> '1' OR r->>'low_stock_count' <> '3' THEN
  RAISE EXCEPTION 'Org-wide admin results wrong: %', r;
 END IF;
 r := read_scoped_report('overview','2026-11-27','2026-11-27',test_id(11))->'overview';
 IF r->>'total_sales' <> '17' OR r ?| ARRAY['payroll_net','outstanding_cash','deliveries_pending'] THEN
  RAISE EXCEPTION 'Branch-filtered admin totals wrong: %', r;
 END IF;
END $roles$;
RESET ROLE;
ROLLBACK;
