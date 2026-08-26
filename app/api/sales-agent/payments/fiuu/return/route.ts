import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { getFiuuAgentConfig, parseFiuuCallback, verifyFiuuCallback } from '@/lib/sales-agent/fiuu';

async function handleReturn(request: Request, body: Record<string, unknown>) {
 const config = getFiuuAgentConfig();
 if (!config) return new NextResponse('Not configured', { status: 503 });
 const callback = parseFiuuCallback(body);
 if (!verifyFiuuCallback(callback, config) || !callback.orderId) {
 return new NextResponse('Invalid payment response', { status: 401 });
 }

 const service = await createServiceClient();
 const { data: payment } = await (service as SupabaseClient)
 .from('agent_online_payments')
 .select('id')
 .eq('provider', 'fiuu')
 .eq('gateway_session_id', callback.orderId)
 .maybeSingle();
 if (!payment) return new NextResponse('Payment not found', { status: 404 });

 const redirectUrl = new URL('/sales-agent/payment-return', request.url);
 redirectUrl.searchParams.set('payment', String(payment.id));
 return NextResponse.redirect(redirectUrl, 303);
}

export async function POST(request: Request) {
 const contentType = request.headers.get('content-type') ?? '';
 const raw = await request.text();
 let body: Record<string, unknown>;
 try {
 body = contentType.includes('application/json')
 ? raw ? JSON.parse(raw) as Record<string, unknown> : {}
 : Object.fromEntries(new URLSearchParams(raw));
 } catch {
 return new NextResponse('Invalid request', { status: 400 });
 }
 return handleReturn(request, body);
}

export async function GET(request: Request) {
 const url = new URL(request.url);
 return handleReturn(request, Object.fromEntries(url.searchParams));
}

