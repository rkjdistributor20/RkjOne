import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export async function POST(request: Request) {
 const limited = enforceRateLimit(request, {
 key: 'auth-change-password',
 limit: 6,
 windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const body = await request.json().catch(() => null);
 const currentPassword = body?.currentPassword as string | undefined;
 const newPassword = body?.newPassword as string | undefined;

 if (!currentPassword || !newPassword) {
 return NextResponse.json(
 { error: 'Kata laluan semasa dan baharu diperlukan.' },
 { status: 400 });
 }

 if (newPassword.length < 8) {
 return NextResponse.json(
 { error: 'Kata laluan baharu mesti sekurang-kurangnya 8 aksara.' },
 { status: 400 });
 }

 if (newPassword === currentPassword) {
 return NextResponse.json(
 { error: 'Kata laluan baharu mesti berbeza daripada kata laluan semasa.' },
 { status: 400 });
 }

 const supabase = await createClient();
 const {
 data: { user },
 } = await supabase.auth.getUser();

 if (!user?.email) {
 return NextResponse.json({ error: 'Sesi tamat. Sila log masuk semula.' }, { status: 401 });
 }

 const { error: verifyError } = await supabase.auth.signInWithPassword({
 email: user.email,
 password: currentPassword,
 });

 if (verifyError) {
 return NextResponse.json({ error: 'Kata laluan semasa tidak betul.' }, { status: 400 });
 }

 const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

 if (updateError) {
 return NextResponse.json(
 { error: updateError.message || 'Gagal kemas kini kata laluan.' },
 { status: 400 });
 }

 const { error: profileError } = await (supabase as SupabaseClient).from('profiles').update({
 must_change_password: false,
 last_login_at: new Date().toISOString(),
 }).eq('id', user.id);

 if (profileError) {
 return NextResponse.json(
 { error: 'Kata laluan dikemas kini tetapi profil gagal diselaraskan.' },
 { status: 500 });
 }

 return NextResponse.json({ ok: true });
}
