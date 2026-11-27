-- Disposable, empty PostgreSQL 15+: psql -X -v ON_ERROR_STOP=1 -f this-file.sql
-- Minimal supporting schema; use the actual POS tables, payment/transaction
-- read policies, explicit AM scope helper, and deployed report definitions.
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
CREATE TYPE public.pos_tx_status AS ENUM ('COMPLETED', 'VOIDED', 'REFUNDED');
CREATE TYPE public.pos_shift_status AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE public.payment_method AS ENUM ('CASH', 'QR', 'MIXED');
CREATE TYPE public.stock_unit AS ENUM ('PCS');
CREATE FUNCTION public.test_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT lpad(n::text, 32, '0')::uuid $$;
CREATE FUNCTION public.check_report(ok boolean, reason text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Operational report: %', reason; END IF; END $$;

CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.branches(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  region_id uuid, branch_code text NOT NULL, branch_name text NOT NULL, status text NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE public.profiles(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  role public.user_role, status text, region_id uuid, branch_id uuid REFERENCES branches, full_name text);
CREATE TABLE public.profile_branch_access(profile_id uuid REFERENCES profiles, branch_id uuid REFERENCES branches,
  PRIMARY KEY (profile_id, branch_id));
CREATE TABLE public.audit_logs(organization_id uuid, user_id uuid, action text, entity_type text, entity_id uuid,
  old_values jsonb, new_values jsonb);
CREATE TABLE public.staff(id uuid PRIMARY KEY, organization_id uuid, branch_id uuid, profile_id uuid);
CREATE TABLE public.products(id uuid PRIMARY KEY);
CREATE TABLE public.stock_items(id uuid PRIMARY KEY);
CREATE TABLE public.inventory_locations(id uuid PRIMARY KEY);
CREATE TABLE public.stock_movements(id uuid PRIMARY KEY);
CREATE TABLE public.finance_collections(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  branch_id uuid REFERENCES branches, shift_id uuid);
CREATE TABLE public.bank_in_records(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  collection_id uuid REFERENCES finance_collections, amount numeric NOT NULL, status text NOT NULL,
  banked_at timestamptz NOT NULL, verified_at timestamptz);
-- Deliberately broad same-tenant visibility in this fixture: the report
-- must still scope both sides of the deposit join even without a narrower RLS policy.
ALTER TABLE public.finance_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_in_records ENABLE ROW LEVEL SECURITY;

\ir ../migrations/00005_pos.sql
ALTER TABLE public.pos_shifts ADD COLUMN actual_work_ended_at timestamptz;
ALTER TABLE public.pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;
\ir ../migrations/20260826234500_harden_active_tenant_pos_boundaries.sql
CREATE POLICY finance_tenant ON public.finance_collections FOR SELECT TO authenticated USING (organization_id = public.organization_id());
CREATE POLICY bank_tenant ON public.bank_in_records FOR SELECT TO authenticated USING (organization_id = public.organization_id());
\ir ../migrations/00086_pos_verified_qr_payments.sql
\ir ../migrations/20260808132000_harden_pos_online_payment_mutations.sql
ALTER TABLE public.pos_online_payments DROP CONSTRAINT pos_online_payments_status_check,
  ADD CHECK (status IN ('PENDING', 'REPORTED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'QUARANTINED'));
ALTER TABLE public.pos_online_payments ADD COLUMN fiuu_vt_review_required boolean NOT NULL DEFAULT false;
\ir ../migrations/00105_pos_shift_staff_members.sql
ALTER TABLE public.pos_shift_staff_members DROP CONSTRAINT pos_shift_staff_members_status_check,
  ADD CHECK (status IN ('PENDING_APPROVAL', 'ACTIVE', 'ENDED', 'REJECTED'));
DROP POLICY pos_shift_staff_members_select ON public.pos_shift_staff_members;
CREATE POLICY shift_member_select ON public.pos_shift_staff_members FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.organization_id()) AND public.has_branch_access(branch_id));

CREATE TABLE public.pos_trial_sale_markers(transaction_id uuid PRIMARY KEY REFERENCES pos_transactions);
CREATE TABLE public.pos_trial_payment_markers(payment_id uuid PRIMARY KEY REFERENCES pos_online_payments);
CREATE TABLE public.pos_trial_shift_markers(shift_id uuid PRIMARY KEY REFERENCES pos_shifts);
ALTER TABLE public.pos_trial_sale_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_trial_payment_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_trial_shift_markers ENABLE ROW LEVEL SECURITY;
CREATE POLICY trial_sale_select ON public.pos_trial_sale_markers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.pos_transactions t WHERE t.id = transaction_id));
CREATE POLICY trial_payment_select ON public.pos_trial_payment_markers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.pos_online_payments p WHERE p.id = payment_id AND public.has_branch_access(p.branch_id)));
CREATE POLICY trial_shift_select ON public.pos_trial_shift_markers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.pos_shifts s WHERE s.id = shift_id));
CREATE VIEW public.pos_operational_transactions WITH (security_invoker = true) AS
  SELECT t.* FROM public.pos_transactions t WHERE NOT EXISTS (
    SELECT 1 FROM public.pos_trial_sale_markers m WHERE m.transaction_id = t.id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.pos_trial_payment_markers m JOIN public.pos_online_payments p ON p.id = m.payment_id
    WHERE (p.transaction_id, p.organization_id, p.branch_id, p.shift_id) = (t.id, t.organization_id, t.branch_id, t.shift_id)
  );
CREATE VIEW public.pos_operational_shifts WITH (security_invoker = true) AS
  SELECT s.* FROM public.pos_shifts s WHERE NOT EXISTS (SELECT 1 FROM public.pos_trial_shift_markers m WHERE m.shift_id = s.id);
CREATE TABLE public.fixture_plans(organization_id uuid, branch_id uuid, staff_id uuid, shift_date date,
  status text, scheduled_start time, scheduled_end time);
ALTER TABLE public.fixture_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_select ON public.fixture_plans FOR SELECT TO authenticated USING (
  organization_id = (SELECT public.organization_id()) AND public.has_branch_access(branch_id));
