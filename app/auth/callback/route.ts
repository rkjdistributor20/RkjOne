import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

function safeNextPath(next: string): string {
  if (next.startsWith('/') && !next.startsWith('//') && !next.includes('://')) {
    return next;
  }
  return '/dashboard';
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next') ?? '/dashboard');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await (supabase as SupabaseClient)
          .from('profiles')
          .select('must_change_password')
          .eq('id', user.id)
          .maybeSingle();

        if ((profile as { must_change_password?: boolean } | null)?.must_change_password) {
          return NextResponse.redirect(`${origin}/change-password`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
