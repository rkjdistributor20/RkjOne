-- RKJ One: AM cash collection usage vouchers
-- AM may use collected cash only for approved branch requests, fuel/diesel, or company transport maintenance.

CREATE TABLE IF NOT EXISTS finance_collection_usages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 collection_id UUID NOT NULL REFERENCES finance_collections(id) ON DELETE CASCADE,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 supply_request_id UUID REFERENCES pos_branch_supply_requests(id) ON DELETE SET NULL,
 usage_number TEXT NOT NULL,
 usage_type TEXT NOT NULL CHECK (
 usage_type IN ('BRANCH_NECESSITY', 'FUEL_DIESEL', 'TRANSPORT_MAINTENANCE')
 ),
 amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
 description TEXT NOT NULL,
 proof_url TEXT,
 receipt_number TEXT,
 vehicle_reference TEXT,
 vendor_name TEXT,
 spent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 spent_by UUID NOT NULL REFERENCES profiles(id),
 status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (
 status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED')
 ),
 reviewed_by UUID REFERENCES profiles(id),
 reviewed_at TIMESTAMPTZ,
 review_notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_collection_usages_number_org
 ON finance_collection_usages(organization_id, usage_number);
CREATE INDEX IF NOT EXISTS idx_finance_collection_usages_collection
 ON finance_collection_usages(collection_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_collection_usages_branch
 ON finance_collection_usages(branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_collection_usages_supply_request
 ON finance_collection_usages(supply_request_id)
 WHERE supply_request_id IS NOT NULL;

ALTER TABLE finance_collection_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_collection_usages_scope ON finance_collection_usages;
CREATE POLICY finance_collection_usages_scope ON finance_collection_usages
 FOR ALL
 USING (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER')
 OR (
 public.user_role() = 'AREA_MANAGER'
 AND public.has_branch_access(branch_id)
 )
 )
 )
 WITH CHECK (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER')
 OR (
 public.user_role() = 'AREA_MANAGER'
 AND public.has_branch_access(branch_id)
 )
 )
 );

DROP TRIGGER IF EXISTS set_updated_at ON finance_collection_usages;
CREATE TRIGGER set_updated_at
 BEFORE UPDATE ON finance_collection_usages
 FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

GRANT SELECT, INSERT, UPDATE ON finance_collection_usages TO authenticated;

