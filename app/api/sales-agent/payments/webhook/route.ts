import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import {
  fulfillAgentPayment,
  verifyGatewayWebhookSignature,
} from '@/lib/sales-agent/payment-gateway';

/**
 * Webhook gateway bayaran (iPay88 / FPX / kad).
 * Body: { payment_id, gateway_ref, status: 'PAID' | 'FAILED', signature? }
 */
export async function POST(request: Request) {
  const raw = await request.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const signature = request.headers.get('x-rkj-payment-signature');
  if (!verifyGatewayWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const paymentId = body.payment_id as string | undefined;
  const gatewayRef = (body.gateway_ref as string) ?? `GW-${Date.now()}`;
  const status = body.status as string | undefined;

  if (!paymentId) {
    return NextResponse.json({ error: 'payment_id required' }, { status: 400 });
  }

  if (status !== 'PAID') {
    const service = await createServiceClient();
    await (service as SupabaseClient)
      .from('agent_online_payments')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', paymentId);
    return NextResponse.json({ ok: true, status: 'FAILED' });
  }

  try {
    const service = await createServiceClient();
    const result = await fulfillAgentPayment(service as SupabaseClient, paymentId, gatewayRef);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Fulfill failed' },
      { status: 400 }
    );
  }
}
