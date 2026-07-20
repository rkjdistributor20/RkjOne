'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Truck, Plus, MapPin, Package, CalendarDays, LayoutDashboard, ClipboardCheck, Route, UserRound, Pencil, Trash2, Search, MapPinned, ShieldCheck } from 'lucide-react';
import {
 deleteFleetDriver,
 fetchDeliveryOrders,
 fetchFleetDrivers,
 fetchFleetVehicles,
 fetchFleetStatus,
 dispatchLeg,
 logFleetStatus,
 updateFleetDriver,
} from '@/lib/fleet/api';
import { fetchLocations, fetchStockItems } from '@/lib/inventory/api';
import type { DeliveryLeg, DeliveryOrder, FleetDriver, FleetRouteOption, FleetStatusLog, FleetVehicle } from '@/lib/fleet/types';
import { LEG_TYPE_LABELS } from '@/lib/fleet/types';
import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';
import type { InventoryLocation, StockItemOption } from '@/lib/inventory/types';
import { useAuthStore } from '@/stores/auth-store';
import {
 labelFor,
 DELIVERY_STATUS_LABELS,
 FLEET_VEHICLE_STATUS_LABELS,
} from '@/lib/ui/labels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CreateDeliveryDialog } from '@/components/fleet/create-delivery-dialog';
import { PodDialog } from '@/components/fleet/pod-dialog';
import { DriverWorkSchedulePanel } from '@/components/fleet/driver-work-schedule-panel';
import { DriverManualRoutePanel } from '@/components/fleet/driver-manual-route-panel';
import { FleetOverviewPanel } from '@/components/fleet/fleet-overview-panel';
import { WorkflowSopPanel } from '@/components/dashboard/workflow-sop-panel';
import { OperationsWorkflowMap } from '@/components/dashboard/operations-workflow-map';
import { getRoleWorkflow } from '@/lib/dashboard/role-workflows';
import {
 ModuleLayout,
 ModuleHeader,
 ModuleLoading,
 EmptyState,
 PrimaryActionButton,
 KpiGrid,
 KpiCard,
 moduleTabsListClass,
 moduleTabsTriggerClass,
} from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/components/i18n/language-provider';

const STATUS_VARIANT: Record<string, 'outline' | 'secondary' | 'destructive' | 'default'> = {
 PENDING: 'secondary',
 IN_TRANSIT: 'default',
 DELIVERED: 'outline',
 DRAFT: 'secondary',
};

const VEHICLE_STATUS_OPTIONS = Object.keys(FLEET_VEHICLE_STATUS_LABELS);
type FleetTab = 'overview' | 'schedule' | 'drivers' | 'deliveries' | 'vehicles' | 'status';

function parseFleetRemark(remarks?: string | null) {
 const parts = (remarks ?? '').split('|').map((part) => part.trim());
 const model = parts.find((part) => part.toLowerCase().startsWith('model:'))?.replace(/^Model:\s*/i, '');
 const route = parts.find((part) => part.toLowerCase().startsWith('lokasi perjalanan:'))
 ?.replace(/^Lokasi Perjalanan:\s*/i, '');
 return { model, route };
}

