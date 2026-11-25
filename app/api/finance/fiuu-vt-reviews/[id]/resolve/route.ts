import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

const REVIEW_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'FINANCE']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const OUTCOMES = new Set(['CONFIRMED_NOT_CHARGED', 'CONFIRMED_CHARGED']);

type ResolveOutcome = 'CONFIRMED_NOT_CHARGED' | 'CONFIRMED_CHARGED';
type ResolveRpcClient = {
 rpc: (
 name: 'resolve_pos_fiuu_vt_review_for_shift',
 args: {
 p_payment_id: string;
 p_actor_id: string;
 p_outcome: ResolveOutcome;
 p_provider_transaction_id: string | null;
 p_notes: string;
 }) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export async function POST(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!REVIEW_ROLES.has(profile.role)) {
 return NextResponse.json({ error: 'Tiada akses semakan Fiuu VT' }, { status: 403 });
 }

 const { id } = await params;
 if (!UUID_PATTERN.test(id)) {
 return NextResponse.json({ error: 'ID bayaran tidak sah' }, { status: 400 });
 }

 const body = (await request.json().catch(() => null)) as {
 outcome?: string;
 providerTransactionId?: string | null;
 notes?: string;
 } | null;
 const outcome = typeof body?.outcome === 'string' ? body.outcome.trim() as ResolveOutcome : undefined;
 const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
 const providerTransactionId = typeof body?.providerTransactionId === 'string'
 ? body.providerTransactionId.trim() || null
 : null;

 if (!outcome || !OUTCOMES.has(outcome)) {
 return NextResponse.json({ error: 'Keputusan semakan tidak sah' }, { status: 400 });
 }
 if (notes.length < 10 || notes.length > 1000) {
 return NextResponse.json({ error: 'Catatan bermakna sekurang-kurangnya 10 aksara diperlukan' }, { status: 400 });
 }
 if (outcome === 'CONFIRMED_CHARGED') {
 if (!providerTransactionId || !PROVIDER_TRANSACTION_ID_PATTERN.test(providerTransactionId)) {
 return NextResponse.json({ error: 'ID transaksi penyedia yang sah diperlukan' }, { status: 400 });
 }
 }

 const db = createAdminClient() as unknown as ResolveRpcClient;
 const { data, error } = await db.rpc('resolve_pos_fiuu_vt_review_for_shift', {
 p_payment_id: id,
 p_actor_id: profile.id,
 p_outcome: outcome,
 p_provider_transaction_id: outcome === 'CONFIRMED_CHARGED' ? providerTransactionId : null,
 p_notes: notes,
 });

 if (error) {
 if (error.code === '23505') {
 return NextResponse.json({
 error: 'Rujukan atau pesanan ini sudah dipadankan dengan jualan. Jangan cipta jualan kedua; semak caj pendua atau rujukan tersebut di Fiuu.',
 }, { status: 409 });
 }
 return NextResponse.json({
 error: 'Resolusi gagal. Pastikan transaksi masih dalam kuarantin dan bukti semakan lengkap.',
 }, { status: 400 });
 }

 return NextResponse.json({ result: data });
}
