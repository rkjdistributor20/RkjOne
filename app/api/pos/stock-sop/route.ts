import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import { RKJ_MANUFACTURING_OWN_PRODUCT_CODES } from '@/lib/stock/catalog';
import {
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';

const POS_SHIFT_COUNT_ITEM_CODES = [...RKJ_MANUFACTURING_OWN_PRODUCT_CODES, 'ST-BUTTER'] as const;
const POS_SHIFT_COUNT_ORDER = new Map<string, number>(
 POS_SHIFT_COUNT_ITEM_CODES.map((code, index) => [code, index]));

type BranchLocation = {
 id: string;
 organization_id: string;
 branch_id: string | null;
 name: string;
};

type SubmittedStockCountItem = {
 stock_item_id?: string;
 item_code?: string;
 item_name?: string;
 counted_quantity?: number | string;
 quantity?: number | string;
 unit?: string;
 production_date?: string;
};

type StockEstimate = Awaited<ReturnType<typeof getLastCloseShiftEstimate>>;

async function getBranchLocation(
 supabase: Awaited<ReturnType<typeof createClient>>,
 branchId: string): Promise<BranchLocation> {
 const { data, error } = await supabase
 .from('inventory_locations')
 .select('id, organization_id, branch_id, name')
 .eq('branch_id', branchId)
 .eq('location_type', 'BRANCH_KIOSK')
 .eq('is_active', true)
 .maybeSingle();

 if (error) throw new Error(error.message);
 if (!data) throw new Error('Lokasi POS cawangan tidak dijumpai');
 return data as BranchLocation;
}

async function getOpenShiftId(
 supabase: Awaited<ReturnType<typeof createClient>>,
 branchId: string) {
 const db = supabase as any;
 const { data, error } = await db
 .from('pos_shifts')
 .select('id')
 .eq('branch_id', branchId)
 .eq('status', 'OPEN')
 .order('opened_at', { ascending: false })
 .limit(1)
 .maybeSingle();

 if (error) throw new Error(error.message);
 return data?.id ?? null;
}

async function getLastCloseShiftEstimate(
 supabase: Awaited<ReturnType<typeof createClient>>,
 branchId: string,
 location: BranchLocation) {
 const db = supabase as any;

 try {
 const { data: lastCloseLog, error: logError } = await db
 .from('pos_shift_stock_check_logs')
 .select('id, stock_count_id, production_date, completed_at, completed_by')
 .eq('branch_id', branchId)
 .eq('check_type', 'CLOSE_SHIFT')
 .not('stock_count_id', 'is', null)
 .order('completed_at', { ascending: false })
 .limit(1)
 .maybeSingle();

 if (logError) throw new Error(logError.message);
 if (!lastCloseLog?.stock_count_id) return getCurrentSystemStockEstimate(supabase, location);

 const [countRes, itemRes, profileRes, currentItems] = await Promise.all([
 db
 .from('stock_counts')
 .select('id, count_number, status, created_at')
 .eq('id', lastCloseLog.stock_count_id)
 .maybeSingle(),
 db
 .from('stock_count_items')
 .select(`
 stock_item_id,
 counted_quantity,
 unit,
 stock_item:stock_items(item_code, name, category, base_unit)
 `)
 .eq('count_id', lastCloseLog.stock_count_id),
 lastCloseLog.completed_by
 ? db
 .from('profiles')
 .select('full_name')
 .eq('id', lastCloseLog.completed_by)
 .maybeSingle()
 : Promise.resolve({ data: null, error: null }),
 getCurrentSystemStockEstimateItems(supabase, location),
 ]);

 if (countRes.error) throw new Error(countRes.error.message);
 if (itemRes.error) throw new Error(itemRes.error.message);
 if (profileRes.error) throw new Error(profileRes.error.message);
 if (!countRes.data) return null;

 const items = (itemRes.data ?? [])
 .map((row: any) => {
 const stockItem = Array.isArray(row.stock_item) ? row.stock_item[0] : row.stock_item;
 const itemCode = String(stockItem?.item_code ?? '').trim().toUpperCase();
 const quantity = Number(row.counted_quantity ?? 0);
 return {
 stock_item_id: String(row.stock_item_id ?? ''),
 item_code: itemCode,
 item_name: String(stockItem?.name ?? (itemCode || 'Item stok')),
 estimated_quantity: Number.isFinite(quantity) ? quantity : 0,
 unit: String(row.unit ?? stockItem?.base_unit ?? 'PCS'),
 source_counted_quantity: Number.isFinite(quantity) ? quantity : 0,
 };
 })
 .filter((item: { stock_item_id: string; item_code: string }) =>
 item.stock_item_id && (POS_SHIFT_COUNT_ITEM_CODES as readonly string[]).includes(item.item_code));

 const existingCodes = new Set(items.map((item: { item_code: string }) => item.item_code));
 currentItems.forEach((item: { item_code: string }) => {
 if (!existingCodes.has(item.item_code)) {
 items.push(item);
 }
 });

 items.sort((a: { item_code: string }, b: { item_code: string }) =>
 (POS_SHIFT_COUNT_ORDER.get(a.item_code) ?? 99) - (POS_SHIFT_COUNT_ORDER.get(b.item_code) ?? 99));

 if (!items.length) return null;

 return {
 source: 'LAST_CLOSE_SHIFT',
 stock_count_id: String(countRes.data.id),
 count_number: String(countRes.data.count_number),
 completed_at: String(lastCloseLog.completed_at),
 production_date: lastCloseLog.production_date ? String(lastCloseLog.production_date) : null,
 completed_by_name: profileRes.data?.full_name ? String(profileRes.data.full_name) : null,
 items,
 };
 } catch (err) {
 console.warn('POS stock estimate unavailable', err);
 return getCurrentSystemStockEstimate(supabase, location);
 }
}

async function getCurrentSystemStockEstimateItems(
 supabase: Awaited<ReturnType<typeof createClient>>,
 location: BranchLocation) {
 const db = supabase as any;

 const [stockItemsRes, balancesRes] = await Promise.all([
 db
 .from('stock_items')
 .select('id, item_code, name, category, base_unit')
 .eq('organization_id', location.organization_id)
 .in('item_code', POS_SHIFT_COUNT_ITEM_CODES as readonly string[]),
 db
 .from('inventory_balances')
 .select('stock_item_id, quantity, unit')
 .eq('location_id', location.id),
 ]);

 if (stockItemsRes.error) throw new Error(stockItemsRes.error.message);
 if (balancesRes.error) throw new Error(balancesRes.error.message);

 const balanceByStockId = new Map<string, { quantity: number; unit: string }>();
 (balancesRes.data ?? []).forEach((balance: any) => {
 balanceByStockId.set(String(balance.stock_item_id), {
 quantity: Number(balance.quantity ?? 0),
 unit: String(balance.unit ?? 'PCS'),
 });
 });

 return (stockItemsRes.data ?? [])
 .map((stockItem: any) => {
 const itemCode = String(stockItem.item_code ?? '').trim().toUpperCase();
 const balance = balanceByStockId.get(String(stockItem.id));
 const quantity = Number(balance?.quantity ?? 0);
 return {
 stock_item_id: String(stockItem.id),
 item_code: itemCode,
 item_name: String(stockItem.name ?? (itemCode || 'Item stok')),
 estimated_quantity: Number.isFinite(quantity) ? quantity : 0,
 unit: String(balance?.unit ?? stockItem.base_unit ?? 'PCS'),
 source_counted_quantity: Number.isFinite(quantity) ? quantity : 0,
 };
 })
 .filter((item: { stock_item_id: string; item_code: string }) =>
 item.stock_item_id && (POS_SHIFT_COUNT_ITEM_CODES as readonly string[]).includes(item.item_code))
 .sort((a: { item_code: string }, b: { item_code: string }) =>
 (POS_SHIFT_COUNT_ORDER.get(a.item_code) ?? 99) - (POS_SHIFT_COUNT_ORDER.get(b.item_code) ?? 99));
}

async function getCurrentSystemStockEstimate(
 supabase: Awaited<ReturnType<typeof createClient>>,
 location: BranchLocation) {
 const items = await getCurrentSystemStockEstimateItems(supabase, location);
 if (!items.length) return null;
 return {
 source: 'CURRENT_SYSTEM_STOCK',
 stock_count_id: null,
 count_number: 'Stok semasa sistem',
 completed_at: null,
 production_date: null,
 completed_by_name: null,
 items,
 };
}

function toFiniteNumber(value: unknown) {
 const numeric = Number(value);
 return Number.isFinite(numeric) ? numeric : 0;
}

function formatVarianceQuantity(value: number) {
 return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function buildAiVarianceItems(items: SubmittedStockCountItem[], stockEstimate: StockEstimate) {
 const estimateItems = (stockEstimate?.items ?? []) as Array<{
 stock_item_id: string;
 item_code: string;
 item_name: string;
 estimated_quantity: number;
 unit: string;
 }>;
 const estimateByStockId = new Map(
 estimateItems.map((item) => [item.stock_item_id, item]));

 return items
 .map((item) => {
 const stockItemId = String(item.stock_item_id ?? '');
 const estimate = estimateByStockId.get(stockItemId);
 if (!stockItemId || !estimate) return null;

 const countedQuantity = toFiniteNumber(item.counted_quantity ?? item.quantity);
 const aiQuantity = toFiniteNumber(estimate.estimated_quantity);
 const difference = countedQuantity - aiQuantity;

 if (Math.abs(difference) <= 0.0001) return null;

 return {
 stock_item_id: stockItemId,
 item_code: String(item.item_code ?? estimate.item_code ?? '').trim().toUpperCase(),
 item_name: String(item.item_name ?? estimate.item_name ?? 'Item stok'),
 counted_quantity: countedQuantity,
 ai_quantity: aiQuantity,
 difference,
 unit: String(item.unit ?? estimate.unit ?? 'PCS'),
 production_date: item.production_date ?? null,
 };
 })
 .filter(Boolean) as Array<{
 stock_item_id: string;
 item_code: string;
 item_name: string;
 counted_quantity: number;
 ai_quantity: number;
 difference: number;
 unit: string;
 production_date: string | null;
 }>;
}

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { searchParams } = new URL(request.url);
 const branchId = searchParams.get('branch_id') ?? profile.branch_id;
 if (!branchId) return NextResponse.json({ error: 'Branch required' }, { status: 400 });

 const supabase = await createClient();
 const db = supabase as any;

 try {
 await assertCanAccessPosBranch(supabase, profile, branchId);

 const location = await getBranchLocation(supabase, branchId);

 const [receiptsRes, requestsRes, countsRes, sopStatusRes, stockEstimate] = await Promise.all([
 db
 .from('pos_stock_receipts')
 .select(`
 id,
 branch_id,
 location_id,
 route_stop_id,
 stock_transfer_id,
 status,
 receiver_name,
 driver_notes,
 staff_notes,
 manager_notes,
 delivered_at,
 staff_confirmed_at,
 manager_approved_at,
 created_at,
 driver:drivers(driver_code, full_name),
 delivered_by_profile:profiles!pos_stock_receipts_delivered_by_fkey(full_name),
 staff_profile:profiles!pos_stock_receipts_staff_confirmed_by_fkey(full_name),
 manager_profile:profiles!pos_stock_receipts_manager_approved_by_fkey(full_name),
 items:pos_stock_receipt_items(
 id,
 stock_item_id,
 expected_quantity,
 actual_quantity,
 variance_quantity,
 unit,
 production_date,
 staff_note,
 stock_item:stock_items(item_code, name, category, base_unit, conversion_text, pack_quantity, pack_unit)
 )
 `)
 .eq('branch_id', branchId)
 .in('status', ['DRIVER_DROPPED', 'STAFF_CONFIRMED', 'DISCREPANCY_PENDING_APPROVAL'])
 .order('created_at', { ascending: false }),
 db
 .from('pos_branch_supply_requests')
 .select('id, status, request_type, priority, needed_by, notes, items, created_at, updated_at')
 .eq('branch_id', branchId)
 .order('created_at', { ascending: false })
 .limit(10),
 supabase
 .from('stock_counts')
 .select('id, count_number, status, notes, created_at')
 .eq('location_id', location.id)
 .order('created_at', { ascending: false })
 .limit(8),
 inventoryRpc(supabase, 'pos_sop_status', { p_branch_id: branchId }),
 getLastCloseShiftEstimate(supabase, branchId, location),
 ]);

 if (receiptsRes.error) throw new Error(receiptsRes.error.message);
 if (requestsRes.error) throw new Error(requestsRes.error.message);
 if (countsRes.error) throw new Error(countsRes.error.message);
 if (sopStatusRes.error) throw new Error(sopStatusRes.error.message);

 return NextResponse.json({
 location,
 receipts: receiptsRes.data ?? [],
 supplyRequests: requestsRes.data ?? [],
 stockChecks: countsRes.data ?? [],
 stockEstimate,
 pendingDeliveryCount: (receiptsRes.data ?? []).filter(
 (r: { status: string }) => r.status === 'DRIVER_DROPPED' || r.status === 'DISCREPANCY_PENDING_APPROVAL').length,
 sopStatus: sopStatusRes.data ?? {},
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal memuatkan SOP stok POS' },
 { status: posAccessErrorStatus(err, 400) });
 }
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 const action = String(body.action ?? '');
 const branchId = body.branch_id ?? profile.branch_id;
 if (!branchId) return NextResponse.json({ error: 'Branch required' }, { status: 400 });

 const supabase = await createClient();
 const db = supabase as any;

 try {
 await assertCanAccessPosBranch(supabase, profile, branchId);

 if (action === 'confirm_delivery') {
 if (!body.receipt_id) {
 return NextResponse.json({ error: 'receipt_id required' }, { status: 400 });
 }

 const { data: receipt, error: receiptError } = await db
 .from('pos_stock_receipts')
 .select('id, branch_id')
 .eq('id', body.receipt_id)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();

 if (receiptError) throw new Error(receiptError.message);
 if (!receipt) {
 return NextResponse.json({ error: 'Rekod penghantaran stok tidak dijumpai' }, { status: 404 });
 }
 if (receipt.branch_id !== branchId) {
 return NextResponse.json(
 { error: 'Rekod penghantaran stok bukan milik cawangan yang dipilih' },
 { status: 403 });
 }

 const { data, error } = await inventoryRpc(supabase, 'pos_staff_confirm_stock_delivery', {
 p_receipt_id: body.receipt_id,
 p_items: body.items ?? [],
 p_staff_notes: body.notes ?? null,
 });
 if (error) throw new Error(error.message);
 return NextResponse.json({ result: data });
 }

 if (action === 'stock_check') {
 const location = await getBranchLocation(supabase, branchId);
 const checkType = String(body.check_type ?? 'MID_SHIFT').toUpperCase();
 if (!['OPENING', 'MID_SHIFT', 'CLOSE_SHIFT'].includes(checkType)) {
 return NextResponse.json({ error: 'Jenis kiraan stok tidak sah' }, { status: 400 });
 }
 const shiftId = body.shift_id ?? await getOpenShiftId(supabase, branchId);
 if (!shiftId) {
 return NextResponse.json({ error: 'Buka syif POS dahulu sebelum buat kiraan stok' }, { status: 400 });
 }
 if (profile.role === 'STAFF' && checkType === 'OPENING') {
 const { count: pendingDeliveryCount, error: pendingDeliveryError } = await db
 .from('pos_stock_receipts')
 .select('id', { count: 'exact', head: true })
 .eq('branch_id', branchId)
 .in('status', ['DRIVER_DROPPED', 'DISCREPANCY_PENDING_APPROVAL']);

 if (pendingDeliveryError) throw new Error(pendingDeliveryError.message);
 if (Number(pendingDeliveryCount ?? 0) > 0) {
 return NextResponse.json(
 { error: 'Sahkan penerimaan stok driver dahulu sebelum kiraan stok pembukaan dan jualan POS.' },
 { status: 400 });
 }
 }
 const items = Array.isArray(body.items) ? (body.items as SubmittedStockCountItem[]) : [];
 if (!items.length) return NextResponse.json({ error: 'Masukkan item kiraan stok' }, { status: 400 });

 const stockEstimate = await getLastCloseShiftEstimate(supabase, branchId, location);
 const aiVarianceItems = buildAiVarianceItems(items, stockEstimate);
 const submitAutoApproved = ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER'].includes(profile.role);
 const canApproveOfficialStockNow =
 submitAutoApproved || profile.role === 'AREA_MANAGER';
 const requiresManagerApproval = profile.role === 'STAFF' && aiVarianceItems.length > 0;
 const shouldApprovePendingCount =
 !requiresManagerApproval && !submitAutoApproved && canApproveOfficialStockNow;
 const shouldAutoApproveExactStaffCount =
 profile.role === 'STAFF' && aiVarianceItems.length === 0;

 const productionLines = items
 .filter((item: { production_date?: string; item_code?: string; stock_item_id?: string }) => item.production_date)
 .map((item: { production_date?: string; item_code?: string; stock_item_id?: string }) => {
 const code = String(item.item_code ?? '').trim().toUpperCase();
 return `${code || 'Item stok'}: ${item.production_date}`;
 });

 const notes = [
 `POS_${checkType}`,
 body.production_date ? `Production date: ${body.production_date}` : null,
 productionLines.length ? `Batch produk: ${productionLines.join(', ')}` : null,
 stockEstimate?.count_number ? `AI rujukan: ${stockEstimate.count_number}` : null,
 aiVarianceItems.length
 ? `Beza AI: ${aiVarianceItems.map((item) =>
 `${item.item_code || 'Item stok'} staf ${formatVarianceQuantity(item.counted_quantity)} ${item.unit}, AI ${formatVarianceQuantity(item.ai_quantity)} ${item.unit}`).join('; ')}`
 : 'Beza AI: tiada',
 body.notes ? String(body.notes) : null,
 ].filter(Boolean).join(' | ');

 const { data, error } = await inventoryRpc(supabase, 'submit_stock_count', {
 p_location_id: location.id,
 p_items: items,
 p_notes: notes || null,
 });
 if (error) throw new Error(error.message);

 const countId =
 data && typeof data === 'object' && 'count_id' in data
 ? String((data as { count_id?: string }).count_id ?? '')
 : null;

 if (countId && (shouldApprovePendingCount || shouldAutoApproveExactStaffCount)) {
 const { error: approveError } = await inventoryRpc(supabase, 'approve_stock_count', {
 p_count_id: countId,
 });
 if (approveError) throw new Error(approveError.message);

 await db
 .from('approval_requests')
 .update({
 status: 'APPROVED',
 approved_by: profile.id,
 resolved_at: new Date().toISOString(),
 metadata: {
 workflow: 'POS_STOCK_COUNT_AI_MATCH',
 ai_stock_count_id: stockEstimate?.stock_count_id ?? null,
 ai_count_number: stockEstimate?.count_number ?? null,
 },
 })
 .eq('entity_type', 'STOCK_TRANSFER')
 .eq('entity_id', countId)
 .eq('status', 'PENDING');
 } else if (countId && requiresManagerApproval) {
 const varianceSummary = aiVarianceItems
 .map((item) =>
 `${item.item_code || 'Item stok'}: staf ${formatVarianceQuantity(item.counted_quantity)} ${item.unit}, AI ${formatVarianceQuantity(item.ai_quantity)} ${item.unit}`)
 .join('; ');

 await db
 .from('approval_requests')
 .update({
 title: 'Kiraan stok POS perlu sah AM/OM',
 description: `Staf hantar kiraan stok yang berbeza daripada anggaran AI. ${varianceSummary}`,
 metadata: {
 workflow: 'POS_STOCK_COUNT_AI_VARIANCE',
 check_type: checkType,
 production_date: body.production_date || todayIso(),
 ai_stock_count_id: stockEstimate?.stock_count_id ?? null,
 ai_count_number: stockEstimate?.count_number ?? null,
 ai_variance_items: aiVarianceItems,
 },
 })
 .eq('entity_type', 'STOCK_TRANSFER')
 .eq('entity_id', countId)
 .eq('status', 'PENDING');
 }

 const { error: logError } = await db
 .from('pos_shift_stock_check_logs')
 .upsert(
 {
 organization_id: profile.organization_id,
 branch_id: branchId,
 shift_id: shiftId,
 stock_count_id: countId || null,
 check_type: checkType,
 production_date: body.production_date || todayIso(),
 notes: body.notes ?? null,
 completed_by: profile.id,
 },
 { onConflict: 'shift_id,check_type' });

 if (logError) throw new Error(logError.message);

 if (checkType === 'OPENING') {
 const startedAt = new Date().toISOString();
 const { data: currentShift } = await db
 .from('pos_shifts')
 .select('*')
 .eq('id', shiftId)
 .maybeSingle();
 const shiftUpdate: Record<string, string> = {};

 if (!currentShift?.business_started_at) {
 shiftUpdate.business_started_at = startedAt;
 }
 if (!currentShift?.payroll_started_at) {
 shiftUpdate.payroll_started_at =
 typeof currentShift?.business_started_at === 'string'
 ? currentShift.business_started_at
 : startedAt;
 }

 if (Object.keys(shiftUpdate).length) {
 const { error: businessStartError } = await db
 .from('pos_shifts')
 .update(shiftUpdate)
 .eq('id', shiftId);

 if (
 businessStartError &&
 !String(businessStartError.message ?? '').includes('business_started_at') &&
 !String(businessStartError.message ?? '').includes('payroll_started_at')
 ) {
 throw new Error(businessStartError.message);
 }
 }
 }

 const resultPayload =
 data && typeof data === 'object' && !Array.isArray(data)
 ? { ...(data as Record<string, unknown>) }
 : { value: data };

 return NextResponse.json({
 result: {
 ...resultPayload,
 requires_manager_approval: requiresManagerApproval,
 approval_status: requiresManagerApproval ? 'PENDING_AM_OM' : 'OFFICIAL',
 ai_variance_items: aiVarianceItems,
 },
 });
 }

 if (action === 'leave_start') {
 const shiftId = body.shift_id ?? await getOpenShiftId(supabase, branchId);
 if (!shiftId) {
 return NextResponse.json({ error: 'Buka syif POS dahulu sebelum rekod keluar kiosk' }, { status: 400 });
 }
 const { data, error } = await inventoryRpc(supabase, 'pos_staff_leave_start', {
 p_branch_id: branchId,
 p_shift_id: shiftId,
 p_reason: body.reason ?? 'OTHER',
 p_notes: body.notes ?? null,
 });
 if (error) throw new Error(error.message);
 return NextResponse.json({ result: data });
 }

 if (action === 'leave_return') {
 if (!body.presence_id) {
 return NextResponse.json({ error: 'presence_id required' }, { status: 400 });
 }
 const { data: presence, error: presenceError } = await db
 .from('pos_staff_presence_logs')
 .select('id, branch_id')
 .eq('id', body.presence_id)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();

 if (presenceError) throw new Error(presenceError.message);
 if (!presence) {
 return NextResponse.json({ error: 'Rekod keluar kiosk tidak dijumpai' }, { status: 404 });
 }
 if (presence.branch_id !== branchId) {
 return NextResponse.json(
 { error: 'Rekod keluar kiosk bukan milik cawangan yang dipilih' },
 { status: 403 });
 }

 const { data, error } = await inventoryRpc(supabase, 'pos_staff_leave_return', {
 p_presence_id: body.presence_id,
 });
 if (error) throw new Error(error.message);
 return NextResponse.json({ result: data });
 }

 if (action === 'presence_check') {
 const shiftId = body.shift_id ?? await getOpenShiftId(supabase, branchId);
 if (!shiftId) {
 return NextResponse.json({ error: 'Buka syif POS dahulu sebelum presence check' }, { status: 400 });
 }

 const { data, error } = await inventoryRpc(supabase, 'pos_staff_presence_check', {
 p_branch_id: branchId,
 p_shift_id: shiftId,
 p_status: body.status ?? 'CONFIRMED',
 p_prompt_reason: body.prompt_reason ?? 'IDLE_POS',
 p_prompted_at: body.prompted_at ?? null,
 p_notes: body.notes ?? null,
 });
 if (error) throw new Error(error.message);
 return NextResponse.json({ result: data });
 }

 if (action === 'supply_request') {
 const items = Array.isArray(body.items) ? body.items : [];
 if (!items.length) return NextResponse.json({ error: 'Masukkan item request barang' }, { status: 400 });

 const { data, error } = await inventoryRpc(supabase, 'create_pos_branch_supply_request', {
 p_branch_id: branchId,
 p_items: items,
 p_notes: body.notes ?? null,
 p_priority: body.priority ?? 'NORMAL',
 p_needed_by: body.needed_by ?? null,
 });
 if (error) throw new Error(error.message);
 return NextResponse.json({ result: data });
 }

 return NextResponse.json({ error: 'Action tidak dikenali' }, { status: 400 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal proses SOP stok POS' },
 { status: posAccessErrorStatus(err, 400) });
 }
}

function todayIso() {
 return new Date().toISOString().slice(0, 10);
}
