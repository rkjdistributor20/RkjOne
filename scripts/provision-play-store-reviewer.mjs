/**
 * Provision a restricted Google Play reviewer account for RKJ One Staff.
 *
 * The reviewer is mapped as a normal kiosk STAFF user for BR011 only, so Google
 * can review real login/POS flows without using an owner or HQ account.
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'outputs', 'mobile-release');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'play-store-reviewer-account.json');
const OUTPUT_TXT = path.join(OUTPUT_DIR, 'play-store-reviewer-account.txt');

const REVIEWER = {
  email: 'playstore.reviewer@rkj.com',
  staffCode: 'REV001',
  fullName: 'Google Play Reviewer',
  role: 'STAFF',
  legalEntityCode: 'RKJ',
  branchCode: 'BR011',
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

function generatePassword() {
  const token = randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  return `RkjReview@${new Date().getFullYear()}-${token}aA1!`;
}

function readExistingPassword() {
  if (!fs.existsSync(OUTPUT_JSON)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
    return typeof payload.password === 'string' && payload.password.length >= 12
      ? payload.password
      : null;
  } catch {
    return null;
  }
}

async function findUserByEmail(admin, email) {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((user) => user.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(ROOT, '.env.example')),
    ...loadEnvFile(path.join(ROOT, '.env.local')),
    ...process.env,
  };

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || serviceKey.includes('YOUR_')) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY perlu ada dalam .env.local');
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id, code')
    .eq('code', 'RKJ')
    .single();
  if (orgError || !org) throw new Error('Organization RKJ tidak dijumpai');

  const { data: legalEntity, error: legalError } = await admin
    .from('legal_entities')
    .select('id, code')
    .eq('organization_id', org.id)
    .eq('code', REVIEWER.legalEntityCode)
    .single();
  if (legalError || !legalEntity) throw new Error(`Legal entity ${REVIEWER.legalEntityCode} tidak dijumpai`);

  const { data: branch, error: branchError } = await admin
    .from('branches')
    .select('id, branch_code, branch_name, region_id')
    .eq('organization_id', org.id)
    .eq('branch_code', REVIEWER.branchCode)
    .single();
  if (branchError || !branch) throw new Error(`Cawangan ${REVIEWER.branchCode} tidak dijumpai`);

  const password = process.env.REVIEWER_PASSWORD?.trim() || readExistingPassword() || generatePassword();
  const userMetadata = {
    full_name: REVIEWER.fullName,
    role: REVIEWER.role,
    employee_code: REVIEWER.staffCode,
    reviewer_account: true,
    branch_code: branch.branch_code,
  };

  const existing = await findUserByEmail(admin, REVIEWER.email);
  let userId;
  let mode;
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) throw error;
    userId = existing.id;
    mode = 'updated';
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: REVIEWER.email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) throw error;
    userId = data.user.id;
    mode = 'created';
  }

  const now = new Date().toISOString();
  const profilePayload = {
    id: userId,
    organization_id: org.id,
    employee_code: REVIEWER.staffCode,
    full_name: REVIEWER.fullName,
    email: REVIEWER.email,
    role: REVIEWER.role,
    branch_id: branch.id,
    region_id: branch.region_id,
    legal_entity_id: legalEntity.id,
    status: 'ACTIVE',
    must_change_password: false,
    metadata: {
      purpose: 'Google Play Console restricted app review',
      access_scope: 'BR011 POS reviewer only',
      branch_code: branch.branch_code,
      branch_name: branch.branch_name,
      reviewer_account: true,
    },
    updated_at: now,
  };

  const { error: profileError } = await admin
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' });
  if (profileError) throw profileError;

  const staffPayload = {
    organization_id: org.id,
    staff_code: REVIEWER.staffCode,
    full_name: REVIEWER.fullName,
    branch_id: branch.id,
    region_id: branch.region_id,
    legal_entity_id: legalEntity.id,
    profile_id: userId,
    status: 'ACTIVE',
    on_hold: false,
    remarks: 'Restricted account for Google Play review. Not a real payroll staff.',
    updated_at: now,
  };

  const { error: staffError } = await admin
    .from('staff')
    .upsert(staffPayload, { onConflict: 'organization_id,staff_code' });
  if (staffError) throw staffError;

  const { error: accessError } = await admin
    .from('profile_branch_access')
    .upsert({ profile_id: userId, branch_id: branch.id }, { onConflict: 'profile_id,branch_id' });
  if (accessError) throw accessError;

  const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await anon.auth.signInWithPassword({
    email: REVIEWER.email,
    password,
  });
  if (signInError) throw new Error(`Login reviewer gagal: ${signInError.message}`);
  await anon.auth.signOut();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const credential = {
    generated_at: now,
    mode,
    email: REVIEWER.email,
    password,
    role: REVIEWER.role,
    branch_code: branch.branch_code,
    branch_name: branch.branch_name,
    privacy_note: 'Use only for Google Play Console app review. Rotate/delete after review if desired.',
  };
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(credential, null, 2), 'utf8');
  fs.writeFileSync(
    OUTPUT_TXT,
    [
      'RKJ One Staff - Google Play Reviewer Account',
      `Generated: ${now}`,
      '',
      `Email: ${REVIEWER.email}`,
      `Password: ${password}`,
      `Role: ${REVIEWER.role}`,
      `Access: ${branch.branch_code} - ${branch.branch_name}`,
      '',
      'Reviewer instruction:',
      'This is a restricted internal staff operations app. Log in with this test account to review POS, stock SOP, shift summary and branch workflow demo for BR011.',
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`Reviewer ${mode}: ${REVIEWER.email}`);
  console.log(`Access: ${branch.branch_code} - ${branch.branch_name}`);
  console.log(`Credential file: ${path.relative(ROOT, OUTPUT_TXT)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
