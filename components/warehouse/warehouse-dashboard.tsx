'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Warehouse, Package, ArrowRight, ClipboardCheck, ClipboardList } from 'lucide-react';
import {
 fetchWarehouseSummary,
 fetchWarehouseAudits,
 submitWarehouseAudit,
 approveWarehouseAudit,
} from '@/lib/warehouse/api';
import { fetchStockItems, fetchBalances } from '@/lib/inventory/api';
import type { WarehouseAudit, WarehouseSummary } from '@/lib/warehouse/types';
import type { StockItemOption, InventoryBalanceRow } from '@/lib/inventory/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StockLineForm } from '@/components/inventory/stock-line-form';
import { BalanceTable } from '@/components/inventory/balance-table';
import { useAuthStore } from '@/stores/auth-store';
import { isAdminRole } from '@/lib/auth/permissions';
import {
 canManageHqStockInOut,
 canSubmitHqFactoryOrder,
} from '@/lib/auth/stock-access';
import { fetchProductionCalendar } from '@/lib/production/api';
import type { PublishedProductionDate } from '@/lib/production/types';
import { HqFactoryOrderPanel } from '@/components/warehouse/hq-factory-order-panel';
import { OperationsWorkflowMap } from '@/components/dashboard/operations-workflow-map';
import { COMPANY } from '@/lib/brand/company';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { labelFor, TRANSFER_STATUS_LABELS } from '@/lib/ui/labels';
import {
 ModuleLayout,
 ModuleHeader,
 ModuleLoading,
 EmptyState,
 KpiGrid,
 KpiCard,
 moduleTabsListClass,
 moduleTabsTriggerClass,
} from '@/components/shared/module-ui';

type WarehouseTab = 'stock' | 'hq-order' | 'audit';
type HqLocationRef = NonNullable<WarehouseSummary['location']>;

