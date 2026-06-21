import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

const CHANGE_PASSWORD_PATH = '/change-password';
const CHANGE_PASSWORD_API = '/api/auth/change-password';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth');

  const isChangePasswordRoute =
    pathname === CHANGE_PASSWORD_PATH || pathname.startsWith(CHANGE_PASSWORD_API);

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  if (user && !isPublicRoute && !isChangePasswordRoute) {
    const { data: profile } = await (supabase as SupabaseClient)
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .maybeSingle();

    if ((profile as { must_change_password?: boolean } | null)?.must_change_password) {
      const url = request.nextUrl.clone();
      url.pathname = CHANGE_PASSWORD_PATH;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
