import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertAreaManagerScheduledForPos,
 assertCanAccessPosBranch,
} from '@/lib/pos/access';
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
 const checkedBranches = new Set<string>();

 for (const sale of sales) {
 if (!sale.branchId) {
 failed.push({ offlineId: sale.offlineId, error: 'branchId diperlukan' });
 continue;
 }

 if (!checkedBranches.has(sale.branchId)) {
 try {
 await assertCanAccessPosBranch(supabase, profile, sale.branchId);
 await assertAreaManagerScheduledForPos(supabase, profile, sale.branchId);
 checkedBranches.add(sale.branchId);
 } catch (err) {
 failed.push({
 offlineId: sale.offlineId,
 error: err instanceof Error ? err.message : 'Akses cawangan ditolak',
 });
 continue;
 }
 }

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

 let query = supabase
 .from('branches')
 .select('id, branch_code, branch_name, region_id')
 .eq('organization_id', profile.organization_id)
 .eq('status', 'ACTIVE')
 .order('branch_code');

 if (profile.role === 'AREA_MANAGER') {
 if (!profile.region_id) return NextResponse.json({ branches: [] });
 query = query.eq('region_id', profile.region_id);
 } else if (profile.role === 'STAFF') {
 if (!profile.branch_id) return NextResponse.json({ branches: [] });
 query = query.eq('id', profile.branch_id);
 } else if (!['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER'].includes(profile.role)) {
 return NextResponse.json({ branches: [] });
 }

 const { data: branches } = await query;

 return NextResponse.json({ branches: branches ?? [] });
}
