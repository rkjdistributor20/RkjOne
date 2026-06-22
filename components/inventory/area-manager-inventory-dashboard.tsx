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
} from '@/lib/inventory/types';
import { LOCATION_TYPE_LABELS } from '@/lib/inventory/types';
import { useAuthStore } from '@/stores/auth-store';
import { needsBranchPicker } from '@/lib/auth/branch-scope';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BalanceTable } from '@/components/inventory/balance-table';
import { MovementList } from '@/components/inventory/movement-list';
import { StockLineForm } from '@/components/inventory/stock-line-form';
import { TransferPanel } from '@/components/inventory/transfer-panel';
import { AreaManagerInventoryShell } from '@/components/inventory/area-manager-inventory-shell';
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

/** Inventori AM — tiada dropdown jenis lokasi (ALL) atau UUID; cawangan + grid Buka sahaja */
export function AreaManagerInventoryDashboard({
  serverProfile,
  deployCommit,
}: AreaManagerInventoryDashboardProps) {
  const clientProfile = useAuthStore((s) => s.profile);
  const profile = clientProfile ?? serverProfile;
  const showBranchPicker = profile ? needsBranchPicker(profile) : false;
  const canCrossBranchTransfer = profile
    ? canAccessBranchKioskTransferTab(profile.role)
    : false;

  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState(
    serverProfile.branch_id ?? ''
  );
  const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
  const [balances, setBalances] = useState<InventoryBalanceRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [transfers, setTransfers] = useState<StockTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('balances');
  const [dashboardView, setDashboardView] = useState<'location' | 'branch-transfer'>('location');

  const branchId = showBranchPicker
    ? selectedBranchId || undefined
    : profile?.branch_id ?? undefined;

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
      const { locations: locs } = await fetchLocations('BRANCH_KIOSK', branchId);
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
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan lokasi');
      setLocations([]);
      setSelectedLocationId('');
    } finally {
      setLocationsLoading(false);
    }
  }, [branchId]);

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
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);
  const kioskLocations = locations.filter((l) => l.location_type === 'BRANCH_KIOSK');
  const branchChosen = Boolean(selectedBranchId);

  if (!profile) {
    return (
      <ModuleLayout>
        <ModuleLoading />
      </ModuleLayout>
    );
  }

  const deployHint = deployCommit ? ` · ${deployCommit}` : '';

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
    return `${LOCATION_TYPE_LABELS[loc.location_type]} — ${loc.name}`;
  }

  function handleOverviewSelect(branchIdPick: string, locationId: string) {
    setSelectedBranchId(branchIdPick);
    setSelectedLocationId(locationId);
    setDashboardView('location');
    setActiveTab('balances');
  }

  async function handleReceive(items: LineItemInput[], notes?: string) {
    try {
      await receiveStock(selectedLocationId, items, 'HQ_WAREHOUSE', notes);
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
        />
      );
    }
    if (!selectedLocationId || !selectedLocation) {
      return <ModuleLoading rows={2} />;
    }

    return (
      <>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{formatLocationLabel(selectedLocation)}</CardTitle>
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

            <div className="mt-4">
              {activeTab === 'balances' &&
                (balances.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    title="Tiada baki stok"
                    description="Lokasi ini belum mempunyai baki stok. Terima stok dari tab Terima."
                  />
                ) : (
                  <BalanceTable balances={balances} showPackConversion groupByCategory />
                ))}

              {activeTab === 'movements' && <MovementList movements={movements} />}

              {activeTab === 'receive' && stockAccess?.canReceive && (
                <StockLineForm
                  mode="receive"
                  stockItems={stockItems}
                  onSubmit={(items, meta) => handleReceive(items, meta?.notes)}
                />
              )}

              {activeTab === 'transfer' && stockAccess?.canTransfer && (
                <TransferPanel
                  locations={kioskLocations}
                  kioskOnly
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
                  canSetRotiProductionDate={orderMaker}
                />
              )}

              {activeTab === 'adjust' && stockAccess?.canAdjust && (
                <StockLineForm
                  mode="adjust"
                  stockItems={stockItems}
                  balances={balances}
                  onSubmitAdjust={handleAdjustment}
                />
              )}

              {activeTab === 'count' && stockAccess?.canCount && (
                <StockLineForm
                  mode="count"
                  stockItems={stockItems}
                  balances={balances}
                  onSubmitCount={handleCount}
                />
              )}

              {activeTab === 'writeoff' && stockAccess?.canWriteOff && (
                <StockLineForm
                  mode="writeoff"
                  stockItems={stockItems}
                  onSubmitWriteOff={handleWriteOff}
                />
              )}
            </div>
          </Tabs>
        )}
      </>
    );
  }

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
            allowAll
            allLabel="Semua kiosk kawasan saya"
          />
        )}

        {!branchChosen ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pilih cawangan dari senarai atas, atau klik <strong>Buka</strong> pada grid di bawah
              untuk urus stok kiosk.
            </p>
            <KioskOverviewPanel branchId={undefined} onSelectBranch={handleOverviewSelect} />
          </div>
        ) : (
          <div className="space-y-4">
            {selectedLocation && (
              <p className="text-sm">
                <span className="text-muted-foreground">Kiosk: </span>
                <span className="font-medium">{formatLocationLabel(selectedLocation)}</span>
              </p>
            )}
            {renderLocationDetail()}
          </div>
        )}
      </>
    );
  }

  return (
    <ModuleLayout data-am-inventory="v2">
      <ModuleHeader
        title="Inventori Kawasan"
        description={`Stok kiosk cawangan dalam kawasan anda — terima, pindah, kira & lupus${deployHint}`}
        icon={Package}
        badges={
          dashboardView === 'location' && selectedLocationId ? (
            <>
              {criticalCount > 0 && (
                <Badge variant="destructive">{criticalCount} Kritikal</Badge>
              )}
              {lowCount > 0 && <Badge variant="secondary">{lowCount} Stok Rendah</Badge>}
            </>
          ) : null
        }
      />

      <AreaManagerInventoryShell
        view={dashboardView === 'branch-transfer' ? 'branch-transfer' : 'location'}
        onViewChange={(v) => setDashboardView(v)}
        showBranchTransfer={canCrossBranchTransfer}
        locationPanel={renderLocationPanel()}
        branchTransferPanel={<BranchTransferPanel />}
      />
    </ModuleLayout>
  );
}