CREATE OR REPLACE FUNCTION record_collection_cash_usage(
 p_collection_id UUID,
 p_usage_type TEXT,
 p_amount NUMERIC,
 p_description TEXT,
 p_proof_url TEXT DEFAULT NULL,
 p_receipt_number TEXT DEFAULT NULL,
 p_supply_request_id UUID DEFAULT NULL,
 p_vehicle_reference TEXT DEFAULT NULL,
 p_vendor_name TEXT DEFAULT NULL,
 p_spent_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_role TEXT;
 v_org_id UUID;
 v_usage_id UUID;
 v_usage_number TEXT;
 v_collection RECORD;
 v_request RECORD;
 v_existing_usage NUMERIC := 0;
 v_existing_bank_in NUMERIC := 0;
 v_remaining NUMERIC := 0;
 v_usage_type TEXT;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 v_role := public.user_role();
 IF v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'AREA_MANAGER', 'OPERATION_MANAGER') THEN
 RAISE EXCEPTION 'Insufficient permissions';
 END IF;

 v_org_id := public.organization_id();
 v_usage_type := upper(COALESCE(p_usage_type, ''));

 IF v_usage_type NOT IN ('BRANCH_NECESSITY', 'FUEL_DIESEL', 'TRANSPORT_MAINTENANCE') THEN
 RAISE EXCEPTION 'Jenis penggunaan cash tidak sah';
 END IF;
 IF COALESCE(p_amount, 0) <= 0 THEN
 RAISE EXCEPTION 'Jumlah penggunaan cash mesti lebih daripada 0';
 END IF;
 IF NULLIF(trim(COALESCE(p_description, '')), '') IS NULL THEN
 RAISE EXCEPTION 'Catatan penggunaan wajib diisi';
 END IF;
 IF NULLIF(trim(COALESCE(p_proof_url, '')), '') IS NULL
 AND NULLIF(trim(COALESCE(p_receipt_number, '')), '') IS NULL THEN
 RAISE EXCEPTION 'Bukti wajib: masukkan link resit/gambar atau nombor resit';
 END IF;

 SELECT *
 INTO v_collection
 FROM finance_collections
 WHERE id = p_collection_id
 AND organization_id = v_org_id;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Rekod kutipan tidak dijumpai';
 END IF;
 IF v_collection.branch_id IS NULL THEN
 RAISE EXCEPTION 'Penggunaan cash collection mesti dipautkan kepada cawangan';
 END IF;
 IF v_collection.status NOT IN ('PENDING', 'COLLECTED') THEN
 RAISE EXCEPTION 'Kutipan ini sudah selesai bank-in atau verified';
 END IF;
 IF v_role = 'AREA_MANAGER' AND NOT public.has_branch_access(v_collection.branch_id) THEN
 RAISE EXCEPTION 'AM hanya boleh guna collection dalam kawasan sendiri';
 END IF;

 IF v_usage_type = 'BRANCH_NECESSITY' THEN
 IF p_supply_request_id IS NULL THEN
 RAISE EXCEPTION 'Pembelian barang cawangan mesti dipautkan kepada request staf cawangan yang diluluskan';
 END IF;

 SELECT *
 INTO v_request
 FROM pos_branch_supply_requests
 WHERE id = p_supply_request_id
 AND organization_id = v_org_id
 AND branch_id = v_collection.branch_id;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Request barang cawangan tidak dijumpai untuk cawangan ini';
 END IF;
 IF v_request.status NOT IN ('APPROVED', 'FULFILLED') THEN
 RAISE EXCEPTION 'Request barang cawangan perlu diluluskan dahulu sebelum cash collection boleh digunakan';
 END IF;
 ELSE
 IF NULLIF(trim(COALESCE(p_vehicle_reference, '')), '') IS NULL THEN
 RAISE EXCEPTION 'Rujukan kenderaan wajib untuk petrol/diesel atau maintenance transport';
 END IF;
 END IF;

 SELECT COALESCE(SUM(amount), 0)
 INTO v_existing_usage
 FROM finance_collection_usages
 WHERE collection_id = p_collection_id
 AND organization_id = v_org_id
 AND status <> 'REJECTED';

 SELECT COALESCE(SUM(amount), 0)
 INTO v_existing_bank_in
 FROM bank_in_records
 WHERE collection_id = p_collection_id
 AND organization_id = v_org_id;

 v_remaining := COALESCE(v_collection.amount, 0) - v_existing_usage - v_existing_bank_in;

 IF p_amount > v_remaining THEN
 RAISE EXCEPTION 'Jumlah melebihi baki cash collection yang belum bank-in';
 END IF;

 v_usage_number := generate_doc_number('CU', v_org_id);

 INSERT INTO finance_collection_usages (
 organization_id, collection_id, branch_id, supply_request_id, usage_number,
 usage_type, amount, description, proof_url, receipt_number,
 vehicle_reference, vendor_name, spent_at, spent_by, status
 ) VALUES (
 v_org_id, p_collection_id, v_collection.branch_id, p_supply_request_id, v_usage_number,
 v_usage_type, p_amount, trim(p_description), NULLIF(trim(COALESCE(p_proof_url, '')), ''),
 NULLIF(trim(COALESCE(p_receipt_number, '')), ''),
 NULLIF(trim(COALESCE(p_vehicle_reference, '')), ''),
 NULLIF(trim(COALESCE(p_vendor_name, '')), ''),
 COALESCE(p_spent_at, now()), v_user_id, 'PENDING_REVIEW'
 )
 RETURNING id INTO v_usage_id;

 RETURN jsonb_build_object(
 'usage_id', v_usage_id,
 'usage_number', v_usage_number,
 'remaining_bank_in', v_remaining - p_amount,
 'status', 'PENDING_REVIEW'
 );
END;
$$;

