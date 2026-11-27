-- Run only in a fresh disposable database, never against a linked project.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TYPE public.user_role AS ENUM ('AREA_MANAGER','SUPER_ADMIN','ADMIN','OPERATION_MANAGER','CEO_FACTORY','STAFF','HR','FINANCE');
CREATE TYPE public.location_type AS ENUM ('FACTORY','HQ_WAREHOUSE','FLEET_VEHICLE','BRANCH_KIOSK');
CREATE TYPE public.stock_unit AS ENUM ('PCS','GRAM','BAG');
CREATE TYPE public.movement_type AS ENUM ('RECEIVE','ADJUSTMENT','COUNT','TRANSFER_IN','TRANSFER_OUT','SALE_DEDUCT','WRITE_OFF');
CREATE TYPE public.approval_status AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE public.transfer_status AS ENUM ('DRAFT','COMPLETED');
CREATE TYPE public.approval_entity_type AS ENUM ('STOCK_TRANSFER','STOCK_ADJUSTMENT','SHIFT','POS_SHIFT_STAFF');
CREATE TYPE public.notification_type AS ENUM ('PENDING_APPROVAL');
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.regions(id uuid PRIMARY KEY);
CREATE TABLE public.branches(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE public.vehicles(id uuid PRIMARY KEY);
CREATE TABLE public.drivers(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(id uuid PRIMARY KEY, organization_id uuid, role public.user_role, status text);
CREATE TABLE public.profile_branch_access(profile_id uuid, branch_id uuid, PRIMARY KEY (profile_id,branch_id));
CREATE TABLE public.stock_items(id uuid PRIMARY KEY, organization_id uuid, base_unit public.stock_unit, name text, status text DEFAULT 'ACTIVE');
CREATE TABLE public.pos_stock_receipts(id uuid PRIMARY KEY, organization_id uuid, location_id uuid, route_stop_id uuid);
CREATE FUNCTION public.organization_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT p.organization_id FROM public.profiles p WHERE p.id=auth.uid() AND p.status='ACTIVE'
$$;
CREATE FUNCTION public.user_role() RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT p.role FROM public.profiles p WHERE p.id=auth.uid() AND p.status='ACTIVE'
$$;
CREATE FUNCTION public.has_branch_access(p_branch uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.branches b JOIN public.profile_branch_access a ON a.branch_id=b.id
 WHERE b.id=p_branch AND b.organization_id=public.organization_id() AND a.profile_id=auth.uid())
$$;
-- LOAD BASE INVENTORY AND APPROVAL TABLES: 00004_inventory.sql, 00008_notifications_approvals.sql
ALTER TABLE public.stock_count_items ADD COLUMN production_date date;
ALTER TABLE public.stock_movements ADD COLUMN production_date date;
CREATE TABLE public.stock_batches(
 organization_id uuid, location_id uuid, stock_item_id uuid, quantity_remaining numeric,
 unit public.stock_unit, production_date date, expires_on date, inbound_movement_id uuid,status text);
CREATE SEQUENCE public.stock_test_sequence;
CREATE FUNCTION public.generate_inv_number(p_prefix text, p_org uuid) RETURNS text LANGUAGE sql AS $$
 SELECT p_prefix || '-' || nextval('public.stock_test_sequence')::text
$$;
CREATE FUNCTION public.roti_shelf_life_days() RETURNS int LANGUAGE sql AS $$ SELECT 5 $$;
CREATE FUNCTION public.is_roti_stock_item(p_id uuid) RETURNS boolean LANGUAGE sql AS $$
 SELECT name='Roti test' FROM public.stock_items WHERE id=p_id
$$;
CREATE FUNCTION public.apply_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER stock_movement_apply_balance BEFORE INSERT ON public.stock_movements
 FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();
CREATE FUNCTION public.receive_stock(uuid,jsonb,text,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.submit_stock_adjustment(uuid,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.approve_stock_adjustment(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.resolve_approval_request(uuid,text,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"delegated":true}'::jsonb $$;
CREATE FUNCTION public.get_roti_expiry_summary(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

DO $fixture$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['inventory_balances','stock_movements','stock_batches','stock_counts','stock_count_items',
 'stock_receives','stock_adjustments','approval_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
  EXECUTE format('CREATE POLICY fixture_existing_policy ON public.%I USING (true)', v_table);
 END LOOP;
END $fixture$;

-- LOAD AM STOCK MIGRATION: 20261127220000_am_scoped_stock_posting_and_count_review.sql
DO $fixture$
DECLARE
 o uuid := gen_random_uuid(); outside_org uuid := gen_random_uuid();
 am uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); other_staff uuid := gen_random_uuid();
 b uuid := gen_random_uuid(); outside_branch uuid := gen_random_uuid(); foreign_branch uuid := gen_random_uuid();
 l uuid := gen_random_uuid(); outside_loc uuid := gen_random_uuid(); foreign_loc uuid := gen_random_uuid();
 wh uuid := gen_random_uuid();
 i uuid := gen_random_uuid(); roti uuid := gen_random_uuid(); foreign_item uuid := gen_random_uuid();
 c uuid; c_old uuid; c_new uuid; req uuid; fixture_req uuid; outside_req uuid; receipt uuid; adj uuid;
 lines jsonb; audit jsonb;
BEGIN
 INSERT INTO organizations VALUES (o),(outside_org);
 INSERT INTO profiles VALUES (am,o,'AREA_MANAGER','ACTIVE'), (staff,o,'STAFF','ACTIVE'), (other_staff,o,'STAFF','ACTIVE');
 INSERT INTO branches VALUES (b,o), (outside_branch,o), (foreign_branch,outside_org);
 INSERT INTO profile_branch_access VALUES (am,b),(staff,b),(other_staff,b);
 INSERT INTO inventory_locations(id, organization_id, location_type, name, branch_id)
 VALUES (l,o,'BRANCH_KIOSK','Assigned kiosk',b), (outside_loc,o,'BRANCH_KIOSK','Outside scope',outside_branch),
 (foreign_loc,outside_org,'BRANCH_KIOSK','Another tenant',foreign_branch),(wh,o,'HQ_WAREHOUSE','HQ',NULL);
 INSERT INTO stock_items VALUES (i,o,'PCS','Fixture item'),(roti,o,'PCS','Roti test'),(foreign_item,outside_org,'PCS','Foreign');
 INSERT INTO stock_transfers(organization_id,transfer_number,from_location_id,to_location_id)
 VALUES(o,'TRANSFER-01',wh,l);
 INSERT INTO approval_requests(organization_id,entity_type,entity_id,title,status,requested_by,branch_id)
 VALUES (o,'SHIFT',gen_random_uuid(),'In scope fixture','PENDING',staff,b) RETURNING id INTO fixture_req;
 INSERT INTO approval_requests(organization_id,entity_type,entity_id,title,status,requested_by,branch_id)
 VALUES (o,'SHIFT',gen_random_uuid(),'Out of scope fixture','PENDING',staff,outside_branch) RETURNING id INTO outside_req;
 lines := jsonb_build_array(jsonb_build_object('stock_item_id',i,'quantity',10,'unit','PCS'));
 PERFORM set_config('request.jwt.claim.sub',am::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN
  PERFORM post_am_stock_receipt(outside_loc,lines,'Supplier test',NULL,NULL);
  RAISE EXCEPTION 'Out-of-scope receipt posted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM post_am_stock_receipt(foreign_loc,lines,'Supplier test',NULL,NULL);
  RAISE EXCEPTION 'Cross-tenant receipt posted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM get_roti_expiry_summary(outside_loc);
  RAISE EXCEPTION 'Expiry RPC leaked another kiosk';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (resolve_approval_request(fixture_req,'APPROVE')->>'delegated') IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Non-stock approval did not delegate to the legacy implementation';
 END IF;
 BEGIN
  PERFORM resolve_approval_request(outside_req,'APPROVE');
  RAISE SQLSTATE 'XX000' USING MESSAGE='Out-of-scope AM approval delegated to legacy resolver';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM receive_stock_before_am_stock(l,lines,'Supplier test',NULL);
  RAISE EXCEPTION 'Unwrapped receipt is callable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM post_am_stock_receipt(l,lines,'Supplier test','transfer-01',NULL);
  RAISE SQLSTATE 'XX000' USING MESSAGE='Linked transfer reference accepted in manual receipt';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 receipt := (post_am_stock_receipt(l,lines,'Supplier test','Test-01',NULL)->>'receive_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM stock_receives WHERE id=receipt AND received_by=am AND document_reference='Test-01')
  OR NOT EXISTS(SELECT 1 FROM stock_movements WHERE reference_id=receipt AND quantity=10 AND balance_before=0 AND balance_after=10) THEN
  RAISE EXCEPTION 'Receipt evidence or initial movement is incorrect';
 END IF;
 BEGIN
  PERFORM post_am_stock_receipt(l,lines,'supplier test','test-01',NULL);
  RAISE EXCEPTION 'Duplicate source document posted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM post_am_stock_receipt(l,lines || jsonb_build_array(jsonb_build_object('stock_item_id',foreign_item,'quantity',5)),'Supplier test',NULL,NULL);
  RAISE SQLSTATE 'XX000' USING MESSAGE='Foreign item accepted';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN
  PERFORM post_am_stock_adjustment(l,chr(9) || chr(10),jsonb_build_array(jsonb_build_object('stock_item_id',i,'expected_quantity',10,'quantity_after',9)));
  RAISE SQLSTATE 'XX000' USING MESSAGE='Blank adjustment reason accepted';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 adj := (post_am_stock_adjustment(l,'Fixture correction',jsonb_build_array(
  jsonb_build_object('stock_item_id',i,'expected_quantity',10,'quantity_after',12)))->>'adjustment_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM stock_adjustments WHERE id=adj AND status='APPROVED' AND created_by=am AND approved_by=am)
  OR NOT EXISTS(SELECT 1 FROM stock_movements WHERE reference_id=adj AND quantity=2 AND balance_before=10 AND balance_after=12)
  OR EXISTS(SELECT 1 FROM approval_requests WHERE entity_id=adj) THEN RAISE EXCEPTION 'Adjustment was not directly audited and posted'; END IF;
 BEGIN
  PERFORM post_am_stock_adjustment(l,'Stale UI',jsonb_build_array(jsonb_build_object('stock_item_id',i,'expected_quantity',10,'quantity_after',9)));
  RAISE EXCEPTION 'Stale UI adjustment posted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM post_am_stock_adjustment(l,'Fixture decrease',jsonb_build_array(
  jsonb_build_object('stock_item_id',i,'expected_quantity',12,'quantity_after',10)));
 BEGIN
  PERFORM post_am_stock_adjustment(l,'Need actual batch',jsonb_build_array(jsonb_build_object('stock_item_id',roti,'expected_quantity',0,'quantity_after',2)));
  RAISE SQLSTATE 'XX000' USING MESSAGE='Undated roti addition accepted';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 PERFORM post_am_stock_adjustment(l,'Dated batch adjustment',jsonb_build_array(jsonb_build_object('stock_item_id',roti,
  'expected_quantity',0,'quantity_after',2,'production_date',current_date)));
 IF NOT EXISTS(SELECT 1 FROM stock_batches WHERE location_id=l AND stock_item_id=roti AND quantity_remaining=2) THEN
  RAISE EXCEPTION 'Positive batch adjustment created untracked roti';
 END IF;

 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 lines := jsonb_build_array(jsonb_build_object('stock_item_id',i,'counted_quantity',4,'production_date',current_date),
  jsonb_build_object('stock_item_id',i,'counted_quantity',3,'production_date',current_date-1));
 c := (submit_stock_count(l,lines,'POS_MID_SHIFT')->>'count_id')::uuid;
 BEGIN
  PERFORM approve_stock_count(c);
  RAISE EXCEPTION 'Staff self-approved';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE stock_counts SET status='APPROVED' WHERE id=c;
  RAISE EXCEPTION 'Direct count mutation succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM stock_counts WHERE id=c AND status='PENDING')
  OR (SELECT sum(system_quantity) FROM stock_count_items WHERE count_id=c) IS DISTINCT FROM 10 THEN
  RAISE EXCEPTION 'Count did not stay pending or baseline was duplicated for batches';
 END IF;
 RESET ROLE;
 -- Subsequent sale -2, transfer in +5, transfer out -1. Live quantity = 12.
 INSERT INTO stock_movements(organization_id,movement_type,location_id,stock_item_id,quantity,unit)
 VALUES(o,'SALE_DEDUCT',l,i,-2,'PCS'),(o,'TRANSFER_IN',l,i,5,'PCS'),(o,'TRANSFER_OUT',l,i,-1,'PCS'),
 (o,'RECEIVE',outside_loc,i,20,'PCS');
 PERFORM set_config('request.jwt.claim.sub',am::text,true);
 SET LOCAL ROLE authenticated;
 IF EXISTS(SELECT 1 FROM inventory_balances WHERE location_id=outside_loc)
  OR EXISTS(SELECT 1 FROM stock_movements WHERE location_id=outside_loc) THEN RAISE EXCEPTION 'RLS leaked outside balance/ledger'; END IF;
 PERFORM review_stock_count(c,'APPROVE');
 IF (SELECT quantity FROM inventory_balances WHERE location_id=l AND stock_item_id=i) IS DISTINCT FROM 9
  OR (SELECT count(*) FROM stock_movements WHERE reference_id=c AND quantity=-3 AND balance_before=12 AND balance_after=9) <> 1
  OR NOT EXISTS(SELECT 1 FROM approval_requests WHERE entity_id=c AND status='APPROVED') THEN
  RAISE EXCEPTION 'Late approval overwrote valid intervening movements';
 END IF;
 BEGIN
  PERFORM approve_stock_count(c);
  RAISE EXCEPTION 'Repeat approval was not blocked';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 RESET ROLE;
 SELECT new_values->'items'->0 INTO audit FROM audit_logs WHERE entity_id=c AND action='STOCK_COUNT_APPROVE';
 IF (audit->>'net_since_count')::numeric IS DISTINCT FROM 2 OR (audit->>'balance_after')::numeric IS DISTINCT FROM 9 THEN
  RAISE EXCEPTION 'Late count audit is incomplete: %', audit;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 SET LOCAL ROLE authenticated;
 c_old := (submit_stock_count(l,lines,'POS_MID_SHIFT')->>'count_id')::uuid;
 c_new := (submit_stock_count(l,lines,'POS_MID_SHIFT')->>'count_id')::uuid;
 SELECT id INTO req FROM approval_requests WHERE entity_id=c_old;
 PERFORM set_config('request.jwt.claim.sub',am::text,true);
 BEGIN
  PERFORM approve_stock_count(c_old);
  RAISE EXCEPTION 'Superseded count approved';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM resolve_approval_request(req,'REJECT','  ');
  RAISE SQLSTATE 'XX000' USING MESSAGE='Blank reject reason accepted through legacy entry point';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 PERFORM resolve_approval_request(req,'REJECT','Please recount fixture');
 PERFORM review_stock_count(c_new,'APPROVE');
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM notifications WHERE entity_id=c_old AND recipient_id=staff AND message LIKE '%Please recount fixture%')
  OR NOT EXISTS(SELECT 1 FROM stock_counts WHERE id=c_old AND status='REJECTED' AND rejection_reason='Please recount fixture')
  OR EXISTS(SELECT 1 FROM stock_movements WHERE reference_id=c_old) THEN
  RAISE EXCEPTION 'Rejection did not leave an atomic notification/history without stock movement';
 END IF;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',other_staff::text,true);
 BEGIN
  PERFORM submit_stock_count(l,lines,'POS_RECOUNT',c_old);
  RAISE EXCEPTION 'A different staff member replaced the rejected count';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 IF NOT EXISTS(SELECT 1 FROM list_pos_stock_recounts(l) WHERE id=c_old AND rejection_reason='Please recount fixture') THEN
  RAISE EXCEPTION 'A rejected count is not actionable in POS';
 END IF;
 BEGIN
  PERFORM submit_stock_count(l,jsonb_build_array(jsonb_build_object('stock_item_id',roti,'counted_quantity',2)),'POS_RECOUNT',c_old);
  RAISE SQLSTATE 'XX000' USING MESSAGE='Recount silently dropped an item from the rejected count';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 c := (submit_stock_count(l,lines,'POS_RECOUNT',c_old)->>'count_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM stock_counts WHERE id=c AND recount_of=c_old AND status='PENDING') THEN
  RAISE EXCEPTION 'Recount was not linked and pending';
 END IF;
 IF EXISTS(SELECT 1 FROM list_pos_stock_recounts(l) WHERE id=c_old) THEN RAISE EXCEPTION 'Original still offered after recount'; END IF;
 BEGIN
  PERFORM submit_stock_count(l,lines,'POS_RECOUNT',c_old);
  RAISE EXCEPTION 'A second replacement was accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 RESET ROLE;
 DELETE FROM profile_branch_access WHERE profile_id=am AND branch_id=b;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',am::text,true);
 BEGIN
  PERFORM review_stock_count(c,'REJECT','Outside scope');
  RAISE EXCEPTION 'AM rejected after scope revocation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM stock_counts WHERE id=c) THEN RAISE EXCEPTION 'Counts visible after scope revocation'; END IF;
 RESET ROLE;
END $fixture$;
