import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertBranchInPersonnelScope,
 assertCanManagePersonnel,
 assertStaffTargetInScope,
} from '@/lib/settings/personnel-access';
import {
 loadStaffPortalCredentials,
 loadStaffProfileMeta,
 provisionStaffPortalAccount,
} from '@/lib/settings/staff-auth';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { resolveLegalEntityId } from '@/lib/settings/legal-entity';
import { DEFAULT_SALES_LEGAL_ENTITY_CODE } from '@/lib/brand/legal-entities';
import {
 computeForeignWeeklyPay,
 computeLocalMonthlyPay,
 DEFAULT_SHIFTS_PER_WEEK,
} from '@/lib/payroll/staff-pay-rates';
import type { PayrollRule } from '@/lib/payroll/types';

async function loadPayrollRules(supabase: SupabaseClient, orgId: string) {
 const { data, error } = await supabase.from('payroll_rules').select('id, rule_code, worker_type, component, rate, period, shift_hours, status, notes').eq('organization_id', orgId).eq('status', 'ACTIVE');
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

function computePayAmounts(
 rules: PayrollRule[],
 workerType: 'LOCAL' | 'FOREIGN',
 useRkjDefaultPay: boolean,
 shiftHours?: number,
 shiftsPerWeek?: number,
 monthlyAmount?: number,
 weeklyAmount?: number) {
 if (workerType === 'FOREIGN') {
 if (!useRkjDefaultPay) {
 return {
 weekly_amount: parsePositiveAmount(
 weeklyAmount,
 'Masukkan kadar gaji mingguan untuk staf syarikat ini'),
 monthly_amount: null as number | null,
 shift_hours: shiftHours ?? null,
 shifts_per_week: shiftsPerWeek ?? null,
 };
 }
 const hours = Number(shiftHours);
 const days = Number(shiftsPerWeek ?? DEFAULT_SHIFTS_PER_WEEK);
 if (!Number.isFinite(hours) || hours <= 0) {
 throw new StaffValidationError('Pilih kadar shift pekerja asing RKJ');
 }
 if (!Number.isFinite(days) || days <= 0 || days > 7) {
 throw new StaffValidationError('Hari bekerja seminggu mesti antara 1-7');
 }
 const foreignPay = computeForeignWeeklyPay(rules, hours, days);
 if (foreignPay.perShift <= 0) {
 throw new StaffValidationError('Kadar shift pekerja asing tidak dijumpai dalam payroll rules');
 }
 return {
 weekly_amount: foreignPay.weekly,
 monthly_amount: null as number | null,
 shift_hours: hours,
 shifts_per_week: days,
 };
 }
 if (!useRkjDefaultPay) {
 return {
 weekly_amount: null as number | null,
 monthly_amount: parsePositiveAmount(
 monthlyAmount,
 'Masukkan kadar gaji bulanan untuk staf syarikat ini'),
 shift_hours: null as number | null,
 shifts_per_week: null as number | null,
 };
 }
 const localPay = computeLocalMonthlyPay(rules);
 if (localPay.total <= 0) {
 throw new StaffValidationError('Kadar gaji staf tempatan tidak dijumpai dalam payroll rules');
 }
 return {
 weekly_amount: null as number | null,
 monthly_amount: localPay.total,
 shift_hours: null as number | null,
 shifts_per_week: null as number | null,
 };
}

export async function GET(
 _request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 try {
 const profile = assertCanManagePersonnel(await getCurrentProfile());
 const { id } = await params;
 const supabase = await createClient();
 const service = await createServiceClient();

 await assertStaffTargetInScope(supabase, profile, id);

 const { data: staff, error } = await supabase.from('staff').select(
 `
 id, staff_code, full_name, status, branch_id, region_id, worker_type,
 weekly_amount, monthly_amount, shift_hours, shifts_per_week,
 bank_name, account_number, account_holder, remarks, on_hold, profile_id, legal_entity_id,
 branch:branches(branch_code, branch_name),
 legal_entity:legal_entities(code, name, legal_name, scope)
 `).eq('id', id).eq('organization_id', profile.organization_id).single();

 if (error || !staff) {
 return NextResponse.json({ error: 'Staf tidak dijumpai' }, { status: 404 });
 }

 const staffRow = staff as { profile_id: string | null };

 const [credentials, profileMeta] = await Promise.all([
 loadStaffPortalCredentials(service, id),
 loadStaffProfileMeta(service, staffRow.profile_id),
 ]);

 return NextResponse.json({
 staff,
 portal: credentials,
 login: profileMeta
 ? {
 must_change_password: profileMeta.must_change_password,
 last_login_at: profileMeta.last_login_at,
 status: profileMeta.status,
 }
 : null,
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}

export async function PATCH(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 try {
 const limited = enforceRateLimit(request, {
 key: 'staff-update',
 limit: 40,
 windowMs: 10 * 60 * 1000,
 });
 if (limited) return limited;

 const profile = assertCanManagePersonnel(await getCurrentProfile());
 const { id } = await params;
 const body = await request.json();
 const supabase = await createClient();
 const service = await createServiceClient();

 await assertStaffTargetInScope(supabase, profile, id);

 const { data: existing } = await supabase.from('staff').select('id, staff_code, profile_id, branch_id, region_id, worker_type, full_name, legal_entity_id, legal_entity:legal_entities(code)').eq('id', id).single();

 const existingRow = existing as {
 id: string;
 staff_code: string;
 profile_id: string | null;
 branch_id: string | null;
 region_id: string | null;
 worker_type: 'LOCAL' | 'FOREIGN' | null;
 full_name: string;
 legal_entity_id: string | null;
 legal_entity?: { code: string | null } | { code: string | null }[] | null;
 } | null;

 if (!existingRow) {
 return NextResponse.json({ error: 'Staf tidak dijumpai' }, { status: 404 });
 }

 const updates: Record<string, unknown> = {};

 if (body.full_name != null) updates.full_name = String(body.full_name).trim();
 if (body.status != null) updates.status = body.status;
 if (body.remarks != null) updates.remarks = body.remarks;
 if (body.on_hold != null) updates.on_hold = Boolean(body.on_hold);
 if (body.bank_name != null) updates.bank_name = body.bank_name;
 if (body.account_number != null) updates.account_number = body.account_number;
 if (body.account_holder != null) updates.account_holder = body.account_holder;

 if (body.legal_entity_code != null) {
 updates.legal_entity_id = await resolveLegalEntityId(
 supabase,
 profile.organization_id,
 body.legal_entity_code);
 }

 if (body.branch_id !== undefined) {
 const branchId = body.branch_id
 ? await assertBranchInPersonnelScope(
 supabase,
 profile,
 body.branch_id)
 : null;
 if (branchId) {
 updates.branch_id = branchId;
 const { data: branch } = await supabase.from('branches').select('region_id').eq('id', branchId).maybeSingle();
 updates.region_id = (branch as { region_id: string } | null)?.region_id;
 } else {
 updates.branch_id = null;
 updates.region_id = null;
 }
 }

 const workerType = (body.worker_type ?? existingRow.worker_type) as 'LOCAL' | 'FOREIGN';
 const existingLegalEntity = Array.isArray(existingRow.legal_entity)
 ? existingRow.legal_entity[0]
 : existingRow.legal_entity;
 const effectiveLegalEntityCode = String(
 body.legal_entity_code ?? existingLegalEntity?.code ?? DEFAULT_SALES_LEGAL_ENTITY_CODE);
 const useRkjDefaultPay = effectiveLegalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE;
 if (
 body.legal_entity_code != null ||
 body.worker_type != null ||
 body.shift_hours != null ||
 body.shifts_per_week != null ||
 body.monthly_amount != null ||
 body.weekly_amount != null
 ) {
 const rules = await loadPayrollRules(supabase, profile.organization_id);
 const pay = computePayAmounts(
 rules,
 workerType,
 useRkjDefaultPay,
 body.shift_hours ?? undefined,
 body.shifts_per_week ?? undefined,
 body.monthly_amount ?? undefined,
 body.weekly_amount ?? undefined);
 updates.worker_type = workerType;
 updates.weekly_amount = pay.weekly_amount;
 updates.monthly_amount = pay.monthly_amount;
 updates.shift_hours = pay.shift_hours;
 updates.shifts_per_week = pay.shifts_per_week;
 }

 const { data: staff, error } = await (supabase as SupabaseClient).from('staff').update(updates).eq('id', id).select(
 'id, staff_code, full_name, status, branch_id, worker_type, weekly_amount, monthly_amount, shift_hours, shifts_per_week, profile_id').single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });

 if (existingRow.profile_id && (updates.full_name || Object.prototype.hasOwnProperty.call(updates, 'branch_id') || Object.prototype.hasOwnProperty.call(updates, 'legal_entity_id'))) {
 const profileUpdates: Record<string, unknown> = {};
 if (updates.full_name) profileUpdates.full_name = updates.full_name;
 if (Object.prototype.hasOwnProperty.call(updates, 'branch_id')) profileUpdates.branch_id = updates.branch_id;
 if (Object.prototype.hasOwnProperty.call(updates, 'region_id')) profileUpdates.region_id = updates.region_id;
 if (Object.prototype.hasOwnProperty.call(updates, 'legal_entity_id')) profileUpdates.legal_entity_id = updates.legal_entity_id;
 await (service as SupabaseClient).from('profiles').update(profileUpdates).eq('id', existingRow.profile_id);
 }

 let portal = await loadStaffPortalCredentials(service, id);

 if (body.create_portal_account && !portal) {
 const legalEntityId =
 (updates.legal_entity_id as string | undefined) ??
 existingRow.legal_entity_id ??
 (await resolveLegalEntityId(supabase, profile.organization_id, undefined));

 const created = await provisionStaffPortalAccount(service, {
 staffId: id,
 staffCode: existingRow.staff_code,
 fullName: (updates.full_name as string) ?? existingRow.full_name,
 branchId: Object.prototype.hasOwnProperty.call(updates, 'branch_id')
 ? (updates.branch_id as string | null)
 : existingRow.branch_id,
 regionId: Object.prototype.hasOwnProperty.call(updates, 'region_id')
 ? (updates.region_id as string | null)
 : existingRow.region_id,
 organizationId: profile.organization_id,
 legalEntityId,
 createdBy: profile.id,
 });
 portal = {
 login_email: created.login_email,
 portal_password: created.portal_password,
 updated_at: new Date().toISOString(),
 };
 }

 return NextResponse.json({ staff, portal });
 } catch (err) {
 const isValidation = err instanceof StaffValidationError;
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: isValidation ? 400 : 403 });
 }
}

export async function DELETE(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 try {
 const limited = enforceRateLimit(request, {
 key: 'staff-delete',
 limit: 20,
 windowMs: 10 * 60 * 1000,
 });
 if (limited) return limited;

 const profile = assertCanManagePersonnel(await getCurrentProfile());
 const { id } = await params;
 const supabase = await createClient();

 await assertStaffTargetInScope(supabase, profile, id);

 const { count } = await supabase.from('staff_shifts').select('id', { count: 'exact', head: true }).eq('staff_id', id);

 if ((count ?? 0) > 0) {
 return NextResponse.json(
 {
 error:
 'Staf ada rekod syif - set status INACTIVE atau hubungi Admin HQ',
 },
 { status: 400 });
 }

 const { error } = await (supabase as SupabaseClient).from('staff').delete().eq('id', id).eq('organization_id', profile.organization_id);

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: { id, deleted: true } });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}