CREATE OR REPLACE FUNCTION review_collection_cash_usage(
 p_usage_id UUID,
 p_status TEXT,
 p_review_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_user_id UUID;
 v_role TEXT;
 v_org_id UUID;
 v_usage RECORD;
 v_status TEXT;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 v_role := public.user_role();
 IF v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER') THEN
 RAISE EXCEPTION 'Hanya OM/Admin/Finance boleh semak voucher penggunaan cash';
 END IF;

 v_org_id := public.organization_id();
 v_status := upper(COALESCE(p_status, ''));
 IF v_status NOT IN ('ACCEPTED', 'REJECTED') THEN
 RAISE EXCEPTION 'Status semakan tidak sah';
 END IF;

 SELECT *
 INTO v_usage
 FROM finance_collection_usages
 WHERE id = p_usage_id
 AND organization_id = v_org_id;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Voucher penggunaan cash tidak dijumpai';
 END IF;

 UPDATE finance_collection_usages
 SET status = v_status,
 reviewed_by = v_user_id,
 reviewed_at = now(),
 review_notes = p_review_notes
 WHERE id = p_usage_id
 AND organization_id = v_org_id;

 RETURN jsonb_build_object('usage_id', p_usage_id, 'status', v_status);
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
 v_role TEXT;
 v_branch_id UUID;
 v_collection_amount NUMERIC := NULL;
 v_usage_total NUMERIC := 0;
 v_banked_total NUMERIC := 0;
 v_remaining NUMERIC := NULL;
 v_new_remaining NUMERIC := NULL;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 v_role := public.user_role();
 IF v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'AREA_MANAGER', 'OPERATION_MANAGER') THEN
 RAISE EXCEPTION 'Insufficient permissions';
 END IF;

 IF COALESCE(p_amount, 0) <= 0 THEN
 RAISE EXCEPTION 'Jumlah bank-in mesti lebih daripada 0';
 END IF;

 v_org_id := public.organization_id();

 IF p_collection_id IS NOT NULL THEN
 SELECT branch_id, amount INTO v_branch_id, v_collection_amount
 FROM finance_collections
 WHERE id = p_collection_id
 AND organization_id = v_org_id;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Collection not found';
 END IF;

 IF v_role = 'AREA_MANAGER' AND (v_branch_id IS NULL OR NOT public.has_branch_access(v_branch_id)) THEN
 RAISE EXCEPTION 'Area Manager can only bank in collections within own area';
 END IF;

 SELECT COALESCE(SUM(amount), 0)
 INTO v_usage_total
 FROM finance_collection_usages
 WHERE collection_id = p_collection_id
 AND organization_id = v_org_id
 AND status <> 'REJECTED';

 SELECT COALESCE(SUM(amount), 0)
 INTO v_banked_total
 FROM bank_in_records
 WHERE collection_id = p_collection_id
 AND organization_id = v_org_id;

 v_remaining := COALESCE(v_collection_amount, 0) - v_usage_total - v_banked_total;
 IF p_amount > v_remaining THEN
 RAISE EXCEPTION 'Jumlah bank-in melebihi baki selepas penggunaan cash collection';
 END IF;
 END IF;

 IF v_role = 'AREA_MANAGER' AND p_collection_id IS NULL THEN
 RAISE EXCEPTION 'Area Manager must link bank-in to a branch collection';
 END IF;

 v_number := generate_doc_number('BI', v_org_id);

 INSERT INTO bank_in_records (
 organization_id, bank_in_number, collection_id, amount,
 bank_name, reference_number, slip_url, banked_at, banked_by, notes
 ) VALUES (
 v_org_id, v_number, p_collection_id, p_amount,
 p_bank_name, p_reference_number, p_slip_url, p_banked_at, v_user_id, p_notes
 ) RETURNING id INTO v_id;

 IF p_collection_id IS NOT NULL THEN
 v_new_remaining := COALESCE(v_remaining, 0) - p_amount;

 UPDATE finance_collections
 SET status = CASE WHEN v_new_remaining <= 0.009 THEN 'BANKED' ELSE 'COLLECTED' END
 WHERE id = p_collection_id
 AND organization_id = v_org_id;
 END IF;

 RETURN jsonb_build_object(
 'bank_in_id', v_id,
 'bank_in_number', v_number,
 'remaining_bank_in', COALESCE(v_new_remaining, 0)
 );
END;
$$;

GRANT EXECUTE ON FUNCTION record_collection_cash_usage(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION review_collection_cash_usage(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION record_bank_in(NUMERIC, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;