CREATE VIEW public.roster_planned_shifts WITH (security_invoker = true) AS SELECT * FROM public.fixture_plans;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY branch_select ON public.branches FOR SELECT TO authenticated USING (organization_id = (SELECT public.organization_id()));
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_select ON public.profiles FOR SELECT TO authenticated USING (
  id = (SELECT auth.uid()) OR (organization_id = (SELECT public.organization_id()) AND (
    (SELECT public.is_admin()) OR ((SELECT public.user_role()) = 'AREA_MANAGER' AND role = 'STAFF'
      AND public.has_branch_access(branch_id))
  )));
ALTER TABLE public.profile_branch_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY grant_select ON public.profile_branch_access FOR SELECT TO authenticated USING (
  profile_id = (SELECT auth.uid()) OR ((SELECT public.user_role()) IN ('SUPER_ADMIN', 'ADMIN', 'AREA_MANAGER')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id AND p.organization_id = (SELECT public.organization_id()))));
ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY shift_select ON public.pos_shifts FOR SELECT TO authenticated USING (
  organization_id = (SELECT public.organization_id()) AND public.has_branch_access(branch_id));
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_select ON public.staff FOR SELECT TO authenticated USING (
  organization_id = (SELECT public.organization_id()) AND public.has_branch_access(branch_id));
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE SELECT ON public.pos_trial_sale_markers, public.pos_trial_payment_markers, public.pos_trial_shift_markers FROM authenticated;
GRANT SELECT (transaction_id) ON public.pos_trial_sale_markers TO authenticated;
GRANT SELECT (payment_id) ON public.pos_trial_payment_markers TO authenticated;
GRANT SELECT (shift_id) ON public.pos_trial_shift_markers TO authenticated;

INSERT INTO organizations VALUES (test_id(1)), (test_id(2));
INSERT INTO branches VALUES
 (test_id(11), test_id(1), test_id(51), 'A', 'Assigned A', 'ACTIVE'),
 (test_id(12), test_id(1), test_id(51), 'B', 'Assigned B', 'ACTIVE'),
 (test_id(13), test_id(1), test_id(51), 'X', 'Unassigned, same region', 'ACTIVE'),
 (test_id(14), test_id(2), test_id(51), 'Y', 'Other tenant', 'ACTIVE'),
 (test_id(15), test_id(1), test_id(52), 'Z', 'Zero records', 'ACTIVE');
INSERT INTO profiles VALUES
 (test_id(21), test_id(1), 'AREA_MANAGER', 'ACTIVE', test_id(51), null, 'AM Alpha'),
 (test_id(22), test_id(1), 'STAFF', 'ACTIVE', test_id(51), test_id(13), 'Transferred cashier'),
 (test_id(23), test_id(1), 'ADMIN', 'ACTIVE', null, null, 'Admin'),
 (test_id(24), test_id(1), 'AREA_MANAGER', 'ACTIVE', null, null, 'AM Beta'),
 (test_id(25), test_id(1), 'AREA_MANAGER', 'INACTIVE', test_id(51), null, 'Inactive AM'),
 (test_id(26), test_id(1), 'AREA_MANAGER', 'ACTIVE', null, null, 'No assignments'),
 (test_id(27), test_id(1), 'STAFF', 'ACTIVE', test_id(51), test_id(11), 'Second cashier'),
 (test_id(28), test_id(2), 'AREA_MANAGER', 'ACTIVE', null, test_id(14), 'Foreign AM'),
 (test_id(29), test_id(1), 'STAFF', 'ACTIVE', test_id(51), test_id(11), 'Opening PIC'),
 (test_id(30), test_id(1), 'FINANCE', 'ACTIVE', null, null, 'Finance'),
 (test_id(40), test_id(1), 'SUPER_ADMIN', 'ACTIVE', null, null, 'Owner');
INSERT INTO profile_branch_access VALUES
 (test_id(21), test_id(11)), (test_id(21), test_id(12)), (test_id(24), test_id(11)),
 (test_id(21), test_id(14)), (test_id(28), test_id(14)); -- intentionally malformed cross-tenant grant
\ir ../migrations/20261127090000_pin_area_manager_branch_assignments.sql
\ir ../migrations/20261127100000_scoped_operational_reports.sql
\ir ../migrations/20261127221500_scoped_report_pos_details.sql
\ir ../migrations/20261128010000_operational_report_workspace.sql

INSERT INTO staff VALUES
 (test_id(301), test_id(1), test_id(13), test_id(22)), (test_id(302), test_id(1), test_id(11), test_id(27));
INSERT INTO fixture_plans VALUES
 (test_id(1), test_id(11), test_id(301), '2026-11-27', 'PUBLISHED', '19:00', '07:00'),
 (test_id(1), test_id(11), test_id(302), '2026-11-27', 'PUBLISHED', '19:00', '07:00'),
 (test_id(1), test_id(11), test_id(302), '2026-11-28', 'DRAFT', '00:00', '08:00'),
 (test_id(1), test_id(12), test_id(302), '2026-11-28', 'PUBLISHED', '00:00', '08:00');
INSERT INTO pos_shifts (id, organization_id, branch_id, shift_number, opened_by, status, opened_at, closed_at,
  actual_work_ended_at, opening_cash, expected_cash, closing_cash, cash_variance) VALUES
 (test_id(31), test_id(1), test_id(11), 'Overnight A', test_id(29), 'CLOSED', '2026-11-27 19:00+08',
   '2026-11-28 07:00+08', '2026-11-28 06:55+08', 50, 71, 69, -90),
 (test_id(32), test_id(1), test_id(12), 'Open B', test_id(29), 'OPEN', '2026-11-27 09:00+08', null, null, 20, null, null, null),
 (test_id(33), test_id(1), test_id(13), 'Unassigned X', test_id(22), 'CLOSED', '2026-11-27 08:00+08',
   '2026-11-27 14:00+08', null, 0, 90, 90, 0),
 (test_id(34), test_id(2), test_id(14), 'Foreign Y', test_id(28), 'CLOSED', '2026-11-27 08:00+08',
   '2026-11-27 14:00+08', null, 0, 900, 900, 0),
 (test_id(35), test_id(1), test_id(12), 'No sales, balanced', test_id(29), 'CLOSED', '2026-11-27 23:00+08',
   '2026-11-28 00:00+08', null, 0, 0, 0, 0),
 (test_id(36), test_id(1), test_id(11), 'Registered trial', test_id(29), 'CLOSED', '2026-11-27 18:00+08',
   '2026-11-27 18:30+08', null, 0, 5, 5, 0),
 (test_id(37), test_id(1), test_id(12), 'No cash count', test_id(29), 'CLOSED', '2026-11-27 08:00+08',
   '2026-11-27 08:59+08', null, 0, 0, null, null),
 (test_id(38), test_id(1), test_id(12), 'No expected cash', test_id(29), 'CLOSED', '2026-11-27 07:00+08',
   '2026-11-27 07:59+08', null, 0, null, 0, null);
