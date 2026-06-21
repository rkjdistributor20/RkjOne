import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

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
  const { data, error } = await inventoryRpc(supabase, 'suggest_hq_factory_order', {
    p_production_date: productionDate,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ suggestion: data });
}
