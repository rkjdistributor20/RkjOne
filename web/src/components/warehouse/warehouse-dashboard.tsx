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
import type { InventoryLocation, StockItemOption, StockTransferRow } from '@/lib/inventory/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StockLineForm } from '@/components/inventory/stock-line-form';
import { BalanceTable } from '@/components/inventory/balance-table';
import type { InventoryBalanceRow } from '@/lib/inventory/types';

export function WarehouseDashboard() {
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
      toast.error(err instanceof Error ? err.message : 'Failed to load warehouse');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canApprove = true; // managers via RPC

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">HQ Warehouse</h2>
        <p className="text-sm text-muted-foreground">
          Teluk Intan · Receive · Transfer · Audit
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Stock Items</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{summary?.total_items ?? 0}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Qty</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {summary?.total_quantity?.toLocaleString() ?? 0}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold text-orange-600">
                {summary?.low_stock_count ?? 0}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                Transfers: {summary?.pending_transfers ?? 0}
                <br />
                Deliveries: {summary?.pending_deliveries ?? 0}
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="stock">
            <TabsList>
              <TabsTrigger value="stock" className="gap-1">
                <Package className="h-4 w-4" /> Stock
              </TabsTrigger>
              <TabsTrigger value="receive" className="gap-1">
                <Warehouse className="h-4 w-4" /> Receive
              </TabsTrigger>
              <TabsTrigger value="transfer" className="gap-1">
                <ArrowRight className="h-4 w-4" /> Transfer Out
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-1">
                <ClipboardCheck className="h-4 w-4" /> Audit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="mt-4">
              <BalanceTable balances={balances} />
            </TabsContent>

            <TabsContent value="receive" className="mt-4">
              {hqLocation && (
                <StockLineForm
                  mode="receive"
                  stockItems={stockItems}
                  onSubmit={async (items, meta) => {
                    await receiveStock(hqLocation.id, items, 'FACTORY', meta?.notes);
                    toast.success('Stock received at HQ');
                    loadData();
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="transfer" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Transfer from HQ to Fleet or Branch
              </p>
              {hqLocation && (
                <>
                  <select
                    className="rounded-md border px-3 py-2 text-sm"
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                  >
                    <option value="">Select destination…</option>
                    <optgroup label="Fleet">
                      {fleetLocations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Branches">
                      {branchLocations.slice(0, 20).map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </optgroup>
                  </select>
                  {transferTo && (
                    <StockLineForm
                      mode="receive"
                      stockItems={stockItems}
                      onSubmit={async (items) => {
                        await createTransfer({
                          from_location_id: hqLocation.id,
                          to_location_id: transferTo,
                          items,
                        });
                        toast.success('Transfer created — dispatch from Inventory or here');
                        loadData();
                      }}
                    />
                  )}
                </>
              )}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">HQ Transfers</h3>
                {transfers.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">{t.transfer_number}</p>
                      <p className="text-xs text-muted-foreground">
                        → {t.to_location.name}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">{t.status}</Badge>
                      {t.status === 'PENDING' && (
                        <Button size="sm" variant="outline" onClick={async () => {
                          await dispatchTransfer(t.id);
                          toast.success('Dispatched');
                          loadData();
                        }}>
                          Dispatch
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="audit" className="mt-4 space-y-4">
              {hqLocation && (
                <StockLineForm
                  mode="count"
                  stockItems={stockItems}
                  balances={balances}
                  onSubmitCount={async (items, notes) => {
                    await submitWarehouseAudit(
                      hqLocation.id,
                      items.map((i) => ({
                        stock_item_id: i.stock_item_id,
                        audited_quantity: i.counted_quantity,
                      })),
                      notes
                    );
                    toast.success('Warehouse audit submitted');
                    loadData();
                  }}
                />
              )}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Audit History</h3>
                {audits.map((a) => (
                  <div key={a.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{a.audit_number}</span>
                      <Badge variant="outline">{a.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{a.audit_date}</p>
                    {a.status === 'PENDING' && canApprove && (
                      <Button
                        size="sm"
                        className="mt-2"
                        variant="outline"
                        onClick={async () => {
                          await approveWarehouseAudit(a.id);
                          toast.success('Audit approved');
                          loadData();
                        }}
                      >
                        Approve
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
