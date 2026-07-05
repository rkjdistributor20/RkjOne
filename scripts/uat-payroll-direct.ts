/**
 * UAT Payroll langsung (Supabase service role) - jana cadangan + hantar slip.
 * Guna bila API production cookie gagal; operasi sama seperti HR di /payroll.
 *
 * Usage:
 * npx tsx scripts/uat-payroll-direct.ts
 * npx tsx scripts/uat-payroll-direct.ts --monthly
 * npx tsx scripts/uat-payroll-direct.ts --both
 * npx tsx scripts/uat-payroll-direct.ts --proposal-only
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateAiPayrollProposal, type ProposalPeriodType } from '../lib/payroll/ai-proposal';
import { distributePayslipsFromProposal } from '../lib/payroll/distribute-payslips';
import { getPreviousCompleteMonth } from '../lib/payroll/period-ranges';
import { getPreviousCompleteWeek } from '../lib/payroll/weekly-report';
import type { PayrollRule } from '../lib/payroll/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
 const path = join(ROOT, '.env.local');
 if (!existsSync(path)) throw new Error('Missing .env.local');
 const out: Record<string, string> = {};
 for (const line of readFileSync(path, 'utf8').split('\n')) {
 const t = line.trim();
 if (!t || t.startsWith('#')) continue;
 const eq = t.indexOf('=');
 if (eq === -1) continue;
 out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
 }
 return out;
}

const args = process.argv.slice(2);
const proposalOnly = args.includes('--proposal-only');
const runWeekly = args.includes('--both') || !args.includes('--monthly');
const runMonthly = args.includes('--both') || args.includes('--monthly');

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Missing Supabase env');

const admin = createClient(url, serviceKey, {
 auth: { autoRefreshToken: false, persistSession: false },
});

function ok(label: string, detail?: string) {
 console.log(` ✓ ${label}${detail ? ` - ${detail}` : ''}`);
}
function fail(label: string, detail?: string) {
 console.log(` ✗ ${label}${detail ? ` - ${detail}` : ''}`);
}

async function resolvePublisher() {
 for (const email of ['dist006@rkj.com', 'mfg018@rkj.com', 'matisa@rkj.com']) {
 const { data } = await admin
 .from('profiles')
 .select('id, email, role, status, full_name, organization_id')
 .ilike('email', email)
 .maybeSingle();
 if (data?.status === 'ACTIVE' && ['HR', 'SUPER_ADMIN', 'ADMIN'].includes(data.role)) {
 return data;
 }
 }
 return null;
}

async function runPeriod(
 orgId: string,
 publisherId: string,
 rules: PayrollRule[],
 periodType: ProposalPeriodType,
 label: string
) {
 console.log(`\n--- ${label} (${periodType}) ---`);
 const period =
 periodType === 'MONTHLY' ? getPreviousCompleteMonth() : getPreviousCompleteWeek();

 const proposal = await generateAiPayrollProposal(
 admin,
 orgId,
 rules,
 period.period_start,
 period.period_end,
 period.label,
 periodType
 );

 const t = proposal.totals;
 ok(
 `Cadangan AI ${periodType}`,
 `${proposal.period_label} - ${t.staff_count} staf - bersih RM ${t.net.toFixed(2)}`
 );
 ok(
 'Pecahan syarikat',
 proposal.companies.map((c) => `${c.company_code}:${c.foreign_lines.length}A+${c.local_lines.length}T`).join(' - ')
 );

 if (proposalOnly) return true;

 const result = await distributePayslipsFromProposal(
 admin,
 orgId,
 proposal,
 publisherId,
 null
 );

 ok(
 `Hantar slip ${periodType}`,
 `${result.distributed} dihantar - ${result.skipped} dilangkau`
 );
 if (result.errors.length > 0) {
 fail('Ralat', `${result.errors.length} - ${result.errors.slice(0, 3).join('; ')}`);
 return result.distributed > 0;
 }
 return result.distributed > 0;
}

console.log('\n=== UAT Payroll - Direct (Supabase) ===\n');

async function main() {
const publisher = await resolvePublisher();
if (!publisher) {
 console.error('Tiada HR/Admin aktif.');
 process.exit(1);
}
ok('Publisher', `${publisher.email} (${publisher.role})`);

const { data: org } = await admin.from('organizations').select('id').eq('code', 'RKJ').single();
if (!org) {
 console.error('Organisasi RKJ tiada.');
 process.exit(1);
}

const { data: rules, error: rulesErr } = await admin
 .from('payroll_rules')
 .select('id, rule_code, worker_type, component, rate, period, shift_hours, status, notes')
 .eq('organization_id', org.id)
 .eq('status', 'ACTIVE');

if (rulesErr || !rules?.length) {
 fail('Peraturan payroll', rulesErr?.message ?? 'tiada');
 process.exit(1);
}
ok('Peraturan payroll', String(rules.length));

const { count: before } = await admin.from('staff_payslips').select('*', { count: 'exact', head: true });
ok('Payslip sebelum', String(before ?? 0));

let passed = 0;
let failed = 0;

if (runWeekly) {
 (await runPeriod(org.id, publisher.id, rules as PayrollRule[], 'WEEKLY', 'Gaji mingguan (asing)'))
 ? (passed += 1)
 : (failed += 1);
}
if (runMonthly) {
 (await runPeriod(org.id, publisher.id, rules as PayrollRule[], 'MONTHLY', 'Gaji bulanan (tempatan)'))
 ? (passed += 1)
 : (failed += 1);
}

const { count: after } = await admin.from('staff_payslips').select('*', { count: 'exact', head: true });
ok('Payslip selepas', `${after ?? 0} (+${(after ?? 0) - (before ?? 0)})`);

console.log('\n--- Semak slip staf S001 ---');
const { data: s001Staff } = await admin
 .from('staff')
 .select('profile_id')
 .eq('staff_code', 'S001')
 .maybeSingle();

if (s001Staff?.profile_id) {
 const { count: s001Slips } = await admin
 .from('staff_payslips')
 .select('*', { count: 'exact', head: true })
 .eq('profile_id', s001Staff.profile_id);
 ok('Slip S001 (ELSA)', String(s001Slips ?? 0));
} else {
 fail('Slip S001', 'profile_id tiada');
}

console.log('\n=== Ringkasan ===');
console.log(` Lulus: ${passed} - Gagal: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
 console.error(e);
 process.exit(1);
});
