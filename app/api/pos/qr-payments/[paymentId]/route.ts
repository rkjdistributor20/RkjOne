import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import {
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import { isFiuuReconciliationExpired } from '@/lib/pos/fiuu';

export async function GET(
 _request: Request,
 context: { params: Promise<{ paymentId: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { paymentId } = await context.params;
 const service = createAdminClient();
 const { data, error } = await service.from('pos_online_payments').select(
  'id, branch_id, shift_id, amount_rm, status, provider, gateway_ref, paid_at, transaction_id, expires_at, provider_result',
 ).eq('id', paymentId).eq('organization_id', profile.organization_id).maybeSingle();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 if (!data) return NextResponse.json({ error: 'QR payment tidak dijumpai' }, { status: 404 });

 try {
  await assertCanAccessPosBranch(service, profile, data.branch_id);
 } catch (err) {
  return NextResponse.json(
   { error: err instanceof Error ? err.message : 'Akses cawangan ditolak' },
   { status: posAccessErrorStatus(err) });
 }

 const providerResult = data.provider_result && typeof data.provider_result === 'object'
  && !Array.isArray(data.provider_result)
  ? data.provider_result as Record<string, unknown>
  : null;
 const vtReported = data.provider === 'fiuu_vt'
  && data.status === 'PENDING'
  && providerResult?.opType === 'STATUS'
  && providerResult?.status === '00';
 const payment = vtReported
  ? { ...data, status: 'REPORTED' }
  : data.status === 'PENDING'
  && data.expires_at
  && isFiuuReconciliationExpired(data.expires_at)
  ? { ...data, status: 'EXPIRED' }
  : data;

 let result = null;
 if (payment.status === 'PAID' && payment.transaction_id) {
  const { data: receipt } = await service
   .from('pos_receipts')
   .select('receipt_data')
   .eq('transaction_id', payment.transaction_id)
   .maybeSingle();
  result = receipt?.receipt_data ?? null;
 }

 return NextResponse.json({
  payment: {
   id: payment.id,
   branch_id: payment.branch_id,
   shift_id: payment.shift_id,
   amount_rm: payment.amount_rm,
   status: payment.status,
   gateway_ref: payment.gateway_ref,
   paid_at: payment.paid_at,
   transaction_id: payment.transaction_id,
   expires_at: payment.expires_at,
  },
  result,
 });
}
