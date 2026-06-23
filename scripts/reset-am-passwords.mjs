/**
 * Reset kata laluan 3 AM untuk UAT.
 *
 * Usage:
 *   npm run reset:am-passwords          → RkjOne@2025 (legacy)
 *   npm run reset:am-uat                → dari .go-live-temp-password.txt + wajib tukar
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_PASSWORD = 'RkjOne@2025';
const GO_LIVE_FILE = path.join(ROOT, 'csv_import', '.go-live-temp-password.txt');
const AM_EMAILS = ['safuan@rkj.com', 'hakim@rkj.com', 'yati@rkj.com'];
const useGoLive = process.argv.includes('--go-live');

function loadEnv() {
  const out = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function readGoLivePassword() {
  if (!fs.existsSync(GO_LIVE_FILE)) {
    console.error(`✗ Fail tidak dijumpai: ${GO_LIVE_FILE}`);
    process.exit(1);
  }
  const line = fs
    .readFileSync(GO_LIVE_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  if (!line) {
    console.error('✗ Kata laluan kosong dalam fail go-live');
    process.exit(1);
  }
  return line;
}

async function findUser(sb, email) {
  let page = 1;
  while (page <= 20) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

const password = useGoLive ? readGoLivePassword() : LEGACY_PASSWORD;
const mustChange = useGoLive;

console.log(`\nReset AM UAT — ${useGoLive ? 'go-live password' : 'legacy RkjOne@2025'}\n`);

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

for (const email of AM_EMAILS) {
  const user = await findUser(sb, email);
  if (!user) {
    console.log(`✗ ${email} — tidak dijumpai`);
    continue;
  }
  await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  await sb
    .from('profiles')
    .update({ must_change_password: mustChange })
    .eq('id', user.id);
  console.log(`✓ ${email} — reset OK${mustChange ? ' · wajib tukar password' : ''}`);
}

console.log('');
