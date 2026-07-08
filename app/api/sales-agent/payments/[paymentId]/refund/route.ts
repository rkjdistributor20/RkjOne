import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { refundAgentPayment } from '@/lib/sales-agent/payment-gateway';

const REFUND_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'FINANCE']);

type PaymentRow = {
 id: string;
 organization_id: string;
 status: string;
 amount_rm: number;
 gateway_ref: string | null;
};

export async function POST(
 request: Request,
 context: { params: Promise<{ paymentId: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 if (!REFUND_ROLES.has(profile.role)) {
 return NextResponse.json({ error: 'Hanya admin/finance boleh rekod refund' }, { status: 403 });
 }

 const { paymentId } = await context.params;
 const body = await request.json().catch(() => ({}));
 const service = await createServiceClient();

 const { data: payment } = await (service as SupabaseClient)
 .from('agent_online_payments')
 .select('id, organization_id, status, amount_rm, gateway_ref')
 .eq('id', paymentId)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();

 const paymentRow = payment as PaymentRow | null;
 if (!paymentRow) {
 return NextResponse.json({ error: 'Pembayaran tidak dijumpai' }, { status: 404 });
 }

 if (paymentRow.status !== 'PAID') {
 return NextResponse.json(
 { error: 'Hanya pembayaran PAID boleh direkod sebagai refund' },
 { status: 400 });
 }

 const refundRef =
 typeof body.refund_ref === 'string' && body.refund_ref.trim()
 ? body.refund_ref.trim()
 : `MANUAL-REFUND-${Date.now()}`;
 const reason =
 typeof body.reason === 'string' && body.reason.trim()
 ? body.reason.trim()
 : 'Manual refund recorded by admin/finance';

 try {
 const result = await refundAgentPayment(
 service as SupabaseClient,
 paymentRow.id,
 refundRef,
 reason,
 paymentRow.gateway_ref ?? undefined);
 return NextResponse.json({
 ok: true,
 result,
 refund: {
 payment_id: paymentRow.id,
 amount_rm: Number(paymentRow.amount_rm),
 refund_ref: refundRef,
 manual_gateway_refund_required: true,
 },
 });
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message : 'Refund gagal direkod' },
 { status: 400 });
 }
}