INSERT INTO pos_trial_shift_markers VALUES (test_id(36));
INSERT INTO pos_shift_staff_members (organization_id, branch_id, shift_id, profile_id, full_name, status, started_at, ended_at) VALUES
 (test_id(1), test_id(11), test_id(31), test_id(22), 'Historical cashier name', 'ENDED', '2026-11-27 19:10+08', '2026-11-27 23:30+08'),
 (test_id(1), test_id(11), test_id(31), test_id(22), 'Historical cashier name', 'ENDED', '2026-11-27 23:45+08', '2026-11-28 06:40+08'),
 (test_id(1), test_id(11), test_id(31), test_id(27), 'Second cashier', 'ENDED', '2026-11-28 00:01+08', '2026-11-28 06:45+08'),
 (test_id(1), test_id(11), test_id(31), test_id(29), 'Opening PIC', 'PENDING_APPROVAL', '2026-11-27 19:00+08', null),
 (test_id(1), test_id(12), test_id(35), test_id(29), 'Opening PIC', 'ENDED', '2026-11-27 23:00+08', '2026-11-28 00:00+08');
INSERT INTO pos_transactions (id, organization_id, branch_id, shift_id, created_by, transaction_number, status,
  created_at, payment_method, subtotal, discount, total, cash_amount, change_amount, qr_amount) VALUES
 (test_id(101), test_id(1), test_id(11), test_id(31), test_id(22), 'CASH', 'COMPLETED', '2026-11-27 23:59:59.999999+08', 'CASH', 12, 2, 10, 20, 10, 0),
 (test_id(102), test_id(1), test_id(11), test_id(31), test_id(22), 'MIX', 'COMPLETED', '2026-11-28 00:00:00+08', 'MIXED', 12, 0, 12, 10, 2, 4),
 (test_id(103), test_id(1), test_id(11), test_id(31), test_id(22), 'LATE', 'COMPLETED', '2026-11-28 03:00+08', 'QR', 7, 0, 7, 0, 0, 7),
 (test_id(104), test_id(1), test_id(12), test_id(32), test_id(29), 'UNVERIFIED', 'COMPLETED', '2026-11-27 12:00+08', 'QR', 3, 0, 3, 0, 0, 3),
 (test_id(105), test_id(1), test_id(13), test_id(33), test_id(22), 'OUTSIDE-AM', 'COMPLETED', '2026-11-27 12:00+08', 'CASH', 90, 0, 90, 90, 0, 0),
 (test_id(106), test_id(2), test_id(14), test_id(34), test_id(28), 'FOREIGN', 'COMPLETED', '2026-11-27 12:00+08', 'CASH', 900, 0, 900, 900, 0, 0),
 (test_id(107), test_id(1), test_id(11), test_id(31), test_id(22), 'MARKED-SALE', 'COMPLETED', '2026-11-27 22:00+08', 'CASH', 2.50, 0, 2.50, 2.50, 0, 0),
 (test_id(108), test_id(1), test_id(11), test_id(31), test_id(22), 'VOID', 'VOIDED', '2026-11-27 21:00+08', 'CASH', 100, 0, 100, 100, 0, 0),
 (test_id(109), test_id(1), test_id(11), test_id(31), test_id(27), 'REFUND', 'REFUNDED', '2026-11-27 20:00+08', 'QR', 10, 0, 10, 0, 0, 10),
 (test_id(110), test_id(1), test_id(11), test_id(31), test_id(27), 'BACKDATED-LATE', 'COMPLETED', '2026-11-28 00:30+08', 'QR', 6, 0, 6, 0, 0, 6),
 (test_id(111), test_id(1), test_id(11), test_id(31), test_id(27), 'TRUE-ZERO', 'COMPLETED', '2026-11-27 23:00+08', 'CASH', 5, 5, 0, 0, 0, 0),
 (test_id(112), test_id(1), test_id(11), test_id(32), test_id(27), 'BAD-SHIFT-LINK', 'COMPLETED', '2026-11-27 23:15+08', 'CASH', 4, 0, 4, 4, 0, 0),
 (test_id(113), test_id(1), test_id(11), test_id(36), test_id(22), 'MARKED-SHIFT-SALE', 'COMPLETED', '2026-11-27 18:15+08', 'CASH', 5, 0, 5, 5, 0, 0),
 (test_id(114), test_id(1), test_id(11), test_id(31), test_id(22), 'LINKED-MARKED-PAYMENT', 'COMPLETED', '2026-11-27 22:20+08', 'QR', 2.50, 0, 2.50, 0, 0, 2.50),
 (test_id(115), test_id(1), test_id(11), test_id(31), test_id(22), 'REAL-SMALL', 'COMPLETED', '2026-11-27 22:30+08', 'CASH', 2.50, 0, 2.50, 2.50, 0, 0),
 (test_id(116), test_id(1), test_id(13), test_id(33), test_id(22), 'MARKED-OUTSIDE-AM', 'COMPLETED', '2026-11-27 13:30+08', 'CASH', 2.50, 0, 2.50, 2.50, 0, 0),
 (test_id(117), test_id(2), test_id(14), test_id(34), test_id(28), 'MARKED-FOREIGN', 'COMPLETED', '2026-11-27 13:30+08', 'CASH', 2.50, 0, 2.50, 2.50, 0, 0);
