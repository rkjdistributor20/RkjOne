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
import { fetchLocations, fetchStockItems, fetchBalances } from '@/lib/inventory/api';
import type { WarehouseAudit, WarehouseSummary } from '@/lib/warehouse/types';
import type { InventoryLocation, StockItemOption, InventoryBalanceRow } from '@/lib/inventory/types';
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
import { COMPANY } from '@/lib/brand/company';
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

export function WarehouseDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const canManageHq = profile ? canManageHqStockInOut(profile.role) : false;
  const canOrder = profile ? canSubmitHqFactoryOrder(profile.role) : false;
  const canApprove = profile ? isAdminRole(profile.role) || profile.role === 'OPERATION_MANAGER' : false;
  const [publishedDates, setPublishedDates] = useState<PublishedProductionDate[]>([]);
  const [summary, setSummary] = useState<WarehouseSummary | null>(null);
  const [audits, setAudits] = useState<WarehouseAudit[]>([]);
  const [hqLocation, setHqLocation] = useState<InventoryLocation | null>(null);
  const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
  const [balances, setBalances] = useState<InventoryBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCalendar = useCallback(async () => {
    try {
      const { dates } = await fetchProductionCalendar();
      setPublishedDates(dates);
    } catch (err) {
      setPublishedDates([]);
      toast.error(
        err instanceof Error ? err.message : 'Gagal memuatkan jadual production kilang'
      );
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

      if (hq) {
        const bal = await fetchBalances(hq.id);
        setBalances(bal.balances);
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

  const defaultTab = canOrder ? 'hq-order' : 'stock';

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Gudang HQ"
        description={`${COMPANY.hq} — order per cawangan · cross-dock terus ke kiosk · driver sahkan`}
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
              Paparan sahaja — Gudang HQ tidak menyimpan stok; pre-order dihantar terus ke cawangan
              selepas kilang sahkan.
              {canOrder && ' Anda boleh hantar order per cawangan di tab Order Kilang.'}
            </p>
          )}

          {canManageHq && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
              <strong>Cross-dock:</strong> Bila kilang sahkan order muktamad, stok diterima automatik
              dan dihantar terus ke cawangan mengikut laluan driver. Tiada simpanan stok di HQ —
              driver sahkan penghantaran di tab Armada → Jadual Kerja.
            </p>
          )}

          <Tabs defaultValue={defaultTab} className="space-y-4">
            <TabsList className={moduleTabsListClass}>
              <TabsTrigger value="stock" className={moduleTabsTriggerClass}>
                <Package className="h-4 w-4" /> Stok
              </TabsTrigger>
              {canOrder && (
                <TabsTrigger value="hq-order" className={moduleTabsTriggerClass}>
                  <ClipboardList className="h-4 w-4" /> Order Kilang
                </TabsTrigger>
              )}
              {canManageHq && (
                <TabsTrigger value="audit" className={moduleTabsTriggerClass}>
                  <ClipboardCheck className="h-4 w-4" /> Audit
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="stock" className="mt-2">
              {balances.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Tiada stok simpanan di HQ"
                  description="Gudang HQ cross-dock — stok dari kilang dihantar terus ke cawangan selepas order disahkan."
                />
              ) : (
                <>
                  <p className="mb-3 text-sm text-amber-800">
                    Baki stok di HQ sepatutnya sifar (cross-dock). Jika ada baki, semak penghantaran
                    yang belum disahkan driver.
                  </p>
                  <BalanceTable balances={balances} showPackConversion />
                </>
              )}
            </TabsContent>

            {canOrder && (
              <TabsContent value="hq-order" className="mt-4">
                <HqFactoryOrderPanel
                  stockItems={stockItems}
                  publishedDates={publishedDates}
                  onRefreshCalendar={loadCalendar}
                />
              </TabsContent>
            )}

            {canManageHq && (
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
            )}
          </Tabs>
        </>
      )}
    </ModuleLayout>
  );
}
