import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Semakan pantas production — deploy SHA + Supabase */
export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    process.env.VERCEL_GIT_COMMIT_REF ??
    'local';

  let supabaseOk = false;
  let branchCount: number | null = null;

  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('branches')
      .select('*', { count: 'exact', head: true });
    supabaseOk = !error;
    branchCount = count;
  } catch {
    supabaseOk = false;
  }

  return NextResponse.json(
    {
      ok: supabaseOk,
      app: 'rkj-one',
      commit,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
      supabase: supabaseOk ? 'connected' : 'error',
      branches: branchCount,
      inventoryAmRoute: '/inventory (server split by AREA_MANAGER role)',
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
