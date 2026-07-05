import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { applyBranchIdsFilter } from '@/lib/auth/branch-scope';
import {
 assertBranchInPersonnelScope,
 assertCanManagePersonnel,
 loadPersonnelScope,
} from '@/lib/settings/personnel-access';
import { provisionStaffPortalAccount } from '@/lib/settings/staff-auth';
import { resolveLegalEntityId } from '@/lib/settings/legal-entity';
import { DEFAULT_SALES_LEGAL_ENTITY_CODE } from '@/lib/brand/legal-entities';
import { getCompanyRoleOptions } from '@/lib/auth/role-labels';
import {
 computeForeignWeeklyPay,
 computeLocalMonthlyPay,
 DEFAULT_SHIFTS_PER_WEEK,
} from '@/lib/payroll/staff-pay-rates';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import type { PayrollRule } from '@/lib/payroll/types';
import type { UserRole } from '@/types/enums';

async function loadActivePayrollRules(
 supabase: SupabaseClient,
 organizationId: string) {
 const { data, error } = await supabase.from('payroll_rules').select('id, rule_code, worker_type, component, rate, period, shift_hours, status, notes').eq('organization_id', organizationId).eq('status', 'ACTIVE');

 if (error) throw new Error(error.message);
 return (data ?? []) as PayrollRule[];
}

class StaffValidationError extends Error {}

function parsePositiveAmount(value: unknown, errorMessage: string) {
 const amount = Number(value);
 if (!Number.isFinite(amount) || amount <= 0) {
 throw new StaffValidationError(errorMessage);
 }
 return Math.round(amount * 100) / 100;
}

function optionalText(value: unknown) {
 const text = String(value ?? '').trim();
 return text.length > 0 ? text : null;
}

function optionalDate(value: unknown) {
 const text = optionalText(value);
 if (!text) return null;
 return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 try {
 assertCanManagePersonnel(profile);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 const supabase = await createClient();
 let scope;
 try {
 scope = await loadPersonnelScope(supabase, profile);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 let query = supabase.from('staff').select(
 'id, staff_code, full_name, status, branch_id, region_id, worker_type, weekly_amount, monthly_amount, shift_hours, shifts_per_week, branch:branches(branch_code, branch_name)').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('staff_code');

 query = applyBranchIdsFilter(query, 'branch_id', scope.branchIds);

 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ staff: data ?? [] });
}