UPDATE pos_transactions SET voided_at = '2026-11-28 00:01+08', void_reason = 'Order cancelled' WHERE id = test_id(108);
UPDATE pos_transactions SET refunded_at = '2026-11-29 09:30+08', refund_reason = 'Original returned' WHERE id = test_id(109);
INSERT INTO pos_trial_sale_markers VALUES (test_id(107)), (test_id(116)), (test_id(117));
INSERT INTO pos_online_payments (id, organization_id, branch_id, shift_id, created_by, transaction_id, status, provider,
  amount_rm, created_at, paid_at, sale_payload) VALUES
 (test_id(201), test_id(1), test_id(11), test_id(31), test_id(29), test_id(102), 'PENDING', 'manual_qr', 4, '2026-11-28 00:00+08', null, '{}'),
 (test_id(202), test_id(1), test_id(11), test_id(31), test_id(22), test_id(103), 'PAID', 'fiuu_vt', 7, '2026-11-27 23:58+08', '2026-11-28 03:00+08', '{}'),
 (test_id(203), test_id(1), test_id(11), test_id(31), test_id(22), test_id(103), 'FAILED', 'fiuu_vt', 7, '2026-11-27 23:57+08', null, '{}'),
 (test_id(204), test_id(1), test_id(13), test_id(33), test_id(22), null, 'PENDING', 'fiuu_vt', 90, '2026-11-27 13:00+08', null, '{}'),
 (test_id(205), test_id(1), test_id(11), test_id(31), test_id(22), null, 'QUARANTINED', 'fiuu_vt', 6, '2026-11-27 22:30+08', null, '{"private":"secret"}'),
 (test_id(206), test_id(1), test_id(11), test_id(31), test_id(22), null, 'PENDING', 'fiuu_vt', 60, '2026-11-27 22:30+08', null, '{}'),
 (test_id(207), test_id(1), test_id(13), test_id(32), test_id(29), test_id(104), 'PAID', 'fiuu_vt', 3, '2026-11-27 11:00+08', '2026-11-27 12:00+08', '{}'),
 (test_id(208), test_id(1), test_id(11), test_id(31), test_id(27), test_id(110), 'PAID', 'fiuu_vt', 6, '2026-11-28 00:30+08', '2026-11-30 10:00+08', '{}'),
 (test_id(209), test_id(1), test_id(11), test_id(31), test_id(27), test_id(109), 'PAID', 'fiuu_vt', 10, '2026-11-27 20:00+08', '2026-11-27 20:10+08', '{}'),
 (test_id(210), test_id(1), test_id(11), test_id(31), test_id(22), test_id(114), 'PAID', 'fiuu_vt', 2.50, '2026-11-27 22:20+08', '2026-11-27 22:21+08', '{}'),
 (test_id(211), test_id(1), test_id(11), test_id(31), test_id(22), null, 'PAID', 'fiuu_vt', 19, '2026-11-27 22:40+08', '2026-11-27 22:41+08', '{}'),
 (test_id(212), test_id(1), test_id(11), test_id(31), test_id(22), test_id(103), 'PAID', 'manual_qr', 7, '2026-11-28 04:00+08', '2026-11-28 04:00+08', '{}'),
 (test_id(213), test_id(1), test_id(11), test_id(31), test_id(29), test_id(102), 'REPORTED', 'manual_qr', 4, '2026-11-28 00:10+08', null, '{}');
INSERT INTO pos_trial_payment_markers VALUES (test_id(206)), (test_id(210));

INSERT INTO finance_collections VALUES
 (test_id(701), test_id(1), test_id(11), test_id(31)),
 (test_id(702), test_id(1), test_id(13), null),
 (test_id(703), test_id(2), test_id(14), null),
 (test_id(704), test_id(1), test_id(11), test_id(36)),
 (test_id(705), test_id(1), null, null),
 (test_id(706), test_id(1), test_id(11), test_id(32));
INSERT INTO bank_in_records VALUES
 (test_id(801), test_id(1), test_id(701), 50, 'BANKED', '2026-11-27 00:00+08', null),
 (test_id(802), test_id(1), test_id(701), 80, 'VERIFIED', '2026-11-28 00:00+08', '2026-11-29 08:00+08'),
 (test_id(803), test_id(1), test_id(702), 100, 'BANKED', '2026-11-27 08:00+08', null),
 (test_id(804), test_id(2), test_id(703), 800, 'VERIFIED', '2026-11-27 12:00+08', '2026-11-27 15:00+08'),
 (test_id(805), test_id(1), test_id(704), 80, 'BANKED', '2026-11-27 08:00+08', null),
 (test_id(806), test_id(1), test_id(705), 80, 'BANKED', '2026-11-27 08:00+08', null),
 (test_id(807), test_id(1), test_id(706), 80, 'BANKED', '2026-11-27 08:00+08', null),
 (test_id(808), test_id(1), test_id(701), 80, 'PENDING', '2026-11-27 08:00+08', null),
 (test_id(809), test_id(1), test_id(703), 80, 'BANKED', '2026-11-27 08:00+08', null);

INSERT INTO products VALUES (test_id(401));
INSERT INTO pos_receipts (id, transaction_id, receipt_number, created_at, receipt_data) VALUES
 (test_id(501), test_id(103), 'Original receipt', '2026-11-28 03:00+08', '{"email":"private@example.invalid"}'),
 (test_id(502), test_id(103), 'Reprint', '2026-11-28 04:00+08', '{}');
INSERT INTO pos_transaction_items (id, transaction_id, product_id, product_name, sku, quantity, unit_price, line_total) VALUES
 (test_id(601), test_id(103), test_id(401), 'Kaya toast', 'TOAST', 2, 3.50, 7),
 (test_id(602), test_id(105), test_id(401), 'Out of scope', 'SECRET', 1, 90, 90);

-- Match deployed report-sensitive indexes on the representative fixture.
CREATE INDEX ON pos_transactions (organization_id, branch_id, status, created_at DESC);
CREATE INDEX ON pos_online_payments (transaction_id);
CREATE INDEX ON pos_online_payments (shift_id);
CREATE INDEX ON pos_receipts (transaction_id);
CREATE INDEX ON pos_transaction_items (transaction_id);
SET LOCAL TIME ZONE 'America/Los_Angeles';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', test_id(21)::text, true);

