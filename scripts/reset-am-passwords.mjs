/** Reset kata laluan 3 AM untuk UAT. Usage: node scripts/reset-am-passwords.mjs */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'RkjOne@2025';
const AM_EMAILS = ['safuan@rkj.com', 'hakim@rkj.com', 'yati@rkj.com'];

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

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

for (const email of AM_EMAILS) {
  const user = await findUser(sb, email);
  if (!user) {
    console.log(`✗ ${email} — tidak dijumpai`);
    continue;
  }
  await sb.auth.admin.updateUserById(user.id, { password: PASSWORD });
  await sb.from('profiles').update({ must_change_password: false }).eq('id', user.id);
  console.log(`✓ ${email} — password reset`);
}
