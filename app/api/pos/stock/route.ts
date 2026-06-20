import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
  computeProductAvailability,
  fetchMenuStockBalances,
  fetchSupplementStockBalances,
  getKioskLocationId,
} from '@/lib/pos/stock-server';
import type { ProductStockInfo } from '@/lib/pos/types';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get('branch_id') ?? profile.branch_id;

  if (!branchId) {
    return NextResponse.json({ error: 'Cawangan diperlukan' }, { status: 400 });
  }

  const supabase = await createClient();
  const locationId = await getKioskLocationId(supabase, branchId);

  let menuBalances: Awaited<ReturnType<typeof fetchMenuStockBalances>> = {};
  let supplementBalances: Awaited<ReturnType<typeof fetchSupplementStockBalances>> =
    [];
  let availability: Record<string, ProductStockInfo> = {};
  let warning: string | undefined;

  if (locationId) {
    [menuBalances, supplementBalances] = await Promise.all([
      fetchMenuStockBalances(supabase, locationId),
      fetchSupplementStockBalances(supabase, locationId),
    ]);
  }

  const { data, error } = await callRpc(supabase, 'get_pos_product_availability', {
    p_branch_id: branchId,
  });

  if (!error && data && typeof data === 'object') {
    availability = data as Record<string, ProductStockInfo>;
  }

  if (
    locationId &&
    Object.keys(availability).length === 0 &&
    profile.organization_id
  ) {
    availability = await computeProductAvailability(
      supabase,
      profile.organization_id,
      locationId
    );
  }

  if (error && !Object.keys(availability).length) {
    const msg = error.message ?? '';
    if (
      msg.includes('get_pos_product_availability') ||
      msg.includes('Could not find the function') ||
      msg.includes('does not exist')
    ) {
      warning = locationId
        ? undefined
        : 'Lokasi kiosk belum disediakan untuk cawangan ini';
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    availability,
    menuBalances,
    supplementBalances,
    branchId,
    ...(warning ? { warning } : {}),
  });
}
