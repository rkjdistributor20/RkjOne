/**
 * Gabungkan profil pemilik kumpulan (Mat Isa) — satu login, 3 rekod gaji syarikat.
 *
 * Usage:
 *   node scripts/consolidate-group-owner.mjs
 *   node scripts/consolidate-group-owner.mjs --apply
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const GROUP_OWNER_EMAIL = 'matisa@rkj.com';
const OWNER_FULL_NAME = 'Mat Isa Bin Mohd Junus';
const OWNER_STAFF_CODES = ['U001', 'DIST004', 'MFG008'];
const RKJ_OWNER_SALARY = 8000;

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = {
  ...loadEnvFile(path.join(ROOT, '.env.example')),
  ...loadEnvFile(path.join(ROOT, '.env.local')),
  ...process.env,
};

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\n=== Gabung Profil Pemilik Kumpulan ${APPLY ? '(APPLY)' : '(DRY RUN)'} ===\n`);

const { data: org } = await supabase.from('organizations').select('id').eq('code', 'RKJ').single();
if (!org?.id) throw new Error('Organisasi RKJ tidak dijumpai');

const { data: legalEntities } = await supabase
  .from('legal_entities')
  .select('id, code')
  .eq('organization_id', org.id);
const legalByCode = Object.fromEntries((legalEntities ?? []).map((x) => [x.code, x.id]));

const { data: mainProfile } = await supabase
  .from('profiles')
  .select('id, full_name, email, employee_code, metadata')
  .eq('organization_id', org.id)
  .ilike('email', GROUP_OWNER_EMAIL)
  .maybeSingle();

if (!mainProfile?.id) throw new Error(`Profil utama tidak dijumpai: ${GROUP_OWNER_EMAIL}`);

const { data: staffRows } = await supabase
  .from('staff')
  .select('id, staff_code, full_name, profile_id, legal_entity_id, monthly_amount, legal_entity:legal_entities(code)')
  .eq('organization_id', org.id)
  .in('staff_code', OWNER_STAFF_CODES);

const staffByCode = Object.fromEntries((staffRows ?? []).map((s) => [s.staff_code, s]));

const { data: duplicateProfiles } = await supabase
  .from('profiles')
  .select('id, email, employee_code, full_name, status, metadata')
  .eq('organization_id', org.id)
  .in('employee_code', ['DIST004', 'MFG008']);

const plan = [];

plan.push({
  action: 'update_main_profile',
  id: mainProfile.id,
  full_name: OWNER_FULL_NAME,
  metadata: {
    group_owner: true,
    position: 'Managing Director / Pemilik Kumpulan',
    legal_entities: ['RKJ', 'RKJ_DIST', 'RKJ_MFG'],
  },
  legal_entity_id: null,
});

for (const code of ['DIST004', 'MFG008']) {
  const row = staffByCode[code];
  if (!row) {
    plan.push({ action: 'missing_staff', staff_code: code });
    continue;
  }
  plan.push({
    action: 'link_staff',
    staff_code: code,
    staff_id: row.id,
    profile_id: mainProfile.id,
    legal_entity: row.legal_entity?.code,
    monthly_amount: row.monthly_amount,
  });
}

if (staffByCode.U001) {
  plan.push({
    action: 'link_staff',
    staff_code: 'U001',
    staff_id: staffByCode.U001.id,
    profile_id: mainProfile.id,
    legal_entity: 'RKJ',
    monthly_amount: staffByCode.U001.monthly_amount,
  });
} else {
  plan.push({
    action: 'create_rkj_staff',
    staff_code: 'U001',
    profile_id: mainProfile.id,
    legal_entity_id: legalByCode.RKJ,
    monthly_amount: RKJ_OWNER_SALARY,
  });
}

for (const profile of duplicateProfiles ?? []) {
  if (profile.id === mainProfile.id) continue;
  plan.push({
    action: 'deactivate_duplicate_profile',
    id: profile.id,
    email: profile.email,
    merged_into: mainProfile.id,
  });
}

for (const item of plan) {
  console.log(JSON.stringify(item));
}

if (!APPLY) {
  console.log('\nDry run selesai. Guna --apply untuk tulis ke Supabase.\n');
  process.exit(0);
}

const ownerMetadata = {
  group_owner: true,
  position: 'Managing Director / Pemilik Kumpulan',
  legal_entities: ['RKJ', 'RKJ_DIST', 'RKJ_MFG'],
};

const { error: profileErr } = await supabase
  .from('profiles')
  .update({
    full_name: OWNER_FULL_NAME,
    legal_entity_id: null,
    metadata: ownerMetadata,
    updated_at: new Date().toISOString(),
  })
  .eq('id', mainProfile.id);

if (profileErr) throw profileErr;

if (!staffByCode.U001) {
  const { error: insertErr } = await supabase.from('staff').insert({
    organization_id: org.id,
    staff_code: 'U001',
    full_name: OWNER_FULL_NAME,
    profile_id: mainProfile.id,
    legal_entity_id: legalByCode.RKJ,
    worker_type: 'LOCAL',
    monthly_amount: RKJ_OWNER_SALARY,
    status: 'ACTIVE',
  });
  if (insertErr) throw insertErr;
  console.log('  ✓ Cipta staf U001 (Roti Kaya Junus)');
}

for (const code of OWNER_STAFF_CODES) {
  const row = staffByCode[code];
  if (!row) continue;
  const { error } = await supabase
    .from('staff')
    .update({
      profile_id: mainProfile.id,
      full_name: OWNER_FULL_NAME,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  if (error) throw error;
  console.log(`  ✓ Link staf ${code} → ${GROUP_OWNER_EMAIL}`);
}

for (const profile of duplicateProfiles ?? []) {
  if (profile.id === mainProfile.id) continue;
  const { error } = await supabase
    .from('profiles')
    .update({
      status: 'INACTIVE',
      metadata: {
        ...(typeof profile.metadata === 'object' && profile.metadata ? profile.metadata : {}),
        merged_into: mainProfile.id,
        merge_note: 'Digabung ke profil pemilik kumpulan matisa@rkj.com',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id);
  if (error) throw error;
  console.log(`  ✓ Nyahaktif profil pendua ${profile.email}`);
}

console.log('\n==> Mat Isa Bin Mohd Junus — satu profil, gaji 3 syarikat.\n');
