import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { getCurrentProfile } from '@/lib/auth/session';
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

  const { data: shift, error } = await supabase
    .from('pos_shifts')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', 'OPEN')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shift: shift as PosShiftSummary | null });
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

  const { data, error } = await callRpc(supabase, 'open_pos_shift', {
    p_branch_id: branchId,
    p_opening_cash: openingCash,
    p_staff_id: body.staff_id ?? null,
  });

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to open shift' }, { status: 400 });
  }

  const openResult = data as { shift_id: string };

  const { data: shift } = await supabase
    .from('pos_shifts')
    .select('*')
    .eq('id', openResult.shift_id)
    .single();

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
  const { shift_id, closing_cash, notes } = body;

  if (!shift_id || closing_cash === undefined) {
    return NextResponse.json({ error: 'shift_id and closing_cash required' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await callRpc(supabase, 'close_pos_shift', {
    p_shift_id: shift_id,
    p_closing_cash: Number(closing_cash),
    p_notes: notes ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ result: data });
}
