import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile } from '@/lib/sales-agent/service';
import { buildIPay88PaymentForm, getIPay88Config } from '@/lib/sales-agent/ipay88';
import type { OnlinePaymentMethod } from '@/lib/sales-agent/types';

export async function GET(
 _request: Request,
 context: { params: Promise<{ paymentId: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (profile.role !== 'SALES_AGENT') {
 return NextResponse.json({ error: 'Hanya ejen jualan' }, { status: 403 });
 }

 const { paymentId } = await context.params;
 const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rkj-one.vercel.app';
 const config = getIPay88Config(appUrl, paymentId);
 if (!config) {
 return NextResponse.json(
 { error: 'Gateway iPay88 belum dikonfigurasi - set MERCHANT_ID + API_KEY di Vercel' },
 { status: 503 });
 }

 const service = await createServiceClient();
 const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
 if (!account) return NextResponse.json({ error: 'Akaun ejen tiada' }, { status: 400 });

 const { data: payment } = await (service as SupabaseClient).from('agent_online_payments').select('id, agent_account_id, amount_rm, payment_method, purpose, status').eq('id', paymentId).maybeSingle();

 if (!payment || payment.agent_account_id !== account.id) {
 return NextResponse.json({ error: 'Pembayaran tidak dijumpai' }, { status: 404 });
 }
 if (payment.status !== 'PENDING') {
 return NextResponse.json({ error: 'Pembayaran tidak boleh diproses' }, { status: 400 });
 }

 const purposeLabel =
 payment.purpose === 'POS_SUBSCRIPTION' ? 'Langganan POS Ejen' : 'Order Stok Ejen RKJ';

 const form = buildIPay88PaymentForm({
 config,
 paymentId: payment.id as string,
 refNo: String(payment.id).replace(/-/g, '').slice(0, 30),
 amountRm: Number(payment.amount_rm),
 method: payment.payment_method as OnlinePaymentMethod,
 payerName: profile.full_name ?? account.company_name,
 payerEmail: profile.email ?? account.contact_email ?? 'rkjdistributor20@gmail.com',
 payerPhone: account.contact_phone ?? undefined,
 description: `${purposeLabel} - ${account.company_name}`,
 });

 return NextResponse.json({ form });
}
