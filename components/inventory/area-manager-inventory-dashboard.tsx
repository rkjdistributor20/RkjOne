'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
 Package,
 ArrowLeftRight,
 History,
 Plus,
 ClipboardList,
 Trash2,
} from 'lucide-react';
import {
 fetchLocations,
 fetchStockItems,
 fetchBalances,
 fetchTransfers,
 receiveStock,
 createTransfer,
 dispatchTransfer,
 completeTransfer,
 submitAdjustment,
 submitCount,
 submitWriteOff,
 fetchDrivers,
 fetchVehicles,
} from '@/lib/inventory/api';
import type {
 AdjustmentItemInput,
 InventoryBalanceRow,
 InventoryLocation,
 LineItemInput,
 StockItemOption,
 StockTransferRow,
} from '@/lib/inventory/types';
import { LOCATION_TYPE_LABELS } from '@/lib/inventory/types';
import { useAuthStore } from '@/stores/auth-store';
import {
 getInventoryStockUiAccess,
 canSetRotiProductionDate,
 canAccessBranchKioskTransferTab,
} from '@/lib/auth/stock-access';
import { formatBranchDestination } from '@/lib/fleet/display-labels';
import { BranchTransferPanel } from '@/components/inventory/branch-transfer-panel';
import { BranchScopeSelect } from '@/components/shared/branch-scope-select';
import { KioskOverviewPanel } from '@/components/inventory/kiosk-overview-panel';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BalanceTable } from '@/components/inventory/balance-table';
import { AmMovementHistory } from '@/components/inventory/movement-list';
import { StockLineForm } from '@/components/inventory/stock-line-form';
import { TransferPanel } from '@/components/inventory/transfer-panel';
import { AreaManagerInventoryShell } from '@/components/inventory/area-manager-inventory-shell';
import { AmCountReviewPanel } from '@/components/inventory/am-count-review-panel';
import {
 ModuleLayout,
 ModuleHeader,
 ModuleLoading,
 EmptyState,
 moduleTabsListClass,
 moduleTabsTriggerClass,
} from '@/components/shared/module-ui';

import type { Profile } from '@/types/database';

export type ServerInventoryProfile = Pick<
 Profile,
 'role' | 'branch_id' | 'region_id' | 'full_name'
>;

interface AreaManagerInventoryDashboardProps {
 serverProfile: ServerInventoryProfile;
 deployCommit?: string;
}

