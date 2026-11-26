import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';

function malaysiaDayRange(date: string) {
 const start = new Date(`${date}T00:00:00+08:00`);
 const end = new Date(start);
 end.setUTCDate(end.getUTCDate() + 1);

 return {
 startIso: start.toISOString(),
 endIso: end.toISOString(),
 };
}

function asIsoString(value: unknown) {
 if (typeof value !== 'string') return null;
 const date = new Date(value);
 return Number.isNaN(date.getTime()) ? null : value;
}

function earliest(values: Array<string | null>) {
 return values
 .filter((value): value is string => Boolean(value))
 .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
}

function latest(values: Array<string | null>) {
 return values
 .filter((value): value is string => Boolean(value))
 .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { searchParams } = new URL(request.url);
 const branchId = searchParams.get('branch_id') ?? profile.branch_id;
 const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

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

 const { data, error } = await supabase.from('pos_operational_daily_summaries').select('*').eq('branch_id', branchId).eq('summary_date', date).maybeSingle();

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 const { startIso, endIso } = malaysiaDayRange(date);
 const { data: latestQrShiftClose, error: latestQrShiftCloseError } = await callRpc(
  supabase, 'latest_pos_fiuu_vt_shift_close', { p_branch_id: branchId },
 );
 if (latestQrShiftCloseError) {
  console.error('[pos-summary] shift_close_snapshot_unavailable', { code: latestQrShiftCloseError.code });
 }
 // A trial close remains visible to Finance on the original shift, but it
 // is not the last real shift on the operational summary.
 const latestClosedShiftNumber = latestQrShiftClose && typeof latestQrShiftClose === 'object'
  && !Array.isArray(latestQrShiftClose)
  && typeof latestQrShiftClose.shift_number === 'string'
  ? latestQrShiftClose.shift_number : null;
 const { data: operationalClose, error: operationalCloseError } = latestClosedShiftNumber
  ? await supabase.from('pos_operational_shifts').select('id')
   .eq('branch_id', branchId).eq('shift_number', latestClosedShiftNumber).maybeSingle()
  : { data: null, error: null };
 if (operationalCloseError) {
  console.error('[pos-summary] shift_close_classification_unavailable', { code: operationalCloseError.code });
 }
 const { data: shifts, error: shiftsError } = await db
 .from('pos_operational_shifts')
 .select('*')
 .eq('branch_id', branchId)
 .gte('opened_at', startIso)
 .lt('opened_at', endIso);

 if (shiftsError) {
 return NextResponse.json({ error: shiftsError.message }, { status: 500 });
 }

 const shiftRows = (shifts ?? []) as Array<Record<string, unknown>>;
 const businessStartedAt = earliest(
 shiftRows.map((shift) =>
 asIsoString(shift.business_started_at) ?? asIsoString(shift.payroll_started_at)));
 const payrollStartedAt = earliest(
 shiftRows.map((shift) =>
 asIsoString(shift.payroll_started_at) ?? asIsoString(shift.business_started_at)));
 const actualWorkEndedAt = latest(
 shiftRows.map((shift) =>
 asIsoString(shift.actual_work_ended_at) ?? asIsoString(shift.closed_at)));

 const summary = data ?? {
 summary_date: date,
 total_sales: 0,
 total_cash: 0,
 total_qr: 0,
 transaction_count: 0,
 void_count: 0,
 refund_count: 0,
 shift_count: 0,
 };

 return NextResponse.json({
 summary: {
 ...summary,
 latest_qr_shift_close: !latestQrShiftCloseError && operationalClose ? latestQrShiftClose : null,
 business_started_at: businessStartedAt,
 payroll_started_at: payrollStartedAt,
 actual_work_ended_at: actualWorkEndedAt,
 },
 });
}
