import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import {
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';

export async function GET(
 _request: Request,
 context: { params: Promise<{ paymentId: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { paymentId } = await context.params;
 const service = createAdminClient();
 const { data, error } = await service.from('pos_online_payments').select(
  'id, branch_id, shift_id, amount_rm, status, gateway_ref, paid_at, transaction_id, expires_at',
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

 let payment = data;
 if (payment.status === 'PENDING'
  && payment.expires_at
  && new Date(payment.expires_at).getTime() <= Date.now()) {
  const now = new Date().toISOString();
  const { data: expired } = await service
   .from('pos_online_payments')
   .update({ status: 'EXPIRED', failed_at: now, updated_at: now })
   .eq('id', payment.id)
   .eq('status', 'PENDING')
   .select('id, branch_id, shift_id, amount_rm, status, gateway_ref, paid_at, transaction_id, expires_at')
   .maybeSingle();
  payment = expired ?? payment;
 }

 let result = null;
 if (payment.status === 'PAID' && payment.transaction_id) {
  const { data: receipt } = await service
   .from('pos_receipts')
   .select('receipt_data')
   .eq('transaction_id', payment.transaction_id)
   .maybeSingle();
  result = receipt?.receipt_data ?? null;
 }

 return NextResponse.json({ payment, result });
}
