'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Warehouse, Package, ArrowRight, ClipboardCheck, CalendarDays, ClipboardList, Inbox } from 'lucide-react';
import {
  fetchWarehouseSummary,
  fetchWarehouseAudits,
  submitWarehouseAudit,
  approveWarehouseAudit,
  receiveStock,
  createTransfer,
  dispatchTransfer,
} from '@/lib/warehouse/api';
import { fetchLocations, fetchStockItems, fetchBalances, fetchTransfers } from '@/lib/inventory/api';
import type { WarehouseAudit, WarehouseSummary } from '@/lib/warehouse/types';
import type { InventoryLocation, StockItemOption, StockTransferRow, InventoryBalanceRow } from '@/lib/inventory/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StockLineForm } from '@/components/inventory/stock-line-form';
import { BalanceTable } from '@/components/inventory/balance-table';
import { useAuthStore } from '@/stores/auth-store';
import { isAdminRole } from '@/lib/auth/permissions';
import { canManageHqStockInOut, canSetRotiProductionDate, canManageFactorySchedule } from '@/lib/auth/stock-access';
import { fetchProductionCalendar } from '@/lib/production/api';
import type { PublishedProductionDate } from '@/lib/production/types';
import { FactoryProductionSchedulePanel } from '@/components/warehouse/factory-production-schedule-panel';
import { HqFactoryOrderPanel } from '@/components/warehouse/hq-factory-order-panel';
import { FactoryOrderInbox } from '@/components/warehouse/factory-order-inbox';
import { COMPANY } from '@/lib/brand/company';
import { labelFor, TRANSFER_STATUS_LABELS } from '@/lib/ui/labels';
import {
  ModuleLayout,
  ModuleHeader,
  ModuleLoading,
  EmptyState,
  KpiGrid,
  KpiCard,
  SectionCard,
  moduleTabsListClass,
  moduleTabsTriggerClass,
} from '@/components/shared/module-ui';

