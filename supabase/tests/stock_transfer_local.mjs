// Run with node and a local @electric-sql/pglite installation. Optionally set
// RKJ_TEST_PGLITE_MODULE to the filesystem path of that package.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.env.RKJ_TEST_PGLITE_MODULE || '@electric-sql/pglite');
const migrations = new URL('../migrations/', import.meta.url);
const files = readdirSync(migrations);
const read = (id) => readFileSync(new URL(files.find((name) => name.startsWith(id)), migrations), 'utf8');
const fn = (id, name) => read(id).match(new RegExp(
 `CREATE (?:OR REPLACE )?FUNCTION (?:public\\.)?${name}\\([\\s\\S]*?\\$\\$;`,
))[0];

const db = new PGlite();
try {
 await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE SCHEMA private_rkj;
  CREATE TABLE auth.users(id uuid primary key, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 `);
 await db.exec(read('00001_').replace(/^CREATE EXTENSION.*$/gm, ''));
 for (const id of ['00002_', '00003_', '00004_', '00007_', '00008_']) await db.exec(read(id));
 await db.exec(`
  CREATE TABLE hq_delivery_route_stops(stock_transfer_id uuid REFERENCES stock_transfers(id));
  CREATE TABLE pos_stock_receipts(organization_id uuid, branch_id uuid, location_id uuid,
   stock_transfer_id uuid REFERENCES stock_transfers(id));
  ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION assert_published_production_date(uuid, date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
 `);
 for (const name of ['organization_id', 'user_role', 'has_branch_access']) await db.exec(fn('20260826234500_', name));
 await db.exec(read('20261127090000_'));
 await db.exec(fn('20261127220000_', 'lock_stock_balance'));
 await db.exec(fn('20261127220000_', 'apply_stock_movement'));
 await db.exec(fn('00010_', 'check_low_stock'));
 await db.exec('CREATE TRIGGER stock_movement_apply_balance BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION apply_stock_movement()');
 await db.exec(read('00034_').split('CREATE OR REPLACE FUNCTION complete_stock_transfer')[0]);
 await db.exec('ALTER TABLE stock_transfer_items ADD COLUMN production_date date');
 await db.exec(fn('00035_', 'can_set_roti_production_date'));
 await db.exec(read('20260708090000_').split('CREATE OR REPLACE FUNCTION get_expired_roti_stock')[0]);
 await db.exec(read('00059_'));
 await db.exec(fn('00013_', 'dispatch_stock_transfer'));
 await db.exec(fn('00034_', 'complete_stock_transfer'));
 await db.exec(fn('00035_', 'complete_stock_transfer'));
 await db.exec(read('00013_').match(/CREATE POLICY stock_transfers_org[\s\S]*?(?=CREATE POLICY stock_receives_org)/)[0]);
 await db.exec(read('20261127120000_'));
 await db.exec(read('20261127221057_'));
 await db.exec(readFileSync(new URL('./stock_transfer_workflow.sql', import.meta.url), 'utf8'));
 console.log('Transfer workflow passed on isolated PostgreSQL (PGlite; fixtures rolled back)');
} catch (error) {
 console.error({ message: error.message, code: error.code, detail: error.detail, where: error.where, position: error.position });
 process.exitCode = 1;
} finally {
 await db.close();
}
