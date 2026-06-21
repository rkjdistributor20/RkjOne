import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches, applyBranchIdsFilter } from '@/lib/auth/branch-scope';
import {
  HQ_ROTI_ITEM_CODES,
  formatStockQuantity,
  getStockByCode,
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

  let branchQuery = supabase
    .from('branches')
    .select('id, branch_code, branch_name, status')
    .eq('organization_id', profile.organization_id)
    .order('branch_code');

  if (scope.branchIds !== null) {
    branchQuery = applyBranchIdsFilter(branchQuery, 'id', scope.branchIds);
  }

  const { data: branchRows, error: branchErr } = await branchQuery;
  if (branchErr) {
    return NextResponse.json({ error: branchErr.message }, { status: 500 });
  }

  const branches = branchRows ?? [];
  if (!branches.length) {
    return NextResponse.json({
      branches: [],
      summary: { total: 0, low: 0, critical: 0, pending: 0, no_location: 0 },
    });
  }

  const branchIds = branches.map((b) => (b as { id: string }).id);

  const { data: locations, error: locErr } = await supabase
    .from('inventory_locations')
    .select('id, name, branch_id, is_active')
    .eq('organization_id', profile.organization_id)
    .eq('location_type', 'BRANCH_KIOSK')
    .in('branch_id', branchIds);

  if (locErr) {
    return NextResponse.json({ error: locErr.message }, { status: 500 });
  }

  const kioskByBranch = new Map<string, { id: string; name: string }>();
  for (const loc of locations ?? []) {
    const row = loc as { id: string; name: string; branch_id: string; is_active: boolean };
    const existing = kioskByBranch.get(row.branch_id);
    if (!existing || row.is_active) {
      kioskByBranch.set(row.branch_id, { id: row.id, name: row.name });
    }
  }

  const locationIds = [...kioskByBranch.values()].map((k) => k.id);

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
  const pendingByLocation = new Map<string, number>();

  if (locationIds.length) {
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

    for (const row of (balances ?? []) as unknown as BalRow[]) {
      if (!isHqStockItemCode(row.stock_item?.item_code ?? '')) continue;
      const list = balByLocation.get(row.location_id) ?? [];
      list.push(row);
      balByLocation.set(row.location_id, list);
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

    for (const t of pendingTransfers ?? []) {
      const lid = (t as { to_location_id: string }).to_location_id;
      pendingByLocation.set(lid, (pendingByLocation.get(lid) ?? 0) + 1);
    }
  }

  let summaryLow = 0;
  let summaryCritical = 0;
  let summaryPending = 0;
  let noLocation = 0;

  const result = branches.map((b) => {
    const branch = b as {
      id: string;
      branch_code: string;
      branch_name: string;
      status: string | null;
    };
    const kiosk = kioskByBranch.get(branch.id);
    const locationId = kiosk?.id ?? '';

    if (!kiosk) {
      noLocation += 1;
      return {
        branch_id: branch.id,
        branch_code: branch.branch_code,
        branch_name: branch.branch_name,
        location_id: '',
        location_name: '',
        has_location: false,
        roti: Object.fromEntries(
          HQ_ROTI_ITEM_CODES.map((code) => {
            const def = getStockByCode(code);
            return [
              code,
              {
                item_code: code,
                name: def?.name ?? code,
                quantity: 0,
                display: '—',
                status: 'OK' as StockStatus,
              },
            ];
          })
        ),
        low_count: 0,
        critical_count: 0,
        worst_status: 'OK' as StockStatus,
        pending_transfers: 0,
      };
    }

    const rows = balByLocation.get(locationId) ?? [];
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
      const def = getStockByCode(code);
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
        name: item?.name ?? def?.name ?? code,
        quantity: qty,
        display: formatStockQuantity(qty, row?.unit ?? 'PCS', {
          item_code: code,
          pack_quantity: item?.pack_quantity ?? def?.pack_quantity,
          pack_unit: item?.pack_unit ?? def?.pack_unit,
        }),
        status,
      };
    }

    const pending = pendingByLocation.get(locationId) ?? 0;
    summaryPending += pending;
    if (worst === 'CRITICAL') summaryCritical++;
    else if (worst === 'LOW') summaryLow++;

    return {
      branch_id: branch.id,
      branch_code: branch.branch_code,
      branch_name: branch.branch_name,
      location_id: locationId,
      location_name: kiosk.name,
      has_location: true,
      roti,
      low_count: lowCount,
      critical_count: criticalCount,
      worst_status: worst,
      pending_transfers: pending,
    };
  });

  result.sort((a, b) => a.branch_code.localeCompare(b.branch_code));

  return NextResponse.json({
    branches: result,
    summary: {
      total: result.length,
      low: summaryLow,
      critical: summaryCritical,
      pending: summaryPending,
      no_location: noLocation,
    },
  });
}
