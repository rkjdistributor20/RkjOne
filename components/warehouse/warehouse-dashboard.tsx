'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Warehouse, Package, ArrowRight, ClipboardCheck } from 'lucide-react';
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
import { COMPANY } from '@/lib/brand/company';
import { labelFor, TRANSFER_STATUS_LABELS } from '@/lib/ui/labels';

export function WarehouseDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const canApprove = profile ? isAdminRole(profile.role) || profile.role === 'OPERATION_MANAGER' : false;
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, aud, locs, items] = await Promise.all([
        fetchWarehouseSummary(),
        fetchWarehouseAudits(),
        fetchLocations(),
        fetchStockItems(),
      ]);
      setSummary(sum.summary);
      setAudits(aud.audits);
      const allLocs = locs.locations;
      const hq = allLocs.find((l) => l.location_type === 'HQ_WAREHOUSE') ?? null;
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
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Gudang HQ</h2>
        <p className="text-sm text-muted-foreground">
          {COMPANY.hq} · Terima · Pindah · Audit
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : !hqLocation ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Lokasi gudang HQ tidak dijumpai. Hubungi pentadbir sistem.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Item Stok</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{summary?.total_items ?? 0}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Jumlah Kuantiti</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {summary?.total_quantity?.toLocaleString() ?? 0}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Stok Rendah</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold text-orange-600">
                {summary?.low_stock_count ?? 0}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Menunggu</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                Pindahan: {summary?.pending_transfers ?? 0}
                <br />
                Penghantaran: {summary?.pending_deliveries ?? 0}
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="stock">
            <TabsList>
              <TabsTrigger value="stock" className="gap-1">
                <Package className="h-4 w-4" /> Stok
              </TabsTrigger>
              <TabsTrigger value="receive" className="gap-1">
                <Warehouse className="h-4 w-4" /> Terima
              </TabsTrigger>
              <TabsTrigger value="transfer" className="gap-1">
                <ArrowRight className="h-4 w-4" /> Pindah Keluar
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-1">
                <ClipboardCheck className="h-4 w-4" /> Audit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="mt-4">
              {balances.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tiada baki stok di gudang HQ.</p>
              ) : (
                <BalanceTable balances={balances} />
              )}
            </TabsContent>

            <TabsContent value="receive" className="mt-4">
              <StockLineForm
                mode="receive"
                stockItems={stockItems}
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
          </Tabs>
        </>
      )}
    </div>
  );
}
