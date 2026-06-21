import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

function parseRpcJsonArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from =
    searchParams.get('from') ??
    new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const to =
    searchParams.get('to') ??
    new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const supabase = await createClient();

  // Tutup window expired (write) — jangan panggil dari STABLE read function
  await inventoryRpc(supabase, 'close_expired_production_order_windows', {});

  const { data, error } = await inventoryRpc(supabase, 'get_published_production_dates', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ dates: parseRpcJsonArray(data) });
}
