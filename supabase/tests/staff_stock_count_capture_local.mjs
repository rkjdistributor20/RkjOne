// Disposable PostgreSQL (PGlite) only; never connects to Supabase.
// Set RKJ_TEST_PGLITE_MODULE if the package is installed outside this repo.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.RKJ_TEST_PGLITE_MODULE || '@electric-sql/pglite');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const [bootstrap, supportingSchema] = read('./am_scoped_stock_local.sql').split(/^-- LOAD.*$/m);
const db = new PGlite();
try {
  await db.exec(bootstrap + read('../migrations/00004_inventory.sql')
    + read('../migrations/00008_notifications_approvals.sql') + supportingSchema);
  await db.exec(`
    CREATE SCHEMA private_rkj;
    CREATE TABLE public.pos_shifts(id uuid PRIMARY KEY, organization_id uuid, branch_id uuid, status text,
     opened_at timestamptz DEFAULT now(), business_started_at timestamptz, payroll_started_at timestamptz);
    CREATE TABLE public.pos_shift_stock_check_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id uuid,branch_id uuid,shift_id uuid,stock_count_id uuid,check_type text,
     production_date date,notes text,completed_by uuid,completed_at timestamptz, UNIQUE(shift_id,check_type));
    ALTER TABLE public.pos_shift_stock_check_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_old_pos_logs ON public.pos_shift_stock_check_logs FOR ALL USING (true);
    GRANT SELECT,INSERT,UPDATE ON public.pos_shift_stock_check_logs TO authenticated;
    ALTER TABLE public.pos_stock_receipts ADD COLUMN branch_id uuid, ADD COLUMN status text;
    CREATE FUNCTION public.validate_pos_server_actor_device(a uuid,d uuid,g integer,b uuid)
    RETURNS public.profiles LANGUAGE sql AS $$ SELECT p FROM public.profiles p WHERE p.id=a AND g=1 $$;
  `);
  await db.exec(read('../migrations/20261127220000_am_scoped_stock_posting_and_count_review.sql'));
  await db.exec(read('../migrations/20261127222531_staff_stock_count_capture.sql'));
  await db.exec(read('../migrations/20261128112500_stop_stock_count_conflict_retries.sql'));
  const { rows } = await db.query(
    `SELECT pg_get_functiondef('public.review_stock_count(uuid,text,text)'::regprocedure) AS definition`);
  if (!rows[0]?.definition.includes('FOR UPDATE;') || rows[0].definition.includes("ERRCODE = '40001'")) {
    throw new Error('Stock count decision must retain its lock and not retry a deterministic conflict');
  }
  await db.exec(read('./staff_stock_count_capture_local.sql'));
  console.log('Staff stock count capture database fixture passed');
} catch (error) {
  console.error(error.message, error.code, error.where, error.detail);
  process.exitCode = 1;
} finally {
  await db.close();
}
