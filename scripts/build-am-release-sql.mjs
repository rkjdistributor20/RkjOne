// Generate a reviewed, single-transaction bundle outside the source tree.
// Default is rollback only. Applying additionally requires an exact SHA-256
// manifest. This script never connects to a database.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const files = [
 '20261127090000_pin_area_manager_branch_assignments.sql',
 '20261127090500_verified_staff_pos_self_start.sql',
 '20261127090700_distinguish_atomic_manual_qr_from_offline_cash.sql',
 '20261127091200_limit_pos_open_and_cash_to_registered_devices.sql',
 '20261127100000_scoped_operational_reports.sql',
 '20261127111541_am_weekly_roster_planning.sql',
 '20261127120000_scope_and_serialize_stock_transfers.sql',
 '20261127220000_am_scoped_stock_posting_and_count_review.sql',
];
const [mode = 'dry-run', manifestPath] = process.argv.slice(2);
if (mode !== 'dry-run' && mode !== 'apply') throw new Error('Expected dry-run or apply');
const reviewed = mode === 'apply' ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const content = files.map(file => {
 const raw = readFileSync(resolve('supabase/migrations', file));
 const hash = createHash('sha256').update(raw).digest('hex');
 if (reviewed && reviewed[file] !== hash) throw new Error(`Hash mismatch: ${file}`);
 process.stderr.write(`${hash} ${file}\n`);
 return `\n-- ${file}\n${raw.toString('utf8')}`;
});
const q = `
SELECT
 (SELECT count(*) FROM public.profile_branch_access a JOIN public.profiles p ON p.id=a.profile_id
   WHERE p.role='AREA_MANAGER' AND p.status='ACTIVE') AS area_branch_grants,
 has_function_privilege('authenticated','public.open_pos_shift(uuid,numeric,uuid)','EXECUTE') AS legacy_client_open,
 has_function_privilege('authenticated','public.process_pos_sale(uuid,uuid,jsonb,public.payment_method,numeric,numeric,numeric,text,text,text)','EXECUTE') AS legacy_client_sale,
 has_function_privilege('service_role','public.start_verified_pos_staff_shift(uuid,uuid,integer,uuid,uuid,numeric)','EXECUTE') AS service_verified_staff;
`;
const output = join(tmpdir(), `rkj-am-release-${mode}-${process.pid}.sql`);
writeFileSync(output, `BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='90s';\n${content.join('\n')}\n${q}\n${mode === 'apply' ? "NOTIFY pgrst, 'reload schema';\nCOMMIT;" : 'ROLLBACK;'}\n`, { flag: 'wx' });
console.log(output);