DO $am$
DECLARE a jsonb; b jsonb; x jsonb; v text; d date := '2026-11-27'; e date := '2026-11-28';
BEGIN
  a := read_operational_report('summary',d,e,null,null,null,null,null,'operational',1,0);
  b := read_operational_report('summary',d,e,null,null,null,null,null,'operational',2,0);
  PERFORM check_report(a->'totals' = b->'totals' AND a->>'total_rows' = '2' AND jsonb_array_length(a->'rows') = 1, 'pagination-independent summary');
  PERFORM check_report(a->'totals' @> '{"net_sales":29.5,"cash":24.5,"qr":13,"other":0,"confirmed":37.5,"recorded_sales":44.5,"sales_count":8,"shift_count":5}', 'AM totals, scope, reversal, mixed, and shift dedup: ' || (a->'totals')::text);
  PERFORM check_report(a->'filters'->'managers' = '[]' AND jsonb_array_length(a->'filters'->'branches') = 2
    AND a->'settlement' @> '{"label":"Bank masuk direkodkan","amount":130,"banked_amount":50,"verified_amount":80,"verified_count":1,"provider_settlement_available":false}',
    'AM filters and independent deposit ledger stay scoped');
  PERFORM check_report(read_operational_report('summary',d,d,test_id(11),null,null,null,null,'operational',1,0)->'settlement'
    @> '{"amount":50,"banked_amount":50,"verified_amount":null,"verified_count":0}', 'deposits use half-open banked time');
  PERFORM check_report(NOT (read_operational_report('summary',d,e,test_id(11),null,test_id(22),null,null,'operational',1,0) ? 'settlement')
    AND NOT (read_operational_report('summary',d,e,test_id(11),null,null,test_id(31),null,'operational',1,0) ? 'settlement')
    AND NOT (read_operational_report('summary',d,e,test_id(11),null,null,null,null,'trial',1,0) ? 'settlement'),
    'never imply cash deposits belong to cashier, shift, or trial cohort');
  PERFORM check_report(NOT (a::text LIKE '%Opening PIC%') OR NOT (a->'rows'->0 ? 'cashier_id'), 'summary does not attribute to opening PIC');
  a := read_operational_report('daily',d,e,test_id(11),null,null,null,null,'operational',10,0);
  PERFORM check_report(a->'rows' @> '[{"day":"2026-11-27","net_sales":23.5,"cash":16.5,"qr":7},{"day":"2026-11-28","net_sales":6,"confirmed":14,"cash":8,"qr":6}]', 'MYT boundary and original sale day: ' || (a->'rows')::text);
  PERFORM check_report((SELECT sum((j->>'review_count')::int) FROM jsonb_array_elements(a->'rows') j)
    = (a->'totals'->>'review_count')::int, 'daily review counts reconcile');
  a := read_operational_report('summary',e,e,test_id(12),null,null,null,null,'operational',10,0);
  PERFORM check_report(a->'totals'->>'shift_count' = '1', 'a shift closing exactly at midnight stays out of the following MYT day');
  FOREACH v IN ARRAY ARRAY['daily','shifts','transactions','actions'] LOOP
    b := read_operational_report(v,e,e,test_id(12),null,null,null,null,'operational',1,0);
    PERFORM check_report(a->'totals' = b->'totals', 'exact totals across views on close boundary: ' || v);
  END LOOP;
  a := read_operational_report('actions',e,e,test_id(12),null,null,null,null,'operational',20,0,'shift_open');
  b := read_operational_report('actions',d,e,test_id(12),null,null,null,null,'operational',20,0,'shift_open');
  PERFORM check_report(a->>'total_rows' = '1' AND a->'rows'->0->>'day' = e::text AND b->>'total_rows' = '1'
    AND b->'rows'->0->>'day' = d::text AND (a->'rows'->0->>'case_at')::timestamptz = '2026-11-27 09:00+08',
    'still-open overnight shift appears once per overlapping range with original opening time');
  a := read_operational_report('actions','9999-01-01','9999-01-01',test_id(12),null,null,null,null,'operational',20,0,'shift_open');
  PERFORM check_report(a->>'total_rows' = '0', 'open shifts are not projected into the future');
  a := read_operational_report('shifts',d,d,test_id(11),null,test_id(22),test_id(31),null,'operational',10,0);
  x := a->'rows'->0;
  PERFORM check_report(x @> '{"cashier_name":"Historical cashier name","net_sales":19.5,"full_shift_net_sales":19.5,"full_shift_confirmed":27.5}'
    AND a->>'total_rows' = '1' AND (x->>'cashier_started_at')::timestamptz = '2026-11-27 19:10+08'
    AND (x->>'cashier_ended_at')::timestamptz = '2026-11-28 06:40+08', 'historical cashier, multiple sessions, full shift: ' || x::text);
  a := read_operational_report('shifts',e,e,test_id(11),null,test_id(27),test_id(31),null,'operational',10,0);
  x := a->'rows'->0;
  PERFORM check_report(x @> '{"cashier_name":"Second cashier","net_sales":6,"full_shift_net_sales":6}' AND
    (x->>'planned_start')::timestamptz = '2026-11-27 19:00+08' AND
    (x->>'planned_end')::timestamptz = '2026-11-28 07:00+08', 'published overnight plan, draft and other branch ignored');
  a := read_operational_report('transactions',d,e,test_id(11),null,null,null,null,'operational',1,1);
  b := read_operational_report('transactions',d,e,test_id(11),null,null,null,null,'operational',20,0);
  PERFORM check_report(a->'rows'->0 = b->'rows'->1 AND a->>'total_rows' = '9' AND a->'totals' = b->'totals'
    AND a->'totals' @> '{"net_sales":29.5,"confirmed":37.5}', 'stable pagination and all transaction totals');
  a := read_operational_report('receipt',d,d,null,null,null,null,test_id(103),'operational',1,50);
  x := a->'receipt';
  PERFORM check_report(x @> '{"transaction_number":"LATE","receipt_number":"Original receipt","confirmed":7,"items":[{"name":"Kaya toast","quantity":2,"line_total":7}]}'
    AND (x->>'sold_at')::timestamptz = '2026-11-27 23:58+08' AND (x->>'payment_confirmed_at')::timestamptz = '2026-11-28 03:00+08'
    AND a::text NOT LIKE '%private%', 'one receipt, exact late paid time and no receipt payload: ' || x::text);
  a := read_operational_report('receipt',d,d,null,null,null,null,test_id(109),'operational',1,0);
  x := a->'receipt';
  PERFORM check_report(x @> '{"status":"REFUNDED","reversal_reason":"Original returned","confirmed":0,"net_sales":0,"sales_count":0}'
    AND (x->>'reversed_at')::timestamptz = '2026-11-29 09:30+08', 'refund is zero once, preserves original row');
  a := read_operational_report('receipt',d,d,null,null,null,null,test_id(108),'operational',1,0);
  PERFORM check_report(a->'receipt' @> '{"status":"VOIDED","reversal_reason":"Order cancelled","net_sales":0,"cash":0,"transaction_total":100}', 'void is zero once, original receipt amount survives');
  a := read_operational_report('receipt',d,d,null,null,null,null,test_id(101),'operational',1,0);
  PERFORM check_report(a->'receipt' @> '{"net_sales":10,"transaction_total":10,"discount_amount":2}', 'record original discount without deducting twice');
  a := read_operational_report('receipt',d,d,null,null,null,null,test_id(111),'operational',1,0);
  PERFORM check_report(a->'totals' @> '{"net_sales":0,"sales_count":1}' AND a->>'data_state' = 'available', 'true recorded zero');
  a := read_operational_report('receipt',e,e,null,null,null,null,test_id(103),'operational',1,0);
  PERFORM check_report(a->'receipt' = 'null' AND a->'totals'->'net_sales' = 'null' AND a->>'data_state' = 'no_data',
    'pending date cannot move sale to paid date and no records are not zero');
  a := read_operational_report('actions',d,e,test_id(11),null,null,null,null,'operational',20,0,'payment_pending');
  PERFORM check_report(a->>'total_rows' = '2' AND a->'totals'->>'review_count' = '2'
    AND a->'rows' @> jsonb_build_array(jsonb_build_object('transaction_id',test_id(102),'cashier_id',test_id(22),'status','REPORTED','amount',4))
    AND a::text NOT LIKE '%secret%', 'dedup linked pending, no payment actor reassignment or raw payload');
  a := read_operational_report('actions',d,e,test_id(11),null,null,null,null,'operational',20,0,'payment_duplicate');
  PERFORM check_report(a->>'total_rows' = '1' AND a->'rows'->0 @> '{"transaction_number":"LATE"}'
    AND NOT (a->'rows'->0 ?| ARRAY['amount','net_sales','confirmed','recorded_sales','cash','qr','transaction_total']),
    'repeated PAID case does not imply a duplicate charge or repeat the sale amounts');
  a := read_operational_report('actions',d,e,test_id(11),null,null,null,null,'operational',20,0,'cash_variance');
  PERFORM check_report(a->>'total_rows' = '1' AND a->'rows'->0 @> '{"opening_float":50,"expected_cash":71,"counted_cash":69,"cash_variance":-2,"shift_cash_sales":20.5}'
    AND NOT (a->'rows'->0 ? 'cashier_id') AND NOT (a->'rows'->0 ? 'other_cash_movements'), 'variance uses only actual counted vs expected');
  a := read_operational_report('actions',d,e,test_id(12),null,null,null,null,'operational',20,0,'cash_count_missing');
  PERFORM check_report(a->>'total_rows' = '1' AND a->'rows'->0 @> '{"expected_cash":0}' AND NOT (a->'rows'->0 ? 'counted_cash')
    AND NOT (a->'rows'->0 ? 'cash_variance'), 'never substitute expected cash for missing count');
  a := read_operational_report('actions',d,e,test_id(12),null,null,null,null,'operational',20,0,'shift_incomplete');
  PERFORM check_report(a->>'total_rows' = '1' AND a->'rows'->0 @> '{"counted_cash":0}' AND NOT (a->'rows'->0 ? 'cash_variance'),
    'counted zero with no expected cash has no variance');
  a := read_operational_report('actions',d,e,test_id(11),null,null,null,null,'operational',20,0,'transaction_incomplete');
  PERFORM check_report(a->>'total_rows' = '1' AND NOT (a->'rows'->0 ? 'shift_id')
    AND a->'rows'->0 @> '{"transaction_number":"BAD-SHIFT-LINK"}',
    'malformed branch/shift link remains actionable without sharing shift details');
  a := read_operational_report('transactions',d,e,null,null,null,test_id(32),null,'operational',10,0);
  PERFORM check_report(a->>'total_rows' = '1' AND a->'rows'->0 @> '{"transaction_number":"UNVERIFIED","net_sales":0,"recorded_sales":3}',
    'explicit shift cannot select another branch via a malformed link');
  a := read_operational_report('transactions',d,e,null,null,null,null,null,'trial',20,0);
  PERFORM check_report(a->>'total_rows' = '3' AND a->'totals' @> '{"net_sales":10,"cash":7.5,"qr":2.5}'
    AND a->'rows' @> '[{"transaction_number":"MARKED-SALE"},{"transaction_number":"MARKED-SHIFT-SALE"},{"transaction_number":"LINKED-MARKED-PAYMENT"}]'
    AND NOT (a->'rows' @> '[{"transaction_number":"REAL-SMALL"}]'), 'marker scope, linked trial, and operational small sale');
  a := read_operational_report('actions',d,e,null,null,null,null,null,'trial',10,0);
  PERFORM check_report(a->>'total_rows' = '1' AND a->'rows'->0->>'reference' = test_id(206)::text, 'explicitly marked unmatched trial attempt');
  a := read_operational_report('receipt',d,d,null,null,null,null,test_id(114),'operational',1,0);
  PERFORM check_report(a->'receipt' = 'null', 'marked payment cannot leak via operational receipt');
  a := read_operational_report('receipt',d,d,null,null,null,null,test_id(116),'trial',1,0);
  PERFORM check_report(a->'receipt' = 'null', 'trial receipt cannot leave branch scope');
  a := read_operational_report('receipt',d,d,null,null,null,null,test_id(117),'trial',1,0);
  PERFORM check_report(a->'receipt' = 'null', 'trial receipt cannot leave organization scope');
  a := read_operational_report('receipt',d,d,null,null,null,null,test_id(106),'operational',1,0);
  PERFORM check_report(a->'receipt' = 'null', 'foreign receipt does not reveal existence');
  a := read_scoped_report('receipt',d,d,null,1,0,null,test_id(103));
  PERFORM check_report(a->'receipt' @> '{"transaction_number":"LATE","qr_confirmed":7}', 'existing report RPC still works');

  BEGIN PERFORM read_operational_report('summary',d,e,null,test_id(21),null,null,null,'operational',1,0);
    RAISE EXCEPTION 'AM can use organization-only manager filter'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM read_operational_report('summary',d,e,test_id(13),null,null,null,null,'operational',1,0);
    RAISE EXCEPTION 'AM can use same-region unassigned branch'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM read_operational_report('summary',d,e,test_id(14),null,null,null,null,'trial',1,0);
    RAISE EXCEPTION 'explicit foreign grant widened trial scope'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM read_operational_report('shifts',d,e,null,null,null,test_id(33),null,'operational',1,0);
    RAISE EXCEPTION 'AM can use out-of-scope shift'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM read_operational_report('shifts',d,e,null,null,test_id(28),null,null,'operational',1,0);
    RAISE EXCEPTION 'AM can filter foreign staff'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM read_operational_report('actions',d,e,null,null,null,null,null,'operational',1,0,'unsupported');
    RAISE EXCEPTION 'unknown case accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM read_operational_report('summary',e,d,null,null,null,null,null,'operational',1,0);
    RAISE EXCEPTION 'reversed range accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM read_operational_report('summary',d,e,null,null,null,null,null,'unregistered',1,0);
    RAISE EXCEPTION 'unregistered dataset accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END;
