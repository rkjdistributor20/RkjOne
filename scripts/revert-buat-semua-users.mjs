/**
 * Batalkan akaun tambahan dari arahan "buat semua":
 * - finance@rkj.com (U009)
 * - s015@rkj.com, s020@rkj.com, s045@rkj.com
 * - Rekod staf S020 & S045 (jika wujud)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const REVOKE_EMAILS = [
  'finance@rkj.com',
  's015@rkj.com',
  's020@rkj.com',
  's045@rkj.com',
];

const REVOKE_STAFF_CODES = ['S020', 'S045'];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

async function findUserByEmail(supabase, email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(ROOT, '.env.local')),
    ...process.env,
  };

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('❌ Perlu SUPABASE_SERVICE_ROLE_KEY dalam .env.local atau env');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('\n🗑️  Buang akaun auth tambahan…');
  for (const email of REVOKE_EMAILS) {
    const user = await findUserByEmail(supabase, email);
    if (!user) {
      console.log(`  - ${email} (tiada)`);
      continue;
    }
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`${email}: ${error.message}`);
    console.log(`  ✓ ${email}`);
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('code', 'RKJ')
    .maybeSingle();

  if (org) {
    for (const code of REVOKE_STAFF_CODES) {
      await supabase
        .from('staff')
        .update({ profile_id: null })
        .eq('organization_id', org.id)
        .eq('staff_code', code);

      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('organization_id', org.id)
        .eq('staff_code', code);

      if (error) {
        console.log(`  ! Staf ${code}: ${error.message}`);
      } else {
        console.log(`  ✓ Staf ${code} dibuang`);
      }
    }

    await supabase
      .from('staff')
      .update({ profile_id: null })
      .eq('organization_id', org.id)
      .eq('staff_code', 'S015');
  }

  const csvPath = path.join(ROOT, 'csv_import', 'login_users_generated.csv');
  if (fs.existsSync(csvPath)) {
    const revokeSet = new Set(REVOKE_EMAILS.map((e) => e.toLowerCase()));
    const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
    const header = lines[0];
    const kept = lines.slice(1).filter((line) => {
      const email = line.split(',')[1]?.trim().toLowerCase();
      return line.trim() && email && !revokeSet.has(email);
    });
    fs.writeFileSync(csvPath, [header, ...kept].join('\n') + '\n', 'utf8');
    console.log(`\n📄 CSV dikemas kini — ${kept.length} akaun`);
  }

  console.log('\n✅ Arahan "buat semua" dibatalkan.');
}

main().catch((err) => {
  console.error('\n❌ Gagal:', err.message);
  process.exit(1);
});