export async function POST(request: Request) {
 try {
 const limited = enforceRateLimit(request, {
 key: 'staff-create',
 limit: 20,
 windowMs: 10 * 60 * 1000,
 });
 if (limited) return limited;

 const profile = assertCanManagePersonnel(await getCurrentProfile());
 const body = await request.json();
 const supabase = await createClient();

 const legalEntityCode = String(
 body.legal_entity_code ?? DEFAULT_SALES_LEGAL_ENTITY_CODE);
 const branchInput = body.branch_id ? String(body.branch_id) : null;

 if (!branchInput && legalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE) {
 return NextResponse.json({ error: 'Cawangan wajib' }, { status: 400 });
 }

 const branchId = branchInput
 ? await assertBranchInPersonnelScope(supabase, profile, branchInput)
 : null;

 const staffCode = String(body.staff_code ?? '').trim().toUpperCase();
 const fullName = String(body.full_name ?? '').trim();
 const workerType = body.worker_type as 'LOCAL' | 'FOREIGN' | undefined;
 const role = String(body.role ?? 'STAFF') as UserRole;
 const allowedRoles = getCompanyRoleOptions(legalEntityCode);

 if (!staffCode || !fullName) {
 return NextResponse.json(
 { error: 'Kod staf dan nama diperlukan' },
 { status: 400 });
 }

 if (workerType !== 'LOCAL' && workerType !== 'FOREIGN') {
 return NextResponse.json(
 { error: 'Pilih jenis staf: Staf Tempatan atau Pekerja Asing' },
 { status: 400 });
 }

 const rules = await loadActivePayrollRules(supabase, profile.organization_id);
 const useRkjDefaultPay = legalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE;

 let weeklyAmount: number | null = null;
 let monthlyAmount: number | null = null;
 let shiftHours: number | null = null;
 let shiftsPerWeek: number | null = null;

 if (workerType === 'FOREIGN') {
 if (useRkjDefaultPay) {
 shiftHours = Number(body.shift_hours);
 shiftsPerWeek = Number(body.shifts_per_week ?? DEFAULT_SHIFTS_PER_WEEK);

 if (!Number.isFinite(shiftHours) || shiftHours <= 0) {
 return NextResponse.json(
 { error: 'Pilih kadar shift (8, 9, 12, atau 16 jam)' },
 { status: 400 });
 }

 if (!allowedRoles.includes(role)) {
 return NextResponse.json(
 { error: 'Tahap akses tidak sepadan dengan syarikat majikan' },
 { status: 400 });
 }

 if (!Number.isFinite(shiftsPerWeek) || shiftsPerWeek <= 0 || shiftsPerWeek > 7) {
 return NextResponse.json(
 { error: 'Hari bekerja seminggu mesti antara 1-7' },
 { status: 400 });
 }

 const foreignPay = computeForeignWeeklyPay(rules, shiftHours, shiftsPerWeek);
 if (foreignPay.perShift <= 0) {
 return NextResponse.json(
 { error: 'Kadar shift pekerja asing tidak dijumpai dalam payroll rules' },
 { status: 400 });
 }

 weeklyAmount = foreignPay.weekly;
 } else {
 weeklyAmount = parsePositiveAmount(
 body.weekly_amount,
 'Masukkan kadar gaji mingguan untuk staf syarikat ini');
 shiftHours = body.shift_hours ? Number(body.shift_hours) : null;
 shiftsPerWeek = body.shifts_per_week ? Number(body.shifts_per_week) : null;
 if (shiftsPerWeek != null && (!Number.isFinite(shiftsPerWeek) || shiftsPerWeek <= 0 || shiftsPerWeek > 7)) {
 return NextResponse.json(
 { error: 'Hari bekerja seminggu mesti antara 1-7' },
 { status: 400 });
 }
 }
 } else {
 if (useRkjDefaultPay) {
 const localPay = computeLocalMonthlyPay(rules);
 if (localPay.total <= 0) {
 return NextResponse.json(
 { error: 'Kadar gaji staf tempatan tidak dijumpai dalam payroll rules' },
 { status: 400 });
 }

 monthlyAmount = localPay.total;
 } else {
 monthlyAmount = parsePositiveAmount(
 body.monthly_amount,
 'Masukkan kadar gaji bulanan untuk staf syarikat ini');
 }
 }

 const { data: branch } = branchId
 ? await supabase.from('branches').select('region_id').eq('id', branchId).maybeSingle()
 : { data: null };

 const regionId =
 (branch as { region_id: string } | null)?.region_id ?? profile.region_id;

 const legalEntityId = await resolveLegalEntityId(
 supabase,
 profile.organization_id,
 legalEntityCode);

 const { data, error } = await (supabase as SupabaseClient).from('staff').insert({
 organization_id: profile.organization_id,
 staff_code: staffCode,
 full_name: fullName,
 branch_id: branchId,
 region_id: regionId,
 worker_type: workerType,
 bank_name: optionalText(body.bank_name),
 account_number: optionalText(body.account_number),
 account_holder: optionalText(body.account_holder),
 weekly_amount: weeklyAmount,
 monthly_amount: monthlyAmount,
 shift_hours: shiftHours,
 shifts_per_week: shiftsPerWeek,
 legal_entity_id: legalEntityId,
 remarks: optionalText(body.remarks ?? body.work_scope),
 status: 'ACTIVE',
 }).select(
 'id, staff_code, full_name, status, branch_id, worker_type, weekly_amount, monthly_amount, shift_hours, shifts_per_week').single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });

 const service = await createServiceClient();
 let portal: { login_email: string; portal_password: string } | null = null;
 try {
 portal = await provisionStaffPortalAccount(service, {
 staffId: data.id,
 staffCode,
 fullName,
 role,
 branchId,
 regionId,
 organizationId: profile.organization_id,
 legalEntityId,
 createdBy: profile.id,
 phone: optionalText(body.phone),
 icNumber: optionalText(body.ic_number),
 dateOfBirth: optionalDate(body.date_of_birth),
 gender: optionalText(body.gender) as 'MALE' | 'FEMALE' | 'OTHER' | null,
 nationality: optionalText(body.nationality),
 addressLine1: optionalText(body.address_line1),
 addressLine2: optionalText(body.address_line2),
 city: optionalText(body.city),
 state: optionalText(body.state),
 postcode: optionalText(body.postcode),
 emergencyContactName: optionalText(body.emergency_contact_name),
 emergencyContactPhone: optionalText(body.emergency_contact_phone),
 emergencyContactRelation: optionalText(body.emergency_contact_relation),
 jobTitle: optionalText(body.job_title),
 department: optionalText(body.department),
 employmentStartDate: optionalDate(body.employment_start_date),
 workScope: optionalText(body.work_scope),
 });
 } catch (authError) {
 await (supabase as SupabaseClient).from('staff').delete().eq('id', data.id);
 return NextResponse.json(
 {
 error:
 authError instanceof Error
 ? authError.message
 : 'Gagal cipta akaun login staf',
 },
 { status: 400 });
 }

 return NextResponse.json({
 staff: data,
 portal,
 message: 'Akaun login dicipta - staf mesti tukar kata laluan pada log masuk pertama',
 });
 } catch (err) {
 const isValidation = err instanceof StaffValidationError;
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: isValidation ? 400 : 403 });
 }
}

