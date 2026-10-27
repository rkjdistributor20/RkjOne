import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';

const SESSION_CLOCK_SKEW_MS = 5_000;

type ForcedPasswordProfile = {
 status: string;
 must_change_password: boolean;
 updated_at: string | null;
 metadata: Record<string, unknown> | null;
};

function timestamp(value: unknown) {
 if (typeof value !== 'string') return Number.NaN;
 return Date.parse(value);
}

export async function POST(request: Request) {
 const limited = enforceRateLimit(request, {
 key: 'auth-change-password',
 limit: 6,
 windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const body = await request.json().catch(() => null);
 const newPassword = body?.newPassword as string | undefined;

 if (!newPassword) {
 return NextResponse.json(
 { error: 'Kata laluan baharu diperlukan.' },
 { status: 400 });
 }

 if (newPassword.length < 8) {
 return NextResponse.json(
 { error: 'Kata laluan baharu mesti sekurang-kurangnya 8 aksara.' },
 { status: 400 });
 }

 const supabase = await createClient();
 const {
 data: { user },
 } = await supabase.auth.getUser();

 if (!user?.email) {
 return NextResponse.json({ error: 'Sesi tamat. Sila log masuk semula.' }, { status: 401 });
 }

 const { data: rawProfile, error: profileLookupError } = await supabase
 .from('profiles')
 .select('status, must_change_password, updated_at, metadata')
 .eq('id', user.id)
 .maybeSingle();
 const profile = rawProfile as ForcedPasswordProfile | null;

 if (profileLookupError) {
 return NextResponse.json(
 { error: 'Profil tidak dapat disahkan buat sementara waktu.' },
 { status: 503 });
 }

 if (!profile || profile.status !== 'ACTIVE') {
 return NextResponse.json({ error: 'Akaun tidak aktif.' }, { status: 403 });
 }

 if (!profile.must_change_password) {
 return NextResponse.json(
 { error: 'Kata laluan tidak lagi perlu ditukar. Sila log masuk semula.' },
 { status: 409 });
 }

 const resetAt = timestamp(
 profile.metadata?.password_reset_at ?? profile.updated_at);
 const signedInAt = timestamp(user.last_sign_in_at);

 if (
 !Number.isFinite(resetAt) ||
 !Number.isFinite(signedInAt) ||
 signedInAt + SESSION_CLOCK_SKEW_MS < resetAt
 ) {
 return NextResponse.json(
 {
 error:
 'Sesi ini bermula sebelum reset kata laluan. Sila log masuk semula menggunakan kata laluan sementara terkini.',
 },
 { status: 401 });
 }

 const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

 if (updateError) {
 return NextResponse.json(
 { error: updateError.message || 'Gagal kemas kini kata laluan.' },
 { status: 400 });
 }

 const service = (await createServiceClient()) as SupabaseClient;
 const { data: updatedProfile, error: profileError } = await service.from('profiles').update({
 must_change_password: false,
 last_login_at: new Date().toISOString(),
 }).eq('id', user.id).eq('must_change_password', true).select('id').maybeSingle();

 if (profileError || !updatedProfile) {
 return NextResponse.json(
 {
 error:
 'Kata laluan telah dikemas kini tetapi profil gagal diselaraskan. Sila log masuk semula dengan kata laluan baharu.',
 },
 { status: 500 });
 }

 return NextResponse.json({ ok: true });
}