export function WarehouseDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const canManageHq = profile ? canManageHqStockInOut(profile.role) : false;
  const canOrder = profile ? canSetRotiProductionDate(profile.role) : false;
  const canFactory = profile ? canManageFactorySchedule(profile.role) : false;
  const canApprove = profile ? isAdminRole(profile.role) || profile.role === 'OPERATION_MANAGER' : false;
  const [publishedDates, setPublishedDates] = useState<PublishedProductionDate[]>([]);
  const productionDateOptions = publishedDates.map((d) => d.production_date);
  const [summary, setSummary] = useState<WarehouseSummary | null>(null);
  const [audits, setAudits] = useState<WarehouseAudit[]>([]);
  const [hqLocation, setHqLocation] = useState<InventoryLocation | null>(null);
  const [fleetLocations, setFleetLocations] = useState<InventoryLocation[]>([]);
  const [branchLocations, setBranchLocations] = useState<InventoryLocation[]>([]);
  const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
  const [balances, setBalances] = useState<InventoryBalanceRow[]>([]);
  const [transfers, setTransfers] = useState<StockTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferTo, setTransferTo] = useState('');

  const loadCalendar = useCallback(async () => {
    try {
      const { dates } = await fetchProductionCalendar();
      setPublishedDates(dates);
    } catch {
      setPublishedDates([]);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, aud, locs, items] = await Promise.all([
        fetchWarehouseSummary(),
        fetchWarehouseAudits(),
        fetchLocations(),
        fetchStockItems({ hq: true }),
      ]);
      await loadCalendar();
      setSummary(sum.summary);
      setAudits(aud.audits);
      const allLocs = locs.locations;
      const hq =
        allLocs.find(
          (l) =>
            l.location_type === 'HQ_WAREHOUSE' &&
            l.name.toLowerCase().includes('teluk intan')
        ) ??
        allLocs.find((l) => l.location_type === 'HQ_WAREHOUSE') ??
        null;
      setHqLocation(hq);
      setFleetLocations(allLocs.filter((l) => l.location_type === 'FLEET_VEHICLE'));
      setBranchLocations(allLocs.filter((l) => l.location_type === 'BRANCH_KIOSK'));

      if (hq) {
        const [bal, trf] = await Promise.all([
          fetchBalances(hq.id),
          fetchTransfers(hq.id),
        ]);
        setBalances(bal.balances);
        setTransfers(trf.transfers);
      }
      setStockItems(items.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan gudang HQ');
    } finally {
      setLoading(false);
    }
  }, [loadCalendar]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Gudang HQ"
        description={`${COMPANY.hq} — jadual production kilang · order HQ · terima stok · pindah ke cawangan`}
        icon={Warehouse}
      />

      {loading ? (
        <ModuleLoading />
      ) : !hqLocation ? (
        <EmptyState
          icon={Warehouse}
          title="Lokasi HQ tidak dijumpai"
          description="Hubungi pentadbir sistem untuk konfigurasi lokasi gudang HQ."
        />
      ) : (
        <>
          <KpiGrid cols={4}>
            <KpiCard title="Item Stok" value={`${summary?.total_items ?? 0} / 9`} icon={Package} />
            <KpiCard
              title="Jumlah Kuantiti"
              value={summary?.total_quantity?.toLocaleString() ?? 0}
              icon={Package}
            />
            <KpiCard
              title="Stok Rendah"
              value={summary?.low_stock_count ?? 0}
              icon={Package}
              variant="warning"
            />
            <KpiCard
              title="Menunggu"
              value={`${summary?.pending_transfers ?? 0} pindah · ${summary?.pending_deliveries ?? 0} hantar`}
              icon={ArrowRight}
            />
          </KpiGrid>

          {!canManageHq && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Paparan sahaja — stok masuk/keluar Gudang HQ dikawal oleh pentadbir HQ (Admin /
              CEO Kilang).
            </p>
          )}

          <Tabs defaultValue="stock" className="space-y-4">
            <TabsList className={moduleTabsListClass}>
              <TabsTrigger value="stock" className={moduleTabsTriggerClass}>
                <Package className="h-4 w-4" /> Stok
              </TabsTrigger>
              {canFactory && (
                <TabsTrigger value="schedule" className={moduleTabsTriggerClass}>
                  <CalendarDays className="h-4 w-4" /> Jadual Kilang
                </TabsTrigger>
              )}
              {canOrder && (
                <TabsTrigger value="hq-order" className={moduleTabsTriggerClass}>
                  <ClipboardList className="h-4 w-4" /> Order Kilang
                </TabsTrigger>
              )}
              {canFactory && (
                <TabsTrigger value="factory-inbox" className={moduleTabsTriggerClass}>
                  <Inbox className="h-4 w-4" /> Laporan Order
                </TabsTrigger>
              )}
              {canManageHq && (
                <>
                  <TabsTrigger value="receive" className={moduleTabsTriggerClass}>
                    <Warehouse className="h-4 w-4" /> Terima
                  </TabsTrigger>
                  <TabsTrigger value="transfer" className={moduleTabsTriggerClass}>
                    <ArrowRight className="h-4 w-4" /> Pindah Keluar
                  </TabsTrigger>
                  <TabsTrigger value="audit" className={moduleTabsTriggerClass}>
                    <ClipboardCheck className="h-4 w-4" /> Audit
                  </TabsTrigger>
                </>
              )}
            </TabsList>

            <TabsContent value="stock" className="mt-2">
              {balances.length === 0 ? (
                <EmptyState icon={Package} title="Tiada baki stok" description="Terima stok dari kilang melalui tab Terima." />
              ) : (
                <BalanceTable balances={balances} showPackConversion />
              )}
            </TabsContent>

            {canFactory && (
              <TabsContent value="schedule" className="mt-4">
                <FactoryProductionSchedulePanel />
              </TabsContent>
            )}

            {canOrder && (
              <TabsContent value="hq-order" className="mt-4">
                <HqFactoryOrderPanel
                  stockItems={stockItems}
                  publishedDates={publishedDates}
                  onRefreshCalendar={loadCalendar}
                />
              </TabsContent>
            )}

            {canFactory && (
              <TabsContent value="factory-inbox" className="mt-4">
                <FactoryOrderInbox />
              </TabsContent>
            )}

            {canManageHq && (
              <>
            <TabsContent value="receive" className="mt-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Terima stok dari kilang — pilih tarikh production dari jadual kilang yang diterbitkan.
              </p>
              <StockLineForm
                mode="receive"
                stockItems={stockItems}
                orderInPacks
                requireRotiProductionDate
                productionDateOptions={productionDateOptions}
                onSubmit={async (items, meta) => {
                  try {
                    await receiveStock(hqLocation.id, items, 'FACTORY', meta?.notes);
                    toast.success('Stok diterima di HQ');
                    loadData();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Gagal terima stok');
                  }
                }}
              />
            </TabsContent>

            <TabsContent value="transfer" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Pindah stok dari HQ ke kenderaan atau cawangan
              </p>
              <>
                <select
                  className="rounded-md border px-3 py-2 text-sm"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                >
                  <option value="">Pilih destinasi…</option>
                  <optgroup label="Kenderaan">
                    {fleetLocations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Cawangan">
                    {branchLocations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </optgroup>
                </select>
                {transferTo && (
                  <StockLineForm
                    mode="receive"
                    stockItems={stockItems}
                    orderInPacks
                    requireRotiProductionDate={
                      branchLocations.some((l) => l.id === transferTo)
                    }
                    productionDateOptions={
                      branchLocations.some((l) => l.id === transferTo)
                        ? productionDateOptions
                        : undefined
                    }
                    onSubmit={async (items) => {
                      try {
                        await createTransfer({
                          from_location_id: hqLocation.id,
                          to_location_id: transferTo,
                          items,
                        });
                        toast.success('Pindahan dicipta');
                        loadData();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Gagal cipta pindahan');
                      }
                    }}
                  />
                )}
              </>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Pindahan HQ</h3>
                {transfers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tiada pindahan HQ.</p>
                ) : (
                  transfers.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div>
                        <p className="font-medium">{t.transfer_number}</p>
                        <p className="text-xs text-muted-foreground">
                          → {t.to_location.name}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline">
                          {labelFor(TRANSFER_STATUS_LABELS, t.status)}
                        </Badge>
                        {t.status === 'PENDING' && (
                          <Button size="sm" variant="outline" onClick={async () => {
                            try {
                              await dispatchTransfer(t.id);
                              toast.success('Dihantar');
                              loadData();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Gagal hantar');
                            }
                          }}>
                            Hantar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="audit" className="mt-4 space-y-4">
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
                      notes
                    );
                    toast.success('Audit gudang dihantar');
                    loadData();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Gagal hantar audit');
                  }
                }}
              />
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Sejarah Audit</h3>
                {audits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tiada rekod audit.</p>
                ) : (
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
                              loadData();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Gagal luluskan audit');
                            }
                          }}
                        >
                          Luluskan
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
              </>
            )}
          </Tabs>
        </>
      )}
    </ModuleLayout>
  );
}
