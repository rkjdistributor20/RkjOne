import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/auth/session';
import type { Database, Json } from '@/types/database';

type PosOnlinePaymentUpdate = Database['public']['Tables']['pos_online_payments']['Update'];

function isJsonObject(value: Json): value is { [key: string]: Json | undefined } {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REVIEW_ROLES = new Set([
 'SUPER_ADMIN',
 'ADMIN',
 'FINANCE',
 'OPERATION_MANAGER',
 'AREA_MANAGER',
]);

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!REVIEW_ROLES.has(profile.role)) {
 return NextResponse.json({ error: 'Tiada akses pengesahan QR manual' }, { status: 403 });
 }

 const { searchParams } = new URL(request.url);
 const status = searchParams.get('status') ?? undefined;
 const requestedLimit = Number(searchParams.get('limit') ?? 30);
 const limit = Number.isFinite(requestedLimit)
 ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
 : 30;
 const supabase = await createClient();
 const db = supabase as SupabaseClient;

 let query = db
 .from('pos_online_payments')
 .select(`
 id,
 amount_rm,
 status,
 provider,
 gateway_ref,
 paid_at,
 failed_at,
 created_at,
 transaction_id,
 sale_payload,
 branch:branches(branch_code, branch_name),
 transaction:pos_transactions(transaction_number, total, payment_method, created_at)
 `)
 .eq('organization_id', profile.organization_id)
 .eq('provider', 'manual_qr')
 .order('created_at', { ascending: false })
 .limit(limit);

 if (status) query = query.eq('status', status);

 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ payments: data ?? [] }, {
 headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
 });
}

export async function PATCH(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!REVIEW_ROLES.has(profile.role)) {
 return NextResponse.json({ error: 'Tiada akses pengesahan QR manual' }, { status: 403 });
 }

 const body = (await request.json().catch(() => ({}))) as {
 payment_id?: string;
 status?: 'PAID' | 'FAILED' | 'CANCELLED';
 notes?: string;
 };

 if (!body.payment_id || !body.status || !['PAID', 'FAILED', 'CANCELLED'].includes(body.status)) {
 return NextResponse.json({ error: 'payment_id dan status sah diperlukan' }, { status: 400 });
 }

 const db = createAdminClient();
 const { data: payment, error: loadError } = await db
 .from('pos_online_payments')
 .select('id, status, sale_payload')
 .eq('id', body.payment_id)
 .eq('organization_id', profile.organization_id)
 .eq('provider', 'manual_qr')
 .maybeSingle();

 if (loadError) return NextResponse.json({ error: loadError.message }, { status: 400 });
 if (!payment) return NextResponse.json({ error: 'Rekod QR manual tidak dijumpai' }, { status: 404 });

 const now = new Date().toISOString();
 const salePayload = isJsonObject(payment.sale_payload) ? payment.sale_payload : {};

 const patch: PosOnlinePaymentUpdate = {
 status: body.status,
 updated_at: now,
 sale_payload: {
 ...salePayload,
 manual_verification_status: body.status,
 manual_verification_notes: body.notes?.trim() || null,
 manual_verified_by: profile.id,
 manual_verified_by_name: profile.full_name,
 manual_verified_at: now,
 },
 };

 if (body.status === 'PAID') {
 patch.paid_at = now;
 patch.failed_at = null;
 } else {
 patch.failed_at = now;
 }

 const { data, error } = await db
 .from('pos_online_payments')
 .update(patch)
 .eq('id', body.payment_id)
 .eq('organization_id', profile.organization_id)
 .eq('provider', 'manual_qr')
 .select('id, status, paid_at, failed_at, sale_payload')
 .single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ payment: data });
}
