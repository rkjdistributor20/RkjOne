import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/security/rate-limit';
import { createClient } from '@/lib/supabase/server';

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Pragma: 'no-cache',
    },
  });
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, {
    key: 'auth-login',
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as LoginBody;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password || email.length > 254 || password.length > 4096) {
    return json({ error: 'Email atau kata laluan tidak sah.' }, 400);
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return json({ error: authError?.message ?? 'Log masuk tidak berjaya.' }, 401);
  }

  const { data: rawProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', authData.user.id)
    .maybeSingle();
  const profile = rawProfile as { role: string; status: string } | null;

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return json({ error: 'Profil pengguna tidak ditemui.' }, 403);
  }

  if (profile.status !== 'ACTIVE') {
    await supabase.auth.signOut();
    return json({ error: 'Akaun tidak aktif.' }, 403);
  }

  return json({ success: true, role: profile.role });
}
