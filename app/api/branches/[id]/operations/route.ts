import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches, applyBranchIdsFilter } from '@/lib/auth/branch-scope';
import { computeBalanceStatus } from '@/lib/inventory/balance-utils';
import { isHqStockItemCode } from '@/lib/stock/catalog';
import { mapLegalEntityDocumentRow } from '@/lib/brand/legal-entity-profile';

const STOCK_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER']);
const STAFF_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATION_MANAGER', 'AREA_MANAGER']);
const DOCUMENT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATION_MANAGER', 'AREA_MANAGER', 'BRANCH_MANAGER']);
const AUTO_APPROVE_STOCK_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']);

type StockItemRow = {
 id: string;
 item_code: string;
 name: string;
 category: string | null;
 base_unit: string;
 min_threshold: number | null;
 critical_threshold: number | null;
 pack_quantity: number | null;
 pack_unit: string | null;
 conversion_text: string | null;
};

type BalanceRow = {
 id: string;
 location_id: string;
 stock_item_id: string;
 quantity: number;
 unit: string;
 stock_item: StockItemRow | null;
};

type BranchLocationRow = {
 id: string;
 name: string;
 location_type: string;
 branch_id: string | null;
};

type BranchIdentityRow = {
 branch_name: string;
 branch_code: string;
};

