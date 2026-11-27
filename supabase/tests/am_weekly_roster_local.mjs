// Run with an existing PGlite install: node supabase/tests/am_weekly_roster_local.mjs <path-to-dist/index.js>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8');
function section(name, start, end) {
 const source = migration(name);
 const from = source.indexOf(start);
 const to = end ? source.indexOf(end, from + start.length) : source.length;
 if (from < 0 || to < 0) throw new Error(`Fixture DDL not found in ${name}`);
 return source.slice(from, to);
}

try {
 await db.exec(`
 CREATE ROLE authenticated;
 CREATE ROLE service_role;
 CREATE ROLE anon;
 CREATE SCHEMA auth;
 CREATE SCHEMA private_rkj;
 CREATE TABLE auth.users (id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
 $$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 `);
 for (const sql of [
  section('00001_extensions_enums', 'CREATE TYPE user_role'),
  migration('00002_core_organization'),
  migration('00003_master_data'),
  section('00005_pos', 'CREATE TABLE pos_shifts', 'CREATE TABLE pos_transactions'),
  migration('00006_shifts_payroll_finance'),
  migration('00008_notifications_approvals'),
  section('20260826234500_harden_active_tenant_pos_boundaries', 'CREATE OR REPLACE FUNCTION public.organization_id', 'DROP POLICY IF EXISTS pos_transactions_branch'),
  section('00009_rls_policies', 'CREATE POLICY pos_shifts_branch', 'CREATE POLICY pos_transactions_branch'),
  section('00014_shift_rpc', 'CREATE OR REPLACE FUNCTION create_staff_shift', 'CREATE OR REPLACE FUNCTION clock_in_staff'),
  section('00014_shift_rpc', '-- Shift RLS'),
  section('20260722195500_supabase_security_advisor_hardening', 'CREATE POLICY audit_logs_admin_select', '-- Financial routing'),
  migration('00062_weekly_staff_roster'),
  migration('00063_fix_roster_rls_recursion'),
  section('20260722223000_finish_rls_policy_consolidation', '-- Roster read predicates', '-- Authenticated-only scheduling tables'),
 ]) await db.exec(sql);
 await db.exec(`
 ALTER TABLE pos_shifts ENABLE ROW LEVEL SECURITY;
 ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
 GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
 `);
 for (const name of [
  '20261127090000_pin_area_manager_branch_assignments',
  '20261127111541_am_weekly_roster_planning',
  '20261127223000_guard_and_audit_weekly_roster',
 ]) await db.exec('BEGIN;\n' + migration(name) + '\nCOMMIT;');
 await db.exec(readFileSync(new URL('./am_weekly_roster_local.sql', import.meta.url), 'utf8'));
 console.log('AM weekly roster database fixture passed');
} catch (error) {
 console.error(error.message, error.code, error.where, error.detail);
 process.exitCode = 1;
} finally {
 await db.close();
}