function uniqueClean(values: Array<string | null | undefined>) {
 return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function driverAreas(driver: FleetDriver) {
 const vehicleAreas = uniqueClean((driver.vehicles ?? []).map((vehicle) => parseFleetRemark(vehicle.remarks).route));
 const routeAreas = uniqueClean((driver.route_rows ?? []).map((route) => route.location_name));
 return uniqueClean([...vehicleAreas, ...routeAreas]);
}

function driverMainRole(driver: FleetDriver) {
 const areas = driverAreas(driver).join(' / ').toLowerCase();
 if (
 ['DRV001', 'DIST-DRV-001'].includes(driver.driver_code) ||
 areas.includes('teluk intan > kuala lumpur')
 ) {
 return 'Driver hub utama: ambil stok dari kilang/HQ, lengkapkan handoff hub dan bawa ke laluan utama Kuala Lumpur/Utara.';
 }
 if (driver.driver_code === 'DIST-AST-001') {
 return 'Pembantu driver kepada Abdul Samad: ikut tugas, waktu, kenderaan dan area yang sama untuk hub Kuala Lumpur/Utara.';
 }
 if (driver.driver_code === 'MFG-DRV-POOL') {
 return 'Driver kilang ganti: pool khas untuk staf kilang yang ditugaskan sementara sebagai driver tambahan atau backup.';
 }
 if (areas.includes('kuala lumpur')) {
 return 'Driver relay Kuala Lumpur: terima stok dari hub/HQ, pecahkan ikut kiosk, AM kawasan dan pickup ejen kawasan KL.';
 }
 if (areas.includes('sungkai')) {
 return 'Driver laluan Sungkai: urus penghantaran khas dan sokongan laluan tengah.';
 }
 if (areas.includes('utara')) {
 return 'Driver laluan Utara: hantar stok ke cawangan dan pickup ejen Utara, serta bantu sambungan dari Teluk Intan.';
 }
 return 'Driver penghantaran aktif RKJ Distributor mengikut arahan OM/HQ, readiness AM, cawangan dan pickup agent.';
}

function driverSop(driver: FleetDriver) {
 const base = [
 'Semak arahan OM/HQ dalam Logistik sebelum bergerak.',
 'Pastikan AM/cawangan atau PIC pickup agent jelas sebelum keluar.',
 'Sahkan kenderaan, kuantiti stok, HQ/hub handoff dan destinasi cawangan/pickup sebelum load.',
 'Update status bila keluar, sampai cawangan/HQ/pickup agent, serah stok dan selesai route.',
 'Ambil bukti penghantaran/POD: penerima, nota isu, masa, kuantiti dan lokasi jika diperlukan.',
 ];
 const areas = driverAreas(driver).join(' / ').toLowerCase();
 if (['DRV001', 'DIST-DRV-001', 'DIST-AST-001'].includes(driver.driver_code)) {
 return [
 ...base,
 'Untuk hub utama, pastikan stok handoff kepada driver relay direkod sebelum route ditutup.',
 driver.driver_code === 'DIST-AST-001'
 ? 'Sebagai pembantu driver, ikut arahan Abdul Samad dan sahkan setiap handoff/serahan pada dashboard yang sama.'
 : 'Jika ada pembantu driver, pastikan pembahagian tugas dan masa serahan disahkan sebelum keluar.',
 ];
 }
 if (driver.driver_code === 'MFG-DRV-POOL') {
 return [
 'Digunakan hanya apabila OM/HQ melantik staf kilang sebagai driver ganti.',
 'Sahkan staf yang ditugaskan, kenderaan, destinasi dan kuantiti stok sebelum bergerak.',
 'Rekod status penghantaran seperti driver biasa supaya laporan logistik lengkap.',
 ];
 }
 if (areas.includes('kuala lumpur')) {
 return [
 ...base,
 'Untuk relay KL, semak stok yang diterima daripada hub sebelum pecahan ke kiosk/ejen.',
 ];
 }
 if (areas.includes('utara')) {
 return [
 ...base,
 'Untuk laluan Utara, susun hentian ikut jarak, stok kritikal dan cutoff cawangan.',
 ];
 }
 return base;
}

function routeTypeLabel(type?: string | null) {
 if (type === 'BRANCH_KIOSK') return 'Cawangan';
 if (type === 'AGENT_DROP_POINT') return 'Pickup Ejen';
 return 'Drop Point';
}

function DriverProfileEditor({
 driver,
 routeOptions,
 open,
 onOpenChange,
 onSaved,
}: {
 driver: FleetDriver | null;
 routeOptions: FleetRouteOption[];
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onSaved: () => void;
}) {
 const [fullName, setFullName] = useState('');
 const [phone, setPhone] = useState('');
 const [routeDescription, setRouteDescription] = useState('');
 const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
 const [search, setSearch] = useState('');
 const [saving, setSaving] = useState(false);

 useEffect(() => {
 if (!driver) return;
 setFullName(driver.full_name);
 setPhone(driver.phone ?? '');
 setRouteDescription(driver.route_description ?? '');
 setSelectedKeys(driver.assigned_route_keys ?? []);
 setSearch('');
 }, [driver]);

 const filteredOptions = useMemo(() => {
 const needle = search.trim().toLowerCase();
 const options = needle
 ? routeOptions.filter((option) =>
 [
 option.label,
 option.route_code,
 option.location_name,
 option.collect_from,
 option.notes,
 option.assigned_driver_names.join(' '),
 ].join(' ').toLowerCase().includes(needle))
 : routeOptions;

 return {
 branches: options.filter((option) => option.location_type === 'BRANCH_KIOSK'),
 agents: options.filter((option) => option.location_type === 'AGENT_DROP_POINT'),
 others: options.filter((option) => !['BRANCH_KIOSK', 'AGENT_DROP_POINT'].includes(String(option.location_type))),
 };
 }, [routeOptions, search]);

 function toggleRoute(key: string) {
 setSelectedKeys((current) =>
 current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
 }

 async function handleSave() {
 if (!driver) return;
 if (!fullName.trim()) {
 toast.error('Nama driver wajib diisi.');
 return;
 }

 setSaving(true);
 try {
 await updateFleetDriver({
 id: driver.id,
 full_name: fullName.trim(),
 phone: phone.trim() || null,
 route_description: routeDescription.trim() || null,
 route_keys: selectedKeys,
 });
 toast.success('Profil driver dikemaskini');
 onSaved();
 onOpenChange(false);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemaskini driver');
 } finally {
 setSaving(false);
 }
 }

 const sections = [
 { key: 'branches', title: 'Cawangan Roti Kaya Junus', options: filteredOptions.branches },
 { key: 'agents', title: 'Pickup Point / Drop Point Agent', options: filteredOptions.agents },
 { key: 'others', title: 'Laluan Lain', options: filteredOptions.others },
 ].filter((section) => section.options.length > 0);

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Pencil className="h-4 w-4 text-amber-600" />
 Kemaskini Profil Driver
 </DialogTitle>
 <DialogDescription>
 Edit maklumat driver, telefon dan pilihan area/laluan berdasarkan cawangan serta pickup point ejen yang aktif.
 </DialogDescription>
 </DialogHeader>

 <div className="grid gap-4 md:grid-cols-2">
 <div className="space-y-1.5">
 <span className="text-sm font-medium">Nama penuh driver</span>
 <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
 </div>
 <div className="space-y-1.5">
 <span className="text-sm font-medium">No. telefon</span>
 <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Opsyenal" />
 </div>
 <div className="space-y-1.5 md:col-span-2">
 <span className="text-sm font-medium">Ringkasan tugas / laluan utama</span>
 <Textarea
 value={routeDescription}
 onChange={(event) => setRouteDescription(event.target.value)}
 placeholder="Contoh: Driver laluan Utara, cover BR001-BR012 dan pickup agent berdekatan."
 className="min-h-20"
 />
 </div>
 </div>

 <div className="rounded-xl border bg-amber-50/50 p-4">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <p className="font-semibold">Area / Laluan Bertugas</p>
 <p className="text-sm text-muted-foreground">
 Pilih lebih dari satu laluan. Pilihan ini terus digunakan oleh jadual penghantaran, agent drop point dan rujukan OM/HQ.
 </p>
 </div>
 <Badge variant="secondary">{selectedKeys.length} dipilih</Badge>
 </div>
 <div className="relative mt-3">
 <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 value={search}
 onChange={(event) => setSearch(event.target.value)}
 placeholder="Cari cawangan, pickup ejen, route code atau driver..."
 className="pl-9"
 />
 </div>
 </div>

 <div className="space-y-4">
 {sections.map((section) => (
 <div key={section.key} className="rounded-xl border bg-card">
 <div className="flex items-center justify-between border-b px-4 py-3">
 <div className="flex items-center gap-2">
 <MapPinned className="h-4 w-4 text-blue-600" />
 <p className="font-semibold">{section.title}</p>
 </div>
 <Badge variant="outline">{section.options.length} lokasi</Badge>
 </div>
 <div className="grid gap-2 p-3 md:grid-cols-2">
 {section.options.map((option) => {
 const checked = selectedKeys.includes(option.key);
 const otherDrivers = option.assigned_driver_names.filter((name) => name.toLowerCase() !== fullName.trim().toLowerCase());
 return (
 <button
 key={option.key}
 type="button"
 onClick={() => toggleRoute(option.key)}
 className={cn(
 'rounded-lg border p-3 text-left transition hover:border-amber-400 hover:bg-amber-50/60',
 checked ? 'border-amber-500 bg-amber-50 shadow-sm' : 'bg-background')}
 >
 <div className="flex items-start gap-3">
 <input
 readOnly
 type="checkbox"
 checked={checked}
 className="mt-1 h-4 w-4 rounded border-input accent-amber-500"
 />
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-2">
 <p className="font-medium">{option.label}</p>
 <Badge variant="secondary">{routeTypeLabel(option.location_type)}</Badge>
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 {option.route_code} {option.collect_from ? `- ${option.collect_from}` : ''}
 </p>
 {option.notes && (
 <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{option.notes}</p>)}
 {otherDrivers.length > 0 && (
 <p className="mt-2 text-xs text-blue-700">
 Turut dijaga: {otherDrivers.join(' / ')}
 </p>)}
 </div>
 </div>
 </button>);
 })}
 </div>
 </div>))}
 {sections.length === 0 && (
 <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
 Tiada laluan padan dengan carian.
 </div>)}
 </div>

 <DialogFooter>
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Batal
 </Button>
 <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600">
 {saving ? 'Menyimpan...' : 'Simpan Profil Driver'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}

export function FleetDashboard() {
 const { t } = useLanguage();
 const profile = useAuthStore((s) => s.profile);
 const isDriver = profile?.role === 'DRIVER';
 const workflow = getRoleWorkflow({
 role: isDriver ? 'DRIVER' : 'OPERATION_MANAGER',
 legalEntityCode: profile?.legal_entity?.code ?? 'RKJ_DIST',
 });

 const [orders, setOrders] = useState<DeliveryOrder[]>([]);
 const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
 const [drivers, setDrivers] = useState<FleetDriver[]>([]);
 const [routeOptions, setRouteOptions] = useState<FleetRouteOption[]>([]);
 const [statusLogs, setStatusLogs] = useState<FleetStatusLog[]>([]);
 const [locations, setLocations] = useState<InventoryLocation[]>([]);
 const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
 const [loading, setLoading] = useState(!isDriver);
 const [activeTab, setActiveTab] = useState<FleetTab>('overview');
 const [statusLoading, setStatusLoading] = useState(false);
 const [statusLoaded, setStatusLoaded] = useState(false);
 const [resourceLoading, setResourceLoading] = useState(false);
 const [resourcesLoaded, setResourcesLoaded] = useState(false);
 const [createOpen, setCreateOpen] = useState(false);
 const [driverEditorOpen, setDriverEditorOpen] = useState(false);
 const [editingDriver, setEditingDriver] = useState<FleetDriver | null>(null);
 const [podLeg, setPodLeg] = useState<DeliveryLeg | null>(null);
 const [podOpen, setPodOpen] = useState(false);

 const loadData = useCallback(async () => {
 if (isDriver) return;
 setLoading(true);
 try {
 const [ord, veh, drv] = await Promise.all([
 fetchDeliveryOrders(),
 fetchFleetVehicles(),
 fetchFleetDrivers(),
 ]);
 setOrders(ord.orders as DeliveryOrder[]);
 setVehicles(veh.vehicles);
 setDrivers(drv.drivers);
 setRouteOptions(drv.route_options ?? []);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan data logistik');
 } finally {
 setLoading(false);
 }
 }, [isDriver]);

 const loadStatusLogs = useCallback(async (force = false) => {
 if (statusLoaded && !force) return;
 setStatusLoading(true);
 try {
 const logs = await fetchFleetStatus();
 setStatusLogs(logs.logs as FleetStatusLog[]);
 setStatusLoaded(true);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan log status logistik');
 } finally {
 setStatusLoading(false);
 }
 }, [statusLoaded]);

 const loadCreateResources = useCallback(async () => {
 if (resourcesLoaded) return;
 setResourceLoading(true);
 try {
 const [loc, items] = await Promise.all([
 fetchLocations(),
 fetchStockItems({ hq: true }),
 ]);
 setLocations(loc.locations);
 setStockItems(items.items);
 setResourcesLoaded(true);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan data penghantaran manual');
 } finally {
 setResourceLoading(false);
 }
 }, [resourcesLoaded]);

 useEffect(() => {
 loadData();
 }, [loadData]);

 useEffect(() => {
 if (activeTab === 'status') {
 void loadStatusLogs();
 }
 }, [activeTab, loadStatusLogs]);

 useEffect(() => {
 if (createOpen) {
 void loadCreateResources();
 }
 }, [createOpen, loadCreateResources]);

 function openCreateDialog() {
 setCreateOpen(true);
 void loadCreateResources();
 }

 async function handleDispatch(legId: string) {
 try {
 await dispatchLeg(legId);
 toast.success('Leg dihantar');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal hantar leg');
 }
 }

 async function handleLogStatus(vehicleId: string, status: string) {
 try {
 await logFleetStatus({ vehicle_id: vehicleId, status });
 toast.success('Status direkod');
 setStatusLoaded(false);
 loadData();
 void loadStatusLogs(true);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal rekod status');
 }
 }

 function handleEditDriver(driver: FleetDriver) {
 setEditingDriver(driver);
 setDriverEditorOpen(true);
 }

 async function handleDeleteDriver(driver: FleetDriver) {
 const ok = window.confirm(`Delete driver ${driver.full_name} daripada dashboard logistik? Rekod akan ditanda inactive untuk laporan/audit.`);
 if (!ok) return;

 try {
 await deleteFleetDriver(driver.id);
 toast.success('Driver ditanda inactive dan dikeluarkan daripada laluan aktif');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal delete driver');
 }
 }

 if (isDriver) {
 return (
 <ModuleLayout>
 <ModuleHeader
 title={t('module.fleet.driverTitle')}
 description={t('module.fleet.driverDesc')}
 icon={Truck}
 />
 <WorkflowSopPanel workflow={workflow} />
 <OperationsWorkflowMap focus="fleet" compact />
 <div className="space-y-6">
 <DriverWorkSchedulePanel driverMode />
 <div>
 <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
 {t('module.fleet.manualDo')}
 </h2>
 <DriverManualRoutePanel />
 </div>
 </div>
 </ModuleLayout>);
 }

 const activeDeliveries = orders.filter(
 (o) => o.status === 'PENDING' || o.status === 'IN_TRANSIT').length;
 const branchRouteCount = routeOptions.filter((route) => route.location_type === 'BRANCH_KIOSK').length;
 const agentRouteCount = routeOptions.filter((route) => route.location_type === 'AGENT_DROP_POINT').length;
 const assignedRouteCount = routeOptions.filter((route) => route.assigned_driver_names.some((name) => name.toLowerCase() !== 'belum ditetapkan')).length;

 return (
 <ModuleLayout>
 <ModuleHeader
 title={t('module.fleet.title')}
 description={t('module.fleet.description')}
 icon={Truck}
 badges={
 <>
 <Badge variant="secondary">{vehicles.length} {t('module.fleet.vehicles')}</Badge>
 <Badge variant={activeDeliveries > 0 ? 'default' : 'outline'}>
 {activeDeliveries} {t('module.fleet.activeDeliveries')}
 </Badge>
 </>
 }
 actions={
 <PrimaryActionButton onClick={openCreateDialog}>
 <Plus className="mr-2 h-4 w-4" />
 {t('module.fleet.manualDelivery')}
 </PrimaryActionButton>
 }
 />

 <WorkflowSopPanel workflow={workflow} />
 <OperationsWorkflowMap focus="fleet" compact />

 {loading ? (
 <ModuleLoading />) : (
 <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FleetTab)} className="space-y-4">
 <TabsList className={moduleTabsListClass}>
 <TabsTrigger value="overview" className={moduleTabsTriggerClass}>
 <LayoutDashboard className="h-4 w-4" /> {t('module.fleet.overview')}
 </TabsTrigger>
 <TabsTrigger value="schedule" className={moduleTabsTriggerClass}>
 <CalendarDays className="h-4 w-4" /> {t('module.fleet.driverInstruction')}
 </TabsTrigger>
 <TabsTrigger value="drivers" className={moduleTabsTriggerClass}>
 <UserRound className="h-4 w-4" /> {t('module.fleet.driverProfile')}
 </TabsTrigger>
 <TabsTrigger value="deliveries" className={moduleTabsTriggerClass}>
 <Package className="h-4 w-4" /> {t('module.fleet.manualDo')}
 </TabsTrigger>
 <TabsTrigger value="vehicles" className={moduleTabsTriggerClass}>
 <Truck className="h-4 w-4" /> {t('module.fleet.activeVehicles')}
 </TabsTrigger>
 <TabsTrigger value="status" className={moduleTabsTriggerClass}>
 <MapPin className="h-4 w-4" /> {t('module.fleet.statusLog')}
 </TabsTrigger>
 </TabsList>

 <TabsContent value="overview" className="mt-2">
 <FleetOverviewPanel />
 </TabsContent>

 <TabsContent value="schedule" className="mt-2">
 <DriverWorkSchedulePanel />
 </TabsContent>

 <TabsContent value="drivers" className="mt-2 space-y-5">
 <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 text-white shadow-sm">
 <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr]">
 <div>
 <Badge className="border-amber-400/40 bg-amber-400/15 text-amber-100 hover:bg-amber-400/20">
 {t('module.fleet.commandCenter')}
 </Badge>
 <h3 className="mt-3 text-2xl font-semibold tracking-normal">
 {t('module.fleet.commandCenterTitle')}
 </h3>
 <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
 {t('module.fleet.commandCenterDesc')}
 </p>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div className="rounded-xl border border-white/10 bg-white/10 p-3">
 <p className="text-xs uppercase text-white/55">{t('module.fleet.activeDrivers')}</p>
 <p className="mt-2 text-2xl font-semibold">{drivers.length}</p>
 </div>
 <div className="rounded-xl border border-white/10 bg-white/10 p-3">
 <p className="text-xs uppercase text-white/55">{t('module.fleet.activeVehicles')}</p>
 <p className="mt-2 text-2xl font-semibold">{vehicles.length}</p>
 </div>
 <div className="rounded-xl border border-white/10 bg-white/10 p-3">
 <p className="text-xs uppercase text-white/55">{t('module.fleet.branchRoutes')}</p>
 <p className="mt-2 text-2xl font-semibold">{branchRouteCount}</p>
 </div>
 <div className="rounded-xl border border-white/10 bg-white/10 p-3">
 <p className="text-xs uppercase text-white/55">{t('module.fleet.agentPickup')}</p>
 <p className="mt-2 text-2xl font-semibold">{agentRouteCount}</p>
 </div>
 </div>
 </div>
 <div className="border-t border-white/10 bg-white/5 px-5 py-3 text-sm text-white/70">
 {assignedRouteCount} daripada {routeOptions.length} lokasi aktif telah dipautkan kepada driver.
 </div>
 </div>

 {drivers.length === 0 ? (
 <EmptyState
 icon={UserRound}
 title={t('module.fleet.noActiveDrivers')}
 description={t('module.fleet.noActiveDriversDesc')}
 />) : (
 <div className="grid gap-4 xl:grid-cols-2">
 {drivers.map((driver) => {
 const areas = driverAreas(driver);
 const sop = driverSop(driver);
 const visibleAreas = areas.slice(0, 8);
 const hiddenAreaCount = Math.max(areas.length - visibleAreas.length, 0);
 return (
 <Card key={driver.id} className="overflow-hidden border-amber-100/70 shadow-sm">
 <CardHeader className="border-b bg-gradient-to-r from-amber-50 via-white to-white pb-4">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="min-w-0">
 <CardTitle className="flex items-center gap-2 text-base">
 <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
 <UserRound className="h-4 w-4" />
 </span>
 <span className="min-w-0">
 <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
 {driver.driver_code}
 </span>
 <span className="block truncate">{driver.full_name}</span>
 </span>
 </CardTitle>
 <p className="mt-2 text-xs text-muted-foreground">
 {driver.phone ? `Telefon: ${driver.phone}` : 'Telefon belum didaftarkan'}
 </p>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button size="sm" variant="outline" onClick={() => handleEditDriver(driver)}>
 <Pencil className="mr-2 h-4 w-4" />
 Edit
 </Button>
 <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteDriver(driver)}>
 <Trash2 className="mr-2 h-4 w-4" />
 Delete
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-4 pt-4 text-sm">
 <div className="grid gap-3 sm:grid-cols-3">
 <div className="rounded-xl border bg-muted/30 p-3">
 <p className="text-xs text-muted-foreground">Laluan</p>
 <p className="mt-1 text-lg font-semibold">{areas.length}</p>
 </div>
 <div className="rounded-xl border bg-muted/30 p-3">
 <p className="text-xs text-muted-foreground">Kenderaan</p>
 <p className="mt-1 text-lg font-semibold">{driver.vehicles?.length ?? 0}</p>
 </div>
 <div className="rounded-xl border bg-muted/30 p-3">
 <p className="text-xs text-muted-foreground">Status</p>
 <p className="mt-1 text-sm font-semibold text-emerald-700">Aktif</p>
 </div>
 </div>

 <div className="rounded-xl border bg-background p-3">
 <p className="flex items-center gap-2 font-semibold">
 <Route className="h-4 w-4 text-blue-600" />
 Area / Laluan Bertugas
 </p>
 <div className="mt-2 flex flex-wrap gap-2">
 {visibleAreas.length > 0 ? visibleAreas.map((area) => (
 <Badge key={area} variant="secondary" className="whitespace-normal text-left">
 {area}
 </Badge>)) : (
 <span className="text-xs text-muted-foreground">Belum ada area/laluan khusus.</span>)}
 {hiddenAreaCount > 0 && <Badge variant="outline">+{hiddenAreaCount} lagi</Badge>}
 </div>
 </div>

 <div className="grid gap-3 md:grid-cols-2">
 <div className="rounded-xl border bg-background p-3">
 <p className="flex items-center gap-2 font-semibold">
 <Truck className="h-4 w-4 text-emerald-600" />
 Kenderaan
 </p>
 <div className="mt-2 space-y-2">
 {(driver.vehicles ?? []).length > 0 ? (driver.vehicles ?? []).map((vehicle) => {
 const details = parseFleetRemark(vehicle.remarks);
 return (
 <div key={vehicle.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
 <p className="font-medium">
 {vehicle.plate_number ?? vehicle.vehicle_code} - {vehicle.vehicle_type ?? 'Kenderaan'}
 {vehicle.capacity ? ` (${vehicle.capacity})` : ''}
 </p>
 {details.model && <p className="text-muted-foreground">Model: {details.model}</p>}
 </div>);
 }) : (
 <p className="text-xs text-muted-foreground">Belum ada kenderaan aktif dipautkan.</p>)}
 </div>
 </div>

 <div className="rounded-xl border bg-amber-50/60 p-3">
 <p className="flex items-center gap-2 font-semibold text-amber-950">
 <ShieldCheck className="h-4 w-4" />
 Tugas Utama
 </p>
 <p className="mt-2 text-xs leading-5 text-amber-950/80">{driverMainRole(driver)}</p>
 </div>
 </div>

 <div className="rounded-xl border bg-background p-3">
 <p className="flex items-center gap-2 font-semibold">
 <ClipboardCheck className="h-4 w-4 text-violet-600" />
 SOP Kerja Harian
 </p>
 <ol className="mt-2 grid gap-1 pl-5 text-xs text-muted-foreground sm:grid-cols-2">
 {sop.map((step) => (
 <li className="list-decimal" key={step}>{step}</li>))}
 </ol>
 </div>
 </CardContent>
 </Card>);
 })}
 </div>)}
 </TabsContent>

 <TabsContent value="deliveries" className="mt-2 space-y-4">
 {!loading && (
 <KpiGrid cols={3}>
 <KpiCard title={t('module.fleet.orders')} value={orders.length} icon={Package} />
 <KpiCard title={t('module.fleet.activeVehicles')} value={vehicles.length} icon={Truck} />
 <KpiCard title="Log Hari Ini" value={statusLogs.length} icon={MapPin} />
 </KpiGrid>)}
 {orders.length === 0 ? (
 <EmptyState
 icon={Package}
 title={t('module.fleet.noManualOrders')}
 description={`Aliran utama: ${HQ_DISTRIBUTOR_LABEL} -> rancang laluan -> driver terima arahan gabungan. DO manual untuk kes khas.`}
 action={
 <PrimaryActionButton onClick={openCreateDialog}>
 <Plus className="mr-2 h-4 w-4" />
 {t('module.fleet.manualDelivery')}
 </PrimaryActionButton>
 }
 />) : (
 orders.map((order) => (
 <Card key={order.id}>
 <CardHeader className="pb-2">
 <div className="flex items-start justify-between">
 <div>
 <CardTitle className="text-base">{order.order_number}</CardTitle>
 <p className="text-xs text-muted-foreground">
 {order.origin_location.name} ke {order.final_destination.name}
 {order.primary_driver && ` - ${order.primary_driver.full_name}`}
 </p>
 </div>
 <Badge variant={STATUS_VARIANT[order.status] ?? 'outline'}>
 {labelFor(DELIVERY_STATUS_LABELS, order.status)}
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="space-y-3">
 {(order.delivery_legs ?? []).sort((a, b) => a.leg_sequence ?? b.leg_sequence).map((leg) => (
 <div key={leg.id} className="rounded-lg border p-3 text-sm">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <span className="font-medium">
 Leg {leg.leg_sequence}: {LEG_TYPE_LABELS[leg.leg_type]}
 </span>
 <p className="text-xs text-muted-foreground">
 {leg.from_location.name} ke {leg.to_location.name}
 </p>
 </div>
 <Badge variant="outline">
 {labelFor(DELIVERY_STATUS_LABELS, leg.status)}
 </Badge>
 </div>
 <ul className="mt-2 text-xs text-muted-foreground">
 {leg.delivery_leg_items?.map((item, i) => (
 <li key={i}>
 {item.stock_item.name}: {item.quantity} {item.unit}
 </li>))}
 </ul>
 <div className="mt-2 flex gap-2">
 {leg.status === 'PENDING' && (
 <Button size="sm" variant="outline" onClick={() => handleDispatch(leg.id)}>
 Hantar
 </Button>)}
 {leg.status === 'IN_TRANSIT' && (
 <Button
 size="sm"
 className="bg-amber-500 hover:bg-amber-600"
 onClick={() => {
 setPodLeg(leg);
 setPodOpen(true);
 }}
 >
 Hantar POD
 </Button>)}
 {leg.proof_of_delivery?.[0] && (
 <span className="text-xs text-green-600">
 POD: {leg.proof_of_delivery[0].receiver_name}
 </span>)}
 </div>
 </div>))}
 </CardContent>
 </Card>)))}
 </TabsContent>

 <TabsContent value="vehicles" className="mt-2">
 {vehicles.length === 0 ? (
 <EmptyState
 icon={Truck}
 title={t('module.fleet.noVehicles')}
 description={t('module.fleet.noVehiclesDesc')}
 />) : (
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {vehicles.map((v) => (
 <Card key={v.id}>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm">{v.plate_number ?? v.vehicle_code}</CardTitle>
 </CardHeader>
 <CardContent className="space-y-2 text-sm">
 {(() => {
 const details = parseFleetRemark(v.remarks);
 return (
 <>
 <p className="font-medium">
 {v.vehicle_type}
 {v.capacity ? ` (${v.capacity})` : ''}
 </p>
 <p className="text-xs text-muted-foreground">
 Kod: {v.vehicle_code}
 {details.model ? ` | Model: ${details.model}` : ''}
 </p>
 {v.company_custodian_name && (
 <p className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-950">
 <span className="font-semibold">Penjaga syarikat:</span> {v.company_custodian_name}
 </p>)}
 {details.route && (
 <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
 Laluan: {details.route}
 </p>)}
 </>);
 })()}
 {v.latest_status && (
 <Badge variant="outline">
 {labelFor(FLEET_VEHICLE_STATUS_LABELS, v.latest_status, v.latest_status)}
 </Badge>)}
 <div className="flex flex-wrap gap-1 pt-1">
 {VEHICLE_STATUS_OPTIONS.map((s) => (
 <Button
 key={s}
 size="sm"
 variant="ghost"
 className="h-7 text-xs"
 onClick={() => handleLogStatus(v.id, s)}
 >
 {FLEET_VEHICLE_STATUS_LABELS[s]}
 </Button>))}
 </div>
 </CardContent>
 </Card>))}
 </div>)}
 </TabsContent>

 <TabsContent value="status" className="mt-2 space-y-2">
 {statusLoading ? (
 <ModuleLoading />) : statusLogs.length === 0 ? (
 <EmptyState
 icon={MapPin}
 title={t('module.fleet.noStatusLog')}
 description={t('module.fleet.noStatusLogDesc')}
 />) : (
 statusLogs.map((log) => (
 <div key={log.id} className="rounded-lg border p-3 text-sm">
 <div className="flex justify-between">
 <span className="font-medium">
 {log.vehicle.vehicle_code} - {' '}
 {labelFor(FLEET_VEHICLE_STATUS_LABELS, log.status, log.status)}
 </span>
 <span className="text-xs text-muted-foreground">
 {new Date(log.logged_at).toLocaleString('ms-MY')}
 </span>
 </div>
 {log.driver && (
 <p className="text-xs text-muted-foreground">{log.driver.full_name}</p>)}
 {log.location_description && (
 <p className="text-xs">{log.location_description}</p>)}
 </div>)))}
 </TabsContent>
 </Tabs>)}

 <CreateDeliveryDialog
 open={createOpen}
 onOpenChange={setCreateOpen}
 locations={locations}
 stockItems={stockItems}
 drivers={drivers}
 vehicles={vehicles}
 onSuccess={loadData}
 />
 {resourceLoading && createOpen && (
 <p className="px-1 text-xs text-muted-foreground">Memuatkan lokasi dan stok untuk penghantaran manual...</p>)}

 <DriverProfileEditor
 open={driverEditorOpen}
 onOpenChange={setDriverEditorOpen}
 driver={editingDriver}
 routeOptions={routeOptions}
 onSaved={loadData}
 />

 <PodDialog
 open={podOpen}
 onOpenChange={setPodOpen}
 leg={podLeg}
 onSuccess={loadData}
 />
 </ModuleLayout>);
}
