// Run with an isolated @electric-sql/pglite module:
// node supabase/tests/am_verified_pos_local.mjs /absolute/path/to/pglite/dist/index.js
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8');

const staff = '00000000-0000-4000-a000-000000000001';
const am = '00000000-0000-4000-a000-000000000002';
const admin = '00000000-0000-4000-a000-000000000003';
const org = '00000000-0000-4000-a000-000000000010';
const region = '00000000-0000-4000-a000-000000000011';
const branch = '00000000-0000-4000-a000-000000000012';
const laterBranch = '00000000-0000-4000-a000-000000000013';
const device = '00000000-0000-4000-a000-000000000014';
const wrongOrg = '00000000-0000-4000-a000-000000000015';
const outside = '00000000-0000-4000-a000-000000000016';

try {
 await db.exec(`
 CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
   SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
 $$;
 CREATE TYPE public.user_role AS ENUM ('SUPER_ADMIN','ADMIN','OPERATION_MANAGER','AREA_MANAGER','STAFF','HR','FINANCE','CEO_FACTORY');
 CREATE TYPE public.entity_status AS ENUM ('ACTIVE','INACTIVE');
 CREATE TYPE public.payment_method AS ENUM ('CASH','QR','MIXED');
 CREATE TABLE public.profiles (id uuid PRIMARY KEY,organization_id uuid,role public.user_role,status public.entity_status,branch_id uuid,region_id uuid);
 CREATE FUNCTION public.user_role() RETURNS public.user_role LANGUAGE sql STABLE AS $$ SELECT role FROM profiles WHERE id=auth.uid() $$;
 CREATE TABLE public.branches (id uuid PRIMARY KEY,organization_id uuid,status text,region_id uuid);
 CREATE TABLE public.profile_branch_access(profile_id uuid,branch_id uuid, UNIQUE(profile_id,branch_id));
 CREATE TABLE public.staff (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid,profile_id uuid,branch_id uuid,status text,full_name text);
 CREATE TABLE public.staff_shifts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,staff_id uuid,branch_id uuid,
   shift_date date,scheduled_start time,scheduled_end time,status text);
 CREATE TABLE public.pos_devices (id uuid PRIMARY KEY,organization_id uuid,branch_id uuid,status text,
   enrolled_at timestamptz,asset_verified_at timestamptz,asset_verified_by uuid,secret_hash text,enrollment_generation integer);
 CREATE TABLE public.pos_shifts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,branch_id uuid,
   opened_at timestamptz DEFAULT now(),opened_by uuid,opening_cash numeric,status text);
 CREATE TABLE public.pos_shift_staff_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,branch_id uuid,
  shift_id uuid,profile_id uuid,staff_id uuid,full_name text,role_in_shift text,status text,started_at timestamptz,started_by uuid,
  ended_at timestamptz,ended_by uuid,approved_at timestamptz,approved_by uuid,approval_notes text,created_at timestamptz DEFAULT now());
 CREATE TABLE public.approval_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,branch_id uuid,
  entity_type text,entity_id uuid,status text,metadata jsonb DEFAULT '{}',approved_by uuid,rejected_by uuid,
  rejection_reason text,resolved_at timestamptz);
 CREATE TABLE public.notifications(organization_id uuid,recipient_id uuid,type text,title text,message text,link text,entity_type text,entity_id uuid);
 CREATE TABLE public.audit_logs(organization_id uuid,user_id uuid,action text,entity_type text,entity_id uuid,old_values jsonb,new_values jsonb);
 CREATE TABLE public.pos_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shift_id uuid,branch_id uuid,
   organization_id uuid,payment_method public.payment_method,qr_amount numeric,cash_amount numeric,offline_id text,created_by uuid);
 CREATE FUNCTION public.open_pos_shift(uuid,numeric,uuid) RETURNS jsonb LANGUAGE sql AS $$
  INSERT INTO public.pos_shifts(organization_id,branch_id,opened_by,opening_cash,status)
  SELECT organization_id,id,auth.uid(),$2,'OPEN' FROM public.branches WHERE id=$1
  RETURNING jsonb_build_object('shift_id',id)
 $$;
 CREATE FUNCTION public.process_pos_sale(uuid,uuid,jsonb,public.payment_method,numeric,numeric,numeric,text,text,text)
 RETURNS jsonb LANGUAGE sql AS $$
  INSERT INTO public.pos_transactions(shift_id,branch_id,organization_id,payment_method,cash_amount,qr_amount,offline_id,created_by)
  SELECT $1,$2,organization_id,$4,$5,$6,$8,auth.uid() FROM public.branches WHERE id=$2
  RETURNING jsonb_build_object('transaction_id',id)
 $$;
 CREATE FUNCTION public.process_pos_manual_qr_sale(p_actor_id uuid,p_device_id uuid,p_generation integer,p_shift_id uuid,p_branch_id uuid,p_sale jsonb)
 RETURNS jsonb LANGUAGE plpgsql AS $$
 DECLARE
  v_before_subject text:=current_setting('request.jwt.claim.sub',true);
  v_result jsonb;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',p_actor_id::text,true);
  v_result := public.process_pos_sale(p_shift_id,p_branch_id,'[]','QR',0,3.5,0,p_sale->>'offline_id',null,null);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_before_subject,''),true);
  RETURN v_result;
 END;
 $$;
 INSERT INTO public.branches VALUES('${branch}','${org}','ACTIVE','${region}'),('${outside}','${wrongOrg}','ACTIVE','${region}');
 INSERT INTO public.profiles VALUES('${staff}','${org}','STAFF','ACTIVE','${branch}','${region}'),
   ('${am}','${org}','AREA_MANAGER','ACTIVE',NULL,'${region}'),
   ('${admin}','${org}','SUPER_ADMIN','ACTIVE',NULL,NULL);
 INSERT INTO public.staff(organization_id,profile_id,branch_id,status,full_name) VALUES('${org}','${staff}','${branch}','ACTIVE','Synthetic POS staff');
 INSERT INTO public.pos_devices VALUES('${device}','${org}','${branch}','ACTIVE',now(),now(),'${admin}','isolated-fixture',4);
 `);
 await db.exec(migration('20260807193000_sync_pos_shift_staff_approvals').split('-- Repair central approvals')[0]);
 await db.exec(migration('20261123191000_harden_offline_pos_sync'));
 for (const name of [
  '20261127090000_pin_area_manager_branch_assignments','20261127090500_verified_staff_pos_self_start',
  '20261127090700_distinguish_atomic_manual_qr_from_offline_cash','20261127091200_limit_pos_open_and_cash_to_registered_devices',
 ]) await db.exec('BEGIN;\n' + migration(name) + '\nCOMMIT;');

 const uid = (id) => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);
 const query = async (sql, args) => (await db.query(sql,args)).rows[0];
 const open = (generation) => query('SELECT public.start_verified_pos_staff_shift($1,$2,$3,$4,NULL,10) AS result', [staff,device,generation,branch]);
 assert.equal((await query("SELECT has_function_privilege('authenticated','public.open_pos_shift(uuid,numeric,uuid)','EXECUTE') AS allowed")).allowed,false);
 await assert.rejects(open(5),/Tablet POS rasmi/);
 const result = (await open(4)).result;
 assert.equal(result.member.status,'ACTIVE');
 assert.equal(result.member.approved_by,null);
 assert.equal(result.schedule,'NO_PUBLISHED_SCHEDULE');
 assert.equal((await open(4)).result.reused,true);
 assert.equal((await query('SELECT count(*)::int AS n FROM public.notifications WHERE recipient_id=$1',[am])).n,1);
 const shift = result.shift.id;
 const key = `manual-qr:${shift}:cart-1795674000000-a7kp17x8m`;
 await uid(staff);
 await assert.rejects(query("SELECT public.process_pos_sale($1,$2,'[]','QR',0,3.5,0,$3,null,null)",[shift,branch,key]), /Offline POS only accepts cash/);
 assert.ok((await query('SELECT public.process_pos_manual_qr_sale($1,$2,4,$3,$4,$5::jsonb) AS result',
  [staff,device,shift,branch,{offline_id:key}])).result.transaction_id);
 await assert.rejects(query("SELECT public.process_registered_pos_cash_sale($1,$2,4,$3,$4,'{\"payment_method\":\"QR\"}')",[staff,device,shift,branch]),/jualan tunai/);
 assert.ok((await query('SELECT public.process_registered_pos_cash_sale($1,$2,4,$3,$4,$5::jsonb) AS result',
  [staff,device,shift,branch,{payment_method:'CASH',cash_amount:10,qr_amount:0,offline_id:'offline-fixture',items:[]}])).result.transaction_id);
 await uid(am);
 await db.query("INSERT INTO public.branches VALUES($1,$2,'ACTIVE',$3)",[laterBranch,org,region]);
 assert.equal((await query('SELECT has_branch_access($1) AS allowed',[branch])).allowed,true);
 assert.equal((await query('SELECT has_branch_access($1) AS allowed',[laterBranch])).allowed,false);
 await assert.rejects(db.query('SELECT replace_area_manager_branch_grants($1,$2::uuid[])',[am,[laterBranch]]), /Pentadbir Utama/);
 await uid(admin);
 await assert.rejects(db.query('SELECT replace_area_manager_branch_grants($1,$2::uuid[])',[am,[outside]]), /di luar organisasi/);
 await db.query('SELECT replace_area_manager_branch_grants($1,$2::uuid[])',[am,[laterBranch]]);
 await uid(am);
 assert.equal((await query('SELECT has_branch_access($1) AS allowed',[branch])).allowed,false);
 assert.equal((await query('SELECT has_branch_access($1) AS allowed',[laterBranch])).allowed,true);
 await db.query("UPDATE public.profiles SET role='STAFF' WHERE id=$1",[am]);
 assert.equal((await query('SELECT has_branch_access($1) AS allowed',[laterBranch])).allowed,false);
 console.log('PASS: registered POS, schedule advisory, idempotent self-start, offline/online QR separation, branch revocation and cross-tenant grant denial.');
} finally {
 await db.close();
}
