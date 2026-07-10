import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { canAccessSalesAgent } from '@/lib/auth/permissions';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile } from '@/lib/sales-agent/service';
import { getAgentReceiptForPayment } from '@/lib/sales-agent/receipt';

export async function GET(
 _request: Request,
 context: { params: Promise<{ paymentId: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!canAccessSalesAgent(profile.role)) {
 return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
 }

 const { paymentId } = await context.params;
 const service = await createServiceClient();
 const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
 if (!account) return NextResponse.json({ error: 'Akaun ejen tiada' }, { status: 400 });

 const { data: payment } = await (service as SupabaseClient)
 .from('agent_online_payments')
 .select('id, agent_account_id, purpose, reference_type, reference_id, amount_rm, payment_method, status, paid_at, created_at, provider, gateway_ref, gateway_session_id, checkout_url, failure_reason, cancelled_at, refunded_at, refund_ref, refund_reason')
 .eq('id', paymentId)
 .maybeSingle();

 if (!payment || payment.agent_account_id !== account.id) {
 return NextResponse.json({ error: 'Pembayaran tidak dijumpai' }, { status: 404 });
 }

 const lifecycleStatus =
 payment.status === 'FAILED' && payment.cancelled_at ? 'CANCELLED' : payment.status;
 const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

 let receipt = null;
 if (payment.status === 'PAID') {
 try {
 receipt = await getAgentReceiptForPayment(
 service as SupabaseClient,
 paymentId,
 account.id as string,
 profile.organization_id);
 } catch {
 receipt = null;
 }
 }

 return NextResponse.json({
 payment: {
 id: payment.id,
 purpose: payment.purpose,
 reference_type: payment.reference_type,
 reference_id: payment.reference_id,
 amount_rm: Number(payment.amount_rm),
 payment_method: payment.payment_method,
 status: payment.status,
 lifecycle_status: lifecycleStatus,
 paid_at: payment.paid_at,
 created_at: payment.created_at,
 provider: payment.provider,
 gateway_ref: payment.gateway_ref,
 gateway_session_id: payment.gateway_session_id,
 checkout_url: payment.checkout_url,
 failure_reason: payment.failure_reason,
 cancelled_at: payment.cancelled_at,
 refunded_at: payment.refunded_at,
 refund_ref: payment.refund_ref,
 refund_reason: payment.refund_reason,
 next_action:
 lifecycleStatus === 'PENDING'
 ? {
 type: 'checkout',
 checkout_url: payment.checkout_url,
 cancel_url: `${appUrl}/api/sales-agent/payments/${payment.id}/cancel`,
 }
 : null,
 },
 receipt,
 });
}
