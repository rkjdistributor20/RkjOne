import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import type { OfflineSalePayload } from '@/lib/pos/types';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const sales = (body.sales ?? []) as OfflineSalePayload[];

  if (!sales.length) {
    return NextResponse.json({ synced: [], failed: [] });
  }

  const supabase = await createClient();
  const synced: string[] = [];
  const failed: Array<{ offlineId: string; error: string }> = [];

  for (const sale of sales) {
    const { error } = await callRpc(supabase, 'process_pos_sale', {
      p_shift_id: sale.shiftId,
      p_branch_id: sale.branchId,
      p_items: sale.items,
      p_payment_method: sale.payment_method,
      p_cash_amount: sale.cash_amount,
      p_qr_amount: sale.qr_amount,
      p_discount: sale.discount ?? 0,
      p_offline_id: sale.offlineId,
    });

    if (error) {
      failed.push({ offlineId: sale.offlineId, error: error.message });
    } else {
      synced.push(sale.offlineId);
    }
  }

  return NextResponse.json({ synced, failed });
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: branches } = await supabase
    .from('branches')
    .select('id, branch_code, branch_name, region_id')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'ACTIVE')
    .order('branch_code');

  return NextResponse.json({ branches: branches ?? [] });
}
