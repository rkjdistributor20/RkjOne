import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import {
  optimizeRouteStops,
  routeSortKeyFromBranch,
  type RouteStopMeta,
} from '@/lib/fleet/route-ai';

type OptimizeBody = {
  stops: Array<{ key: string; location_id: string }>;
  current_lat?: number | null;
  current_lng?: number | null;
};

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  let body: OptimizeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const stops = body.stops ?? [];
  if (!stops.length) {
    return NextResponse.json({ error: 'Senarai hentian kosong' }, { status: 400 });
  }
  if (stops.length > 20) {
    return NextResponse.json({ error: 'Maksimum 20 hentian' }, { status: 400 });
  }

  const locationIds = stops.map((s) => s.location_id);
  const supabase = await createClient();

  const { data: metaRows, error: metaError } = await inventoryRpc(
    supabase,
    'branch_route_stop_meta',
    {
      p_org_id: profile.organization_id,
      p_location_ids: locationIds,
    }
  );

  if (metaError) {
    return NextResponse.json({ error: metaError.message }, { status: 400 });
  }

  const metaList = (
    Array.isArray(metaRows)
      ? metaRows
      : typeof metaRows === 'string'
        ? (JSON.parse(metaRows) as unknown[])
        : []
  ) as Array<{
    location_id: string;
    branch_id?: string;
    branch_code?: string;
    branch_name?: string;
    latitude?: number | null;
    longitude?: number | null;
    priority?: number;
    sort_key?: number;
  }>;

  const metaByLocation = new Map(metaList.map((m) => [m.location_id, m]));

  const routeStops: RouteStopMeta[] = stops.map((s) => {
    const m = metaByLocation.get(s.location_id);
    return {
      key: s.key,
      locationId: s.location_id,
      branchId: m?.branch_id,
      branchCode: m?.branch_code,
      branchName: m?.branch_name,
      latitude: m?.latitude != null ? Number(m.latitude) : null,
      longitude: m?.longitude != null ? Number(m.longitude) : null,
      priority: m?.priority ?? 0,
      sortKey:
        m?.sort_key ??
        routeSortKeyFromBranch(m?.branch_name, m?.branch_code),
    };
  });

  const result = optimizeRouteStops(routeStops, {
    currentLat: body.current_lat ?? null,
    currentLng: body.current_lng ?? null,
  });

  return NextResponse.json({ result });
}
