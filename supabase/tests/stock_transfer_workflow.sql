-- Run as the migration owner on an isolated, migrated database; fixtures roll back.
BEGIN;

DO $$
DECLARE
 org uuid := gen_random_uuid();
 other_org uuid := gen_random_uuid();
 region_a uuid := gen_random_uuid();
 region_b uuid := gen_random_uuid();
 region_c uuid := gen_random_uuid();
 branch_a uuid := gen_random_uuid();
 branch_b uuid := gen_random_uuid();
 branch_c uuid := gen_random_uuid();
 source uuid := gen_random_uuid();
 destination uuid := gen_random_uuid();
 foreign_location uuid := gen_random_uuid();
 am_source uuid := gen_random_uuid();
 am_destination uuid := gen_random_uuid();
 am_unrelated uuid := gen_random_uuid();
 hq_admin uuid := gen_random_uuid();
 hq uuid := gen_random_uuid();
 item uuid := gen_random_uuid();
 supplies uuid := gen_random_uuid();
 key uuid := gen_random_uuid();
 result jsonb;
 lines jsonb;
 transfer uuid;
 cancelled uuid;
 same_am_transfer uuid;
 hq_transfer uuid;
 hq_return uuid;
 partial_transfer uuid;
 partial_roti uuid;
 partial_supplies uuid;
 reverse_id uuid;
 return_line uuid;
 receipt_key uuid := gen_random_uuid();
 receipt_lines jsonb;
 delivery uuid := gen_random_uuid();
 fleet_transfer uuid := gen_random_uuid();
 fleet_order uuid := gen_random_uuid();
 stock_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 source_before numeric := 20;
