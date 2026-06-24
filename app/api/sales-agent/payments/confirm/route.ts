import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile } from '@/lib/sales-agent/service';
import { fulfillAgentPayment, isSimulatePaymentAllowed } from '@/lib/sales-agent/payment-gateway';
import { getAgentReceiptForPayment } from '@/lib/sales-agent/receipt';

/** Hanya mod simulate (dev/UAT) — production mesti pengesahan bank iPay88. */
export async function POST(request: Request) {
  if (!isSimulatePaymentAllowed()) {
    return NextResponse.json(
      {
        error:
          'Bayaran mesti melalui FPX/kad (iPay88). Pengesahan bank diperlukan — tempahan tidak disahkan tanpa bayaran berjaya.',
      },
      { status: 403 }
    );
  }
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (profile.role !== 'SALES_AGENT') {
    return NextResponse.json({ error: 'Hanya ejen jualan' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const paymentId = body.payment_id as string | undefined;
  if (!paymentId) return NextResponse.json({ error: 'payment_id diperlukan' }, { status: 400 });

  const service = await createServiceClient();
  const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
  if (!account) return NextResponse.json({ error: 'Akaun ejen tiada' }, { status: 400 });

  const { data: payment } = await (service as SupabaseClient)
    .from('agent_online_payments')
    .select('id, agent_account_id, status')
    .eq('id', paymentId)
    .maybeSingle();

  const payRow = payment as { id: string; agent_account_id: string; status: string } | null;
  if (!payRow || payRow.agent_account_id !== account.id) {
    return NextResponse.json({ error: 'Pembayaran tidak dijumpai' }, { status: 404 });
  }

  const gatewayRef = `RKJ-SIM-${Date.now()}`;
  try {
    const result = await fulfillAgentPayment(service as SupabaseClient, paymentId, gatewayRef);
    const receipt = await getAgentReceiptForPayment(
      service as SupabaseClient,
      paymentId,
      account.id as string,
      profile.organization_id
    );
    return NextResponse.json({ ok: true, result, gateway_ref: gatewayRef, receipt });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gagal' }, { status: 400 });
  }
}
