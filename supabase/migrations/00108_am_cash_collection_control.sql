-- RKJ One: AM cash collection control
-- Allow Area Manager to bank in cash only for collections within their branch access scope.

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
 v_role TEXT;
 v_org_id UUID;
 v_branch_id UUID;
 v_status collection_status;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 v_role := public.user_role();
 IF v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'AREA_MANAGER', 'OPERATION_MANAGER') THEN
 RAISE EXCEPTION 'Insufficient permissions';
 END IF;

 v_org_id := public.organization_id();

 SELECT branch_id, status INTO v_branch_id, v_status
 FROM finance_collections
 WHERE id = p_collection_id
 AND organization_id = v_org_id;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Collection not found';
 END IF;

 IF v_status <> 'PENDING' THEN
 RAISE EXCEPTION 'Collection already processed';
 END IF;

 IF v_role = 'AREA_MANAGER' AND (v_branch_id IS NULL OR NOT public.has_branch_access(v_branch_id)) THEN
 RAISE EXCEPTION 'Area Manager can only collect cash within own area';
 END IF;

 UPDATE finance_collections SET
 status = 'COLLECTED',
 collected_by = v_user_id,
 collected_at = now(),
 collector_name = COALESCE(p_collector_name, collector_name),
 third_party_name = COALESCE(p_third_party_name, third_party_name)
 WHERE id = p_collection_id AND organization_id = v_org_id AND status = 'PENDING';

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
 v_role TEXT;
 v_branch_id UUID;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 v_role := public.user_role();
 IF v_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'AREA_MANAGER', 'OPERATION_MANAGER') THEN
 RAISE EXCEPTION 'Insufficient permissions';
 END IF;

 v_org_id := public.organization_id();

 IF p_collection_id IS NOT NULL THEN
 SELECT branch_id INTO v_branch_id
 FROM finance_collections
 WHERE id = p_collection_id
 AND organization_id = v_org_id;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Collection not found';
 END IF;

 IF v_role = 'AREA_MANAGER' AND (v_branch_id IS NULL OR NOT public.has_branch_access(v_branch_id)) THEN
 RAISE EXCEPTION 'Area Manager can only bank in collections within own area';
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
 UPDATE finance_collections SET status = 'BANKED'
 WHERE id = p_collection_id AND organization_id = v_org_id;
 END IF;

 RETURN jsonb_build_object('bank_in_id', v_id, 'bank_in_number', v_number);
END;
$$;

DROP POLICY IF EXISTS bank_in_records_org ON bank_in_records;

CREATE POLICY bank_in_records_org ON bank_in_records
 FOR ALL USING (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER')
 OR (
 public.user_role() = 'AREA_MANAGER'
 AND collection_id IS NOT NULL
 AND EXISTS (
 SELECT 1
 FROM finance_collections fc
 WHERE fc.id = bank_in_records.collection_id
 AND fc.organization_id = bank_in_records.organization_id
 AND fc.branch_id IS NOT NULL
 AND public.has_branch_access(fc.branch_id)
 )
 )
 )
 );

GRANT EXECUTE ON FUNCTION mark_collection_collected TO authenticated;
GRANT EXECUTE ON FUNCTION record_bank_in TO authenticated;
