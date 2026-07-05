import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertCanAccessPosBranch,
 canApprovePosShiftStaff,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import type { PosShiftSummary } from '@/lib/pos/types';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { searchParams } = new URL(request.url);
 const branchId = searchParams.get('branch_id') ?? profile.branch_id;

 if (!branchId) {
 return NextResponse.json({ error: 'Branch required' }, { status: 400 });
 }

 const supabase = await createClient();
 try {
 await assertCanAccessPosBranch(supabase, profile, branchId);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Akses cawangan ditolak' },
 { status: posAccessErrorStatus(err) });
 }

 const { data: shift, error } = await supabase.from('pos_shifts').select('*').eq('branch_id', branchId).eq('status', 'OPEN').maybeSingle();

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 if (!shift) {
 return NextResponse.json({ shift: null });
 }

 const db = supabase as any;
 const openShift = shift as Record<string, unknown> & { id: string };
 const [openingCheckRes, firstTransactionRes] = await Promise.all([
 db
 .from('pos_shift_stock_check_logs')
 .select('completed_at')
 .eq('shift_id', openShift.id)
 .eq('check_type', 'OPENING')
 .order('completed_at', { ascending: true })
 .limit(1)
 .maybeSingle(),
 supabase
 .from('pos_transactions')
 .select('created_at')
 .eq('shift_id', openShift.id)
 .eq('status', 'COMPLETED')
 .order('created_at', { ascending: true })
 .limit(1)
 .maybeSingle(),
 ]);

 if (openingCheckRes.error) {
 return NextResponse.json({ error: openingCheckRes.error.message }, { status: 500 });
 }
 if (firstTransactionRes.error) {
 return NextResponse.json({ error: firstTransactionRes.error.message }, { status: 500 });
 }

 const firstTransactionAt =
 (firstTransactionRes.data as { created_at?: string } | null)?.created_at ?? null;
 const openingStockCheckedAt =
 (openingCheckRes.data as { completed_at?: string } | null)?.completed_at ?? null;
 const businessStartedAt =
 typeof openShift.business_started_at === 'string'
 ? openShift.business_started_at
 : openingStockCheckedAt;
 const payrollStartedAt =
 typeof openShift.payroll_started_at === 'string'
 ? openShift.payroll_started_at
 : businessStartedAt;

 return NextResponse.json({
 shift: {
 ...openShift,
 business_started_at: businessStartedAt,
 payroll_started_at: payrollStartedAt,
 actual_work_ended_at:
 typeof openShift.actual_work_ended_at === 'string'
 ? openShift.actual_work_ended_at
 : null,
 opening_stock_checked_at: openingStockCheckedAt,
 first_transaction_at: firstTransactionAt,
 sales_started_at: firstTransactionAt,
 } as PosShiftSummary,
 });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const body = await request.json();
 const branchId = body.branch_id ?? profile.branch_id;
 const openingCash = Number(body.opening_cash ?? 0);

 if (!branchId) {
 return NextResponse.json({ error: 'Branch required' }, { status: 400 });
 }

 const supabase = await createClient();
 try {
 await assertCanAccessPosBranch(supabase, profile, branchId);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Akses cawangan ditolak' },
 { status: posAccessErrorStatus(err) });
 }

 const db = supabase as any;

 const { data, error } = await callRpc(supabase, 'open_pos_shift', {
 p_branch_id: branchId,
 p_opening_cash: openingCash,
 p_staff_id: body.staff_id ?? null,
 });

 if (error || !data) {
 return NextResponse.json({ error: error?.message ?? 'Failed to open shift' }, { status: 400 });
 }

 const openResult = data as { shift_id: string };

 const { data: shiftRow } = await supabase.from('pos_shifts').select('*').eq('id', openResult.shift_id).single();
 const shift = shiftRow as (PosShiftSummary & {
 organization_id: string;
 branch_id: string;
 opened_at: string;
 }) | null;

 if (shift) {
 const { data: linkedStaff, error: linkedStaffError } = body.staff_id
 ? await db
 .from('staff')
 .select('id, profile_id, full_name, branch_id, status')
 .eq('id', body.staff_id)
 .eq('status', 'ACTIVE')
 .maybeSingle()
 : await db
 .from('staff')
 .select('id, profile_id, full_name, branch_id, status')
 .eq('profile_id', profile.id)
 .eq('branch_id', shift.branch_id)
 .eq('status', 'ACTIVE')
 .maybeSingle();

 if (linkedStaffError) {
 return NextResponse.json({ error: linkedStaffError.message }, { status: 400 });
 }

 const shouldRecordOpeningMember = linkedStaff?.branch_id === shift.branch_id;
 const isApprovedNow = canApprovePosShiftStaff(profile.role);
 const openingMemberStatus = isApprovedNow ? 'ACTIVE' : 'PENDING_APPROVAL';

 const { data: existingMember, error: existingMemberError } = await db
 .from('pos_shift_staff_members')
 .select('id')
 .eq('shift_id', shift.id)
 .eq('profile_id', profile.id)
 .in('status', ['ACTIVE', 'PENDING_APPROVAL'])
 .maybeSingle();

 if (existingMemberError) {
 return NextResponse.json({ error: existingMemberError.message }, { status: 400 });
 }

 if (!existingMember && shouldRecordOpeningMember) {
 const { data: memberRow, error: memberError } = await db
 .from('pos_shift_staff_members')
 .insert({
 organization_id: shift.organization_id,
 branch_id: shift.branch_id,
 shift_id: shift.id,
 profile_id: linkedStaff.profile_id ?? profile.id,
 staff_id: linkedStaff?.id ?? null,
 full_name: linkedStaff.full_name ?? profile.full_name,
 role_in_shift: 'PIC',
 status: openingMemberStatus,
 started_at: shift.opened_at ?? new Date().toISOString(),
 started_by: profile.id,
 approved_by: isApprovedNow ? profile.id : null,
 approved_at: isApprovedNow ? new Date().toISOString() : null,
 approval_notes: isApprovedNow ? 'Diluluskan terus oleh AM/ke atas semasa buka syif.' : null,
 })
 .select('id, full_name')
 .single();

 if (memberError) {
 return NextResponse.json({ error: memberError.message }, { status: 400 });
 }

 if (openingMemberStatus === 'PENDING_APPROVAL' && memberRow?.id) {
 const { error: approvalError } = await db.from('approval_requests').insert({
 organization_id: shift.organization_id,
 entity_type: 'POS_SHIFT_STAFF',
 entity_id: memberRow.id,
 title: 'Kelulusan PIC buka syif POS',
 description: `${memberRow.full_name} perlu kelulusan AM/ke atas sebelum rekod staf syif POS menjadi rasmi.`,
 status: 'PENDING',
 requested_by: profile.id,
 branch_id: shift.branch_id,
 metadata: {
 workflow: 'POS_SHIFT_STAFF_APPROVAL',
 shift_id: shift.id,
 shift_number: shift.shift_number,
 staff_id: linkedStaff.id,
 profile_id: linkedStaff.profile_id ?? profile.id,
 role_in_shift: 'PIC',
 },
 });

 if (approvalError) {
 console.warn('POS opening shift member approval request failed', approvalError.message);
 }
 }
 }
 }

 return NextResponse.json({
 shift: shift as unknown as PosShiftSummary,
 result: data,
 });
}