BEGIN
 INSERT INTO organizations (id, code, name) VALUES (org, 'TEST-' || org, 'Transfer test'), (other_org, 'TEST-' || other_org, 'Other transfer test');
 INSERT INTO regions (id, organization_id, code, name) VALUES
  (region_a, org, 'UTARA', 'A'), (region_b, org, 'TENGAH', 'B'), (region_c, org, 'SELATAN', 'C');
 INSERT INTO branches (id, organization_id, region_id, branch_code, branch_name) VALUES
  (branch_a, org, region_a, 'TA', 'Origin'), (branch_b, org, region_b, 'TB', 'Destination'), (branch_c, org, region_c, 'TC', 'Unrelated');
 INSERT INTO auth.users (id, email) VALUES
  (am_source, am_source || '@example.invalid'), (am_destination, am_destination || '@example.invalid'),
  (am_unrelated, am_unrelated || '@example.invalid'), (hq_admin, hq_admin || '@example.invalid');
 INSERT INTO profiles (id, organization_id, full_name, role, region_id) VALUES
  (am_source, org, 'Sender', 'AREA_MANAGER', region_a),
  (am_destination, org, 'Receiver', 'AREA_MANAGER', region_b),
  (am_unrelated, org, 'Unrelated', 'AREA_MANAGER', region_a),
  (hq_admin, org, 'HQ', 'ADMIN', NULL)
 ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role, region_id = EXCLUDED.region_id;
 -- Grants are authoritative even when an AM has a different region hint.
 INSERT INTO profile_branch_access (profile_id, branch_id) VALUES
  (am_source, branch_a), (am_destination, branch_b), (am_unrelated, branch_c);
 INSERT INTO inventory_locations (id, organization_id, location_type, name, branch_id) VALUES
  (source, org, 'BRANCH_KIOSK', 'Origin', branch_a), (destination, org, 'BRANCH_KIOSK', 'Destination', branch_b),
  (hq, org, 'HQ_WAREHOUSE', 'HQ', NULL), (foreign_location, other_org, 'HQ_WAREHOUSE', 'Foreign', NULL);
 INSERT INTO stock_items(id, organization_id, item_code, name, category) VALUES
  (item, org, 'TEST-ROTI', 'Roti test', 'Roti'), (supplies, org, 'TEST-SUPPLY', 'Supplies test', 'Supplies');
 INSERT INTO stock_movements (organization_id, movement_type, location_id, stock_item_id, quantity, unit, production_date)
 VALUES (org, 'RECEIVE', source, item, 7, 'PCS', stock_today - 1),
        (org, 'RECEIVE', source, item, source_before - 7, 'PCS', stock_today),
        (org, 'RECEIVE', hq, supplies, 10, 'PCS', NULL);
 lines := jsonb_build_array(jsonb_build_object('stock_item_id', item, 'quantity', 3, 'production_date', stock_today));

 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub', am_source::text, true);
 result := stock_transfer_kiosk_options();
 IF jsonb_array_length(result->'origins') <> 1 OR jsonb_array_length(result->'destinations') <> 2 THEN
  RAISE EXCEPTION 'Kiosk options did not separate scoped origins from organization destinations';
 END IF;
 BEGIN
  PERFORM create_stock_transfer(destination, source, lines, gen_random_uuid());
  RAISE EXCEPTION 'Origin outside AM scope was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM create_stock_transfer(source, foreign_location, lines, gen_random_uuid());
  RAISE EXCEPTION 'Foreign destination was accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 result := create_stock_transfer(source, destination, lines, key);
 transfer := (result->>'transfer_id')::uuid;
 IF create_stock_transfer(source, destination, lines, key) IS DISTINCT FROM result THEN
  RAISE EXCEPTION 'Same create request returned a different document';
 END IF;
 BEGIN
  PERFORM create_stock_transfer(source, destination, lines, key, p_notes => 'Changed');
  RAISE EXCEPTION 'Changed request reused a create key';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 IF (list_stock_transfers()->0->>'can_dispatch')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Source cannot dispatch';
 END IF;
 PERFORM dispatch_stock_transfer(transfer);
 PERFORM dispatch_stock_transfer(transfer);
 BEGIN
  PERFORM complete_stock_transfer(transfer);
  RAISE EXCEPTION 'Source AM accepted for the remote destination';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM cancel_stock_transfer(transfer, 'Already sent');
  RAISE EXCEPTION 'Posted transfer was cancellable';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 PERFORM set_config('request.jwt.claim.sub', am_unrelated::text, true);
 IF list_stock_transfers() <> '[]' OR EXISTS (SELECT 1 FROM stock_transfers WHERE id = transfer)
  OR EXISTS (SELECT 1 FROM stock_transfer_items WHERE transfer_id = transfer) THEN
  RAISE EXCEPTION 'Unrelated AM can see transfer documents';
 END IF;

 PERFORM set_config('request.jwt.claim.sub', am_destination::text, true);
 IF (list_stock_transfers(destination)->0->>'can_complete')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Destination cannot confirm receipt';
 END IF;
 PERFORM complete_stock_transfer(transfer);
 PERFORM complete_stock_transfer(transfer);

 PERFORM set_config('request.jwt.claim.sub', am_source::text, true);
 cancelled := (create_stock_transfer(source, destination, lines, gen_random_uuid())->>'transfer_id')::uuid;
 PERFORM cancel_stock_transfer(cancelled, 'Duplicate paperwork');
 PERFORM cancel_stock_transfer(cancelled, 'Duplicate paperwork');
 RESET ROLE;

 IF (SELECT count(*) FROM stock_movements WHERE reference_type = 'stock_transfer' AND reference_id = transfer) <> 2
  OR EXISTS (SELECT 1 FROM stock_movements WHERE reference_type = 'stock_transfer' AND reference_id = cancelled)
  OR (SELECT quantity FROM inventory_balances WHERE location_id = source AND stock_item_id = item) IS DISTINCT FROM source_before - 3
  OR (SELECT quantity FROM inventory_balances WHERE location_id = destination AND stock_item_id = item) IS DISTINCT FROM 3::numeric
  OR (SELECT quantity_remaining FROM stock_batches WHERE location_id = source AND stock_item_id = item AND production_date = stock_today - 1) IS DISTINCT FROM 7::numeric
  OR (SELECT quantity_remaining FROM stock_batches WHERE location_id = destination AND stock_item_id = item AND production_date = stock_today) IS DISTINCT FROM 3::numeric
  OR NOT EXISTS (SELECT 1 FROM stock_transfers WHERE id = cancelled AND cancelled_by = am_source AND cancellation_reason = 'Duplicate paperwork')
  OR EXISTS (SELECT 1 FROM approval_requests WHERE entity_id = transfer AND entity_type = 'STOCK_TRANSFER') THEN
  RAISE EXCEPTION 'Posting, batch preservation, no-HQ approval, or cancellation audit failed';
 END IF;

 INSERT INTO profile_branch_access (profile_id, branch_id) VALUES (am_source, branch_b);
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub', am_source::text, true);
 same_am_transfer := (create_stock_transfer(source, destination, lines, gen_random_uuid())->>'transfer_id')::uuid;
 PERFORM dispatch_stock_transfer(same_am_transfer);
 PERFORM complete_stock_transfer(same_am_transfer);

 PERFORM set_config('request.jwt.claim.sub', hq_admin::text, true);
 hq_transfer := (create_stock_transfer(hq, destination,
  jsonb_build_array(jsonb_build_object('stock_item_id', supplies, 'quantity', 5)), gen_random_uuid())->>'transfer_id')::uuid;
 PERFORM dispatch_stock_transfer(hq_transfer);
 PERFORM set_config('request.jwt.claim.sub', am_destination::text, true);
 PERFORM complete_stock_transfer(hq_transfer);
 RESET ROLE;
 IF (SELECT quantity FROM inventory_balances WHERE location_id = destination AND stock_item_id = item) IS DISTINCT FROM 6::numeric
  OR (SELECT quantity FROM inventory_balances WHERE location_id = destination AND stock_item_id = supplies) IS DISTINCT FROM 5::numeric THEN
  RAISE EXCEPTION 'Same-AM or HQ-to-kiosk receipt failed';
 END IF;

 DELETE FROM profile_branch_access WHERE profile_id = am_source AND branch_id = branch_b;
 INSERT INTO stock_movements(organization_id, movement_type, location_id, stock_item_id, quantity, unit)
 VALUES (org, 'RECEIVE', source, supplies, 2, 'PCS');
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub', am_source::text, true);
 partial_transfer := (create_stock_transfer(source, destination, lines ||
  jsonb_build_array(jsonb_build_object('stock_item_id', supplies, 'quantity', 2)), gen_random_uuid())->>'transfer_id')::uuid;
 PERFORM dispatch_stock_transfer(partial_transfer);
 SELECT id INTO STRICT partial_roti FROM stock_transfer_items WHERE transfer_id = partial_transfer AND stock_item_id = item;
 SELECT id INTO STRICT partial_supplies FROM stock_transfer_items WHERE transfer_id = partial_transfer AND stock_item_id = supplies;
 receipt_lines := jsonb_build_array(jsonb_build_object('item_id', partial_roti, 'quantity', 1));
 BEGIN
  PERFORM receive_stock_transfer(partial_transfer, receipt_key, 0, receipt_lines, false, 'Wrong side');
  RAISE EXCEPTION 'Source AM posted a partial receipt at the other branch';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub', am_destination::text, true);
 BEGIN
  PERFORM receive_stock_transfer(partial_transfer, receipt_key, 0, receipt_lines, false, E' \n\t ');
  RAISE EXCEPTION 'Partial receipt accepted a blank reason';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM receive_stock_transfer(partial_transfer, receipt_key, 0, receipt_lines || receipt_lines, false, 'Duplicate rows');
  RAISE EXCEPTION 'Duplicate receipt lines were accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM receive_stock_transfer(partial_transfer, receipt_key, 0,
   jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'quantity', 1)), false, 'Foreign line');
  RAISE EXCEPTION 'Foreign receipt line was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 result := receive_stock_transfer(partial_transfer, receipt_key, 0, receipt_lines, false, 'Baki dalam perjalanan');
 IF result->>'status' IS DISTINCT FROM 'IN_TRANSIT' OR
  receive_stock_transfer(partial_transfer, receipt_key, 0, receipt_lines, false, 'Baki dalam perjalanan') IS DISTINCT FROM result THEN
  RAISE EXCEPTION 'Partial posting did not stay open or retry was not idempotent';
 END IF;
 BEGIN
  PERFORM receive_stock_transfer(partial_transfer, receipt_key, 0, receipt_lines, true, 'Changed intent');
  RAISE EXCEPTION 'Changed receipt reused an idempotency key';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM receive_stock_transfer(partial_transfer, gen_random_uuid(), 0, receipt_lines, false, 'Stale quantity');
  RAISE EXCEPTION 'Stale submission with another key duplicated a receipt';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM complete_stock_transfer(partial_transfer);
  RAISE EXCEPTION 'Legacy full receipt bypassed partial reconciliation';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM reverse_stock_transfer(partial_transfer, 'Still in transit');
  RAISE EXCEPTION 'In-transit document could be reversed';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM receive_stock_transfer(partial_transfer, gen_random_uuid(), 1, receipt_lines, false, 'Kotak kedua');
 PERFORM receive_stock_transfer(partial_transfer, gen_random_uuid(), 2, '[]', true, 'Tutup baki tidak sampai');
 IF receive_stock_transfer(partial_transfer, receipt_key, 0, receipt_lines, false, 'Baki dalam perjalanan') IS DISTINCT FROM result THEN
  RAISE EXCEPTION 'A retry after a later receipt did not replay the stored result';
 END IF;
 SELECT doc INTO STRICT result FROM jsonb_array_elements(list_stock_transfers(destination)) doc WHERE doc->>'id' = partial_transfer::text;
 IF result->>'status' IS DISTINCT FROM 'DELIVERED' OR jsonb_array_length(result->'receipts') <> 3
  OR (result->>'can_reverse')::boolean IS DISTINCT FROM true
  OR (SELECT received_quantity FROM stock_transfer_items WHERE id = partial_roti) IS DISTINCT FROM 2::numeric
  OR (SELECT received_quantity FROM stock_transfer_items WHERE id = partial_supplies) IS DISTINCT FROM 0::numeric THEN
  RAISE EXCEPTION 'Cumulative receipt, closed shortage or audit listing failed';
 END IF;

 PERFORM set_config('request.jwt.claim.sub', am_unrelated::text, true);
 IF EXISTS (SELECT 1 FROM stock_transfer_receipts WHERE transfer_id = partial_transfer) THEN
  RAISE EXCEPTION 'Unrelated AM can see receipt events';
 END IF;
 PERFORM set_config('request.jwt.claim.sub', am_source::text, true);
 IF NOT EXISTS (SELECT 1 FROM stock_transfer_receipts WHERE transfer_id = partial_transfer) THEN
  RAISE EXCEPTION 'Sender cannot review the scoped receipt audit';
 END IF;
 BEGIN
  UPDATE stock_transfer_receipts SET reason = 'Overwritten' WHERE transfer_id = partial_transfer;
  RAISE EXCEPTION 'An AM can overwrite receipt audit records';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM reverse_stock_transfer(partial_transfer, 'Unilateral return');
  RAISE EXCEPTION 'Original sender could deduct stock at the receiving branch';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub', am_destination::text, true);
 result := reverse_stock_transfer(partial_transfer, 'Pulang dua unit diterima');
 reverse_id := (result->>'transfer_id')::uuid;
 IF reverse_stock_transfer(partial_transfer, 'Pulang dua unit diterima') IS DISTINCT FROM result THEN
  RAISE EXCEPTION 'Repeated reversal created another document';
 END IF;
 BEGIN
  PERFORM reverse_stock_transfer(partial_transfer, 'Changed reason');
  RAISE EXCEPTION 'Duplicate reversal did not conflict';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 SELECT id INTO STRICT return_line FROM stock_transfer_items WHERE transfer_id = reverse_id;
 BEGIN
  PERFORM receive_stock_transfer(reverse_id, gen_random_uuid(), 0,
   jsonb_build_array(jsonb_build_object('item_id', return_line, 'quantity', 2)), false);
  RAISE EXCEPTION 'Return sender credited the remote branch without confirmation';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
 IF (SELECT quantity FROM inventory_balances WHERE location_id = source AND stock_item_id = item) IS DISTINCT FROM 11::numeric
  OR (SELECT quantity FROM inventory_balances WHERE location_id = destination AND stock_item_id = item) IS DISTINCT FROM 6::numeric
  OR (SELECT count(*) FROM stock_movements WHERE reference_id = partial_transfer AND movement_type = 'TRANSFER_IN') <> 2
  OR EXISTS (SELECT 1 FROM stock_movements WHERE reference_id = reverse_id AND movement_type = 'TRANSFER_IN')
  OR NOT EXISTS (SELECT 1 FROM stock_transfers WHERE id = reverse_id AND reversal_of_id = partial_transfer
   AND created_by = am_destination AND reversal_reason = 'Pulang dua unit diterima')
  OR NOT EXISTS (SELECT 1 FROM stock_transfer_receipts WHERE transfer_id = partial_transfer AND version = 3
   AND reason = 'Tutup baki tidak sampai' AND closed AND received_by = am_destination) THEN
  RAISE EXCEPTION 'Receipt or reversal audit/balances did not match physical stock';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub', am_source::text, true);
 BEGIN
  PERFORM complete_stock_transfer(reverse_id);
  RAISE EXCEPTION 'Reverse document allowed legacy receipt without explicit quantities';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 receipt_lines := jsonb_build_array(jsonb_build_object('item_id', return_line, 'quantity', 2));
 IF receive_stock_transfer(reverse_id, gen_random_uuid(), 0, receipt_lines, false)->>'status' IS DISTINCT FROM 'DELIVERED' THEN
  RAISE EXCEPTION 'Original source could not confirm the return';
 END IF;
 BEGIN
  PERFORM reverse_stock_transfer(reverse_id, 'Nested return');
  RAISE EXCEPTION 'Recursive reversal was allowed';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 RESET ROLE;
 IF (SELECT quantity FROM inventory_balances WHERE location_id = source AND stock_item_id = item) IS DISTINCT FROM 13::numeric
  OR NOT EXISTS (SELECT 1 FROM stock_movements WHERE reference_id = reverse_id AND movement_type = 'TRANSFER_IN'
   AND production_date = stock_today AND quantity = 2 AND created_by = am_source)
  OR NOT EXISTS (SELECT 1 FROM stock_transfers WHERE id = partial_transfer AND status = 'DELIVERED') THEN
  RAISE EXCEPTION 'Return did not preserve source balance, batch, receiver or original document';
 END IF;

 -- A failed return leaves no document or stock changes; an HQ return still
 -- requires its HQ receiver. Physical excess is audited without over-crediting.
 INSERT INTO stock_movements(organization_id, movement_type, location_id, stock_item_id, quantity, unit)
 VALUES (org, 'WRITE_OFF', destination, supplies, -1, 'PCS');
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub', am_destination::text, true);
 BEGIN
  PERFORM reverse_stock_transfer(hq_transfer, 'Return to HQ');
  RAISE EXCEPTION 'Return dispatched stock that was no longer available';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 IF EXISTS (SELECT 1 FROM stock_transfers WHERE reversal_of_id = hq_transfer) THEN
  RAISE EXCEPTION 'Failed reversal left a document';
 END IF;
 RESET ROLE;
 INSERT INTO stock_movements(organization_id, movement_type, location_id, stock_item_id, quantity, unit)
 VALUES (org, 'RECEIVE', destination, supplies, 1, 'PCS');
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub', am_destination::text, true);
 hq_return := (reverse_stock_transfer(hq_transfer, 'Return to HQ')->>'transfer_id')::uuid;
 SELECT id INTO STRICT return_line FROM stock_transfer_items WHERE transfer_id = hq_return;
 receipt_lines := jsonb_build_array(jsonb_build_object('item_id', return_line, 'quantity', 6));
 PERFORM set_config('request.jwt.claim.sub', hq_admin::text, true);
 BEGIN
  PERFORM receive_stock_transfer(hq_return, gen_random_uuid(), 0, receipt_lines, false);
  RAISE EXCEPTION 'Overage was accepted without a reason';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 PERFORM receive_stock_transfer(hq_return, gen_random_uuid(), 0, receipt_lines, false, 'Lebihan perlu semakan');
 RESET ROLE;
 IF (SELECT quantity FROM inventory_balances WHERE location_id = hq AND stock_item_id = supplies) IS DISTINCT FROM 10::numeric
  OR NOT EXISTS (SELECT 1 FROM stock_transfer_receipts WHERE transfer_id = hq_return
   AND items = receipt_lines AND (excess_items->0->>'quantity')::numeric = 1 AND received_by = hq_admin) THEN
  RAISE EXCEPTION 'Overage was over-credited or not audited';
 END IF;

 INSERT INTO stock_transfers (id, organization_id, transfer_number, from_location_id, to_location_id, status)
 VALUES (delivery, org, 'TEST-' || delivery, source, destination, 'IN_TRANSIT'),
  (fleet_transfer, org, 'TEST-' || fleet_transfer, source, destination, 'IN_TRANSIT');
 UPDATE stock_transfers SET dispatched_at = now() WHERE id IN (delivery, fleet_transfer);
 INSERT INTO pos_stock_receipts (organization_id, branch_id, location_id, stock_transfer_id)
 VALUES (org, branch_b, destination, delivery);
 INSERT INTO delivery_orders (id, organization_id, order_number, origin_location_id, final_destination_id)
 VALUES (fleet_order, org, 'TEST-' || fleet_order, source, destination);
 INSERT INTO delivery_legs (delivery_order_id, leg_sequence, leg_type, from_location_id, to_location_id, stock_transfer_id)
 VALUES (fleet_order, 1, 'VEHICLE_TO_BRANCH', source, destination, fleet_transfer);
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub', am_destination::text, true);
 BEGIN
  PERFORM complete_stock_transfer(delivery);
  RAISE EXCEPTION 'Transfer receipt bypassed its POS workflow';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM receive_stock_transfer(fleet_transfer, gen_random_uuid(), 0, '[]', true, 'Managed delivery');
  RAISE EXCEPTION 'Explicit transfer receipt bypassed its fleet workflow';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM reverse_stock_transfer(delivery, 'Managed delivery');
  RAISE EXCEPTION 'Reversal bypassed its POS workflow';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 IF (SELECT count(*) FROM jsonb_array_elements(list_stock_transfers(destination)) doc
  WHERE doc->>'id' IN (delivery::text, fleet_transfer::text)
   AND (doc->>'managed_delivery')::boolean AND NOT (doc->>'can_complete')::boolean) <> 2 THEN
  RAISE EXCEPTION 'A linked POS or fleet document was shown as receivable';
 END IF;
 RESET ROLE;
 IF to_regprocedure('public.complete_stock_transfer(uuid,date)') IS NOT NULL THEN
  RAISE EXCEPTION 'Legacy date override is still a public RPC';
 END IF;
END;
$$;

ROLLBACK;
