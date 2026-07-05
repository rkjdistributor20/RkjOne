import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const input = process.argv[2] ?? path.join(ROOT, 'csv_import', 'rkj_company_staff_register.json');

function loadEnvFile(filePath) {
 if (!fs.existsSync(filePath)) return {};
 const out = {};
 for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
 const trimmed = line.trim();
 if (!trimmed || trimmed.startsWith('#')) continue;
 const eq = trimmed.indexOf('=');
 if (eq === -1) continue;
 const key = trimmed.slice(0, eq).trim();
 let val = trimmed.slice(eq + 1).trim();
 if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
 val = val.slice(1, -1);
 }
 out[key] = val;
 }
 return out;
}

const payload = JSON.parse(fs.readFileSync(input, 'utf8'));
const rows = payload.staff ?? [];
const codes = rows.map((r) => r.staff_code);
const expected = Object.fromEntries(rows.map((r) => [r.staff_code, r]));

const env = {
 ...loadEnvFile(path.join(ROOT, '.env.example')),
 ...loadEnvFile(path.join(ROOT, '.env.local')),
 ...process.env,
};

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
 auth: { autoRefreshToken: false, persistSession: false },
});

const { data: legalEntities, error: legalError } = await supabase
 .from('legal_entities')
 .select('id, code');
if (legalError) throw legalError;
const legalById = Object.fromEntries((legalEntities ?? []).map((x) => [x.id, x.code]));

const { data: staff, error: staffError } = await supabase
 .from('staff')
 .select('staff_code, full_name, legal_entity_id, profile_id, status, monthly_amount')
 .in('staff_code', codes);
if (staffError) throw staffError;

const { data: profiles, error: profileError } = await supabase
 .from('profiles')
 .select('employee_code, full_name, email, role, legal_entity_id, status')
 .in('employee_code', codes);
if (profileError) throw profileError;

const staffByCode = Object.fromEntries((staff ?? []).map((x) => [x.staff_code, x]));
const profileByCode = Object.fromEntries((profiles ?? []).map((x) => [x.employee_code, x]));

const mismatches = [];
const counts = {};
for (const row of rows) {
 const s = staffByCode[row.staff_code];
 const p = profileByCode[row.staff_code];
 if (!s) {
 mismatches.push(`${row.staff_code}: missing staff`);
 continue;
 }
 if (!p) {
 mismatches.push(`${row.staff_code}: missing profile`);
 continue;
 }
 const staffEntity = legalById[s.legal_entity_id];
 const profileEntity = legalById[p.legal_entity_id];
 if (staffEntity !== row.legal_entity_code) mismatches.push(`${row.staff_code}: staff entity ${staffEntity} != ${row.legal_entity_code}`);
 if (profileEntity !== row.legal_entity_code) mismatches.push(`${row.staff_code}: profile entity ${profileEntity} != ${row.legal_entity_code}`);
 if (p.role !== row.role) mismatches.push(`${row.staff_code}: profile role ${p.role} != ${row.role}`);
 if (!s.profile_id) mismatches.push(`${row.staff_code}: staff.profile_id missing`);
 counts[row.legal_entity_code] = (counts[row.legal_entity_code] ?? 0) + 1;
}

console.log(JSON.stringify({
 expected_rows: rows.length,
 staff_found: staff?.length ?? 0,
 profiles_found: profiles?.length ?? 0,
 counts,
 mismatches,
}, null, 2));

process.exit(mismatches.length ? 1 : 0);
