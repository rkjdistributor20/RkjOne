import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import type { CreateSalePayload, SaleResult } from '@/lib/pos/types';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get('branch_id') ?? profile.branch_id;
  const shiftId = searchParams.get('shift_id');
  const limit = Number(searchParams.get('limit') ?? 50);

  if (!branchId) {
    return NextResponse.json({ error: 'Branch required' }, { status: 400 });
  }

  const supabase = await createClient();

  let query = supabase
    .from('pos_transactions')
    .select(
      `
      *,
      pos_transaction_items (*)
    `
    )
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (shiftId) {
    query = query.eq('shift_id', shiftId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transactions: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as CreateSalePayload;

  if (!body.shiftId || !body.branchId || !body.items?.length) {
    return NextResponse.json({ error: 'Invalid sale payload' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await callRpc(supabase, 'process_pos_sale', {
    p_shift_id: body.shiftId,
    p_branch_id: body.branchId,
    p_items: body.items,
    p_payment_method: body.payment_method,
    p_cash_amount: body.cash_amount,
    p_qr_amount: body.qr_amount,
    p_discount: body.discount ?? 0,
    p_offline_id: body.offline_id ?? null,
    p_receipt_email: body.receipt_email ?? null,
    p_receipt_phone: body.receipt_phone ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ result: data as SaleResult });
}
