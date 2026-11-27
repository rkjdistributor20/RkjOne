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
 delivery uuid := gen_random_uuid();
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

 INSERT INTO stock_transfers (id, organization_id, transfer_number, from_location_id, to_location_id, status)
 VALUES (delivery, org, 'TEST-' || delivery, source, destination, 'IN_TRANSIT');
 INSERT INTO pos_stock_receipts (organization_id, branch_id, location_id, stock_transfer_id)
 VALUES (org, branch_b, destination, delivery);
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub', am_destination::text, true);
 BEGIN
  PERFORM complete_stock_transfer(delivery);
  RAISE EXCEPTION 'Transfer receipt bypassed its POS workflow';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 RESET ROLE;
END;
$$;

ROLLBACK;
