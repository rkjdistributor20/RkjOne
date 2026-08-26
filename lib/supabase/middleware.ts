import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { verifyKioskBypassToken } from '@/lib/pos/kiosk-token';
import { isDashboardRouteAllowed } from '@/lib/auth/route-access';

const CHANGE_PASSWORD_PATH = '/change-password';
const CHANGE_PASSWORD_API = '/api/auth/change-password';
const POS_DEVICE_COOKIE = 'rkj_pos_device';
const POS_KIOSK_BYPASS_COOKIE = 'rkj_pos_kiosk_bypass';
const PUBLIC_API_PATHS = new Set([
 '/api/health',
 '/api/auth/login',
 '/api/pos/qr-payments/webhook',
 '/api/sales-agent/payments/webhook',
 '/api/sales-agent/payments/fiuu/webhook',
 '/api/sales-agent/payments/fiuu/return',
]);

type MiddlewareProfile = {
 must_change_password?: boolean;
 role?: string;
 status?: string;
 legal_entity?: { code?: string | null } | null;
};

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
 request.cookies.set(name, value));
 supabaseResponse = NextResponse.next({ request });
 cookiesToSet.forEach(({ name, value, options }) =>
 supabaseResponse.cookies.set(name, value, options));
 },
 },
 });

 const {
 data: { user },
 } = await supabase.auth.getUser();

 const pathname = request.nextUrl.pathname;
 const isApiRoute = pathname.startsWith('/api/');
 const isPublicApiRoute = PUBLIC_API_PATHS.has(pathname);
 const isPublicAsset =
 pathname === '/manifest.json' ||
 pathname === '/sw.js' ||
 pathname.startsWith('/app-icon-') ||
 pathname.startsWith('/icon-');
 const isPublicRoute =
 pathname === '/' ||
 pathname.startsWith('/login') ||
 pathname.startsWith('/auth') ||
 pathname === '/offline' ||
 pathname === '/privacy' ||
 isPublicAsset ||
 isPublicApiRoute;

 const isChangePasswordRoute =
 pathname === CHANGE_PASSWORD_PATH || pathname.startsWith(CHANGE_PASSWORD_API);
 const hasOfficialPosCredential = Boolean(request.cookies.get(POS_DEVICE_COOKIE)?.value);
 const kioskBypassed = user
 ? await verifyKioskBypassToken(request.cookies.get(POS_KIOSK_BYPASS_COOKIE)?.value, user.id)
 : false;

 let profileRow: MiddlewareProfile | null = null;

 if (user) {
 const profileSelect = isApiRoute
 ? 'must_change_password, role, status'
 : 'must_change_password, role, status, legal_entity:legal_entities(code)';
 const { data: profile, error: profileError } = await (supabase as SupabaseClient)
 .from('profiles')
 .select(profileSelect)
 .eq('id', user.id)
 .maybeSingle();

 if (profileError) {
 if (isApiRoute) {
 return NextResponse.json({ error: 'Profil tidak dapat disahkan buat sementara waktu.' }, { status: 503 });
 }
 if (pathname !== '/login') {
 const url = request.nextUrl.clone();
 url.pathname = '/login';
 url.searchParams.set('error', 'profile_unavailable');
 return NextResponse.redirect(url);
 }
 return supabaseResponse;
 }
 profileRow = profile as MiddlewareProfile | null;
 }

 if (!user && !isPublicRoute) {
 if (isApiRoute) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const url = request.nextUrl.clone();
 url.pathname = '/login';
 url.searchParams.set('redirect', pathname);
 return NextResponse.redirect(url);
 }

 if (user && !profileRow) {
 if (isApiRoute) {
 return NextResponse.json({ error: 'Profil pengguna tidak ditemui.' }, { status: 403 });
 }
 if (pathname !== '/login') {
 const url = request.nextUrl.clone();
 url.pathname = '/login';
 url.searchParams.set('error', 'profile_missing');
 return NextResponse.redirect(url);
 }
 return supabaseResponse;
 }

 if (user && profileRow && profileRow.status !== 'ACTIVE') {
 if (isApiRoute) {
 return NextResponse.json({ error: 'Akaun tidak aktif' }, { status: 403 });
 }
 if (pathname !== '/login') {
 const url = request.nextUrl.clone();
 url.pathname = '/login';
 url.searchParams.set('error', 'account_inactive');
 return NextResponse.redirect(url);
 }
 return supabaseResponse;
 }

 if (user && pathname === '/login') {
 const url = request.nextUrl.clone();
 url.pathname = hasOfficialPosCredential && !kioskBypassed ? '/pos' : '/dashboard';
 return NextResponse.redirect(url);
 }

 if (
 user &&
 hasOfficialPosCredential &&
 !kioskBypassed &&
 !isApiRoute &&
 !isPublicAsset &&
 !isChangePasswordRoute &&
 pathname !== '/pos'
 ) {
 const url = request.nextUrl.clone();
 url.pathname = '/pos';
 url.search = '';
 return NextResponse.redirect(url);
 }

 if (user && !isPublicRoute && !isChangePasswordRoute) {
 if (profileRow?.must_change_password) {
 if (isApiRoute) {
 return NextResponse.json(
 { error: 'Kata laluan perlu ditukar sebelum meneruskan.' },
 { status: 403 });
 }
 const url = request.nextUrl.clone();
 url.pathname = CHANGE_PASSWORD_PATH;
 return NextResponse.redirect(url);
 }

 if (
 !isApiRoute &&
 !(hasOfficialPosCredential && !kioskBypassed && pathname === '/pos') &&
 !isDashboardRouteAllowed(pathname, {
 role: profileRow?.role,
 legalEntityCode: profileRow?.legal_entity?.code,
 })
 ) {
 const url = request.nextUrl.clone();
 url.pathname = '/dashboard';
 url.search = '';
 return NextResponse.redirect(url);
 }

 if (pathname === '/inventory/kawasan') {
 const url = request.nextUrl.clone();
 url.pathname = '/inventory';
 return NextResponse.redirect(url);
 }
 }

 return supabaseResponse;
}