export async function GET(
 _request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { id: branchId } = await params;
 const supabase = await createClient();

 try {
 const scope = await resolveScopedBranches(supabase, profile);
 if (scope.branchIds !== null && !scope.branchIds.includes(branchId)) {
 return NextResponse.json({ error: 'Cawangan di luar skop akses anda' }, { status: 403 });
 }

 const { data: branch, error: branchErr } = await supabase
 .from('branches')
 .select('id, branch_code, branch_name, status')
 .eq('organization_id', profile.organization_id)
 .eq('id', branchId)
 .maybeSingle();

 if (branchErr) return NextResponse.json({ error: branchErr.message }, { status: 500 });
 if (!branch) return NextResponse.json({ error: 'Cawangan tidak dijumpai' }, { status: 404 });

 const { data: locationData } = await supabase
 .from('inventory_locations')
 .select('id, name, location_type, branch_id')
 .eq('organization_id', profile.organization_id)
 .eq('branch_id', branchId)
 .eq('location_type', 'BRANCH_KIOSK')
 .eq('is_active', true)
 .order('name')
 .limit(1)
 .maybeSingle();
 const location = locationData as BranchLocationRow | null;

 const service = await createServiceClient();
 const [balances, staff, branchOptions, documents] = await Promise.all([
 location
 ? loadBranchBalances(supabase, profile.organization_id, location.id)
 : Promise.resolve([]),
 loadBranchStaff(supabase, profile.organization_id, branchId),
 loadBranchOptions(supabase, profile.organization_id, scope.branchIds),
 loadBranchDocuments(service, profile.organization_id, branch as BranchIdentityRow),
 ]);

 return NextResponse.json({
 branch,
 location,
 balances,
 staff,
 documents,
 branch_options: branchOptions,
 permissions: {
 can_adjust_stock: STOCK_ROLES.has(profile.role),
 can_manage_staff: STAFF_ROLES.has(profile.role),
 can_transfer_staff: STAFF_ROLES.has(profile.role),
 can_manage_documents: DOCUMENT_ROLES.has(profile.role),
 stock_auto_approve: AUTO_APPROVE_STOCK_ROLES.has(profile.role),
 role: profile.role,
 },
 stock_reasons: stockReasonsForRole(profile.role),
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal baca operasi cawangan' },
 { status: 403 });
 }
}

function normalize(text: string | null | undefined) {
 return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function documentMatchesBranch(branchName: string | null, branch: BranchIdentityRow) {
 if (!branchName) return false;
 const needle = normalize(branchName);
 const branchCode = normalize(branch.branch_code);
 const branchLabel = normalize(branch.branch_name);
 return (
 needle === branchCode ||
 needle === branchLabel ||
 (branchLabel.length > 4 && (needle.includes(branchLabel) || branchLabel.includes(needle))) ||
 (branchCode.length > 1 && needle.includes(branchCode))
 );
}

async function loadBranchDocuments(
 service: Awaited<ReturnType<typeof createServiceClient>>,
 orgId: string,
 branch: BranchIdentityRow) {
 const { data, error } = await service
 .from('legal_entity_documents')
 .select('id, branch_name, document_type, title, file_name, source_path, folder_path, storage_path, file_size, mime_type, issue_date, expiry_date, status, notes, legal_entity:legal_entities(code)')
 .eq('organization_id', orgId)
 .eq('status', 'ACTIVE')
 .order('document_type')
 .order('title');

 if (error) throw new Error(error.message);

 return ((data ?? []) as Record<string, unknown>[])
 .map((row) => {
 const mapped = mapLegalEntityDocumentRow(row as never);
 if (mapped.storagePath) mapped.downloadUrl = `/api/legal-entities/documents/${mapped.id}/download`;
 return mapped;
 })
 .filter((doc) => doc.legalEntityCode === 'RKJ' && documentMatchesBranch(doc.branchName, branch));
}

async function loadBranchBalances(
 supabase: Awaited<ReturnType<typeof createClient>>,
 orgId: string,
 locationId: string) {
 const [itemsRes, balancesRes] = await Promise.all([
 supabase
 .from('stock_items')
 .select(
 'id, item_code, name, category, base_unit, min_threshold, critical_threshold, pack_quantity, pack_unit, conversion_text')
 .eq('organization_id', orgId)
 .eq('status', 'ACTIVE')
 .order('item_code'),
 supabase
 .from('inventory_balances')
 .select(
 `id, location_id, stock_item_id, quantity, unit,
 stock_item:stock_items(
 id, item_code, name, category, base_unit, min_threshold, critical_threshold,
 pack_quantity, pack_unit, conversion_text
 )`)
 .eq('location_id', locationId),
 ]);

 if (itemsRes.error) throw new Error(itemsRes.error.message);
 if (balancesRes.error) throw new Error(balancesRes.error.message);

 const stockItems = ((itemsRes.data ?? []) as StockItemRow[])
 .filter((item) => isHqStockItemCode(item.item_code));
 const balanceRows = (balancesRes.data ?? []) as unknown as BalanceRow[];
 const balanceByItem = new Map(balanceRows.map((row) => [row.stock_item_id, row]));

 return stockItems.map((item) => {
 const balance = balanceByItem.get(item.id);
 const quantity = Number(balance?.quantity ?? 0);
 const unit = balance?.unit ?? item.base_unit;
 return {
 id: balance?.id ?? `virtual-${locationId}-${item.id}`,
 location_id: locationId,
 stock_item_id: item.id,
 quantity,
 unit,
 stock_item: item,
 status: computeBalanceStatus(
 quantity,
 item.min_threshold,
 item.critical_threshold),
 };
 });
}

async function loadBranchStaff(
 supabase: Awaited<ReturnType<typeof createClient>>,
 orgId: string,
 branchId: string) {
 const { data, error } = await supabase
 .from('staff')
 .select('id, staff_code, full_name, status, branch_id, region_id, worker_type, branch:branches(branch_code, branch_name)')
 .eq('organization_id', orgId)
 .eq('branch_id', branchId)
 .order('status')
 .order('full_name');

 if (error) throw new Error(error.message);
 return data ?? [];
}

async function loadBranchOptions(
 supabase: Awaited<ReturnType<typeof createClient>>,
 orgId: string,
 branchIds: string[] | null) {
 let query = supabase
 .from('branches')
 .select('id, branch_code, branch_name, area, region_id, status')
 .eq('organization_id', orgId)
 .eq('status', 'ACTIVE')
 .order('branch_code');

 query = applyBranchIdsFilter(query, 'id', branchIds);
 const { data, error } = await query;
 if (error) throw new Error(error.message);
 return data ?? [];
}

function stockReasonsForRole(role: string) {
 if (role === 'AREA_MANAGER') {
 return [
 'Kiraan stok lawatan Area Manager',
 'Stok rosak / expired di cawangan',
 'Pembetulan stok selepas closing POS',
 'Pembetulan penerimaan dari driver',
 'Pindahan kecemasan dalam kawasan',
 'Selisih fizikal semasa audit',
 ];
 }

 if (role === 'OPERATION_MANAGER') {
 return [
 'Audit operasi OM',
 'Reconciliation stok harian',
 'Pembetulan route delivery',
 'Pelarasan stok selepas pemeriksaan cawangan',
 'Stock count berkala',
 'Isu operasi POS / inventory',
 ];
 }

 return [
 'Kiraan stok harian cawangan',
 'Pembetulan selepas audit HQ',
 'Stok rosak / expired disahkan',
 'Reconciliation jualan POS',
 'Pembetulan penerimaan stok dari driver',
 'Pindahan kecemasan antara cawangan',
 ];
}
