import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import type { OrderSuggestion } from '@/lib/production/types';

function parseSuggestion(data: unknown): OrderSuggestion | null {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as OrderSuggestion;
    } catch {
      return null;
    }
  }
  if (typeof data === 'object') return data as OrderSuggestion;
  return null;
}

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  const productionDate = new URL(request.url).searchParams.get('production_date');
  if (!productionDate) {
    return NextResponse.json({ error: 'production_date diperlukan' }, { status: 400 });
  }

  const supabase = await createClient();

  await inventoryRpc(supabase, 'close_expired_production_order_windows', {});

  const { data, error } = await inventoryRpc(supabase, 'suggest_hq_factory_order', {
    p_production_date: productionDate,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const suggestion = parseSuggestion(data);
  if (!suggestion) {
    return NextResponse.json({ error: 'Format cadangan tidak sah' }, { status: 500 });
  }

  return NextResponse.json({ suggestion });
}
