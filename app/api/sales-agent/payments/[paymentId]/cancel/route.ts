import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { canAccessSalesAgent, isAdminRole } from '@/lib/auth/permissions';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile } from '@/lib/sales-agent/service';
import { cancelAgentPayment } from '@/lib/sales-agent/payment-gateway';

type PaymentRow = {
 id: string;
 organization_id: string;
 agent_account_id: string;
 status: string;
 gateway_ref: string | null;
};

export async function POST(
 request: Request,
 context: { params: Promise<{ paymentId: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!canAccessSalesAgent(profile.role)) {
 return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
 }

 const { paymentId } = await context.params;
 const body = await request.json().catch(() => ({}));
 const service = await createServiceClient();
 const isAdmin = isAdminRole(profile.role);
 const agentAccount = isAdmin
 ? null
 : await getAgentAccountForProfile(service, profile.id, profile.organization_id);

 const { data: payment } = await (service as SupabaseClient)
 .from('agent_online_payments')
 .select('id, organization_id, agent_account_id, status, gateway_ref')
 .eq('id', paymentId)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();

 const paymentRow = payment as PaymentRow | null;
 if (!paymentRow) {
 return NextResponse.json({ error: 'Pembayaran tidak dijumpai' }, { status: 404 });
 }

 if (!isAdmin && paymentRow.agent_account_id !== agentAccount?.id) {
 return NextResponse.json({ error: 'Tidak dibenarkan batal pembayaran ini' }, { status: 403 });
 }

 if (paymentRow.status !== 'PENDING' && paymentRow.status !== 'FAILED') {
 return NextResponse.json(
 { error: 'Hanya pembayaran pending/gagal boleh dibatalkan' },
 { status: 400 });
 }

 try {
 const result = await cancelAgentPayment(
 service as SupabaseClient,
 paymentRow.id,
 paymentRow.gateway_ref ?? undefined,
 typeof body.reason === 'string' ? body.reason : 'CANCELLED_BY_USER');
 return NextResponse.json({ ok: true, result });
 } catch (e) {
 return NextResponse.json(
 { error: e instanceof Error ? e.message : 'Batal pembayaran gagal' },
 { status: 400 });
 }
}
