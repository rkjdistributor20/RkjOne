import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches, applyBranchIdsFilter } from '@/lib/auth/branch-scope';
import {
 computeBalanceStatus,
 filterOfficialStockRows,
} from '@/lib/inventory/balance-utils';
import { HQ_STOCK_ITEM_CODES } from '@/lib/stock/catalog';
import type { LocationType } from '@/lib/inventory/types';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';

type NodeSummary = {
 location_type: LocationType;
 label: string;
 location_count: number;
 item_lines: number;
 total_quantity_pcs: number;
 low_count: number;
 critical_count: number;
 in_transit_in: number;
 in_transit_out: number;
 locations: Array<{
 id: string;
 name: string;
 subtitle?: string;
 low_count: number;
 critical_count: number;
 total_items: number;
 }>;
};

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 const supabase = await createClient();
 let scope;
 try {
 scope = await resolveScopedBranches(supabase, profile, profile.branch_id);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 let locQuery = supabase.from('inventory_locations').select(
 `
 id, name, location_type, branch_id, vehicle_id, is_active,
 branch:branches(branch_code, branch_name),
 vehicle:vehicles(vehicle_code, vehicle_type)
 `).eq('organization_id', profile.organization_id).order('location_type').order('name');

 const kioskOnlyOverview =
 profile.role === 'AREA_MANAGER' || profile.role === 'STAFF';

 if (kioskOnlyOverview) {
 locQuery = locQuery.eq('location_type', 'BRANCH_KIOSK');
 } else {
 locQuery = locQuery.in('location_type', [
 'FACTORY',
 'HQ_WAREHOUSE',
 'FLEET_VEHICLE',
 'BRANCH_KIOSK',
 ]);
 }

 if (scope.branchIds !== null) {
 locQuery = applyBranchIdsFilter(locQuery, 'branch_id', scope.branchIds);
 }

 const { data: locations, error: locErr } = await locQuery;
 if (locErr) {
 return NextResponse.json({ error: locErr.message }, { status: 500 });
 }

 const locs = (locations ?? []) as Array<{
 id: string;
 name: string;
 location_type: LocationType;
 branch_id: string | null;
 branch: { branch_code: string; branch_name: string } | null;
 vehicle: { vehicle_code: string; vehicle_type: string } | null;
 }>;

 const locationIds = locs.map((l) => l.id);
 if (!locationIds.length) {
 return NextResponse.json({
 nodes: [],
 pipeline: { in_transit: 0, pending_receive: 0 },
 network: { low: 0, critical: 0, kiosks: 0 },
 });
 }

 const { data: balances, error: balErr } = await supabase.from('inventory_balances').select(
 `
 location_id, quantity, unit,
 stock_item:stock_items(
 item_code, name, min_threshold, critical_threshold,
 pack_quantity, pack_unit, category)
 `).in('location_id', locationIds);

 if (balErr) {
 return NextResponse.json({ error: balErr.message }, { status: 500 });
 }

 const { data: transfers, error: trfErr } = await supabase.from('stock_transfers').select('id, status, from_location_id, to_location_id').eq('organization_id', profile.organization_id).eq('status', 'IN_TRANSIT').or(
 `from_location_id.in.(${locationIds.join(',')}),to_location_id.in.(${locationIds.join(',')})`);

 if (trfErr) {
 return NextResponse.json({ error: trfErr.message }, { status: 500 });
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
 category: string | null;
 };
 };

 const balByLoc = new Map<string, BalRow[]>();
 for (const row of filterOfficialStockRows((balances ?? []) as unknown as BalRow[])) {
 const list = balByLoc.get(row.location_id) ?? [];
 list.push(row);
 balByLoc.set(row.location_id, list);
 }

 const inTransitIn = new Map<string, number>();
 const inTransitOut = new Map<string, number>();
 for (const t of transfers ?? []) {
 const tr = t as { from_location_id: string; to_location_id: string };
 inTransitOut.set(tr.from_location_id, (inTransitOut.get(tr.from_location_id) ?? 0) + 1);
 inTransitIn.set(tr.to_location_id, (inTransitIn.get(tr.to_location_id) ?? 0) + 1);
 }

 const typeLabels: Record<LocationType, string> = {
 FACTORY: 'Kilang',
 HQ_WAREHOUSE: HQ_DISTRIBUTOR_LABEL,
 FLEET_VEHICLE: LOGISTIK_LABEL,
 BRANCH_KIOSK: 'Kiosk Cawangan',
 };

 const nodeMap = new Map<LocationType, NodeSummary>();

 function ensureNode(type: LocationType): NodeSummary {
 let node = nodeMap.get(type);
 if (!node) {
 node = {
 location_type: type,
 label: typeLabels[type],
 location_count: 0,
 item_lines: 0,
 total_quantity_pcs: 0,
 low_count: 0,
 critical_count: 0,
 in_transit_in: 0,
 in_transit_out: 0,
 locations: [],
 };
 nodeMap.set(type, node);
 }
 return node;
 }

 let networkLow = 0;
 let networkCritical = 0;
 let kioskCount = 0;

 for (const loc of locs) {
 const node = ensureNode(loc.location_type);
 node.location_count += 1;
 if (loc.location_type === 'BRANCH_KIOSK') kioskCount += 1;

 const rows = balByLoc.get(loc.id) ?? [];
 let locLow = 0;
 let locCritical = 0;

 for (const code of HQ_STOCK_ITEM_CODES) {
 const row = rows.find((r) => r.stock_item.item_code === code);
 const qty = row ? Number(row.quantity) : 0;
 const status = computeBalanceStatus(
 qty,
 row?.stock_item.min_threshold,
 row?.stock_item.critical_threshold);
 if (row) {
 node.item_lines += 1;
 node.total_quantity_pcs += qty;
 }
 if (status === 'LOW') {
 locLow += 1;
 node.low_count += 1;
 }
 if (status === 'CRITICAL') {
 locCritical += 1;
 node.critical_count += 1;
 }
 }

 if (loc.location_type === 'BRANCH_KIOSK') {
 if (locLow > 0) networkLow += 1;
 if (locCritical > 0) networkCritical += 1;
 }

 const inIn = inTransitIn.get(loc.id) ?? 0;
 const inOut = inTransitOut.get(loc.id) ?? 0;
 node.in_transit_in += inIn;
 node.in_transit_out += inOut;

 let subtitle: string | undefined;
 if (loc.branch?.branch_code) subtitle = `${loc.branch.branch_code} - ${loc.branch.branch_name}`;
 else if (loc.vehicle?.vehicle_code) subtitle = `${loc.vehicle.vehicle_code} - ${loc.vehicle.vehicle_type}`;

 node.locations.push({
 id: loc.id,
 name: loc.name,
 subtitle,
 low_count: locLow,
 critical_count: locCritical,
 total_items: rows.length,
 });
 }

 const flowOrder: LocationType[] = ['FACTORY', 'HQ_WAREHOUSE', 'FLEET_VEHICLE', 'BRANCH_KIOSK'];
 const nodes = flowOrder.map((t) => nodeMap.get(t)).filter(Boolean) as NodeSummary[];

 const pipelineInTransit = (transfers ?? []).length;
 const pendingReceive = [...inTransitIn.values()].reduce((a, b) => a + b, 0);

 return NextResponse.json({
 nodes,
 pipeline: {
 in_transit: pipelineInTransit,
 pending_receive: pendingReceive,
 },
 network: {
 low: networkLow,
 critical: networkCritical,
 kiosks: kioskCount,
 },
 updated_at: new Date().toISOString(),
 });
}
