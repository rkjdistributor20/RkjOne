import { NextResponse } from 'next/server';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertActivePosShiftMember,
 assertAreaManagerScheduledForPos,
 assertCanAccessPosBranch,
} from '@/lib/pos/access';
import type { OfflineSalePayload } from '@/lib/pos/types';
import { assertOfficialPosDevice } from '@/lib/pos/device-auth';

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
 const checkedBranches = new Map<string, {
  id: string;
  enrollmentGeneration: number;
 }>();
 const checkedShifts = new Set<string>();

 for (const sale of sales) {
 const offlineId = typeof sale.offlineId === 'string' && sale.offlineId
  ? sale.offlineId
  : 'offline-tidak-sah';
 if (!sale.branchId) {
 failed.push({ offlineId, error: 'branchId diperlukan' });
 continue;
 }
 if (sale.payment_method !== 'CASH' || sale.qr_amount !== 0) {
 failed.push({
  offlineId,
  error: 'Jualan luar talian hanya dibenarkan untuk bayaran tunai tanpa amaun QR',
 });
 continue;
 }
 if (!sale.actorId || sale.actorId !== profile.id) {
 failed.push({
  offlineId,
  error: 'Jualan luar talian ini bukan milik staf yang sedang log masuk',
 });
 continue;
 }
 if (!sale.deviceId || !Number.isInteger(sale.enrollmentGeneration)
  || sale.enrollmentGeneration < 1) {
 failed.push({
  offlineId,
  error: 'Identiti tablet asal untuk jualan luar talian tidak lengkap',
 });
 continue;
 }

 let verifiedDevice = checkedBranches.get(sale.branchId);
 if (!verifiedDevice) {
 try {
 await assertCanAccessPosBranch(supabase, profile, sale.branchId);
 await assertAreaManagerScheduledForPos(supabase, profile, sale.branchId);
 const device = await assertOfficialPosDevice(profile, sale.branchId);
 verifiedDevice = {
  id: device.id,
  enrollmentGeneration: device.enrollmentGeneration,
 };
 checkedBranches.set(sale.branchId, verifiedDevice);
 } catch (err) {
 failed.push({
 offlineId,
 error: err instanceof Error ? err.message : 'Akses cawangan ditolak',
 });
 continue;
 }
 }
 if (sale.deviceId !== verifiedDevice.id
  || sale.enrollmentGeneration !== verifiedDevice.enrollmentGeneration) {
 failed.push({
  offlineId,
  error: 'Tablet atau generasi enrolmen jualan luar talian tidak sepadan',
 });
 continue;
 }

 const shiftKey = `${sale.branchId}:${sale.shiftId}`;
 if (!checkedShifts.has(shiftKey)) {
 try {
  await assertActivePosShiftMember(
   supabase,
   profile,
   sale.shiftId,
   sale.branchId,
  );
  checkedShifts.add(shiftKey);
 } catch (err) {
  failed.push({
   offlineId,
   error: err instanceof Error ? err.message : 'Keahlian syif aktif diperlukan',
  });
  continue;
 }
 }

 const { error } = await callRpc(createAdminClient(), 'process_registered_pos_cash_sale', {
 p_actor_id: profile.id,
 p_device_id: verifiedDevice.id,
 p_enrollment_generation: verifiedDevice.enrollmentGeneration,
 p_shift_id: sale.shiftId,
 p_branch_id: sale.branchId,
 p_sale: {
  items: sale.items,
  payment_method: sale.payment_method,
  cash_amount: sale.cash_amount,
  qr_amount: sale.qr_amount,
  discount: sale.discount ?? 0,
  offline_id: sale.offlineId,
 },
 });

 if (error) {
 failed.push({ offlineId, error: error.message });
 } else {
 synced.push(offlineId);
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
 try {
  const { branchIds } = await resolveScopedBranches(supabase, profile);
  if (!branchIds?.length) return NextResponse.json({ branches: [] });
  query = query.in('id', branchIds);
 } catch {
  return NextResponse.json({ error: 'Skop cawangan tidak dapat disahkan' }, { status: 403 });
 }
 } else if (profile.role === 'STAFF') {
 if (!profile.branch_id) return NextResponse.json({ branches: [] });
 query = query.eq('id', profile.branch_id);
 } else if (!['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER'].includes(profile.role)) {
 return NextResponse.json({ branches: [] });
 }

 const { data: branches } = await query;

 return NextResponse.json({ branches: branches ?? [] });
}
