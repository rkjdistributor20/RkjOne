import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Default: validate the incremental migration against the linked target then
// roll back. Apply runs only the reviewed DDL; the read-only smoke is separate.
const [mode = 'preflight', reviewed] = process.argv.slice(2);
if (!['preflight', 'apply'].includes(mode)) throw new Error('Use preflight or apply');
const filename = '20261128010000_operational_report_workspace.sql';
const migration = readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url));
const hash = createHash('sha256').update(migration).digest('hex');
if (mode === 'apply' && reviewed !== hash) throw new Error('Expected reviewed full SHA-256');
const smoke = readFileSync(new URL('../supabase/tests/operations_release_readonly.sql', import.meta.url), 'utf8');
const smokeBody = smoke.slice(smoke.indexOf('SET LOCAL statement_timeout'), smoke.lastIndexOf('ROLLBACK;'));
const dest = join(tmpdir(), `rkj-operations-report-${mode}-${process.pid}.sql`);
const end = mode === 'apply'
 ? "NOTIFY pgrst, 'reload schema';\nCOMMIT;"
 : `${smokeBody}\nROLLBACK;`;
writeFileSync(dest, `BEGIN ISOLATION LEVEL REPEATABLE READ;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='45s';\n${migration}\n${end}\n`, { flag: 'wx' });
process.stderr.write(`${hash} ${filename}\n`);
console.log(dest);
