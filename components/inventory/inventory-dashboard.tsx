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
import { getInventoryStockUiAccess, canSetRotiProductionDate, isAreaManagerRole } from '@/lib/auth/stock-access';
import { BranchScopeSelect } from '@/components/shared/branch-scope-select';
import { KioskOverviewPanel } from '@/components/inventory/kiosk-overview-panel';
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
import {
  ModuleLayout,
  ModuleHeader,
  ModuleLoading,
  EmptyState,
  BranchRequiredPrompt,
  moduleTabsListClass,
  moduleTabsTriggerClass,
} from '@/components/shared/module-ui';

export function InventoryDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const authBranch = useAuthStore((s) => s.branch);
  const showBranchPicker = profile ? needsBranchPicker(profile) : false;
  const isAreaManager = profile ? isAreaManagerRole(profile.role) : false;
  const defaultLocType: LocationType | 'ALL' =
    profile && (isAreaManagerRole(profile.role) || profile.role === 'STAFF')
      ? 'BRANCH_KIOSK'
      : 'ALL';

  const [locationType, setLocationType] = useState<LocationType | 'ALL'>(defaultLocType);
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
    fetchStockItems({ hq: true })
      .then(({ items }) => setStockItems(items))
      .catch(() => toast.error('Gagal memuatkan senarai stok'));
  }, []);

  useEffect(() => {
    if (!branchId || !locations.length) return;
    const kiosk = locations.find(
      (l) => l.branch_id === branchId && l.location_type === 'BRANCH_KIOSK'
    );
    if (kiosk) setSelectedLocationId(kiosk.id);
  }, [branchId, locations]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);
  const stockAccess = profile
    ? getInventoryStockUiAccess(profile.role, selectedLocation?.location_type)
    : null;
  const orderMaker = profile ? canSetRotiProductionDate(profile.role) : false;
  const isKioskView = selectedLocation?.location_type === 'BRANCH_KIOSK';
  const requireRotiProductionOnReceive =
    orderMaker &&
    (selectedLocation?.location_type === 'HQ_WAREHOUSE' ||
      selectedLocation?.location_type === 'FACTORY');
  const lowCount = balances.filter((b) => b.status === 'LOW').length;
  const criticalCount = balances.filter((b) => b.status === 'CRITICAL').length;
  const pendingInbound = transfers.filter((t) => t.status === 'IN_TRANSIT').length;
  const showOverview = showBranchPicker && !selectedBranchId && isAreaManager;

  function handleOverviewSelect(branchIdPick: string, locationId: string) {
    setSelectedBranchId(branchIdPick);
    setSelectedLocationId(locationId);
    setLocationType('BRANCH_KIOSK');
    setActiveTab('balances');
  }

  function formatLocationLabel(loc: InventoryLocation) {
    if (loc.branch?.branch_code) {
      return `${loc.branch.branch_code} · ${loc.branch.branch_name}`;
    }
    return `${LOCATION_TYPE_LABELS[loc.location_type]} — ${loc.name}`;
  }

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

  const needsBranchSelection = false;

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Inventori"
        description="Kilang → Gudang HQ → Pindah → Terima di Kiosk · pantau baki 9 item stok rasmi"
        icon={Package}
        badges={
          <>
            {criticalCount > 0 && (
              <Badge variant="destructive">{criticalCount} Kritikal</Badge>
            )}
            {lowCount > 0 && (
              <Badge variant="secondary">{lowCount} Stok Rendah</Badge>
            )}
          </>
        }
      />

      {showBranchPicker && (
        <BranchScopeSelect
          value={selectedBranchId}
          onChange={setSelectedBranchId}
          allowAll={profile?.role === 'AREA_MANAGER'}
          allLabel="Semua kiosk kawasan saya"
        />
      )}

      {showOverview ? (
        <KioskOverviewPanel onSelectBranch={handleOverviewSelect} />
      ) : needsBranchSelection ? (
        <BranchRequiredPrompt message="Sila pilih cawangan untuk melihat inventori kiosk dalam kawasan anda." />
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
                    {formatLocationLabel(loc)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {locationsLoading ? (
            <ModuleLoading rows={1} />
          ) : locations.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Tiada lokasi inventori"
              description="Tiada lokasi untuk tapisan ini. Cuba pilih jenis lokasi lain."
            />
          ) : !selectedLocationId ? (
            <EmptyState
              icon={Package}
              title="Pilih lokasi"
              description="Pilih lokasi inventori dari senarai di atas."
            />
          ) : (
            <>
              {selectedLocation && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{selectedLocation.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      {LOCATION_TYPE_LABELS[selectedLocation.location_type]}
                      {authBranch && ` · ${authBranch.branch_name}`}
                    </p>
                    {stockAccess?.readOnlyHint && (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                        {stockAccess.readOnlyHint}
                      </p>
                    )}
                    {isKioskView && pendingInbound > 0 && (
                      <p className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-950">
                        {pendingInbound} pindahan HQ dalam perjalanan — pergi tab{' '}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setActiveTab('transfer')}
                        >
                          Pindah
                        </button>{' '}
                        → Terima di Kiosk
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                  <TabsList className={moduleTabsListClass}>
                    <TabsTrigger value="balances" className={moduleTabsTriggerClass}>
                      <Package className="h-4 w-4" /> Baki
                    </TabsTrigger>
                    <TabsTrigger value="movements" className={moduleTabsTriggerClass}>
                      <History className="h-4 w-4" /> Pergerakan
                    </TabsTrigger>
                    {stockAccess?.canReceive && (
                      <TabsTrigger value="receive" className={moduleTabsTriggerClass}>
                        <Plus className="h-4 w-4" /> Terima
                      </TabsTrigger>
                    )}
                    {stockAccess?.canTransfer && (
                      <TabsTrigger value="transfer" className={moduleTabsTriggerClass}>
                        <ArrowLeftRight className="h-4 w-4" /> Pindah
                      </TabsTrigger>
                    )}
                    {stockAccess?.canAdjust && (
                      <TabsTrigger value="adjust" className={moduleTabsTriggerClass}>
                        <ClipboardList className="h-4 w-4" /> Laras
                      </TabsTrigger>
                    )}
                    {stockAccess?.canCount && (
                      <TabsTrigger value="count" className={moduleTabsTriggerClass}>
                        <ClipboardList className="h-4 w-4" /> Kira
                      </TabsTrigger>
                    )}
                    {stockAccess?.canWriteOff && (
                      <TabsTrigger value="writeoff" className={moduleTabsTriggerClass}>
                        <Trash2 className="h-4 w-4" /> Lupus
                      </TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="balances" className="mt-4">
                    {balances.length === 0 ? (
                      <EmptyState
                        icon={Package}
                        title="Tiada baki stok"
                        description="Lokasi ini belum mempunyai baki stok. Terima stok dari tab Terima."
                      />
                    ) : (
                      <BalanceTable balances={balances} showPackConversion={isKioskView} />
                    )}
                  </TabsContent>

                  <TabsContent value="movements" className="mt-4">
                    <MovementList movements={movements} />
                  </TabsContent>

                  <TabsContent value="receive" className="mt-4">
                    {stockAccess?.canReceive ? (
                      <StockLineForm
                        mode="receive"
                        stockItems={stockItems}
                        requireRotiProductionDate={requireRotiProductionOnReceive}
                        onSubmit={(items, meta) => handleReceive(items, meta?.notes)}
                      />
                    ) : null}
                  </TabsContent>

                  <TabsContent value="transfer" className="mt-4">
                    {stockAccess?.canTransfer ? (
                      <TransferPanel
                      locations={locations}
                      stockItems={stockItems}
                      transfers={transfers}
                      currentLocationId={selectedLocationId}
                      orderInPacks={
                        selectedLocation?.location_type === 'HQ_WAREHOUSE' ||
                        selectedLocation?.location_type === 'FACTORY'
                      }
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
                      canSetRotiProductionDate={orderMaker}
                    />
                    ) : null}
                  </TabsContent>

                  <TabsContent value="adjust" className="mt-4">
                    {stockAccess?.canAdjust ? (
                      <StockLineForm
                        mode="adjust"
                        stockItems={stockItems}
                        balances={balances}
                        onSubmitAdjust={handleAdjustment}
                      />
                    ) : null}
                  </TabsContent>

                  <TabsContent value="count" className="mt-4">
                    {stockAccess?.canCount ? (
                      <StockLineForm
                        mode="count"
                        stockItems={stockItems}
                        balances={balances}
                        onSubmitCount={handleCount}
                      />
                    ) : null}
                  </TabsContent>

                  <TabsContent value="writeoff" className="mt-4">
                    {stockAccess?.canWriteOff ? (
                      <StockLineForm
                        mode="writeoff"
                        stockItems={stockItems}
                        onSubmitWriteOff={handleWriteOff}
                      />
                    ) : null}
                  </TabsContent>
                </Tabs>
              )}
            </>
          )}
        </>
      )}
    </ModuleLayout>
  );
}
