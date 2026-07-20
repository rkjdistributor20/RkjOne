import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/auth/session';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

type DriverRef = { id: string; driver_code: string; full_name?: string | null };

async function companionDriverIds(
 organizationId: string,
 currentProfileId: string,
) {
 const admin = createAdminClient();
 const { data: mine } = await admin
 .from('drivers')
 .select('id, driver_code')
 .eq('organization_id', organizationId)
 .eq('profile_id', currentProfileId)
 .eq('status', 'ACTIVE');

 const myDrivers = (mine ?? []) as DriverRef[];
 const myCodes = new Set(myDrivers.map((driver) => driver.driver_code));
 if (!myCodes.has('DIST-DRV-001') && !myCodes.has('DIST-AST-001')) {
 return myDrivers.map((driver) => driver.id);
 }

 const { data: companions } = await admin
 .from('drivers')
 .select('id, driver_code')
 .eq('organization_id', organizationId)
 .eq('status', 'ACTIVE')
 .in('driver_code', ['DIST-DRV-001', 'DIST-AST-001']);

 return [...new Set(((companions ?? []) as DriverRef[]).map((driver) => driver.id))];
}

async function fetchCompanionSchedule(
 organizationId: string,
 driverIds: string[],
 from: string,
 to: string,
) {
 if (driverIds.length <= 1) return null;

 const admin = createAdminClient() as any;
 const { data: plans, error: planError } = await admin
 .from('hq_delivery_route_plans')
 .select('id, instruction_code, instruction_part, production_date, route_name, region_code, route_pattern, status, factory_order_id, driver_id, vehicle_id, depends_on_plan_id, handoff_completed_at, ai_route_summary, ai_optimized_at')
 .eq('organization_id', organizationId)
 .neq('status', 'CANCELLED')
 .gte('production_date', from)
 .lte('production_date', to)
 .in('driver_id', driverIds)
 .order('production_date', { ascending: true })
 .order('instruction_part', { ascending: true });

 if (planError) {
 throw new Error(planError.message);
 }
 if (!plans?.length) return [];

 const planIds = plans.map((plan: any) => plan.id);
 const orderIds = [...new Set(plans.map((plan: any) => plan.factory_order_id).filter(Boolean))];
 const vehicleIds = [...new Set(plans.map((plan: any) => plan.vehicle_id).filter(Boolean))];
 const depIds = [...new Set(plans.map((plan: any) => plan.depends_on_plan_id).filter(Boolean))];

 const [
 { data: orders },
 { data: drivers },
 { data: vehicles },
 { data: dependencies },
 { data: stops },
 ] = await Promise.all([
 orderIds.length
 ? admin.from('hq_factory_orders').select('id, order_phase, order_number, status').in('id', orderIds)
 : Promise.resolve({ data: [] }),
 admin.from('drivers').select('id, full_name, driver_code').in('id', driverIds),
 vehicleIds.length
 ? admin.from('vehicles').select('id, plate_number, vehicle_type').in('id', vehicleIds)
 : Promise.resolve({ data: [] }),
 depIds.length
 ? admin.from('hq_delivery_route_plans').select('id, status').in('id', depIds)
 : Promise.resolve({ data: [] }),
 admin.from('hq_delivery_route_stops').select('id, route_plan_id, stop_sequence, branch_id, is_handoff, status, notes').in('route_plan_id', planIds).order('stop_sequence', { ascending: true }),
 ]);

 const stopRows = stops ?? [];
 const stopIds = stopRows.map((stop: any) => stop.id);
 const branchIds = [...new Set(stopRows.map((stop: any) => stop.branch_id).filter(Boolean))];
 const [{ data: branches }, { data: stopItems }] = await Promise.all([
 branchIds.length
 ? admin.from('branches').select('id, branch_code, branch_name, area').in('id', branchIds)
 : Promise.resolve({ data: [] }),
 stopIds.length
 ? admin.from('hq_delivery_route_stop_items').select('stop_id, stock_item_id, quantity, planned_quantity, adjusted_quantity, unit').in('stop_id', stopIds)
 : Promise.resolve({ data: [] }),
 ]);

 const stockItemIds = [...new Set((stopItems ?? []).map((item: any) => item.stock_item_id).filter(Boolean))];
 const { data: stockItems } = stockItemIds.length
 ? await admin.from('stock_items').select('id, item_code, name, category').in('id', stockItemIds)
 : { data: [] };

 const orderById = new Map<string, any>((orders ?? []).map((order: any) => [order.id, order]));
 const driverById = new Map<string, any>((drivers ?? []).map((driver: any) => [driver.id, driver]));
 const vehicleById = new Map<string, any>((vehicles ?? []).map((vehicle: any) => [vehicle.id, vehicle]));
 const depById = new Map<string, any>((dependencies ?? []).map((dep: any) => [dep.id, dep]));
 const branchById = new Map<string, any>((branches ?? []).map((branch: any) => [branch.id, branch]));
 const stockById = new Map<string, any>((stockItems ?? []).map((item: any) => [item.id, item]));

 return plans.map((plan: any) => {
 const routeStops = stopRows
 .filter((stop: any) => stop.route_plan_id === plan.id)
 .sort((a: any, b: any) => Number(a.stop_sequence ?? 0) - Number(b.stop_sequence ?? 0));
 const pickTotals = new Map<string, any>();
 const stopPayload = routeStops.map((stop: any) => {
 const branch = branchById.get(stop.branch_id);
 const items = (stopItems ?? [])
 .filter((item: any) => item.stop_id === stop.id)
 .map((item: any) => {
 const stock = stockById.get(item.stock_item_id);
 const quantity = Number(item.adjusted_quantity ?? item.planned_quantity ?? item.quantity ?? 0);
 if (!stop.is_handoff && stock) {
 const key = stock.id;
 const current = pickTotals.get(key) ?? {
 item_code: stock.item_code,
 name: stock.name,
 category: stock.category,
 total_qty: 0,
 unit: item.unit,
 };
 current.total_qty += quantity;
 pickTotals.set(key, current);
 }
 return {
 item_code: stock?.item_code ?? 'ITEM',
 name: stock?.name ?? 'Item stok',
 category: stock?.category ?? null,
 quantity,
 unit: item.unit,
 };
 });

 return {
 stop_id: stop.id,
 sequence: Number(stop.stop_sequence ?? 0),
 branch_code: branch?.branch_code ?? 'HANDOFF',
 branch_name: branch?.branch_name ?? stop.notes ?? 'Sambut Stok',
 area: branch?.area ?? null,
 branch_id: stop.branch_id,
 is_handoff: Boolean(stop.is_handoff),
 status: stop.status,
 item_count: items.length,
 priority_score: 0,
 route_hint: stop.is_handoff ? 'Sambut stok hub' : 'Laluan utama',
 items,
 };
 });

 const order = orderById.get(plan.factory_order_id);
 const driver = driverById.get(plan.driver_id);
 const vehicle = vehicleById.get(plan.vehicle_id);
 const dep = depById.get(plan.depends_on_plan_id);
 return {
 plan_id: plan.id,
 instruction_code: plan.instruction_code,
 instruction_part: Number(plan.instruction_part ?? 1),
 production_date: plan.production_date,
 route_name: plan.route_name,
 region_code: plan.region_code,
 route_pattern: plan.route_pattern,
 status: plan.status,
 order_phase: order?.order_phase ?? 'FINAL',
 order_number: order?.order_number ?? null,
 order_status: order?.status,
 driver_id: plan.driver_id,
 driver_name: driver?.full_name ?? 'Driver',
 driver_code: driver?.driver_code ?? '',
 vehicle: vehicle ? (vehicle.plate_number ?? vehicle.vehicle_type) : null,
 handoff_completed: Boolean(plan.handoff_completed_at),
 depends_on_ready: dep ? ['READY', 'DISPATCHED', 'COMPLETED'].includes(dep.status) : false,
 ai_route_summary: plan.ai_route_summary,
 ai_optimized: Boolean(plan.ai_optimized_at),
 total_stops: routeStops.length,
 kiosk_stops: routeStops.filter((stop: any) => !stop.is_handoff).length,
 completed_stops: routeStops.filter((stop: any) => stop.status === 'DELIVERED').length,
 pick_summary: [...pickTotals.values()],
 stops: stopPayload,
 };
 });
}

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 const url = new URL(request.url);
 const from = url.searchParams.get('from') ?? undefined;
 const to = url.searchParams.get('to') ?? undefined;
 const fromDate = from ?? new Date().toISOString().slice(0, 10);
 const toDate = to ?? new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

 const supabase = await createClient();
 const { data, error } = await inventoryRpc(supabase, 'get_driver_work_schedule', {
 p_from: fromDate,
 p_to: toDate,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 if (profile.role === 'DRIVER') {
 try {
 const driverIds = await companionDriverIds(profile.organization_id, profile.id);
 const companionSchedule = await fetchCompanionSchedule(
 profile.organization_id,
 driverIds,
 fromDate,
 toDate,
 );
 if (companionSchedule) {
 return NextResponse.json({ schedule: companionSchedule });
 }
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal memuatkan jadual companion driver' },
 { status: 500 },
 );
 }
 }

 return NextResponse.json({ schedule: data ?? [] });
}
