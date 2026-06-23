/**
 * Register/update company staff from outputs/rkj_company_staff_register.json.
 *
 * Default mode is dry-run. Use --apply to write to Supabase.
 *
 * Usage from project root:
 *   node scripts/register-company-staff.mjs --input "C:\...\rkj_company_staff_register.json"
 *   node scripts/register-company-staff.mjs --input "C:\...\rkj_company_staff_register.json" --apply
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'csv_import', 'rkj_company_staff_register.json');
const DEFAULT_PASSWORD = 'RkjOne@2025';

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const APPLY = process.argv.includes('--apply');
const INPUT = argValue('--input', DEFAULT_INPUT);

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

function isEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value ?? '').trim());
}

async function findUserByEmail(supabase, email) {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

function metadataFor(row) {
  return {
    source: 'STAFF LIST.xlsx',
    source_sheet: row.source_sheet,
    company_name: row.company_name,
    legal_entity_code: row.legal_entity_code,
    position: row.position,
    department: row.department,
    joined_date: row.joined_date,
    termination_date: row.termination_date,
    epf_number: row.epf_number,
    income_tax_number: row.income_tax_number,
    socso_number: row.socso_number,
    basic_salary: row.basic_salary,
    gross_pay: row.gross_pay,
    net_pay: row.net_pay,
  };
}

async function ensureAuthAndProfile(supabase, row, orgId, legalEntityId, regionId, branchId) {
  if (!isEmail(row.email)) {
    throw new Error(`${row.staff_code}: email tidak sah/kosong`);
  }

  const password = DEFAULT_PASSWORD;
  const existing = await findUserByEmail(supabase, row.email);
  let userId;

  const userMeta = {
    full_name: row.full_name,
    role: row.role,
    employee_code: row.staff_code,
    legal_entity_code: row.legal_entity_code,
  };

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      user_metadata: userMeta,
    });
    if (error) throw error;
    userId = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: row.email,
      password,
      email_confirm: true,
      user_metadata: userMeta,
    });
    if (error) throw error;
    userId = data.user.id;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      organization_id: orgId,
      employee_code: row.staff_code,
      full_name: row.full_name,
      email: row.email,
      role: row.role,
      region_id: regionId,
      branch_id: branchId,
      status: row.status,
      must_change_password: true,
      ic_number: row.ic_number,
      legal_entity_id: legalEntityId,
      metadata: metadataFor(row),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (profileError) throw profileError;
  return { userId, password, mode: existing ? 'updated' : 'created' };
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Input JSON tidak dijumpai: ${INPUT}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const rows = payload.staff ?? [];

  const env = {
    ...loadEnvFile(path.join(ROOT, '.env.example')),
    ...loadEnvFile(path.join(ROOT, '.env.local')),
    ...process.env,
  };

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || serviceKey.includes('YOUR_')) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY dalam .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('code', 'RKJ')
    .single();
  if (orgError || !org) throw new Error('Organization RKJ tidak dijumpai');

  const { data: legalEntities, error: legalError } = await supabase
    .from('legal_entities')
    .select('id, code')
    .eq('organization_id', org.id);
  if (legalError) throw legalError;
  const legalMap = Object.fromEntries((legalEntities ?? []).map((x) => [x.code, x.id]));

  const { data: branches, error: branchError } = await supabase
    .from('branches')
    .select('id, branch_code, region_id')
    .eq('organization_id', org.id);
  if (branchError) throw branchError;
  const branchMap = Object.fromEntries((branches ?? []).map((x) => [x.branch_code, x]));

  const { data: regions, error: regionError } = await supabase
    .from('regions')
    .select('id, code')
    .eq('organization_id', org.id);
  if (regionError) throw regionError;
  const regionMap = Object.fromEntries((regions ?? []).map((x) => [x.code, x.id]));

  console.log(`\n=== RKJ One Company Staff Register ${APPLY ? '(APPLY)' : '(DRY RUN)'} ===`);
  console.log(`Input: ${INPUT}`);
  console.log(`Rows: ${rows.length}\n`);

  const credentials = [];
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const legalEntityId = legalMap[row.legal_entity_code];
      if (!legalEntityId) throw new Error(`Legal entity tidak dijumpai: ${row.legal_entity_code}`);

      const branch = row.branch_code ? branchMap[row.branch_code] : null;
      if (row.branch_code && !branch) throw new Error(`Branch tidak dijumpai: ${row.branch_code}`);

      const branchId = branch?.id ?? null;
      const regionId = branch?.region_id ?? (row.region_code ? regionMap[row.region_code] ?? null : null);

      const staffPatch = {
        organization_id: org.id,
        staff_code: row.staff_code,
        full_name: row.full_name,
        branch_id: branchId,
        region_id: regionId,
        worker_type: row.worker_type,
        bank_name: row.bank_account ? 'BANK' : null,
        account_number: row.bank_account,
        account_holder: row.full_name,
        weekly_amount: null,
        monthly_amount: row.basic_salary,
        shift_hours: null,
        shifts_per_week: null,
        legal_entity_id: legalEntityId,
        status: row.status,
        on_hold: false,
        remarks: [
          row.position ? `Position: ${row.position}` : null,
          row.department ? `Department: ${row.department}` : null,
          row.joined_date ? `Joined: ${row.joined_date}` : null,
          `Source: ${row.source_sheet}`,
        ].filter(Boolean).join(' | '),
        updated_at: new Date().toISOString(),
      };

      if (!APPLY) {
        console.log(`  would upsert ${row.staff_code} ${row.full_name} -> ${row.legal_entity_code}/${row.role}`);
        continue;
      }

      const { data: staff, error: staffError } = await supabase
        .from('staff')
        .upsert(staffPatch, { onConflict: 'organization_id,staff_code' })
        .select('id, profile_id')
        .single();
      if (staffError) throw staffError;

      const auth = await ensureAuthAndProfile(
        supabase,
        row,
        org.id,
        legalEntityId,
        regionId,
        branchId
      );

      const { error: linkError } = await supabase
        .from('staff')
        .update({ profile_id: auth.userId })
        .eq('id', staff.id);
      if (linkError) throw linkError;

      const { error: credError } = await supabase
        .from('staff_portal_credentials')
        .upsert(
          {
            staff_id: staff.id,
            organization_id: org.id,
            login_email: row.email,
            portal_password: auth.password,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'staff_id' }
        );
      if (credError) throw credError;

      if (auth.mode === 'created') inserted += 1;
      else updated += 1;

      credentials.push({
        staff_code: row.staff_code,
        full_name: row.full_name,
        email: row.email,
        role: row.role,
        legal_entity_code: row.legal_entity_code,
        password: auth.password,
      });

      console.log(`  ✓ ${row.staff_code} ${row.full_name} -> ${row.legal_entity_code}/${row.role} (${auth.mode})`);
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${row.staff_code} ${row.full_name}: ${err.message}`);
    }
  }

  if (APPLY) {
    const outPath = path.join(ROOT, 'csv_import', 'company_staff_credentials.csv');
    const csv = [
      'staff_code,full_name,email,role,legal_entity_code,password',
      ...credentials.map((c) =>
        [c.staff_code, c.full_name, c.email, c.role, c.legal_entity_code, c.password]
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n') + '\n';
    fs.writeFileSync(outPath, csv, 'utf8');
    console.log(`\nCredentials CSV: ${outPath}`);
  }

  console.log('\n=== Summary ===');
  console.log(`Created auth users: ${inserted}`);
  console.log(`Updated auth users: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(APPLY ? 'Apply complete.' : 'Dry run only. Re-run with --apply to register.');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nGagal:', err.message);
  process.exit(1);
});
