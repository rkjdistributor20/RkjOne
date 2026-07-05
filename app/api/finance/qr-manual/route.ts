import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

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
 .limit(100);

 if (status) query = query.eq('status', status);

 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ payments: data ?? [] });
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

 const supabase = await createClient();
 const db = supabase as SupabaseClient;
 const { data: payment, error: loadError } = await db
 .from('pos_online_payments')
 .select('id, status, sale_payload')
 .eq('id', body.payment_id)
 .eq('organization_id', profile.organization_id)
 .eq('provider', 'manual_qr')
 .maybeSingle();

 if (loadError) return NextResponse.json({ error: loadError.message }, { status: 400 });
 const paymentRow = payment as { id: string; status: string; sale_payload: unknown } | null;
 if (!paymentRow) return NextResponse.json({ error: 'Rekod QR manual tidak dijumpai' }, { status: 404 });

 const now = new Date().toISOString();
 const salePayload =
 typeof paymentRow.sale_payload === 'object' && paymentRow.sale_payload !== null && !Array.isArray(paymentRow.sale_payload)
 ? paymentRow.sale_payload as Record<string, unknown>
 : {};

 const patch: Record<string, unknown> = {
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
 .select('id, status, paid_at, failed_at, sale_payload')
 .single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ payment: data });
}
