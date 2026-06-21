'use client';

import { useCallback, useEffect, useState } from 'react';
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
  fetchMovements,
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
  InventoryBalanceRow,
  InventoryLocation,
  LineItemInput,
  StockItemOption,
  StockMovementRow,
  StockTransferRow,
  LocationType,
} from '@/lib/inventory/types';
import { LOCATION_TYPE_LABELS } from '@/lib/inventory/types';
import { useAuthStore } from '@/stores/auth-store';
import { needsBranchPicker } from '@/lib/auth/branch-scope';
import { BranchScopeSelect } from '@/components/shared/branch-scope-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BalanceTable } from '@/components/inventory/balance-table';
import { MovementList } from '@/components/inventory/movement-list';
import { StockLineForm } from '@/components/inventory/stock-line-form';
import { TransferPanel } from '@/components/inventory/transfer-panel';

export function InventoryDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const authBranch = useAuthStore((s) => s.branch);
  const showBranchPicker = profile ? needsBranchPicker(profile) : false;

  const [locationType, setLocationType] = useState<LocationType | 'ALL'>('ALL');
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState(profile?.branch_id ?? '');
  const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
  const [balances, setBalances] = useState<InventoryBalanceRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [transfers, setTransfers] = useState<StockTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('balances');

  const branchId = showBranchPicker
    ? selectedBranchId || undefined
    : profile?.branch_id ?? undefined;

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
      const type = locationType === 'ALL' ? undefined : locationType;
      const { locations: locs } = await fetchLocations(type, branchId);
      setLocations(locs);
      if (locs.length && !locs.find((l) => l.id === selectedLocationId)) {
        setSelectedLocationId(locs[0].id);
      } else if (!locs.length) {
        setSelectedLocationId('');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan lokasi');
      setLocations([]);
      setSelectedLocationId('');
    } finally {
      setLocationsLoading(false);
    }
  }, [locationType, branchId, selectedLocationId]);

  const loadData = useCallback(async () => {
    if (!selectedLocationId) {
      setBalances([]);
      setMovements([]);
      setTransfers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [bal, mov, trf] = await Promise.all([
        fetchBalances(selectedLocationId),
        fetchMovements(selectedLocationId),
        fetchTransfers(selectedLocationId),
      ]);
      setBalances(bal.balances);
      setMovements(mov.movements);
      setTransfers(trf.transfers);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan inventori');
    } finally {
      setLoading(false);
    }
  }, [selectedLocationId]);

  useEffect(() => {
    fetchStockItems()
      .then(({ items }) => setStockItems(items))
      .catch(() => toast.error('Gagal memuatkan senarai stok'));
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);
  const lowCount = balances.filter((b) => b.status === 'LOW').length;
  const criticalCount = balances.filter((b) => b.status === 'CRITICAL').length;

  const receiveSource =
    selectedLocation?.location_type === 'BRANCH_KIOSK' ? 'HQ_WAREHOUSE' : 'FACTORY';

  async function handleReceive(items: LineItemInput[], notes?: string) {
    try {
      await receiveStock(selectedLocationId, items, receiveSource, notes);
      toast.success('Stok diterima');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menerima stok');
    }
  }

  async function handleAdjustment(
    reason: string,
    items: Array<{ stock_item_id: string; quantity_after: number }>
  ) {
    try {
      await submitAdjustment(selectedLocationId, reason, items);
      toast.success('Pelarasan dihantar');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal hantar pelarasan');
    }
  }

  async function handleCount(
    items: Array<{ stock_item_id: string; counted_quantity: number }>,
    notes?: string
  ) {
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

  const needsBranchSelection = showBranchPicker && !selectedBranchId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Inventori</h2>
          <p className="text-sm text-muted-foreground">
            Kilang · Gudang HQ · Kenderaan · Kiosk
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {criticalCount > 0 && (
            <Badge variant="destructive">{criticalCount} Kritikal</Badge>
          )}
          {lowCount > 0 && (
            <Badge variant="secondary">{lowCount} Stok Rendah</Badge>
          )}
        </div>
      </div>

      {showBranchPicker && (
        <BranchScopeSelect
          value={selectedBranchId}
          onChange={setSelectedBranchId}
          allowAll={profile?.role === 'AREA_MANAGER'}
          allLabel="Semua kiosk kawasan saya"
        />
      )}

      {needsBranchSelection ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Sila pilih cawangan untuk melihat inventori.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Select
              value={locationType}
              onValueChange={(v) => setLocationType(v as LocationType | 'ALL')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Jenis lokasi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Jenis</SelectItem>
                {(Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {LOCATION_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedLocationId || undefined}
              onValueChange={(v) => v && setSelectedLocationId(v)}
            >
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Pilih lokasi" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {LOCATION_TYPE_LABELS[loc.location_type]} — {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {locationsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : locations.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Tiada lokasi inventori untuk tapisan ini.
            </p>
          ) : !selectedLocationId ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Sila pilih lokasi inventori.
            </p>
          ) : (
            <>
              {selectedLocation && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{selectedLocation.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {LOCATION_TYPE_LABELS[selectedLocation.location_type]}
                    {authBranch && ` · ${authBranch.branch_name}`}
                  </CardContent>
                </Card>
              )}

              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="flex h-auto flex-wrap gap-1">
                    <TabsTrigger value="balances" className="gap-1">
                      <Package className="h-4 w-4" /> Baki
                    </TabsTrigger>
                    <TabsTrigger value="movements" className="gap-1">
                      <History className="h-4 w-4" /> Pergerakan
                    </TabsTrigger>
                    <TabsTrigger value="receive" className="gap-1">
                      <Plus className="h-4 w-4" /> Terima
                    </TabsTrigger>
                    <TabsTrigger value="transfer" className="gap-1">
                      <ArrowLeftRight className="h-4 w-4" /> Pindah
                    </TabsTrigger>
                    <TabsTrigger value="adjust" className="gap-1">
                      <ClipboardList className="h-4 w-4" /> Laras
                    </TabsTrigger>
                    <TabsTrigger value="count" className="gap-1">
                      <ClipboardList className="h-4 w-4" /> Kira
                    </TabsTrigger>
                    <TabsTrigger value="writeoff" className="gap-1">
                      <Trash2 className="h-4 w-4" /> Lupus
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="balances" className="mt-4">
                    {balances.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Tiada baki stok di lokasi ini.</p>
                    ) : (
                      <BalanceTable balances={balances} />
                    )}
                  </TabsContent>

                  <TabsContent value="movements" className="mt-4">
                    <MovementList movements={movements} />
                  </TabsContent>

                  <TabsContent value="receive" className="mt-4">
                    <StockLineForm
                      mode="receive"
                      stockItems={stockItems}
                      onSubmit={(items, meta) => handleReceive(items, meta?.notes)}
                    />
                  </TabsContent>

                  <TabsContent value="transfer" className="mt-4">
                    <TransferPanel
                      locations={locations}
                      stockItems={stockItems}
                      transfers={transfers}
                      currentLocationId={selectedLocationId}
                      onCreate={async (payload) => {
                        try {
                          await createTransfer(payload);
                          toast.success('Pindahan dicipta');
                          loadData();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Gagal cipta pindahan');
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
                    />
                  </TabsContent>

                  <TabsContent value="adjust" className="mt-4">
                    <StockLineForm
                      mode="adjust"
                      stockItems={stockItems}
                      balances={balances}
                      onSubmitAdjust={handleAdjustment}
                    />
                  </TabsContent>

                  <TabsContent value="count" className="mt-4">
                    <StockLineForm
                      mode="count"
                      stockItems={stockItems}
                      balances={balances}
                      onSubmitCount={handleCount}
                    />
                  </TabsContent>

                  <TabsContent value="writeoff" className="mt-4">
                    <StockLineForm
                      mode="writeoff"
                      stockItems={stockItems}
                      onSubmitWriteOff={handleWriteOff}
                    />
                  </TabsContent>
                </Tabs>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