$am$;

SELECT set_config('request.jwt.claim.sub', test_id(23)::text, true);
DO $admin$
DECLARE a jsonb; d date := '2026-11-27'; e date := '2026-11-28';
BEGIN
  a := read_operational_report('summary',d,e,null,null,null,null,null,'operational',20,0);
  PERFORM check_report(a->>'total_rows' = '4' AND a->'totals' @> '{"net_sales":119.5,"confirmed":127.5,"sales_count":9}'
    AND a->'settlement' @> '{"amount":230}'
    AND a->'rows' @> '[{"branch_code":"A","manager_names":["AM Alpha","AM Beta"],"net_sales":29.5},{"branch_code":"X","manager_names":[],"net_sales":90}]'
    AND (SELECT j FROM jsonb_array_elements(a->'rows') j WHERE j->>'branch_code' = 'Z') @> '{"sales_count":0,"shift_count":0,"review_count":0}'
    AND NOT ((SELECT j FROM jsonb_array_elements(a->'rows') j WHERE j->>'branch_code' = 'Z') ? 'net_sales'),
    'admin overlap dedup and unassigned or empty branch visibility: ' || a::text);
  a := read_operational_report('summary',d,e,null,test_id(24),null,null,null,'operational',20,0);
  PERFORM check_report(a->>'total_rows' = '1' AND a->'totals' @> '{"net_sales":29.5}' AND a->'settlement' @> '{"amount":130}'
    AND jsonb_array_length(a->'filters'->'managers') = 3,
    'AM filter narrows branches without multiplying sales or pruning manager choices');
  a := read_operational_report('summary',d,e,null,test_id(26),null,null,null,'operational',1,0);
  PERFORM check_report(a->>'total_rows' = '0' AND a->>'data_state' = 'no_data', 'real AM with empty assignment returns empty report');
  a := read_operational_report('summary',d,e,test_id(15),null,null,null,null,'operational',1,0);
  PERFORM check_report(a->>'data_state' = 'no_data' AND a->'totals'->'net_sales' = 'null', 'empty branch with null money');
  a := read_operational_report('actions',d,e,test_id(13),null,null,null,null,'operational',10,0,'payment_unmatched');
  PERFORM check_report(a->>'total_rows' = '1' AND NOT (a->'rows'->0 ? 'transaction_id') AND NOT (a->'rows'->0 ? 'shift_id'),
    'same-tenant malformed payment is not proof for a different branch and cannot borrow metadata');
  BEGIN PERFORM read_operational_report('summary',d,e,null,test_id(28),null,null,null,'operational',1,0);
    RAISE EXCEPTION 'ADMIN can filter foreign AM'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM read_operational_report('summary',d,e,test_id(13),test_id(24),null,null,null,'operational',1,0);
    RAISE EXCEPTION 'contradictory branch and AM filters accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$admin$;
