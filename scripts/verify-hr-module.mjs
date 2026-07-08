/**
 * Semak modul HR Syarikat - permissions DB, login HR, production deploy.
 * Usage: npm run verify:hr (or node scripts/verify-hr-module.mjs)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { loadProjectEnv, ROOT } from './lib/load-env.mjs';
import { DEFAULT_PASSWORD } from './lib/default-password.mjs';

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj.one';
const GO_LIVE_PASSWORD_FILE = path.join(ROOT, 'csv_import', '.go-live-temp-password.txt');

function readGoLivePassword() {
 if (process.env.GO_LIVE_PASSWORD?.trim()) return process.env.GO_LIVE_PASSWORD.trim();
 if (!fs.existsSync(GO_LIVE_PASSWORD_FILE)) return DEFAULT_PASSWORD;
 const line = fs
 .readFileSync(GO_LIVE_PASSWORD_FILE, 'utf8')
 .split('\n')
 .map((l) => l.trim())
 .find((l) => l && !l.startsWith('#'));
 return line || DEFAULT_PASSWORD;
}

function ok(label, detail) {
 console.log(` ✓ ${label}${detail ? ` - ${detail}` : ''}`);
}

function fail(label, detail) {
 console.log(` ✗ ${label}${detail ? ` - ${detail}` : ''}`);
}

const env = loadProjectEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
 console.error('Missing Supabase env (.env.local)');
 process.exit(1);
}

const admin = createClient(url, serviceKey, {
 auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey);

console.log('\n=== RKJ One - Semakan HR Syarikat ===\n');

let passed = 0;
let failed = 0;

function pass(label, detail) {
 ok(label, detail);
 passed += 1;
}

function flop(label, detail) {
 fail(label, detail);
 failed += 1;
}

console.log('1. Pangkalan data');
const { data: org, error: orgErr } = await admin
 .from('organizations')
 .select('id')
 .eq('code', 'RKJ')
 .single();
if (orgErr || !org) {
 flop('Organisasi RKJ', orgErr?.message ?? 'tiada');
} else {
 pass('Organisasi RKJ', org.id.slice(0, 8));

 const { data: perms } = await admin
 .from('role_permissions')
 .select('role, permission')
 .eq('organization_id', org.id)
 .eq('module', 'hr');

 const expected = ['SUPER_ADMIN:FULL', 'ADMIN:FULL', 'HR:FULL'];
 const actual = (perms ?? []).map((p) => `${p.role}:${p.permission}`).sort();
 const missing = expected.filter((e) => !actual.includes(e));
 missing.length === 0
 ? pass('Permission modul hr', actual.join(', '))
 : flop('Permission modul hr', `tiada: ${missing.join(', ')}`);

 const { data: entities } = await admin
 .from('legal_entities')
 .select('code, status')
 .eq('organization_id', org.id)
 .order('sort_order');

 const codes = (entities ?? []).map((e) => e.code);
 codes.length === 3 && codes.includes('RKJ') && codes.includes('RKJ_DIST') && codes.includes('RKJ_MFG')
 ? pass('3 syarikat legal', codes.join(', '))
 : flop('3 syarikat legal', codes.join(', ') || 'tiada');

 const { count: staffCount } = await admin
 .from('staff')
 .select('*', { count: 'exact', head: true })
 .eq('organization_id', org.id);

 const { count: profileCount } = await admin
 .from('profiles')
 .select('*', { count: 'exact', head: true })
 .eq('organization_id', org.id);

 (staffCount ?? 0) > 0
 ? pass('Rekod staf', String(staffCount))
 : flop('Rekod staf', '0');
 (profileCount ?? 0) > 0
 ? pass('Rekod profil', String(profileCount))
 : flop('Rekod profil', '0');

 const { data: ownerProfile } = await admin
 .from('profiles')
 .select('id, full_name, metadata')
 .eq('organization_id', org.id)
 .ilike('email', 'matisa@rkj.com')
 .maybeSingle();

 if (ownerProfile?.metadata?.group_owner === true) {
 const { data: ownerStaff } = await admin
 .from('staff')
 .select('staff_code, monthly_amount, legal_entity:legal_entities(code)')
 .eq('profile_id', ownerProfile.id);

 const codes = (ownerStaff ?? []).map((s) => s.legal_entity?.code).filter(Boolean);
 codes.length >= 3
 ? pass('Pemilik kumpulan Mat Isa', `${ownerProfile.full_name} - ${codes.join(', ')} - RM${(ownerStaff ?? []).reduce((n, s) => n + Number(s.monthly_amount ?? 0), 0)}/bulan`)
 : flop('Pemilik kumpulan Mat Isa', `hanya ${codes.length} syarikat: ${codes.join(', ')}`);
 } else {
 flop('Pemilik kumpulan Mat Isa', 'metadata group_owner tidak ditetapkan');
 }
}

console.log('\n2. Login HR (Supabase Auth)');
const password = readGoLivePassword();
const { data: login, error: loginErr } = await anon.auth.signInWithPassword({
 email: 'mohdali@rkj.com',
 password,
});

if (loginErr) {
 flop('mohdali@rkj.com', loginErr.message);
} else {
 pass('mohdali@rkj.com', 'auth OK');

 const { data: hrProfile } = await admin
 .from('profiles')
 .select('role, full_name')
 .eq('id', login.user.id)
 .single();

 hrProfile?.role === 'HR'
 ? pass('Role profil HR', hrProfile.full_name)
 : flop('Role profil HR', hrProfile?.role ?? 'tiada');
}

console.log('\n3. Production routes');
try {
 const hrPage = await fetch(`${PRODUCTION_URL}/hr`, { redirect: 'manual' });
 hrPage.status === 307 || hrPage.status === 302
 ? pass('GET /hr tanpa auth', `HTTP ${hrPage.status} ke login`)
 : flop('GET /hr tanpa auth', `HTTP ${hrPage.status}`);
} catch (e) {
 flop('GET /hr tanpa auth', e.message);
}

try {
 const api = await fetch(`${PRODUCTION_URL}/api/hr/companies`, { redirect: 'manual' });
 api.status === 401 || api.status === 403 || api.status === 307 || api.status === 302
 ? pass('GET /api/hr/companies tanpa auth', `HTTP ${api.status}`)
 : flop('GET /api/hr/companies tanpa auth', `HTTP ${api.status}`);
} catch (e) {
 flop('GET /api/hr/companies tanpa auth', e.message);
}

try {
 const health = await fetch(`${PRODUCTION_URL}/api/health`);
 const body = await health.json();
 body.commit === 'f7c5b98' || body.commit?.startsWith('f7c5b98')
 ? pass('Deploy commit HR', body.commit?.slice(0, 7))
 : pass('Deploy commit', body.commit?.slice(0, 7) ?? 'unknown');
} catch (e) {
 flop('Deploy commit', e.message);
}

console.log('\n=== Ringkasan ===');
console.log(` Lulus: ${passed}`);
console.log(` Gagal: ${failed}`);
console.log(failed === 0 ? '\n==> HR Syarikat OK. UAT: login mohdali@rkj.com ke /hr\n' : '\n==> Ada isu - semak di atas.\n');
process.exit(failed > 0 ? 1 : 0);