export function WarehouseDashboard() {
 const profile = useAuthStore((s) => s.profile);
 const canManageHq = profile ? canManageHqStockInOut(profile.role) : false;
 const canOrder = profile ? canSubmitHqFactoryOrder(profile.role) : false;
 const canApprove = profile ? isAdminRole(profile.role) || profile.role === 'OPERATION_MANAGER' : false;

 const [activeTab, setActiveTab] = useState<WarehouseTab>('stock');
 const [initialTabResolved, setInitialTabResolved] = useState(false);
 const [publishedDates, setPublishedDates] = useState<PublishedProductionDate[]>([]);
 const [summary, setSummary] = useState<WarehouseSummary | null>(null);
 const [audits, setAudits] = useState<WarehouseAudit[]>([]);
 const [hqLocation, setHqLocation] = useState<HqLocationRef | null>(null);
 const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
 const [balances, setBalances] = useState<InventoryBalanceRow[]>([]);

 const [summaryLoading, setSummaryLoading] = useState(true);
 const [calendarLoading, setCalendarLoading] = useState(false);
 const [calendarLoaded, setCalendarLoaded] = useState(false);
 const [stockItemsLoading, setStockItemsLoading] = useState(false);
 const [stockItemsLoaded, setStockItemsLoaded] = useState(false);
 const [balancesLoading, setBalancesLoading] = useState(false);
 const [balancesLoaded, setBalancesLoaded] = useState(false);
 const [auditsLoading, setAuditsLoading] = useState(false);
 const [auditsLoaded, setAuditsLoaded] = useState(false);

 const loadSummary = useCallback(async () => {
 setSummaryLoading(true);
 try {
 const { summary: nextSummary } = await fetchWarehouseSummary();
 setSummary(nextSummary);
 setHqLocation(nextSummary.location ?? null);
 } catch (err) {
 setSummary(null);
 setHqLocation(null);
 toast.error(err instanceof Error ? err.message : `Gagal memuatkan ${HQ_DISTRIBUTOR_LABEL}`);
 } finally {
 setSummaryLoading(false);
 }
 }, []);

 const loadCalendar = useCallback(async () => {
 setCalendarLoading(true);
 try {
 const { dates } = await fetchProductionCalendar();
 setPublishedDates(dates);
 } catch (err) {
 setPublishedDates([]);
 toast.error(
 err instanceof Error ? err.message : 'Gagal memuatkan jadual production kilang');
 } finally {
 setCalendarLoaded(true);
 setCalendarLoading(false);
 }
 }, []);

 const loadStockItems = useCallback(async () => {
 setStockItemsLoading(true);
 try {
 const items = await fetchStockItems({ hq: true });
 setStockItems(items.items);
 } catch (err) {
 setStockItems([]);
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan item stok HQ');
 } finally {
 setStockItemsLoaded(true);
 setStockItemsLoading(false);
 }
 }, []);

 const loadBalancesForLocation = useCallback(async (locationId: string) => {
 setBalancesLoading(true);
 try {
 const bal = await fetchBalances(locationId);
 setBalances(bal.balances);
 } catch (err) {
 setBalances([]);
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan baki stok HQ');
 } finally {
 setBalancesLoaded(true);
 setBalancesLoading(false);
 }
 }, []);

 const loadAudits = useCallback(async () => {
 setAuditsLoading(true);
 try {
 const aud = await fetchWarehouseAudits();
 setAudits(aud.audits);
 } catch (err) {
 setAudits([]);
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan audit HQ');
 } finally {
 setAuditsLoaded(true);
 setAuditsLoading(false);
 }
 }, []);

 useEffect(() => {
 void loadSummary();
 }, [loadSummary]);

 useEffect(() => {
 if (!profile || initialTabResolved) return;
 setActiveTab(canOrder ? 'hq-order' : 'stock');
 setInitialTabResolved(true);
 }, [canOrder, initialTabResolved, profile]);

 useEffect(() => {
 if (!canOrder && activeTab === 'hq-order') {
 setActiveTab('stock');
 }
 if (!canManageHq && activeTab === 'audit') {
 setActiveTab(canOrder ? 'hq-order' : 'stock');
 }
 }, [activeTab, canManageHq, canOrder]);

 useEffect(() => {
 if ((canOrder || canManageHq) && !stockItemsLoaded) {
 void loadStockItems();
 }
 }, [canManageHq, canOrder, loadStockItems, stockItemsLoaded]);

 useEffect(() => {
 if (canOrder && !calendarLoaded) {
 void loadCalendar();
 }
 }, [calendarLoaded, canOrder, loadCalendar]);

 useEffect(() => {
 if (!hqLocation?.id || balancesLoaded) return;
 if (activeTab === 'stock' || activeTab === 'audit') {
 void loadBalancesForLocation(hqLocation.id);
 }
 }, [activeTab, balancesLoaded, hqLocation?.id, loadBalancesForLocation]);

 useEffect(() => {
 if (activeTab === 'audit' && canManageHq && !auditsLoaded) {
 void loadAudits();
 }
 }, [activeTab, auditsLoaded, canManageHq, loadAudits]);

 const orderBootstrapLoading =
 canOrder && (calendarLoading || stockItemsLoading || !calendarLoaded || !stockItemsLoaded);

 const refreshAfterAudit = async () => {
 const tasks: Array<Promise<void>> = [loadSummary()];
 if (hqLocation?.id) tasks.push(loadBalancesForLocation(hqLocation.id));
 tasks.push(loadAudits());
 await Promise.all(tasks);
 };

 return (
 <ModuleLayout>
 <ModuleHeader
 title={HQ_DISTRIBUTOR_LABEL}
 description={`${COMPANY.hq} - order per cawangan - cross-dock terus ke kiosk - driver sahkan`}
 icon={Warehouse}
 />

 <KpiGrid cols={4}>
 <KpiCard title="Item Stok" value={summaryLoading ? '...' : `${summary?.total_items ?? 0} / 9`} icon={Package} />
 <KpiCard
 title="Jumlah Kuantiti"
 value={summaryLoading ? '...' : summary?.total_quantity?.toLocaleString() ?? 0}
 icon={Package}
 />
 <KpiCard
 title="Stok Rendah"
 value={summaryLoading ? '...' : summary?.low_stock_count ?? 0}
 icon={Package}
 variant="warning"
 />
 <KpiCard
 title="Menunggu"
 value={
 summaryLoading
 ? '...'
 : `${summary?.pending_transfers ?? 0} pindah - ${summary?.pending_deliveries ?? 0} hantar`
 }
 icon={ArrowRight}
 />
 </KpiGrid>

 {!canManageHq && (
 <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
 Paparan sahaja - {HQ_DISTRIBUTOR_LABEL} tidak menyimpan stok; pre-order dihantar terus ke cawangan
 selepas kilang sahkan.
 {canOrder && ' Anda boleh hantar order per cawangan di tab Order Kilang.'}
 </p>)}

 {canManageHq && (
 <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
 <strong>Cross-dock:</strong> Bila kilang sahkan order muktamad, stok diterima automatik
 dan dihantar terus ke cawangan mengikut laluan driver. Tiada simpanan stok di HQ - 
 driver sahkan penghantaran di tab {LOGISTIK_LABEL} ke Jadual Kerja.
 </p>)}

 <OperationsWorkflowMap focus="hq" compact />

 <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as WarehouseTab)} className="space-y-4">
 <TabsList className={moduleTabsListClass}>
 <TabsTrigger value="stock" className={moduleTabsTriggerClass}>
 <Package className="h-4 w-4" /> Stok
 </TabsTrigger>
 {canOrder && (
 <TabsTrigger value="hq-order" className={moduleTabsTriggerClass}>
 <ClipboardList className="h-4 w-4" /> Order Kilang
 </TabsTrigger>)}
 {canManageHq && (
 <TabsTrigger value="audit" className={moduleTabsTriggerClass}>
 <ClipboardCheck className="h-4 w-4" /> Audit
 </TabsTrigger>)}
 </TabsList>

 <TabsContent value="stock" className="mt-2">
 {summaryLoading || balancesLoading ? (
 <ModuleLoading />) : !hqLocation ? (
 <EmptyState
 icon={Warehouse}
 title="Lokasi HQ tidak dijumpai"
 description={`Hubungi pentadbir sistem untuk konfigurasi lokasi ${HQ_DISTRIBUTOR_LABEL}.`}
 />) : balances.length === 0 ? (
 <EmptyState
 icon={Package}
 title="Tiada stok simpanan di HQ"
 description={`${HQ_DISTRIBUTOR_LABEL} cross-dock - stok dari kilang dihantar terus ke cawangan selepas order disahkan.`}
 />) : (
 <>
 <p className="mb-3 text-sm text-amber-800">
 Baki stok di HQ sepatutnya sifar (cross-dock). Jika ada baki, semak penghantaran
 yang belum disahkan driver.
 </p>
 <BalanceTable balances={balances} showPackConversion />
 </>)}
 </TabsContent>

 {canOrder && (
 <TabsContent value="hq-order" className="mt-4">
 {orderBootstrapLoading ? (
 <ModuleLoading />) : (
 <HqFactoryOrderPanel
 stockItems={stockItems}
 publishedDates={publishedDates}
 onRefreshCalendar={() => {
 void loadCalendar();
 }}
 />)}
 </TabsContent>)}

 {canManageHq && (
 <TabsContent value="audit" className="mt-4 space-y-4">
 {summaryLoading || stockItemsLoading || balancesLoading || auditsLoading ? (
 <ModuleLoading />) : !hqLocation ? (
 <EmptyState
 icon={Warehouse}
 title="Lokasi HQ tidak dijumpai"
 description={`Hubungi pentadbir sistem untuk konfigurasi lokasi ${HQ_DISTRIBUTOR_LABEL}.`}
 />) : (
 <>
 <StockLineForm
 mode="count"
 stockItems={stockItems}
 balances={balances}
 onSubmitCount={async (items, notes) => {
 try {
 await submitWarehouseAudit(
 hqLocation.id,
 items.map((i) => ({
 stock_item_id: i.stock_item_id,
 audited_quantity: i.counted_quantity,
 })),
 notes);
 toast.success('Audit gudang dihantar');
 await refreshAfterAudit();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal hantar audit');
 }
 }}
 />
 <div className="space-y-2">
 <h3 className="font-semibold text-sm">Sejarah Audit</h3>
 {audits.length === 0 ? (
 <p className="text-sm text-muted-foreground">Tiada rekod audit.</p>) : (
 audits.map((a) => (
 <div key={a.id} className="rounded-lg border p-3 text-sm">
 <div className="flex justify-between">
 <span className="font-medium">{a.audit_number}</span>
 <Badge variant="outline">{labelFor(TRANSFER_STATUS_LABELS, a.status, a.status)}</Badge>
 </div>
 <p className="text-xs text-muted-foreground">{a.audit_date}</p>
 {a.status === 'PENDING' && canApprove && (
 <Button
 size="sm"
 className="mt-2"
 variant="outline"
 onClick={async () => {
 try {
 await approveWarehouseAudit(a.id);
 toast.success('Audit diluluskan');
 await refreshAfterAudit();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal luluskan audit');
 }
 }}
 >
 Luluskan
 </Button>)}
 </div>)))}
 </div>
 </>)}
 </TabsContent>)}
 </Tabs>
 </ModuleLayout>);
}
