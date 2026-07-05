import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Semakan pantas production tanpa mendedahkan metadata operasi. */
export async function GET() {
 let supabaseOk = false;

 try {
 const supabase = await createClient();
 const { error } = await supabase.from('branches').select('id', { head: true }).limit(1);
 supabaseOk = !error;
 } catch {
 supabaseOk = false;
 }

 return NextResponse.json(
 {
 ok: supabaseOk,
 status: supabaseOk ? 'ready' : 'degraded',
 },
 {
 status: supabaseOk ? 200 : 503,
 headers: { 'Cache-Control': 'no-store' },
 });
}
