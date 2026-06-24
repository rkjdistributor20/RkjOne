import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile } from '@/lib/sales-agent/service';
import { getAgentReceiptForPayment } from '@/lib/sales-agent/receipt';

export async function GET(
  _request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (profile.role !== 'SALES_AGENT') {
    return NextResponse.json({ error: 'Hanya ejen jualan' }, { status: 403 });
  }

  const { paymentId } = await context.params;
  const service = await createServiceClient();
  const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
  if (!account) return NextResponse.json({ error: 'Akaun ejen tiada' }, { status: 400 });

  const { data: payment } = await (service as SupabaseClient)
    .from('agent_online_payments')
    .select('id, agent_account_id, purpose, amount_rm, payment_method, status, paid_at, created_at')
    .eq('id', paymentId)
    .maybeSingle();

  if (!payment || payment.agent_account_id !== account.id) {
    return NextResponse.json({ error: 'Pembayaran tidak dijumpai' }, { status: 404 });
  }

  let receipt = null;
  if (payment.status === 'PAID') {
    try {
      receipt = await getAgentReceiptForPayment(
        service as SupabaseClient,
        paymentId,
        account.id as string,
        profile.organization_id
      );
    } catch {
      receipt = null;
    }
  }

  return NextResponse.json({
    payment: {
      id: payment.id,
      purpose: payment.purpose,
      amount_rm: Number(payment.amount_rm),
      payment_method: payment.payment_method,
      status: payment.status,
      paid_at: payment.paid_at,
      created_at: payment.created_at,
    },
    receipt,
  });
}
