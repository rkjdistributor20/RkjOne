import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { canViewAllLegalEntities } from '@/lib/auth/legal-entity-scope';
import { assertCanManageHrPeople } from '@/lib/hr/hr-access';
import { ensureLeaveBalance, normalizeLeaveType, remainingLeaveDays } from '@/lib/hr/leave-balances';
import { createServiceClient } from '@/lib/supabase/server';
import type { HrLeaveBalance, HrLeaveType, Staff } from '@/types/database';

const NUMERIC_FIELDS = [
 'entitlement_days',
 'carried_forward_days',
 'used_days',
 'pending_days',
 'adjustment_days',
] as const;

function parseYear(value: unknown) {
 const year = Number(value ?? new Date().getFullYear());
 if (!Number.isInteger(year) || year < 2020 || year > 2100) {
 throw new Error('Tahun cuti tidak sah.');
 }
 return year;
}

function parseNumberField(field: (typeof NUMERIC_FIELDS)[number], value: unknown) {
 if (value == null || value === '') return undefined;
 const num = Number(value);
 if (!Number.isFinite(num)) throw new Error(`Nilai ${field} tidak sah.`);
 if (field !== 'adjustment_days' && num < 0) throw new Error(`Nilai ${field} tidak boleh negatif.`);
 return Math.round(num * 100) / 100;
}

export async function PATCH(request: Request) {
 try {
 const profile = assertCanManageHrPeople(await getCurrentProfile());
 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const staffId = String(body.staff_id ?? '').trim();
 if (!staffId) return NextResponse.json({ error: 'Staf perlu dipilih.' }, { status: 400 });

 const leaveType = normalizeLeaveType(body.leave_type) as HrLeaveType;
 const leaveYear = parseYear(body.leave_year);
 const service = await createServiceClient();

 const { data: staffData, error: staffError } = await service
 .from('staff')
 .select('*')
 .eq('organization_id', profile.organization_id)
 .eq('id', staffId)
 .maybeSingle();
 if (staffError) throw staffError;
 const staff = staffData as Staff | null;
 if (!staff) return NextResponse.json({ error: 'Staf tidak ditemui.' }, { status: 404 });
 if (staff.worker_type !== 'LOCAL') {
 return NextResponse.json({ error: 'Baki cuti rasmi hanya untuk pekerja tempatan.' }, { status: 400 });
 }
 if (!canViewAllLegalEntities(profile.role) && staff.legal_entity_id !== profile.legal_entity_id) {
 return NextResponse.json({ error: 'Akses ditolak untuk syarikat lain.' }, { status: 403 });
 }

 const balance = await ensureLeaveBalance(service, {
 organizationId: profile.organization_id,
 staffId,
 leaveYear,
 leaveType,
 updatedBy: profile.id,
 });

 const updates: Record<string, unknown> = {
 updated_by: profile.id,
 updated_at: new Date().toISOString(),
 };
 for (const field of NUMERIC_FIELDS) {
 const parsed = parseNumberField(field, body[field]);
 if (parsed !== undefined) updates[field] = parsed;
 }
 if (body.notes !== undefined) {
 updates.notes = String(body.notes ?? '').trim() || null;
 }
 if (Object.keys(updates).length <= 2) {
 return NextResponse.json({ error: 'Tiada perubahan baki cuti.' }, { status: 400 });
 }

 const beforeRemaining = remainingLeaveDays(balance);
 const { data, error } = await service
 .from('hr_leave_balances')
 .update(updates as never)
 .eq('id', balance.id)
 .eq('organization_id', profile.organization_id)
 .select('*')
 .single();
 if (error) throw error;

 const updated = data as HrLeaveBalance;
 const afterRemaining = remainingLeaveDays(updated);
 await service.from('hr_leave_transactions').insert({
 organization_id: profile.organization_id,
 leave_balance_id: updated.id,
 staff_id: updated.staff_id,
 profile_id: updated.profile_id,
 hr_service_request_id: null,
 leave_type: updated.leave_type,
 transaction_type: 'ADJUSTMENT',
 days: Math.round((afterRemaining - beforeRemaining) * 100) / 100,
 balance_after_days: afterRemaining,
 note: String(body.notes ?? 'Manual HR leave balance update.').slice(0, 500),
 created_by: profile.id,
 } as never);

 return NextResponse.json({ balance: updated });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal kemaskini baki cuti.' },
 { status: 400 },
 );
 }
}
