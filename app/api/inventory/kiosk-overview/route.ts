import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches, applyBranchIdsFilter } from '@/lib/auth/branch-scope';
import {
  HQ_STOCK_ITEM_CODES,
  HQ_ROTI_ITEM_CODES,
  formatStockQuantity,
  isHqStockItemCode,
} from '@/lib/stock/catalog';

type StockStatus = 'OK' | 'LOW' | 'CRITICAL';

function rowStatus(
  qty: number,
  min: number | null,
  critical: number | null
): StockStatus {
  if (critical != null && qty <= critical) return 'CRITICAL';
  if (min != null && qty <= min) return 'LOW';
  return 'OK';
}

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
  }

  const requestedBranchId = new URL(request.url).searchParams.get('branch_id');

  const supabase = await createClient();
  let scope;
  try {
    scope = await resolveScopedBranches(
      supabase,
      profile,
      requestedBranchId ?? profile.branch_id
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }

  let locQuery = supabase
    .from('inventory_locations')
    .select(
      `
      id,
      name,
      branch_id,
      branch:branches(id, branch_code, branch_name, region_id)
    `
    )
    .eq('organization_id', profile.organization_id)
    .eq('location_type', 'BRANCH_KIOSK')
    .eq('is_active', true)
    .order('name');

  if (scope.branchIds !== null) {
    locQuery = applyBranchIdsFilter(locQuery, 'branch_id', scope.branchIds);
  }

  const { data: locations, error: locErr } = await locQuery;
  if (locErr) {
    return NextResponse.json({ error: locErr.message }, { status: 500 });
  }

  const kiosks = (locations ?? []) as Array<{
    id: string;
    name: string;
    branch_id: string | null;
    branch: {
      id: string;
      branch_code: string;
      branch_name: string;
    } | null;
  }>;

  if (!kiosks.length) {
    return NextResponse.json({ branches: [], summary: { total: 0, low: 0, critical: 0, pending: 0 } });
  }

  const locationIds = kiosks.map((k) => k.id);

  const { data: balances, error: balErr } = await supabase
    .from('inventory_balances')
    .select(
      `
      location_id,
      quantity,
      unit,
      stock_item:stock_items(
        item_code,
        name,
        min_threshold,
        critical_threshold,
        pack_quantity,
        pack_unit,
        conversion_text
      )
    `
    )
    .in('location_id', locationIds);

  if (balErr) {
    return NextResponse.json({ error: balErr.message }, { status: 500 });
  }

  const { data: pendingTransfers, error: trfErr } = await supabase
    .from('stock_transfers')
    .select('id, to_location_id')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'IN_TRANSIT')
    .in('to_location_id', locationIds);

  if (trfErr) {
    return NextResponse.json({ error: trfErr.message }, { status: 500 });
  }

  const pendingByLocation = new Map<string, number>();
  for (const t of pendingTransfers ?? []) {
    const lid = (t as { to_location_id: string }).to_location_id;
    pendingByLocation.set(lid, (pendingByLocation.get(lid) ?? 0) + 1);
  }

  type BalRow = {
    location_id: string;
    quantity: number;
    unit: string;
    stock_item: {
      item_code: string;
      name: string;
      min_threshold: number | null;
      critical_threshold: number | null;
      pack_quantity: number | null;
      pack_unit: string | null;
      conversion_text: string | null;
    };
  };

  const balByLocation = new Map<string, BalRow[]>();
  for (const row of (balances ?? []) as unknown as BalRow[]) {
    if (!isHqStockItemCode(row.stock_item?.item_code ?? '')) continue;
    const list = balByLocation.get(row.location_id) ?? [];
    list.push(row);
    balByLocation.set(row.location_id, list);
  }

  let summaryLow = 0;
  let summaryCritical = 0;
  let summaryPending = 0;

  const branches = kiosks.map((kiosk) => {
    const rows = balByLocation.get(kiosk.id) ?? [];
    const roti: Record<
      string,
      { item_code: string; name: string; display: string; status: StockStatus; quantity: number }
    > = {};
    let worst: StockStatus = 'OK';
    let lowCount = 0;
    let criticalCount = 0;

    for (const code of HQ_ROTI_ITEM_CODES) {
      const row = rows.find((r) => r.stock_item.item_code === code);
      const qty = row ? Number(row.quantity) : 0;
      const item = row?.stock_item;
      const status = rowStatus(
        qty,
        item?.min_threshold ?? null,
        item?.critical_threshold ?? null
      );
      if (status === 'CRITICAL') criticalCount++;
      if (status === 'LOW') lowCount++;
      if (status === 'CRITICAL' || (status === 'LOW' && worst === 'OK')) worst = status;
      if (status === 'CRITICAL') worst = 'CRITICAL';

      roti[code] = {
        item_code: code,
        name: item?.name ?? code,
        quantity: qty,
        display: formatStockQuantity(qty, row?.unit ?? 'PCS', {
          item_code: code,
          pack_quantity: item?.pack_quantity ?? undefined,
          pack_unit: item?.pack_unit ?? undefined,
        }),
        status,
      };
    }

    const pending = pendingByLocation.get(kiosk.id) ?? 0;
    summaryPending += pending;
    if (worst === 'CRITICAL') summaryCritical++;
    else if (worst === 'LOW') summaryLow++;

    return {
      branch_id: kiosk.branch_id ?? kiosk.branch?.id ?? '',
      branch_code: kiosk.branch?.branch_code ?? '—',
      branch_name: kiosk.branch?.branch_name ?? kiosk.name,
      location_id: kiosk.id,
      location_name: kiosk.name,
      roti,
      low_count: lowCount,
      critical_count: criticalCount,
      worst_status: worst,
      pending_transfers: pending,
    };
  });

  branches.sort((a, b) => a.branch_code.localeCompare(b.branch_code));

  return NextResponse.json({
    branches,
    summary: {
      total: branches.length,
      low: summaryLow,
      critical: summaryCritical,
      pending: summaryPending,
    },
  });
}