export async function PATCH(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const body = await request.json();
 const { shift_id, closing_cash, notes, actual_work_ended_at } = body;

 if (!shift_id || closing_cash === undefined || !actual_work_ended_at) {
 return NextResponse.json(
 { error: 'shift_id, closing_cash dan waktu tamat bekerja sebenar wajib diisi' },
 { status: 400 });
 }

 const actualWorkEndedAt = new Date(String(actual_work_ended_at));
 if (Number.isNaN(actualWorkEndedAt.getTime())) {
 return NextResponse.json(
 { error: 'Waktu tamat bekerja sebenar tidak sah' },
 { status: 400 });
 }

 const supabase = await createClient();
 const db = supabase as any;

 const { data: shiftData, error: shiftError } = await supabase
 .from('pos_shifts')
 .select('id, branch_id, organization_id, status')
 .eq('id', shift_id)
 .eq('status', 'OPEN')
 .maybeSingle();
 const shift = shiftData as {
 id: string;
 branch_id: string;
 organization_id: string;
 status: string;
 } | null;

 if (shiftError) {
 return NextResponse.json({ error: shiftError.message }, { status: 400 });
 }
 if (!shift) {
 return NextResponse.json({ error: 'Open shift not found' }, { status: 400 });
 }

 try {
 await assertCanAccessPosBranch(supabase, profile, shift.branch_id);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Akses cawangan ditolak' },
 { status: posAccessErrorStatus(err) });
 }

 const { data: closeCheck, error: closeCheckError } = await db
 .from('pos_shift_stock_check_logs')
 .select('id')
 .eq('shift_id', shift_id)
 .eq('check_type', 'CLOSE_SHIFT')
 .maybeSingle();

 if (closeCheckError) {
 return NextResponse.json({ error: closeCheckError.message }, { status: 400 });
 }
 if (!closeCheck && profile.role !== 'SUPER_ADMIN') {
 return NextResponse.json(
 { error: 'Kiraan stok tutup syif wajib dibuat dahulu di Stok & SOP.' },
 { status: 400 });
 }

 const { data: activeLeave, error: activeLeaveError } = await db
 .from('pos_staff_presence_logs')
 .select('id')
 .eq('shift_id', shift_id)
 .eq('status', 'OUT')
 .limit(1)
 .maybeSingle();

 if (activeLeaveError) {
 return NextResponse.json({ error: activeLeaveError.message }, { status: 400 });
 }
 if (activeLeave && profile.role !== 'SUPER_ADMIN') {
 return NextResponse.json(
 { error: 'Ada staf masih direkod keluar kiosk. Tekan kembali dahulu sebelum tutup syif.' },
 { status: 400 });
 }

 const { data: activeMembers, error: activeMembersError } = await db
 .from('pos_shift_staff_members')
 .select('id, profile_id, full_name, started_at')
 .eq('shift_id', shift_id)
 .eq('status', 'ACTIVE');

 if (activeMembersError) {
 return NextResponse.json({ error: activeMembersError.message }, { status: 400 });
 }

 const activeShiftMembers = activeMembers ?? [];
 if (activeShiftMembers.length) {
 const canAutoEndCurrentMember =
 activeShiftMembers.length === 1 && activeShiftMembers[0]?.profile_id === profile.id;
 const canForceEndForTesting = profile.role === 'SUPER_ADMIN';

 if (!canAutoEndCurrentMember && !canForceEndForTesting) {
 return NextResponse.json(
 {
 error:
 `Ada ${activeShiftMembers.length} staf masih aktif dalam syif. Tamatkan tugas setiap staf dahulu sebelum tutup syif.`,
 active_members: activeShiftMembers,
 },
 { status: 400 });
 }

 const { error: endMembersError } = await db
 .from('pos_shift_staff_members')
 .update({
 status: 'ENDED',
 ended_at: actualWorkEndedAt.toISOString(),
 ended_by: profile.id,
 })
 .eq('shift_id', shift_id)
 .eq('status', 'ACTIVE');

 if (endMembersError) {
 return NextResponse.json({ error: endMembersError.message }, { status: 400 });
 }
 }

 const { data, error } = await callRpc(supabase, 'close_pos_shift', {
 p_shift_id: shift_id,
 p_closing_cash: Number(closing_cash),
 p_notes: notes ?? null,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const { error: workEndError } = await db
 .from('pos_shifts')
 .update({ actual_work_ended_at: actualWorkEndedAt.toISOString() })
 .eq('id', shift_id);

 if (
 workEndError &&
 !String(workEndError.message ?? '').includes('actual_work_ended_at')
 ) {
 return NextResponse.json({ error: workEndError.message }, { status: 400 });
 }

 const resultPayload =
 data && typeof data === 'object' && !Array.isArray(data)
 ? { ...(data as Record<string, unknown>) }
 : { value: data };

 return NextResponse.json({
 result: {
 ...resultPayload,
 actual_work_ended_at: actualWorkEndedAt.toISOString(),
 },
 });
}
