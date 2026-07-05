import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyPosBillplzSignature } from '@/lib/pos/qr-gateway';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export async function POST(request: Request) {
 const limited = enforceRateLimit(request, {
 key: 'pos-qr-webhook',
 limit: 180,
 windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const raw = await request.text();
 const body = Object.fromEntries(new URLSearchParams(raw));

 if (!body.id || !body.collection_id) {
 return NextResponse.json({ error: 'Invalid Billplz payload' }, { status: 400 });
 }

 if (!verifyPosBillplzSignature(body)) {
 return NextResponse.json({ error: 'Invalid POS Billplz signature' }, { status: 401 });
 }

 const service = await createServiceClient();
 const gatewayRef = String(body.id);
 const paymentIdFromReference = typeof body.reference_1 === 'string' ? body.reference_1 : null;
 const paid = String(body.paid) === 'true' && String(body.state) === 'paid';

 let query = (service as SupabaseClient).from('pos_online_payments').select('id, status').eq('provider', 'billplz');

 query = paymentIdFromReference ? query.eq('id', paymentIdFromReference) : query.eq('gateway_ref', gatewayRef);
 const { data: payment } = await query.maybeSingle();

 if (!payment) return NextResponse.json({ error: 'POS QR payment tidak dijumpai' }, { status: 404 });

 await (service as SupabaseClient).from('pos_online_payments').update({
 status: paid ? 'PAID' : 'FAILED',
 gateway_ref: gatewayRef,
 paid_at: paid ? new Date().toISOString() : null,
 failed_at: paid ? null : new Date().toISOString(),
 updated_at: new Date().toISOString(),
 }).eq('id', payment.id);

 return NextResponse.json({ ok: true, status: paid ? 'PAID' : 'FAILED' });
}