/** Inventori AM - tiada dropdown jenis lokasi (ALL) atau UUID; cawangan + grid Buka sahaja */
export function AreaManagerInventoryDashboard({
 serverProfile,
 deployCommit,
}: AreaManagerInventoryDashboardProps) {
 const clientProfile = useAuthStore((s) => s.profile);
 const profile = clientProfile ?? serverProfile;
 const canCrossBranchTransfer = profile
 ? canAccessBranchKioskTransferTab(profile.role)
 : false;

 const [locations, setLocations] = useState<InventoryLocation[]>([]);
 const [selectedLocationId, setSelectedLocationId] = useState('');
 const [selectedBranchId, setSelectedBranchId] = useState(
 serverProfile.branch_id ?? '');
 const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
 const [balances, setBalances] = useState<InventoryBalanceRow[]>([]);
 const [transfers, setTransfers] = useState<StockTransferRow[]>([]);
 const [loading, setLoading] = useState(true);
 const [loadedLocationId, setLoadedLocationId] = useState('');
 const [reloadKey, setReloadKey] = useState(0);
 const dataRequest = useRef(0);
 const locationsRequest = useRef(0);
 const [locationsLoading, setLocationsLoading] = useState(true);
 const [activeTab, setActiveTab] = useState('balances');
 const [dashboardView, setDashboardView] = useState<'location' | 'branch-transfer'>('location');

 const branchId = selectedBranchId || undefined;
 const selectBranch = useCallback((id: string) => {
 setSelectedBranchId(id);
 setSelectedLocationId('');
 }, []);
 const reload = () => setReloadKey((key) => key + 1);
 const selectedLocation = locations.find((l) => l.id === selectedLocationId && l.branch_id === branchId);
 const detailLocationId = selectedLocation?.id;

 const loadLocations = useCallback(async () => {
 const requestId = ++locationsRequest.current;
 setLocationsLoading(true);
 try {
 const { locations: locs } = await fetchLocations('BRANCH_KIOSK', branchId);
 if (locationsRequest.current !== requestId) return;
 const kioskLocs = locs.filter((l) => l.location_type === 'BRANCH_KIOSK');
 setLocations(kioskLocs);
 setSelectedLocationId((prev) => {
 if (!kioskLocs.length) return '';
 if (!branchId) return '';
 const kiosk = kioskLocs.find((l) => l.branch_id === branchId);
 if (kiosk) return kiosk.id;
 if (kioskLocs.some((l) => l.id === prev)) return prev;
 return '';
 });
 } catch (err) {
 if (locationsRequest.current !== requestId) return;
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan lokasi');
 setLocations([]);
 setSelectedLocationId('');
 } finally {
 if (locationsRequest.current === requestId) setLocationsLoading(false);
 }
 }, [branchId]);

 const loadData = useCallback(async () => {
 const requestId = ++dataRequest.current;
 if (!detailLocationId || dashboardView !== 'location') return;
 setLoading(true);
 try {
 const [bal, trf] = await Promise.all([
 fetchBalances(detailLocationId),
 fetchTransfers(detailLocationId).catch(() => null),
 ]);
 if (dataRequest.current !== requestId) return;
 setBalances(bal.balances);
 setTransfers(trf?.transfers ?? []);
 if (!trf) toast.error('Senarai pindahan gagal dimuatkan');
 setLoadedLocationId(detailLocationId);
 } catch (err) {
 if (dataRequest.current !== requestId) return;
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan inventori');
 setLoadedLocationId('');
 } finally {
 if (dataRequest.current === requestId) setLoading(false);
 }
 }, [detailLocationId, dashboardView]);

 useEffect(() => {
 fetchStockItems({ hq: true }).then(({ items }) => setStockItems(items)).catch(() => toast.error('Gagal memuatkan senarai stok'));
 }, []);

 useEffect(() => {
 if (!branchId || !locations.length) return;
 const kiosk = locations.find(
 (l) => l.branch_id === branchId && l.location_type === 'BRANCH_KIOSK');
 if (kiosk) setSelectedLocationId(kiosk.id);
 }, [branchId, locations]);

 useEffect(() => {
 loadLocations();
 }, [loadLocations]);

 useEffect(() => {
 loadData();
 }, [loadData, reloadKey]);

 const kioskLocations = locations.filter((l) => l.location_type === 'BRANCH_KIOSK');
 const branchChosen = Boolean(selectedBranchId);

 if (!profile) {
 return (
 <ModuleLayout>
 <ModuleLoading />
 </ModuleLayout>);
 }

 const deployHint = deployCommit ? ` - ${deployCommit}` : '';

 const stockAccess = getInventoryStockUiAccess(profile.role, selectedLocation?.location_type);
 const orderMaker = canSetRotiProductionDate(profile.role);
 const isKioskView = selectedLocation?.location_type === 'BRANCH_KIOSK';
 const lowCount = balances.filter((b) => b.status === 'LOW').length;
 const criticalCount = balances.filter((b) => b.status === 'CRITICAL').length;
 const pendingInbound = transfers.filter((t) => t.status === 'IN_TRANSIT').length;

 function formatLocationLabel(loc: InventoryLocation) {
 if (loc.branch?.branch_name) {
 return formatBranchDestination(loc);
 }
 return `${LOCATION_TYPE_LABELS[loc.location_type]} - ${loc.name}`;
 }

 function handleOverviewSelect(branchIdPick: string, locationId: string) {
 setSelectedBranchId(branchIdPick);
 setSelectedLocationId(locationId);
 setDashboardView('location');
 setActiveTab('balances');
 }

 async function handleReceive(items: LineItemInput[], meta?: { source?: string; notes?: string; documentReference?: string }) {
 await receiveStock(selectedLocationId, items, meta?.source, meta?.notes, meta?.documentReference);
 toast.success('Penerimaan stok direkod terus');
 reload();
 }

 async function handleAdjustment(
 reason: string,
 items: AdjustmentItemInput[]) {
 await submitAdjustment(selectedLocationId, reason, items);
 toast.success('Pelarasan stok dipos');
 reload();
 }

 async function handleCount(
 items: Array<{ stock_item_id: string; counted_quantity: number }>,
 notes?: string) {
 try {
 await submitCount(selectedLocationId, items, notes);
 toast.success('Kiraan stok dihantar');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal hantar kiraan');
 }
 }

 async function handleWriteOff(reason: string, items: LineItemInput[]) {
 try {
 await submitWriteOff(selectedLocationId, reason, items);
 toast.success('Lupus stok dihantar');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal hantar lupus stok');
 }
 }

 function renderLocationDetail() {
 if (locationsLoading) {
 return <ModuleLoading rows={1} />;
 }
 if (kioskLocations.length === 0) {
 return (
 <EmptyState
 icon={Package}
 title="Tiada kiosk cawangan"
 description="Tiada lokasi kiosk dalam kawasan anda. Hubungi admin HQ jika cawangan tiada kiosk."
 />);
 }
 if (!selectedLocationId || !selectedLocation) {
 return <ModuleLoading rows={2} />;
 }

 return (
 <>
 <Card>
 <CardHeader className="pb-2">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <CardTitle className="text-base">{formatLocationLabel(selectedLocation)}</CardTitle>
 <Button type="button" size="sm" variant="outline" onClick={reload} disabled={loading}>Muat semula baki</Button>
 </div>
 </CardHeader>
 <CardContent className="space-y-2 text-sm text-muted-foreground">
 <p>
 {LOCATION_TYPE_LABELS[selectedLocation.location_type]}
 {selectedLocation.branch?.branch_name &&
 ` - ${selectedLocation.branch.branch_code} - ${selectedLocation.branch.branch_name}`}
 </p>
 {isKioskView && (
 <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
 Stok sumber luar boleh direkod terus. Untuk stok pindahan, gunakan tab Pindah atau rekod penghantaran berpaut.
 </p>)}
 {isKioskView && pendingInbound > 0 && (
 <p className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-950">
 {pendingInbound} pindahan HQ dalam perjalanan - pergi tab{' '}
 <button
 type="button"
 className="underline"
 onClick={() => setActiveTab('transfer')}
 >
 Pindah
 </button>{' '}
 ke Terima di Kiosk
 </p>)}
 </CardContent>
 </Card>

 {loading ? (
 <Skeleton className="h-64 w-full" />) : loadedLocationId !== selectedLocationId ? (
 <button type="button" className="text-sm underline" onClick={() => void loadData()}>Cuba muatkan inventori semula</button>
 ) : (
 <Tabs
 key={selectedLocationId}
 value={activeTab}
 onValueChange={setActiveTab}
 className="space-y-4"
 >
 <TabsList className={moduleTabsListClass}>
 <TabsTrigger value="balances" className={moduleTabsTriggerClass}>
 <Package className="h-4 w-4" /> Baki
 </TabsTrigger>
 <TabsTrigger value="movements" className={moduleTabsTriggerClass}>
 <History className="h-4 w-4" /> Pergerakan
 </TabsTrigger>
 {isKioskView && (
 <TabsTrigger value="receive" className={moduleTabsTriggerClass}>
 <Plus className="h-4 w-4" /> Terima
 </TabsTrigger>)}
 {stockAccess?.canTransfer && (
 <TabsTrigger value="transfer" className={moduleTabsTriggerClass}>
 <ArrowLeftRight className="h-4 w-4" /> Pindah
 </TabsTrigger>)}
 {stockAccess?.canAdjust && (
 <TabsTrigger value="adjust" className={moduleTabsTriggerClass}>
 <ClipboardList className="h-4 w-4" /> Laras
 </TabsTrigger>)}
 {stockAccess?.canCount && (
 <TabsTrigger value="count" className={moduleTabsTriggerClass}>
 <ClipboardList className="h-4 w-4" /> Kira
 </TabsTrigger>)}
 {isKioskView && <TabsTrigger value="review-counts" className={moduleTabsTriggerClass}>
 <ClipboardList className="h-4 w-4" /> Semak Kiraan
 </TabsTrigger>}
 {stockAccess?.canWriteOff && (
 <TabsTrigger value="writeoff" className={moduleTabsTriggerClass}>
 <Trash2 className="h-4 w-4" /> Lupus
 </TabsTrigger>)}
 </TabsList>

 <div className="mt-4">
 {activeTab === 'balances' &&
 (balances.length === 0 ? (
 <EmptyState
 icon={Package}
 title="Tiada baki stok"
 description="Lokasi ini belum mempunyai baki stok. Terima stok dari tab Terima."
 />) : (
 <BalanceTable balances={balances} showPackConversion groupByCategory />))}

 {activeTab === 'movements' && <AmMovementHistory locationId={selectedLocationId} />}

 {activeTab === 'receive' && isKioskView && (
 <StockLineForm
 mode="receive"
 stockItems={stockItems}
 manualReceipt
 requireRotiProductionDate
 onSubmit={handleReceive}
 />)}

 {activeTab === 'transfer' && stockAccess?.canTransfer && (
 <TransferPanel
 locations={kioskLocations}
 kioskOnly
 stockItems={stockItems}
 transfers={transfers}
 currentLocationId={selectedLocationId}
 onCancelled={loadData}
 onCreate={async (payload, requestId) => {
 try {
 await createTransfer(payload, requestId);
 toast.success('Pindahan dicipta');
 loadData();
 return true;
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal cipta pindahan');
 return false;
 }
 }}
 onDispatch={async (id) => {
 try {
 await dispatchTransfer(id);
 toast.success('Pindahan dihantar');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal hantar pindahan');
 }
 }}
 onComplete={async (id) => {
 try {
 await completeTransfer(id);
 toast.success('Pindahan selesai');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal selesaikan pindahan');
 }
 }}
 loadDrivers={fetchDrivers}
 loadVehicles={fetchVehicles}
 canSetRotiProductionDate={orderMaker}
 />)}

 {activeTab === 'adjust' && stockAccess?.canAdjust && (
 <StockLineForm
 mode="adjust"
 stockItems={stockItems}
 balances={balances}
 directAdjustment
 onSubmitAdjust={handleAdjustment}
 />)}

 {activeTab === 'review-counts' && isKioskView && (
 <AmCountReviewPanel locationId={selectedLocationId} onReviewed={reload} />)}

 {activeTab === 'count' && stockAccess?.canCount && (
 <StockLineForm
 mode="count"
 stockItems={stockItems}
 balances={balances}
 onSubmitCount={handleCount}
 />)}

 {activeTab === 'writeoff' && stockAccess?.canWriteOff && (
 <StockLineForm
 mode="writeoff"
 stockItems={stockItems}
 onSubmitWriteOff={handleWriteOff}
 />)}
 </div>
 </Tabs>)}
 </>);
 }

 function renderLocationPanel() {
 return (
 <>
 <BranchScopeSelect
 value={selectedBranchId}
 onChange={selectBranch}
 allowAll
 allLabel="Semua kiosk kawasan saya"
 />

 {!branchChosen ? (
 <div className="space-y-4">
 <p className="text-sm text-muted-foreground">
 Pilih cawangan dari senarai atas, atau klik <strong>Buka</strong> pada grid di bawah
 untuk urus stok kiosk.
 </p>
 <KioskOverviewPanel branchId={undefined} onSelectBranch={handleOverviewSelect} />
 </div>) : (
 <div className="space-y-4">
 {selectedLocation && (
 <p className="text-sm">
 <span className="text-muted-foreground">Kiosk: </span>
 <span className="font-medium">{formatLocationLabel(selectedLocation)}</span>
 </p>)}
 {renderLocationDetail()}
 </div>)}
 </>);
 }

 return (
 <ModuleLayout data-am-inventory="v2">
 <ModuleHeader
 title="Inventori Kawasan"
 description={`Stok kiosk cawangan dalam kawasan anda - terima, pindah, kira & lupus${deployHint}`}
 icon={Package}
 badges={
 dashboardView === 'location' && selectedLocationId ? (
 <>
 {criticalCount > 0 && (
 <Badge variant="destructive">{criticalCount} Kritikal</Badge>)}
 {lowCount > 0 && <Badge variant="secondary">{lowCount} Stok Rendah</Badge>}
 </>) : null
 }
 />

 <AreaManagerInventoryShell
 view={dashboardView === 'branch-transfer' ? 'branch-transfer' : 'location'}
 onViewChange={(v) => setDashboardView(v)}
 showBranchTransfer={canCrossBranchTransfer}
 locationPanel={renderLocationPanel()}
 branchTransferPanel={<BranchTransferPanel />}
 />
 </ModuleLayout>);
}