SELECT set_config('request.jwt.claim.sub', test_id(40)::text, true);
SELECT check_report(read_operational_report('summary','2026-11-27','2026-11-28',null,null,null,null,null,'operational',20,0)
  ->'totals' @> '{"net_sales":119.5,"confirmed":127.5}', 'Owner gets the same tenant totals as Admin');

RESET ROLE;
-- Legacy overlapping published slots must not produce a guessed schedule.
INSERT INTO fixture_plans VALUES (test_id(1),test_id(11),test_id(302),'2026-11-28','PUBLISHED','00:00','08:00');
SET LOCAL ROLE authenticated;
SELECT check_report(NOT (read_operational_report('shifts','2026-11-28','2026-11-28',test_id(11),null,test_id(27),
  test_id(31),null,'operational',10,0)->'rows'->0 ? 'planned_start'), 'ambiguous published plans stay unknown');
SELECT set_config('request.jwt.claim.sub', test_id(26)::text, true);
SELECT check_report(read_operational_report('transactions','2026-11-27','2026-11-28',null,null,null,null,null,'trial',10,0)
  @> '{"total_rows":0,"data_state":"no_data"}', 'AM with empty assignment cannot see trial');
DO $permissions$
DECLARE v_signature text := 'public.read_operational_report(text,date,date,uuid,uuid,uuid,uuid,uuid,text,integer,integer,text)';
BEGIN
  PERFORM check_report(NOT has_function_privilege('anon', v_signature, 'EXECUTE')
    AND NOT has_function_privilege('service_role', v_signature, 'EXECUTE')
    AND NOT has_table_privilege('authenticated', 'public.pos_online_payments', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.pos_transactions', 'UPDATE'), 'RPC does not grant payment or sale mutations');
  PERFORM set_config('request.jwt.claim.sub', test_id(25)::text, true);
  BEGIN PERFORM read_operational_report('summary','2026-11-27','2026-11-28',null,null,null,null,null,'operational',1,0);
    RAISE EXCEPTION 'inactive actor can access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub', test_id(27)::text, true);
  BEGIN PERFORM read_operational_report('summary','2026-11-27','2026-11-28',null,null,null,null,null,'operational',1,0);
    RAISE EXCEPTION 'staff can call management reports'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub', test_id(30)::text, true);
  BEGIN PERFORM read_operational_report('summary','2026-11-27','2026-11-28',null,null,null,null,null,'trial',1,0);
    RAISE EXCEPTION 'excluded report role can call workspace'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM check_report(NOT EXISTS (SELECT 1 FROM report_internal.operational_sales(ARRAY[test_id(11)],
    '2026-11-27 00:00+08','2026-11-29 00:00+08',null,null,null,true)), 'helper cannot expose trial to legacy-only report roles');
END;
$permissions$;

RESET ROLE;
INSERT INTO pos_shifts (id, organization_id, branch_id, shift_number, opened_by, status, opened_at, closed_at,
  expected_cash, closing_cash) VALUES
 (test_id(901), test_id(1), test_id(11), 'Ambiguous checkout overnight', test_id(27), 'CLOSED',
   '2026-10-27 19:00+08', '2026-10-28 07:00+08', 0, 0),
 (test_id(902), test_id(1), test_id(15), 'Exact zero interval', test_id(23), 'CLOSED',
   '2026-11-28 00:00+08', '2026-11-28 00:00+08', 0, 0),
 (test_id(903), test_id(1), test_id(15), 'Close-boundary case', test_id(23), 'CLOSED',
   '2026-11-27 18:00+08', '2026-11-28 00:00+08', 2, 1);
INSERT INTO pos_transactions (id, organization_id, branch_id, shift_id, created_by, transaction_number, status,
  created_at, payment_method, total, qr_amount) VALUES
 (test_id(910), test_id(1), test_id(11), test_id(901), test_id(27), 'AMBIGUOUS-PAID', 'COMPLETED',
   '2026-10-28 01:00+08', 'QR', 14, 14);
INSERT INTO pos_online_payments (id, organization_id, branch_id, shift_id, created_by, transaction_id, status, provider,
  amount_rm, created_at, paid_at, sale_payload, fiuu_vt_review_required) VALUES
 (test_id(911), test_id(1), test_id(11), test_id(901), test_id(27), test_id(910), 'PAID', 'fiuu_vt', 14,
   '2026-10-27 23:55+08', '2026-10-28 01:00+08', '{}', false),
 (test_id(912), test_id(1), test_id(11), test_id(901), test_id(27), test_id(910), 'PAID', 'fiuu_vt', 14,
   '2026-10-28 00:05+08', '2026-10-28 01:05+08', '{}', false),
 (test_id(913), test_id(1), test_id(11), test_id(901), test_id(27), test_id(910), 'PAID', 'fiuu_vt', 7,
   '2026-10-28 00:08+08', '2026-10-28 00:09+08', '{}', false),
 (test_id(914), test_id(1), test_id(11), test_id(901), test_id(27), null, 'FAILED', 'fiuu_vt', 8,
   '2026-10-28 00:40+08', null, '{}', true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', test_id(23)::text, true);
DO $boundaries$
DECLARE a jsonb; b jsonb; v text;
BEGIN
  a := read_operational_report('transactions','2026-10-27','2026-10-28',test_id(11),null,null,null,null,'operational',10,0);
  PERFORM check_report(a->>'total_rows' = '1' AND a->'totals' @> '{"net_sales":14,"confirmed":14,"sales_count":1,"review_count":3}'
    AND (a->'rows'->0->>'sold_at')::timestamptz = '2026-10-28 01:00+08'
    AND (a->'rows'->0->>'payment_confirmed_at')::timestamptz = '2026-10-28 01:00+08',
    'ambiguous paid rows retain recorded sale basis, earliest exact confirmed time, and one sale');
  a := read_operational_report('transactions','2026-10-27','2026-10-27',test_id(11),null,null,null,null,'operational',10,0);
  PERFORM check_report(a->>'total_rows' = '0', 'ambiguous evidence never moves sale to a second MYT day');
  a := read_operational_report('actions','2026-10-28','2026-10-28',test_id(11),null,null,null,null,'operational',10,0);
  PERFORM check_report(a->'rows' @> '[{"case_type":"payment_duplicate"},{"case_type":"payment_unmatched","amount":7},{"case_type":"payment_pending","status":"FAILED"}]'
    AND NOT (a->'totals' ? 'review_amount'), 'mismatch, durable review flag, and duplicate proof stay separate from confirmed amounts');
  a := read_operational_report('summary','2026-11-28','2026-11-28',test_id(15),null,null,null,null,'operational',1,0);
  PERFORM check_report(a->'totals' @> '{"shift_count":1,"review_count":1,"net_sales":null}',
    'zero-duration shift in period counts once while closing-only case does not count as shift participation');
  FOREACH v IN ARRAY ARRAY['daily','shifts','transactions','actions'] LOOP
    b := read_operational_report(v,'2026-11-28','2026-11-28',test_id(15),null,null,null,null,'operational',10,0);
    PERFORM check_report(a->'totals' = b->'totals', 'exact totals including zero-duration shift and closing-only case: ' || v);
  END LOOP;
END;
$boundaries$;

\ir operational_report_workspace_load.sql
ROLLBACK;
