-- Run only via staff_stock_count_capture_local.mjs in a disposable fixture.
DO $test$
DECLARE
 o uuid := gen_random_uuid(); b uuid := gen_random_uuid(); other_branch uuid := gen_random_uuid();
 l uuid := gen_random_uuid(); other_loc uuid := gen_random_uuid(); s uuid := gen_random_uuid();
 sku uuid := gen_random_uuid(); other_sku uuid := gen_random_uuid();
 staff uuid := gen_random_uuid(); other_staff uuid := gen_random_uuid(); am uuid := gen_random_uuid();
 capture jsonb; earlier jsonb; later jsonb; result jsonb; a jsonb;
 lines jsonb; batches jsonb; c uuid; older uuid; old_pending uuid; stale uuid; replacement uuid;
BEGIN
 INSERT INTO organizations VALUES (o);
 INSERT INTO profiles VALUES (staff,o,'STAFF','ACTIVE'), (other_staff,o,'STAFF','ACTIVE'), (am,o,'AREA_MANAGER','ACTIVE');
 INSERT INTO branches VALUES (b,o), (other_branch,o);
 INSERT INTO profile_branch_access VALUES (staff,b),(other_staff,b),(am,b);
 INSERT INTO inventory_locations(id, organization_id, location_type, name, branch_id)
 VALUES (l,o,'BRANCH_KIOSK','Fixture kiosk',b),(other_loc,o,'BRANCH_KIOSK','Outside scope',other_branch);
 INSERT INTO pos_shifts(id,organization_id,branch_id,status) VALUES (s,o,b,'OPEN');
 INSERT INTO stock_items(id,organization_id,base_unit,name) VALUES (sku,o,'PCS','Fixture SKU'),(other_sku,o,'PCS','Other SKU');
 INSERT INTO stock_movements(organization_id,movement_type,location_id,stock_item_id,quantity,unit)
 VALUES (o,'RECEIVE',l,sku,20,'PCS');
 -- An old pending row has a submission baseline but no capture provenance.
 INSERT INTO stock_counts(organization_id,count_number,location_id,counted_by,notes)
 VALUES (o,'LEGACY-01',l,staff,'POS_OPENING') RETURNING id INTO old_pending;
 INSERT INTO stock_count_items(count_id,stock_item_id,system_quantity,counted_quantity,unit)
 VALUES (old_pending,sku,20,100,'PCS');
 lines := jsonb_build_array(jsonb_build_object('stock_item_id',sku,'counted_quantity',18,'unit','PCS'));
 batches := jsonb_build_array(
  jsonb_build_object('stock_item_id',sku,'counted_quantity',10,'unit','PCS','production_date','2026-11-25'),
  jsonb_build_object('stock_item_id',sku,'counted_quantity',6,'unit','PCS','production_date','2026-11-26'));

 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 BEGIN
  PERFORM capture_pos_stock_count(other_loc, ARRAY[sku]);
  RAISE SQLSTATE 'XX000' USING MESSAGE = 'Out-of-scope location captured';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM submit_stock_count_at_submission(l, lines, 'bypass', NULL);
  RAISE SQLSTATE 'XX000' USING MESSAGE = 'Deployed submit helper exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 capture := capture_pos_stock_count(l, ARRAY[sku]);
 IF (capture->>'captured_at') IS NULL THEN RAISE EXCEPTION 'Capture did not supply a server timestamp'; END IF;
 PERFORM set_config('request.jwt.claim.sub',other_staff::text,true);
 result := submit_captured_stock_count(l, lines, 'POS_MID_SHIFT', NULL, (capture->>'id')::uuid);
 IF result->>'status' IS DISTINCT FROM 'REJECTED' OR (result->>'captured_at') IS NOT NULL THEN
  RAISE EXCEPTION 'Different staff used the capture: %', result;
 END IF;

 RESET ROLE;
 -- A transaction during physical observation is ambiguous even if backdated.
 INSERT INTO stock_movements(organization_id,movement_type,location_id,stock_item_id,quantity,unit,created_at)
 VALUES (o,'SALE_DEDUCT',l,sku,-2,'PCS','2026-01-01');
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 BEGIN
  INSERT INTO public.pos_shift_stock_check_logs(shift_id,check_type) VALUES(s,'OPENING');
  RAISE SQLSTATE 'XX000' USING MESSAGE='Staff forged a shift check';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 result := record_verified_pos_staff_stock_check(staff,gen_random_uuid(),1,b,l,batches,'POS_OPENING',
  NULL,(capture->>'id')::uuid,'OPENING',NULL,NULL);
 IF result->>'status' <> 'REJECTED' OR NOT coalesce((result->>'shift_check_recorded')::boolean,false)
  OR result->>'rejection_reason' NOT LIKE 'Stok bergerak%' THEN
   RAISE EXCEPTION 'Ambiguous observation was booked or blocked operational count: %',result;
 END IF;
 IF result IS DISTINCT FROM record_verified_pos_staff_stock_check(staff,gen_random_uuid(),1,b,l,batches,'POS_OPENING',
  NULL,(capture->>'id')::uuid,'OPENING',NULL,NULL)
  OR (SELECT count(*) FROM pos_shift_stock_check_logs WHERE shift_id=s AND check_type='OPENING') <> 1 THEN
   RAISE EXCEPTION 'Atomic stock check replay created a new result'; END IF;
 SET LOCAL ROLE authenticated;
 capture := capture_pos_stock_count(l, ARRAY[sku]);
 result := submit_captured_stock_count(l, batches, 'POS_MID_SHIFT', NULL, (capture->>'id')::uuid);
 c := (result->>'count_id')::uuid;
 IF result->>'status' IS DISTINCT FROM 'PENDING' OR (result->>'capture_shift_id')::uuid IS DISTINCT FROM s
   OR (SELECT sum(system_quantity) FROM stock_count_items WHERE count_id=c) IS DISTINCT FROM 18::numeric
   OR (SELECT count(*) FROM stock_count_items WHERE count_id=c AND production_date IS NOT NULL) <> 2 THEN
  RAISE EXCEPTION 'Delayed count did not retain baseline and batch evidence: %', result;
 END IF;
 BEGIN
  PERFORM submit_captured_stock_count(l, batches, 'retry', NULL, (capture->>'id')::uuid);
  RAISE SQLSTATE 'XX000' USING MESSAGE = 'Duplicate capture submission accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 RESET ROLE;
 INSERT INTO stock_movements(organization_id,movement_type,location_id,stock_item_id,quantity,unit)
 VALUES (o,'TRANSFER_IN',l,sku,4,'PCS');

 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',am::text,true);
 BEGIN
  PERFORM approve_stock_count(old_pending);
  RAISE SQLSTATE 'XX000' USING MESSAGE = 'Legacy pending stock count could overwrite the live balance';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM review_stock_count(old_pending,'REJECT','Kira semula dengan snapshot sah');
 PERFORM approve_stock_count(c);
 BEGIN
  PERFORM approve_stock_count(c);
  RAISE SQLSTATE 'XX000' USING MESSAGE = 'Repeated approval posted stock again';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 RESET ROLE;
 SELECT new_values INTO a FROM audit_logs WHERE action='STOCK_COUNT_APPROVE' AND entity_id=c;
 IF (SELECT quantity FROM inventory_balances WHERE location_id=l AND stock_item_id=sku) IS DISTINCT FROM 20::numeric
  OR (SELECT count(*) FROM stock_movements WHERE reference_id=c AND quantity=-2) <> 1
  OR (a->>'counted_at')::timestamptz IS DISTINCT FROM (capture->>'captured_at')::timestamptz
  OR (a->'items'->0->>'net_since_count')::numeric IS DISTINCT FROM 4::numeric THEN
  RAISE EXCEPTION 'Approval lost intervening ledger movements or the physical count time: %', a;
 END IF;

 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 result := submit_stock_count(l, lines, 'POS_OPENING');
 stale := (result->>'count_id')::uuid;
 IF result->>'status' IS DISTINCT FROM 'REJECTED' OR NOT EXISTS (
  SELECT 1 FROM list_pos_stock_recounts(l) WHERE id=stale AND rejection_reason LIKE 'Tiada snapshot%'
 ) OR EXISTS (SELECT 1 FROM stock_counts WHERE id=stale AND (captured_at IS NOT NULL OR count_date IS NOT NULL))
  OR EXISTS (SELECT 1 FROM stock_count_items WHERE count_id=stale AND system_quantity IS NOT NULL)
  OR EXISTS (SELECT 1 FROM stock_movements WHERE reference_id=stale) THEN
  RAISE EXCEPTION 'Unverified legacy submission was treated as fresh: %', result;
 END IF;

 earlier := capture_pos_stock_count(l, ARRAY[sku]);
 later := capture_pos_stock_count(l, ARRAY[sku]);
 c := (submit_captured_stock_count(l, lines, 'POS_RECOUNT', stale, (later->>'id')::uuid)->>'count_id')::uuid;
 result := submit_captured_stock_count(l, lines, 'POS_MID_SHIFT', NULL, (earlier->>'id')::uuid);
 IF result->>'status' IS DISTINCT FROM 'REJECTED'
  OR result->>'rejection_reason' NOT LIKE 'Snapshot kiraan lapuk%'
  OR EXISTS (SELECT 1 FROM list_pos_stock_recounts(l) WHERE id=stale)
  OR NOT EXISTS (SELECT 1 FROM stock_counts WHERE id=c AND recount_of=stale AND status='PENDING') THEN
  RAISE EXCEPTION 'Out-of-order submission or recount linkage incorrect: %', result;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',am::text,true);
 PERFORM approve_stock_count(c);

 -- An SKU omitted from the capture never falls back to the live balance.
 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 capture := capture_pos_stock_count(l, ARRAY[other_sku]);
 result := submit_captured_stock_count(l, lines, 'POS_MID_SHIFT', NULL, (capture->>'id')::uuid);
 IF result->>'status' IS DISTINCT FROM 'REJECTED' OR result->>'rejection_reason' NOT LIKE 'Snapshot tidak meliputi%' THEN
  RAISE EXCEPTION 'Count with incomplete capture was trusted: %', result;
 END IF;

 -- Approving the newer physical correction invalidates an older pending
 -- observation even when approval caused no COUNT movement at all.
 earlier := capture_pos_stock_count(l, ARRAY[sku]);
 older := (submit_captured_stock_count(l, lines, 'POS_MID_SHIFT', NULL, (earlier->>'id')::uuid)->>'count_id')::uuid;
 later := capture_pos_stock_count(l, ARRAY[sku]);
 replacement := (submit_captured_stock_count(l, lines, 'POS_MID_SHIFT', NULL, (later->>'id')::uuid)->>'count_id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',am::text,true);
 BEGIN
  PERFORM approve_stock_count(older);
  RAISE SQLSTATE 'XX000' USING MESSAGE = 'Older pending observation was approved over a newer pending one';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM approve_stock_count(replacement);
 IF EXISTS (SELECT 1 FROM stock_movements WHERE reference_id=replacement) THEN
  RAISE EXCEPTION 'Expected no movement for the exact zero-delta correction';
 END IF;
 BEGIN
  PERFORM approve_stock_count(older);
  RAISE SQLSTATE 'XX000' USING MESSAGE = 'Older observation approved after zero-delta newer approval';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM review_stock_count(older,'REJECT','Snapshot lapuk');

 -- The approval version, not snapshot timestamp ordering, catches an older
 -- correction that was approved after the newer capture was already issued.
 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 earlier := capture_pos_stock_count(l, ARRAY[sku]);
 c := (submit_captured_stock_count(l, lines, 'POS_MID_SHIFT', NULL, (earlier->>'id')::uuid)->>'count_id')::uuid;
 later := capture_pos_stock_count(l, ARRAY[sku]);
 PERFORM set_config('request.jwt.claim.sub',am::text,true);
 PERFORM approve_stock_count(c);
 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 result := submit_captured_stock_count(l, lines, 'POS_MID_SHIFT', NULL, (later->>'id')::uuid);
 IF result->>'status' IS DISTINCT FROM 'REJECTED' OR result->>'rejection_reason' NOT LIKE 'Snapshot kiraan lapuk%' THEN
  RAISE EXCEPTION 'An older correction was approved after capture without invalidating the observation: %', result;
 END IF;
 RESET ROLE;
 IF NOT EXISTS (SELECT 1 FROM notifications WHERE recipient_id=staff AND entity_id=stale AND title='Kiraan stok perlu dikira semula') THEN
  RAISE EXCEPTION 'Unverified observation did not notify staff';
 END IF;
END $test$;
