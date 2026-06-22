import type { SupabaseClient } from '@supabase/supabase-js';
import { computeBalanceStatus, type BalanceStatus } from '@/lib/inventory/balance-utils';
import {
  HQ_ROTI_ITEM_CODES,
  isHqStockItemCode,
} from '@/lib/stock/catalog';

export type KioskBranchOverviewRow = {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  location_id: string;
  has_location: boolean;
  worst_status: BalanceStatus;
  low_count: number;
  critical_count: number;
  pending_transfers: number;
};

export type KioskOverviewSummary = {
  total: number;
  low: number;
  critical: number;
  pending: number;
  no_location: number;
  low_item_count: number;
  critical_item_count: number;
};

type BranchRow = {
  id: string;
  branch_code: string;
  branch_name: string;
};

type BalRow = {
  location_id: string;
  quantity: number;
  stock_item: {
    item_code: string;
    min_threshold: number | null;
    critical_threshold: number | null;
  };
};

export async function fetchKioskOverviewForBranches(
  supabase: SupabaseClient,
  orgId: string,
  branchIds: string[]
): Promise<{ branches: KioskBranchOverviewRow[]; summary: KioskOverviewSummary }> {
  if (!branchIds.length) {
    return {
      branches: [],
      summary: {
        total: 0,
        low: 0,
        critical: 0,
        pending: 0,
        no_location: 0,
        low_item_count: 0,
        critical_item_count: 0,
      },
    };
  }

  const { data: branchRows } = await supabase
    .from('branches')
    .select('id, branch_code, branch_name')
    .eq('organization_id', orgId)
    .in('id', branchIds)
    .order('branch_code');

  const branches = (branchRows ?? []) as BranchRow[];

  const { data: locations } = await supabase
    .from('inventory_locations')
    .select('id, branch_id, is_active')
    .eq('organization_id', orgId)
    .eq('location_type', 'BRANCH_KIOSK')
    .in('branch_id', branchIds);

  const kioskByBranch = new Map<string, string>();
  for (const loc of locations ?? []) {
    const row = loc as { id: string; branch_id: string; is_active: boolean };
    if (!kioskByBranch.has(row.branch_id) || row.is_active) {
      kioskByBranch.set(row.branch_id, row.id);
    }
  }

  const locationIds = [...kioskByBranch.values()];
  const balByLocation = new Map<string, BalRow[]>();
  const pendingByLocation = new Map<string, number>();

  if (locationIds.length) {
    const { data: balances } = await supabase
      .from('inventory_balances')
      .select(
        `
        location_id,
        quantity,
        stock_item:stock_items(item_code, min_threshold, critical_threshold)
      `
      )
      .in('location_id', locationIds);

    for (const row of (balances ?? []) as unknown as BalRow[]) {
      if (!isHqStockItemCode(row.stock_item?.item_code ?? '')) continue;
      const list = balByLocation.get(row.location_id) ?? [];
      list.push(row);
      balByLocation.set(row.location_id, list);
    }

    const { data: pendingTransfers } = await supabase
      .from('stock_transfers')
      .select('to_location_id')
      .eq('organization_id', orgId)
      .eq('status', 'IN_TRANSIT')
      .in('to_location_id', locationIds);

    for (const t of pendingTransfers ?? []) {
      const lid = (t as { to_location_id: string }).to_location_id;
      pendingByLocation.set(lid, (pendingByLocation.get(lid) ?? 0) + 1);
    }
  }

  let summaryLow = 0;
  let summaryCritical = 0;
  let summaryPending = 0;
  let noLocation = 0;
  let lowItemCount = 0;
  let criticalItemCount = 0;

  const result: KioskBranchOverviewRow[] = branches.map((branch) => {
    const locationId = kioskByBranch.get(branch.id) ?? '';

    if (!locationId) {
      noLocation += 1;
      return {
        branch_id: branch.id,
        branch_code: branch.branch_code,
        branch_name: branch.branch_name,
        location_id: '',
        has_location: false,
        worst_status: 'OK',
        low_count: 0,
        critical_count: 0,
        pending_transfers: 0,
      };
    }

    const rows = balByLocation.get(locationId) ?? [];
    let worst: BalanceStatus = 'OK';
    let lowCount = 0;
    let criticalCount = 0;

    for (const code of HQ_ROTI_ITEM_CODES) {
      const row = rows.find((r) => r.stock_item.item_code === code);
      const qty = row ? Number(row.quantity) : 0;
      const status = computeBalanceStatus(
        qty,
        row?.stock_item.min_threshold,
        row?.stock_item.critical_threshold
      );
      if (status === 'CRITICAL') criticalCount++;
      if (status === 'LOW') lowCount++;
      if (status === 'CRITICAL') worst = 'CRITICAL';
      else if (status === 'LOW' && worst === 'OK') worst = 'LOW';
    }

    lowItemCount += lowCount;
    criticalItemCount += criticalCount;
    const pending = pendingByLocation.get(locationId) ?? 0;
    summaryPending += pending;
    if (worst === 'CRITICAL') summaryCritical++;
    else if (worst === 'LOW') summaryLow++;

    return {
      branch_id: branch.id,
      branch_code: branch.branch_code,
      branch_name: branch.branch_name,
      location_id: locationId,
      has_location: true,
      worst_status: worst,
      low_count: lowCount,
      critical_count: criticalCount,
      pending_transfers: pending,
    };
  });

  return {
    branches: result,
    summary: {
      total: result.length,
      low: summaryLow,
      critical: summaryCritical,
      pending: summaryPending,
      no_location: noLocation,
      low_item_count: lowItemCount,
      critical_item_count: criticalItemCount,
    },
  };
}
