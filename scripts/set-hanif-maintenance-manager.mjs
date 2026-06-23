import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

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

const env = {
  ...loadEnvFile(path.join(ROOT, '.env.local')),
  ...process.env,
};

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY dalam .env.local');
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: org, error: orgError } = await supabase
  .from('organizations')
  .select('id')
  .eq('code', 'RKJ')
  .single();
if (orgError) throw orgError;

const { data: entity, error: entityError } = await supabase
  .from('legal_entities')
  .select('id')
  .eq('organization_id', org.id)
  .eq('code', 'RKJ_DIST')
  .single();
if (entityError) throw entityError;

const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('id, email, full_name, role')
  .eq('organization_id', org.id)
  .or('employee_code.eq.DIST007,email.ilike.anipskjp93@gmail.com,full_name.ilike.%HANIF%')
  .limit(1)
  .single();
if (profileError) throw profileError;

const metadata = {
  position: 'Manager Maintenance',
  maintenance_scope: 'Terima report maintenance semua cawangan Roti Kaya Junus daripada staf cawangan dan Area Manager',
  relief_staff_scope: 'Staf ganti apabila berlaku musibah atau kekurangan staf di mana-mana cawangan',
};

const { error: updateProfileError } = await supabase
  .from('profiles')
  .update({
    role: 'MAINTENANCE_MANAGER',
    legal_entity_id: entity.id,
    branch_id: null,
    region_id: null,
    metadata,
    updated_at: new Date().toISOString(),
  })
  .eq('id', profile.id);
if (updateProfileError) throw updateProfileError;

const { error: staffError } = await supabase
  .from('staff')
  .update({
    legal_entity_id: entity.id,
    branch_id: null,
    region_id: null,
    remarks: 'Manager Maintenance - terima report maintenance semua cawangan; staf ganti jika cawangan kekurangan staf',
    updated_at: new Date().toISOString(),
  })
  .eq('profile_id', profile.id);
if (staffError) throw staffError;

console.log(`Hanif dikemaskini: ${profile.full_name} (${profile.email}) -> MAINTENANCE_MANAGER / RKJ_DIST`);
