// Build only the five follow-up migrations; the earlier AM release is already
// deployed. Default mode rolls back. Apply mode also checks the reviewed hashes.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const names = [
 '20261127221057_transfer_receipts_and_linked_reversals.sql',
 '20261127221500_scoped_report_pos_details.sql',
 '20261127222531_staff_stock_count_capture.sql',
 '20261127223000_guard_and_audit_weekly_roster.sql',
 '20261127223500_make_am_direct_stock_posts_retry_safe.sql',
];
const [mode = 'dry-run', manifest] = process.argv.slice(2);
if (!['dry-run','apply'].includes(mode)) throw new Error('Expected dry-run or apply');
const expected = mode === 'apply' ? JSON.parse(readFileSync(manifest, 'utf8')) : null;
const parts = names.map(name => {
 const bytes = readFileSync(join('supabase','migrations',name));
 const actual = createHash('sha256').update(bytes).digest('hex');
 if (expected && expected[name] !== actual) throw new Error(`Reviewed migration hash differs for ${name}`);
 process.stderr.write(`${actual} ${name}\n`);
 return `-- ${name}\n${bytes.toString('utf8')}`;
});
const verify = `
SELECT to_regclass('public.pos_stock_count_captures') IS NOT NULL AS stock_capture,
 to_regclass('public.stock_transfer_receipts') IS NOT NULL AS transfer_receipt,
 to_regclass('public.roster_planned_shifts') IS NOT NULL AS plan_audit,
 to_regprocedure('public.read_scoped_report(text,date,date,uuid,integer,integer,text,uuid)') IS NOT NULL AS report,
 has_function_privilege('authenticated','public.post_am_stock_operation(uuid,uuid,text,jsonb)','EXECUTE') AS safe_stock_post,
 NOT has_function_privilege('authenticated','public.post_am_stock_receipt(uuid,jsonb,text,text,text)','EXECUTE') AS legacy_write_disabled,
 NOT has_function_privilege('authenticated','public.record_verified_pos_staff_stock_check(uuid,uuid,integer,uuid,uuid,jsonb,text,uuid,uuid,text,date,text)','EXECUTE') AS shift_check_service_only,
 (SELECT count(*) FROM public.stock_transfers t WHERE t.status='IN_TRANSIT'
  AND private_rkj.legacy_stock_transfer_full_only(t)) AS legacy_in_transit_full_receipt;
`;
const path = join(tmpdir(), `rkj-am-gap-${mode}-${process.pid}.sql`);
writeFileSync(path,`BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='90s';\n${parts.join('\n')}\n${verify}\n${mode === 'apply' ? "NOTIFY pgrst, 'reload schema';\nCOMMIT;" : 'ROLLBACK;'}\n`,{flag:'wx'});
console.log(path);
