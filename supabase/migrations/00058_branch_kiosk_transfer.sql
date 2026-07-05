-- Pindahan stok kiosk → kiosk (OM: habiskan stok lama / keperluan mendesak)

CREATE OR REPLACE FUNCTION create_stock_transfer(
 p_from_location_id UUID,
 p_to_location_id UUID,
 p_items JSONB,
 p_driver_id UUID DEFAULT NULL,
 p_vehicle_id UUID DEFAULT NULL,
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
 v_from RECORD;
 v_to RECORD;
 v_item JSONB;
 v_stock RECORD;
 v_transfer_id UUID;
 v_transfer_number TEXT;
 v_prod DATE;
 v_kiosk_to_kiosk BOOLEAN;
BEGIN
 v_user_id := auth.uid();
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

 SELECT * INTO v_from FROM inventory_locations WHERE id = p_from_location_id;
 SELECT * INTO v_to FROM inventory_locations WHERE id = p_to_location_id;

 IF v_from.id IS NULL OR v_to.id IS NULL THEN
 RAISE EXCEPTION 'Location not found';
 END IF;
 IF v_from.organization_id != v_to.organization_id THEN
 RAISE EXCEPTION 'Cross-org transfer not allowed';
 END IF;

 v_org_id := v_from.organization_id;
 v_kiosk_to_kiosk :=
 v_from.location_type = 'BRANCH_KIOSK' AND v_to.location_type = 'BRANCH_KIOSK';

 IF v_kiosk_to_kiosk AND v_from.branch_id IS NOT DISTINCT FROM v_to.branch_id THEN
 RAISE EXCEPTION 'Pindahan dalam cawangan sama tidak dibenarkan — pilih cawangan berbeza';
 END IF;

 IF v_from.branch_id IS NOT NULL AND NOT public.has_branch_access(v_from.branch_id) THEN
 RAISE EXCEPTION 'No access to source location';
 END IF;

 IF v_to.branch_id IS NOT NULL AND NOT public.has_branch_access(v_to.branch_id) THEN
 RAISE EXCEPTION 'No access to destination location';
 END IF;

 v_transfer_number := generate_inv_number('TRF', v_org_id);

 INSERT INTO stock_transfers (
 organization_id, transfer_number, from_location_id, to_location_id,
 status, driver_id, vehicle_id, notes, created_by
 ) VALUES (
 v_org_id, v_transfer_number, p_from_location_id, p_to_location_id,
 'PENDING', p_driver_id, p_vehicle_id, p_notes, v_user_id
 ) RETURNING id INTO v_transfer_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
 LOOP
 SELECT * INTO v_stock FROM stock_items
 WHERE id = (v_item->>'stock_item_id')::uuid AND organization_id = v_org_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;

 v_prod := NULLIF(v_item->>'production_date', '')::date;

 IF is_roti_stock_item(v_stock.id) THEN
 IF v_prod IS NULL THEN
 RAISE EXCEPTION 'Tarikh production wajib untuk roti: %', v_stock.name;
 END IF;
 IF NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order boleh tetapkan tarikh production roti';
 END IF;
 -- Kiosk→kiosk: batch sedia ada (stok lama) — tidak perlu tarikh dalam jadual kilang
 IF NOT v_kiosk_to_kiosk THEN
 PERFORM assert_published_production_date(v_org_id, v_prod);
 END IF;
 ELSIF v_prod IS NOT NULL AND NOT can_set_roti_production_date() THEN
 RAISE EXCEPTION 'Hanya pembuat order boleh tetapkan tarikh production';
 END IF;

 INSERT INTO stock_transfer_items (
 transfer_id, stock_item_id, quantity, unit, production_date
 ) VALUES (
 v_transfer_id, v_stock.id,
 (v_item->>'quantity')::numeric,
 COALESCE((v_item->>'unit')::stock_unit, v_stock.base_unit),
 v_prod
 );
 END LOOP;

 INSERT INTO approval_requests (
 organization_id, entity_type, entity_id, title, description,
 status, requested_by, branch_id
 ) VALUES (
 v_org_id, 'STOCK_TRANSFER', v_transfer_id,
 'Stock Transfer ' || v_transfer_number,
 v_from.name || ' → ' || v_to.name,
 'PENDING', v_user_id, v_from.branch_id
 );

 RETURN jsonb_build_object(
 'transfer_id', v_transfer_id,
 'transfer_number', v_transfer_number,
 'kiosk_to_kiosk', v_kiosk_to_kiosk
 );
END;
$$;
