import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSystemHealthSnapshot } from '@/lib/system/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 if (profile.role !== 'SUPER_ADMIN' && profile.role !== 'ADMIN') {
 return NextResponse.json({ error: 'Akses admin sahaja' }, { status: 403 });
 }

 try {
 const supabase = createAdminClient();
 const snapshot = await buildSystemHealthSnapshot(supabase, profile);
 return NextResponse.json(
 { snapshot },
 { headers: { 'Cache-Control': 'no-store' } });
 } catch (err) {
 const message = err instanceof Error ? err.message : 'Gagal semak kesihatan sistem';
 return NextResponse.json({ error: message }, { status: 500 });
 }
}
