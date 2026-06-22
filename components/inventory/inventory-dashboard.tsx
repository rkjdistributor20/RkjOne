'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Package,
  ArrowLeftRight,
  History,
  Plus,
  ClipboardList,
  Trash2,
  LayoutDashboard,
  MapPinned,
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
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import { LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { useAuthStore } from '@/stores/auth-store';
import { needsBranchPicker } from '@/lib/auth/branch-scope';
import { getInventoryStockUiAccess, canSetRotiProductionDate, isAreaManagerRole, isStaffRole, canAccessBranchKioskTransferTab } from '@/lib/auth/stock-access';
import { formatBranchDestination } from '@/lib/fleet/display-labels';
import { boundSelectValue } from '@/lib/ui/select-utils';
import { BranchTransferPanel } from '@/components/inventory/branch-transfer-panel';
import { BranchScopeSelect } from '@/components/shared/branch-scope-select';
import { KioskOverviewPanel } from '@/components/inventory/kiosk-overview-panel';
import { InventorySupplyChainPanel } from '@/components/inventory/inventory-supply-chain-panel';
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
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const showBranchPicker = profile ? needsBranchPicker(profile) : false;
  const isStaff = profile ? isStaffRole(profile.role) : false;
  const kioskOnlyScope = isStaff;
  const canViewOverview = profile ? !isStaff : false;
  const canCrossBranchTransfer = profile ? canAccessBranchKioskTransferTab(profile.role) : false;

  const [locationType, setLocationType] = useState<LocationType | 'ALL'>('BRANCH_KIOSK');
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
  const [dashboardView, setDashboardView] = useState<'overview' | 'location' | 'branch-transfer'>(
    'location'
  );

  const branchId = showBranchPicker
    ? selectedBranchId || undefined
    : profile?.branch_id ?? undefined;

  const effectiveLocationFilter = kioskOnlyScope
    ? ('BRANCH_KIOSK' as LocationType)
    : locationType === 'ALL'
      ? undefined
      : locationType;

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
      const { locations: locs } = await fetchLocations(
        effectiveLocationFilter,
        branchId
      );
      const kioskLocs = kioskOnlyScope
        ? locs.filter((l) => l.location_type === 'BRANCH_KIOSK')
        : locs;
      setLocations(kioskLocs);
      setSelectedLocationId((prev) => {
        if (!kioskLocs.length) return '';
        if (branchId) {
          const kiosk = kioskLocs.find((l) => l.branch_id === branchId);
          if (kiosk) return kiosk.id;
        }
        if (kioskLocs.some((l) => l.id === prev)) return prev;
        return kioskLocs[0].id;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan lokasi');
      setLocations([]);
      setSelectedLocationId('');
    } finally {
      setLocationsLoading(false);
    }
  }, [effectiveLocationFilter, branchId, kioskOnlyScope]);

  const loadData = useCallback(async () => {
    if (!selectedLocationId || dashboardView !== 'location') {
      if (dashboardView !== 'location') {
        setBalances([]);
        setMovements([]);
        setTransfers([]);
      }
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
  }, [selectedLocationId, dashboardView]);

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
    if (!profile) return;
    if (profile.role !== 'STAFF') {
      setLocationType('ALL');
      setDashboardView('overview');
    }
  }, [profile]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useLayoutEffect(() => {
    if (profile?.role === 'AREA_MANAGER') {
      router.refresh();
    }
  }, [profile, router]);

  useEffect(() => {
    if (profile?.role === 'AREA_MANAGER') {
      router.refresh();
    }
  }, [profile, router]);

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);
  const locationSelectValue =
    boundSelectValue(selectedLocationId, locations.map((l) => l.id)) ?? '';

  if (!profile) {
    return (
      <ModuleLayout>
        <ModuleLoading />
      </ModuleLayout>
    );
  }

  if (isAreaManagerRole(profile.role)) {
    return (
      <ModuleLayout>
        <ModuleLoading />
      </ModuleLayout>
    );
  }

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
  const showKioskGrid = canViewOverview;

  function handleOverviewSelect(branchIdPick: string, locationId: string) {
    setSelectedBranchId(branchIdPick);
    setSelectedLocationId(locationId);
    setLocationType('BRANCH_KIOSK');
    setDashboardView('location');
    setActiveTab('balances');
  }

  function handleSupplyChainSelect(locationId: string, locationType: LocationType) {
    if (kioskOnlyScope && locationType !== 'BRANCH_KIOSK') {
      toast.message('Hanya kiosk cawangan dalam kawasan anda boleh diurus');
      return;
    }
    setLocationType(locationType);
    setSelectedLocationId(locationId);
    setDashboardView('location');
    setActiveTab('balances');
  }

  function formatLocationLabel(loc: InventoryLocation) {
    if (loc.branch?.branch_name) {
      return formatBranchDestination(loc);
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

  const isOfficialLocation =
    selectedLocation?.location_type === 'HQ_WAREHOUSE' ||
    selectedLocation?.location_type === 'FACTORY' ||
    selectedLocation?.location_type === 'FLEET_VEHICLE' ||
    isKioskView;

  const needsBranchSelection = false;

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Inventori"
        description={`Kilang → ${HQ_DISTRIBUTOR_LABEL} → ${LOGISTIK_LABEL} → Kiosk · 9 item stok rasmi selaras di seluruh rantaian`}
        icon={Package}
        badges={
          dashboardView === 'location' ? (
            <>
              {criticalCount > 0 && (
                <Badge variant="destructive">{criticalCount} Kritikal</Badge>
              )}
              {lowCount > 0 && (
                <Badge variant="secondary">{lowCount} Stok Rendah</Badge>
              )}
            </>
          ) : null
        }
      />

      {canViewOverview && (
        <Tabs
          value={dashboardView}
          onValueChange={(v) =>
            setDashboardView(v as 'overview' | 'location' | 'branch-transfer')
          }
          className="space-y-4"
        >
          <TabsList className={moduleTabsListClass}>
            <TabsTrigger value="overview" className={moduleTabsTriggerClass}>
              <LayoutDashboard className="h-4 w-4" /> Ringkasan
            </TabsTrigger>
            <TabsTrigger value="location" className={moduleTabsTriggerClass}>
              <MapPinned className="h-4 w-4" /> Detail Lokasi
            </TabsTrigger>
            {canCrossBranchTransfer && (
              <TabsTrigger value="branch-transfer" className={moduleTabsTriggerClass}>
                <ArrowLeftRight className="h-4 w-4" /> Pindah Cawangan
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-6">
            {showBranchPicker && (
              <BranchScopeSelect
                value={selectedBranchId}
                onChange={(id) => {
                  setSelectedBranchId(id);
                  setSelectedLocationId('');
                }}
              />
            )}
            <InventorySupplyChainPanel
              kioskOnly={kioskOnlyScope}
              onSelectLocation={handleSupplyChainSelect}
            />
            {showKioskGrid && (
              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold">Stok Roti — Cawangan</h2>
                  <p className="text-sm text-muted-foreground">
                    Paparan bag/pcs · klik Buka untuk urus stok penuh 9 item
                  </p>
                </div>
                <KioskOverviewPanel
                  branchId={selectedBranchId || undefined}
                  onSelectBranch={handleOverviewSelect}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="location" className="mt-0">
            {renderLocationPanel()}
          </TabsContent>

          {canCrossBranchTransfer && (
            <TabsContent value="branch-transfer" className="mt-0">
              <BranchTransferPanel />
            </TabsContent>
          )}
        </Tabs>
      )}

      {!canViewOverview && renderLocationPanel()}
    </ModuleLayout>
  );

  function renderLocationPanel() {
    return (
      <>
      {showBranchPicker && (
        <BranchScopeSelect
          value={selectedBranchId}
          onChange={(id) => {
            setSelectedBranchId(id);
            setSelectedLocationId('');
          }}
          allowAll={false}
        />
      )}

      {needsBranchSelection ? (
        <BranchRequiredPrompt message="Sila pilih cawangan untuk melihat inventori kiosk dalam kawasan anda." />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {!kioskOnlyScope && (
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
            )}

            {kioskOnlyScope && branchId && selectedLocation ? (
              <div className="flex min-h-9 w-full max-w-md items-center rounded-md border bg-muted/30 px-3 text-sm">
                <span className="font-medium">{formatLocationLabel(selectedLocation)}</span>
              </div>
            ) : (
              <Select
                value={locationSelectValue}
                onValueChange={(v) => v && setSelectedLocationId(v)}
                disabled={locationsLoading || locations.length === 0}
              >
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="Pilih kiosk cawangan">
                    {selectedLocation ? formatLocationLabel(selectedLocation) : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {formatLocationLabel(loc)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {renderLocationDetail()}
        </>
      )}
      </>
    );
  }

  function renderLocationDetail() {
    return (
      <>
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
          ) : !selectedLocation ? (
            <ModuleLoading rows={2} />
          ) : (
            <>
              {selectedLocation && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {formatLocationLabel(selectedLocation)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      {LOCATION_TYPE_LABELS[selectedLocation.location_type]}
                      {selectedLocation.branch?.branch_name &&
                        ` · ${selectedLocation.branch.branch_code} — ${selectedLocation.branch.branch_name}`}
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
                      <BalanceTable
                        balances={balances}
                        showPackConversion={isKioskView || isOfficialLocation}
                        groupByCategory={isOfficialLocation}
                      />
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
                      kioskOnly={kioskOnlyScope}
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
    );
  }
}
