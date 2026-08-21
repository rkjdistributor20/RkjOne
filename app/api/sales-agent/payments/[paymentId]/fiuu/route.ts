import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { canAccessSalesAgent } from '@/lib/auth/permissions';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile } from '@/lib/sales-agent/service';
import { buildFiuuHostedPaymentForm, getFiuuAgentConfig } from '@/lib/sales-agent/fiuu';
import type { OnlinePaymentMethod } from '@/lib/sales-agent/types';

export async function GET(
 _request: Request,
 context: { params: Promise<{ paymentId: string }> },
) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!canAccessSalesAgent(profile.role)) {
 return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
 }

 const config = getFiuuAgentConfig();
 if (!config) {
 return NextResponse.json(
 { error: 'Fiuu Agent Payment belum dikonfigurasi untuk environment ini' },
 { status: 503 },
 );
 }

 const { paymentId } = await context.params;
 const service = await createServiceClient();
 const account = await getAgentAccountForProfile(
 service,
 profile.id,
 profile.organization_id,
 );
 if (!account) return NextResponse.json({ error: 'Akaun ejen tiada' }, { status: 400 });

 const { data: payment } = await (service as SupabaseClient)
 .from('agent_online_payments')
 .select('id, agent_account_id, amount_rm, payment_method, purpose, status, provider, gateway_session_id')
 .eq('id', paymentId)
 .maybeSingle();
 if (!payment || payment.agent_account_id !== account.id || payment.provider !== 'fiuu') {
 return NextResponse.json({ error: 'Pembayaran Fiuu tidak dijumpai' }, { status: 404 });
 }
 if (payment.status !== 'PENDING') {
 return NextResponse.json({ error: 'Pembayaran tidak boleh diproses' }, { status: 400 });
 }

 const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rkj.one';
 const form = buildFiuuHostedPaymentForm({
 appUrl,
 config,
 paymentId: String(payment.id),
 amountRm: Number(payment.amount_rm),
 method: payment.payment_method as OnlinePaymentMethod,
 purpose: payment.purpose as 'STOCK_ORDER' | 'POS_SUBSCRIPTION',
 payerEmail: profile.email ?? account.contact_email ?? '',
 payerName: profile.full_name ?? account.company_name,
 returnUrl: `${appUrl}/sales-agent/payment-return?payment=${payment.id}`,
 cancelUrl: `${appUrl}/sales-agent/payment-return?payment=${payment.id}`,
 });
 if (payment.gateway_session_id !== form.orderId) {
 return NextResponse.json({ error: 'Rujukan checkout Fiuu tidak sepadan' }, { status: 409 });
 }

 return NextResponse.json({
 form: {
 action: form.action,
 fields: form.fields,
 },
 });
}

