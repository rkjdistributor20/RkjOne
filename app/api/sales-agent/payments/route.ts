import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { AGENT_POS_SUBSCRIPTION_RM, getAgentAccountForProfile, isAgentPaymentExempt } from '@/lib/sales-agent/service';
import { initiateAgentPayment, rejectAgentPayment } from '@/lib/sales-agent/payment-gateway';

type PaymentRow = {
 id: string;
 amount_rm: number;
 status: string;
 payment_method: string;
 purpose: string;
 provider?: string | null;
 gateway_ref?: string | null;
 gateway_session_id?: string | null;
 checkout_url?: string | null;
};

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 const purpose = body.purpose as 'STOCK_ORDER' | 'POS_SUBSCRIPTION';
 const referenceId = body.reference_id as string;
 const paymentMethod = body.payment_method as 'CARD' | 'DEBIT' | 'FPX';

 if (!purpose || !referenceId || !paymentMethod) {
 return NextResponse.json({ error: 'purpose, reference_id, payment_method diperlukan' }, { status: 400 });
 }

 const service = await createServiceClient();
 const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
 if (!account) return NextResponse.json({ error: 'Akaun ejen tiada' }, { status: 400 });

 if (await isAgentPaymentExempt(service, account)) {
 return NextResponse.json({ error: 'Akaun ejen ini tidak memerlukan bayaran online' }, { status: 400 });
 }

 let amount = 0;
 if (purpose === 'STOCK_ORDER') {
 const { data: order } = await (service as SupabaseClient).from('agent_stock_orders').select('total_amount_rm, status, agent_account_id').eq('id', referenceId).maybeSingle();
 const orderRow = order as {
 total_amount_rm: number;
 status: string;
 agent_account_id: string;
 } | null;
 if (!orderRow || orderRow.agent_account_id !== account.id) {
 return NextResponse.json({ error: 'Order tidak dijumpai' }, { status: 404 });
 }
 if (orderRow.status !== 'PENDING_PAYMENT' && orderRow.status !== 'DRAFT') {
 return NextResponse.json({ error: 'Order tidak boleh dibayar' }, { status: 400 });
 }
 amount = Number(orderRow.total_amount_rm);
 } else if (purpose === 'POS_SUBSCRIPTION') {
 const { data: sub } = await (service as SupabaseClient).from('agent_outlet_subscriptions').select('amount_rm, status, outlet:agent_outlets(agent_account_id)').eq('id', referenceId).maybeSingle();
 const subRow = sub as {
 amount_rm: number;
 status: string;
 outlet: { agent_account_id: string } | null;
 } | null;
 const outletAgent = subRow?.outlet?.agent_account_id;
 if (!subRow || outletAgent !== account.id) {
 return NextResponse.json({ error: 'Langganan tidak dijumpai' }, { status: 404 });
 }
 if (subRow.status !== 'PENDING') {
 return NextResponse.json({ error: 'Langganan tidak boleh dibayar' }, { status: 400 });
 }
 amount = Number(subRow.amount_rm ?? AGENT_POS_SUBSCRIPTION_RM);
 } else {
 return NextResponse.json({ error: 'Tujuan tidak sah' }, { status: 400 });
 }

 if (amount <= 0) {
 return NextResponse.json({ error: 'Jumlah bayaran tidak sah' }, { status: 400 });
 }

 const { data: payment, error } = await (service as SupabaseClient).from('agent_online_payments').insert({
 organization_id: profile.organization_id,
 agent_account_id: account.id,
 purpose,
 reference_type: purpose === 'STOCK_ORDER' ? 'agent_stock_orders' : 'agent_outlet_subscriptions',
 reference_id: referenceId,
 amount_rm: amount,
 payment_method: paymentMethod,
 status: 'PENDING',
 created_by: profile.id,
 }).select('id, amount_rm, status, payment_method, purpose, provider, gateway_ref, gateway_session_id, checkout_url').single();

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 const paymentRow = payment as PaymentRow;

 const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
 const statusUrl = `${appUrl}/api/sales-agent/payments/${paymentRow.id}/status`;
 const cancelUrl = `${appUrl}/api/sales-agent/payments/${paymentRow.id}/cancel`;
 const returnUrl = `${appUrl}/sales-agent/payment-return?payment=${paymentRow.id}`;
 let checkout;
 try {
 checkout = await initiateAgentPayment({
 paymentId: paymentRow.id,
 amountRm: amount,
 method: paymentMethod,
 purpose,
 payerEmail: profile.email ?? '',
 payerName: profile.full_name ?? account.company_name,
 returnUrl,
 cancelUrl,
 });
 } catch (e) {
 try {
 await rejectAgentPayment(
 service as SupabaseClient,
 paymentRow.id,
 undefined,
 'SESSION_CREATE_FAILED');
 } catch {
 await (service as SupabaseClient)
 .from('agent_online_payments')
 .update({ status: 'FAILED' })
 .eq('id', paymentRow.id);
 }

 return NextResponse.json(
 { error: e instanceof Error ? e.message : 'Gateway tidak tersedia' },
 { status: 503 });
 }

 await (service as SupabaseClient)
 .from('agent_online_payments')
 .update({
 provider: checkout.provider,
 gateway_ref: checkout.gateway_session_id ?? paymentRow.gateway_ref ?? null,
 gateway_session_id: checkout.gateway_session_id,
 checkout_url: checkout.checkout_url,
 })
 .eq('id', paymentRow.id);

 return NextResponse.json({
 payment: paymentRow,
 checkout,
 session: {
 id: paymentRow.id,
 provider: checkout.provider,
 mode: checkout.mode,
 checkout_url: checkout.checkout_url,
 gateway_session_id: checkout.gateway_session_id,
 status_url: statusUrl,
 cancel_url: cancelUrl,
 return_url: returnUrl,
 },
 });
}

