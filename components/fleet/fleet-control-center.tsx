'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
 AlertTriangle,
 BellRing,
 Check,
 CheckCircle2,
 Clock3,
 Gauge,
 Loader2,
 MapPinned,
 Navigation,
 RefreshCw,
 Route,
 ShieldCheck,
 Sparkles,
 TimerReset,
 Truck,
 Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import {
 endFleetDriverSession,
 createFleetGeofence,
 fetchFleetControlCenter,
 startFleetDriverSession,
 syncFleetGps,
 updateFleetAlert,
} from '@/lib/fleet/api';
import type {
 FleetAlertSeverity,
 FleetControlAlert,
 FleetControlCenterResponse,
} from '@/lib/fleet/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/components/i18n/language-provider';
import { WazeNavigationPanel } from '@/components/fleet/waze-navigation-panel';

const severityStyle: Record<FleetAlertSeverity, string> = {
 LOW: 'border-emerald-200 bg-emerald-50 text-emerald-800',
 MEDIUM: 'border-amber-200 bg-amber-50 text-amber-900',
 HIGH: 'border-orange-200 bg-orange-50 text-orange-900',
 CRITICAL: 'border-red-200 bg-red-50 text-red-900',
};

function useFleetLocale() {
 const { locale } = useLanguage();
 const en = locale === 'en';
 return { en, locale, text: (ms: string, english: string) => en ? english : ms };
}

function localizedAlert(alert: FleetControlAlert, en: boolean) {
 if (!en) return { title: alert.title, message: alert.message };
 const plate = alert.plate_number ?? 'Vehicle';
 const metadata = alert.metadata ?? {};
 if (alert.alert_type === 'OFFLINE') {
  const age = typeof metadata.age_minutes === 'number' ? metadata.age_minutes : null;
  return { title: `${plate} is not transmitting GPS`, message: age === null ? 'No GPS coordinates have been received for this vehicle.' : `The latest data was received ${age} minutes ago.` };
 }
 if (alert.alert_type === 'SPEEDING') {
  const speed = Math.round(Number(metadata.speed_kph ?? 0));
  return { title: `${plate} exceeded the operating speed limit`, message: `Current speed is ${speed} km/h. The OM should verify the situation with the driver.` };
 }
 if (alert.alert_type === 'LOW_FUEL') {
  const fuel = Math.round(Number(metadata.fuel_level ?? 0));
  return { title: `${plate} has low fuel`, message: `Fuel level is ${fuel}%. Plan refuelling before the next route.` };
 }
 if (alert.alert_type === 'IDLE') return { title: `${plate} has been idling too long`, message: 'Check the route, traffic conditions and driver status before taking action.' };
 if (alert.alert_type === 'MAINTENANCE_DUE') return { title: `${plate} requires maintenance`, message: 'Review the service plan before assigning the next route.' };
 return { title: alert.title, message: alert.message };
}

function localizedRecommendation(item: FleetControlCenterResponse['recommendations'][number], en: boolean) {
 if (!en) return { title: item.title, detail: item.detail };
 const copy: Record<string, { title: string; detail: string }> = {
  'critical-alerts': { title: 'Review critical alerts', detail: 'One or more alerts require immediate action by the OM or Owner.' },
  'offline-gps': { title: 'Restore inactive GPS units', detail: 'Some vehicles are not transmitting their latest location.' },
  maintenance: { title: 'Plan vehicle maintenance', detail: 'One or more services are approaching their limit or overdue.' },
  geofence: { title: 'Complete branch coordinates', detail: 'Locations without coordinates cannot automatically verify arrivals or POD.' },
  healthy: { title: 'Fleet operations are under control', detail: 'There are no critical exceptions. Continue monitoring ETA, POD and scheduled maintenance.' },
  'no-assignment': { title: 'No vehicle assigned', detail: 'Ask OM/HQ to link the driver profile to a vehicle before check-in.' },
 };
 return copy[item.id] ?? { title: item.title, detail: item.detail };
}

export function FleetControlCenter() {
 const { en, text } = useFleetLocale();
 const [data, setData] = useState<FleetControlCenterResponse | null>(null);
 const [loading, setLoading] = useState(true);
 const [syncing, setSyncing] = useState(false);
 const [geofenceOpen, setGeofenceOpen] = useState(false);

 const load = useCallback(async () => {
  try {
   setData(await fetchFleetControlCenter());
  } catch (error) {
   toast.error(error instanceof Error ? error.message : en ? 'Failed to load Fleet Control Center' : 'Gagal memuatkan Fleet Control Center');
  } finally {
   setLoading(false);
  }
 }, [en]);

 useEffect(() => {
  const timer = window.setTimeout(() => void load(), 0);
  return () => window.clearTimeout(timer);
 }, [load]);

 async function handleSync() {
  setSyncing(true);
  try {
   const result = await syncFleetGps();
   toast.success(en ? `${result.snapshots} GPS records analyzed, ${result.alerts} signals processed` : `${result.snapshots} GPS dianalisis, ${result.alerts} isyarat diproses`);
   await load();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : text('Analisis GPS gagal', 'GPS analysis failed'));
  } finally {
   setSyncing(false);
  }
 }

 async function handleAlert(alert: FleetControlAlert, status: 'ACKNOWLEDGED' | 'RESOLVED') {
  if (alert.live) {
   toast.info(text('Jalankan Analisis GPS dahulu untuk merekodkan amaran ini.', 'Run GPS Analysis first to record this alert.'));
   return;
  }
  try {
   await updateFleetAlert(alert.id, status);
   toast.success(status === 'ACKNOWLEDGED' ? text('Amaran telah diambil tindakan', 'Alert acknowledged') : text('Amaran telah diselesaikan', 'Alert resolved'));
   await load();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : text('Gagal mengemaskini amaran', 'Failed to update alert'));
  }
 }

 if (loading) return <ControlCenterSkeleton />;
 if (!data) return null;

 return (
  <section className="space-y-5 border-t pt-6" aria-labelledby="fleet-control-title" data-rkj-i18n-skip>
   <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
    <div>
     <div className="flex items-center gap-2">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-neutral-950 text-white">
       <Navigation className="h-4 w-4" />
      </div>
      <div>
       <h2 id="fleet-control-title" className="text-lg font-semibold">Fleet Control Center</h2>
       <p className="text-sm text-muted-foreground">
        {data.mode === 'DRIVER'
         ? text('Syif, keselamatan dan tugasan anda dalam satu paparan.', 'Your shift, safety and assignments in one view.')
         : text('Pantau pengecualian, ETA, keselamatan dan kos tanpa perlu memerhati peta sepanjang masa.', 'Monitor exceptions, ETA, safety and cost without watching the map all day.')}
       </p>
      </div>
     </div>
    </div>
    <div className="flex items-center gap-2">
     <span className="text-xs text-muted-foreground">
      {new Date(data.generated_at).toLocaleTimeString(en ? 'en-MY' : 'ms-MY', { hour: '2-digit', minute: '2-digit' })}
     </span>
     {data.mode === 'MANAGEMENT' && (
      <>
       <Button type="button" size="sm" variant="outline" onClick={() => setGeofenceOpen(true)}>
        <MapPinned className="mr-1.5 h-4 w-4" /> Geofence
       </Button>
       <Button type="button" size="sm" onClick={handleSync} disabled={syncing}>
        {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
        {text('Analisis GPS', 'Analyze GPS')}
       </Button>
      </>
     )}
    </div>
   </div>

   {data.mode === 'DRIVER' && (
    <DriverShiftPanel data={data} onUpdated={load} />
   )}

   <WazeNavigationPanel />

   <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
    <ControlMetric icon={Truck} label={text('Kenderaan', 'Vehicles')} value={data.kpis.total_vehicles} />
    <ControlMetric icon={Navigation} label={text('Bergerak', 'Moving')} value={data.kpis.moving} tone="success" />
    <ControlMetric icon={Clock3} label="Idle" value={data.kpis.idle} tone={data.kpis.idle ? 'warning' : 'neutral'} />
    <ControlMetric icon={AlertTriangle} label="Offline" value={data.kpis.offline} tone={data.kpis.offline ? 'danger' : 'neutral'} />
    <ControlMetric icon={BellRing} label={text('Amaran', 'Alerts')} value={data.kpis.open_alerts} tone={data.kpis.critical_alerts ? 'danger' : 'neutral'} />
    <ControlMetric icon={Route} label={text('Penghantaran', 'Deliveries')} value={data.kpis.active_deliveries} />
    <ControlMetric icon={Wrench} label={text('Servis', 'Service')} value={data.kpis.maintenance_due} tone={data.kpis.maintenance_due ? 'warning' : 'success'} />
    <ControlMetric icon={MapPinned} label="Geofence" value={data.kpis.geofence_coverage} />
   </div>

   <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
    <AlertQueue data={data} onAlert={handleAlert} />
    <RecommendationQueue data={data} />
   </div>

   <div className="grid gap-5 lg:grid-cols-2">
    <DeliveryEtaPanel data={data} />
    <MaintenancePanel data={data} />
   </div>
   <GeofenceDialog open={geofenceOpen} onOpenChange={setGeofenceOpen} data={data} onSaved={load} />
  </section>
 );
}

function GeofenceDialog({
 open, onOpenChange, data, onSaved,
}: {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 data: FleetControlCenterResponse;
 onSaved: () => Promise<void>;
}) {
 const { text } = useFleetLocale();
 const usableVehicles = data.gps.vehicles.filter((vehicle) => vehicle.latitude !== null && vehicle.longitude !== null);
 const [vehicleKey, setVehicleKey] = useState(usableVehicles[0]?.vehicle_id ?? usableVehicles[0]?.registration ?? '');
 const [branchId, setBranchId] = useState('none');
 const [name, setName] = useState('');
 const [type, setType] = useState('BRANCH');
 const [radius, setRadius] = useState('250');
 const [saving, setSaving] = useState(false);
 const selectedVehicle = usableVehicles.find((vehicle) => (vehicle.vehicle_id ?? vehicle.registration) === vehicleKey);

 function selectBranch(value: string | null) {
  const next = value ?? 'none';
  setBranchId(next);
  const branch = data.geofence_options.find((option) => option.id === next);
  if (branch) setName(branch.label);
 }

 async function save() {
  if (!selectedVehicle?.latitude || !selectedVehicle.longitude || !name.trim()) return;
  setSaving(true);
  try {
   await createFleetGeofence({
    name: name.trim(), geofence_type: type, branch_id: branchId === 'none' ? null : branchId,
    latitude: selectedVehicle.latitude, longitude: selectedVehicle.longitude, radius_m: Number(radius),
   });
   toast.success(text('Geofence disimpan daripada lokasi GPS semasa', 'Geofence saved from the current GPS location'));
   onOpenChange(false);
   await onSaved();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : text('Gagal menyimpan geofence', 'Failed to save geofence'));
  } finally { setSaving(false); }
 }

 return (
  <Dialog open={open} onOpenChange={onOpenChange}>
   <DialogContent className="sm:max-w-lg" data-rkj-i18n-skip>
    <DialogHeader>
     <DialogTitle>{text('Tambah Geofence Operasi', 'Add Operations Geofence')}</DialogTitle>
     <DialogDescription>{text('Pilih kenderaan yang sedang berada di lokasi sebenar. RKJ One akan menggunakan koordinat Cartrack tanpa taip manual.', 'Select a vehicle currently at the actual location. RKJ One will use its Cartrack coordinates without manual entry.')}</DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
     <div className="space-y-1.5">
      <Label>{text('Sumber lokasi Cartrack', 'Cartrack location source')}</Label>
      <Select value={vehicleKey} onValueChange={(value) => setVehicleKey(value ?? '')}>
       <SelectTrigger><SelectValue placeholder={text('Pilih kenderaan di lokasi', 'Select a vehicle at the location')} /></SelectTrigger>
       <SelectContent>{usableVehicles.map((vehicle) => <SelectItem key={vehicle.vehicle_id ?? vehicle.registration ?? vehicle.label} value={vehicle.vehicle_id ?? vehicle.registration ?? vehicle.label}>{vehicle.plate_number ?? vehicle.label} - {vehicle.location_description ?? text('Lokasi GPS', 'GPS location')}</SelectItem>)}</SelectContent>
      </Select>
     </div>
     <div className="space-y-1.5">
      <Label>{text('Pautkan cawangan (pilihan)', 'Link a branch (optional)')}</Label>
      <Select value={branchId} onValueChange={selectBranch}>
       <SelectTrigger><SelectValue /></SelectTrigger>
       <SelectContent>
        <SelectItem value="none">{text('Bukan cawangan', 'Not a branch')}</SelectItem>
        {data.geofence_options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
       </SelectContent>
      </Select>
     </div>
     <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label>{text('Nama lokasi', 'Location name')}</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={text('Contoh: HQ Distributor', 'Example: Distributor HQ')} /></div>
      <div className="space-y-1.5"><Label>{text('Jenis', 'Type')}</Label><Select value={type} onValueChange={(value) => setType(value ?? 'OTHER')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BRANCH">{text('Cawangan', 'Branch')}</SelectItem><SelectItem value="HQ">HQ</SelectItem><SelectItem value="FACTORY">{text('Kilang', 'Factory')}</SelectItem><SelectItem value="HUB">Hub</SelectItem><SelectItem value="AGENT_PICKUP">{text('Pickup ejen', 'Agent pickup')}</SelectItem><SelectItem value="OTHER">{text('Lain-lain', 'Other')}</SelectItem></SelectContent></Select></div>
     </div>
     <div className="space-y-1.5"><Label>{text('Radius (meter)', 'Radius (metres)')}</Label><Input inputMode="numeric" value={radius} onChange={(event) => setRadius(event.target.value)} /></div>
     {selectedVehicle && <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground"><strong>{selectedVehicle.plate_number}</strong> - {selectedVehicle.latitude?.toFixed(5)}, {selectedVehicle.longitude?.toFixed(5)}<br />{text('Pastikan kenderaan benar-benar berada di lokasi sebelum menyimpan.', 'Confirm the vehicle is physically at the location before saving.')}</div>}
    </div>
    <DialogFooter>
     <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{text('Batal', 'Cancel')}</Button>
     <Button type="button" disabled={!selectedVehicle || !name.trim() || saving} onClick={save}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {text('Simpan Geofence', 'Save Geofence')}</Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 );
}

function ControlMetric({
 icon: Icon, label, value, tone = 'neutral',
}: {
 icon: typeof Truck;
 label: string;
 value: number;
 tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
 const tones = {
  neutral: 'border-neutral-200 bg-white text-neutral-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  danger: 'border-red-200 bg-red-50 text-red-950',
 };
 return (
  <div className={cn('min-w-0 rounded-md border p-3', tones[tone])}>
   <div className="flex items-center justify-between gap-2">
    <span className="truncate text-[11px] font-medium">{label}</span>
    <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
   </div>
   <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
  </div>
 );
}

function AlertQueue({
 data, onAlert,
}: {
 data: FleetControlCenterResponse;
 onAlert: (alert: FleetControlAlert, status: 'ACKNOWLEDGED' | 'RESOLVED') => void;
}) {
 const { en, text } = useFleetLocale();
 const severityLabel: Record<FleetAlertSeverity, string> = en
  ? { LOW: 'Information', MEDIUM: 'Attention', HIGH: 'High', CRITICAL: 'Critical' }
  : { LOW: 'Makluman', MEDIUM: 'Perhatian', HIGH: 'Tinggi', CRITICAL: 'Kritikal' };
 const visible = data.alerts.slice(0, 7);
 return (
  <div className="min-w-0 space-y-3">
   <div className="flex items-center justify-between gap-3">
    <div>
     <h3 className="font-semibold">{text('Pusat Amaran', 'Alert Center')}</h3>
     <p className="text-xs text-muted-foreground">{text('Utamakan perkara yang memerlukan tindakan, bukan semua pergerakan.', 'Focus on exceptions that require action, not every movement.')}</p>
    </div>
    <Badge variant={data.kpis.critical_alerts ? 'destructive' : 'secondary'}>
     {data.kpis.critical_alerts} {text('kritikal/tinggi', 'critical/high')}
    </Badge>
   </div>
   {visible.length === 0 ? (
    <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
     <CheckCircle2 className="h-5 w-5" /> {text('Tiada amaran aktif. Operasi dalam keadaan terkawal.', 'No active alerts. Operations are under control.')}
    </div>
   ) : visible.map((alert) => {
    const copy = localizedAlert(alert, en);
    return <div key={alert.id} className={cn('rounded-md border p-3', severityStyle[alert.severity])}>
     <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
      <div className="min-w-0">
       <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="bg-white/70">{severityLabel[alert.severity]}</Badge>
        {alert.plate_number && <span className="text-xs font-semibold">{alert.plate_number}</span>}
        {alert.live && <span className="text-[11px]">Live</span>}
       </div>
       <p className="mt-1.5 text-sm font-semibold">{copy.title}</p>
       <p className="mt-0.5 text-xs leading-relaxed opacity-85">{copy.message}</p>
      </div>
      {data.mode === 'MANAGEMENT' && (
       <div className="flex shrink-0 gap-1.5">
        {alert.status === 'OPEN' && (
         <Button type="button" size="sm" variant="outline" className="bg-white/80" onClick={() => onAlert(alert, 'ACKNOWLEDGED')}>
          <Check className="mr-1 h-3.5 w-3.5" /> {text('Ambil', 'Acknowledge')}
         </Button>
        )}
        {!alert.live && (
         <Button type="button" size="sm" variant="outline" className="bg-white/80" onClick={() => onAlert(alert, 'RESOLVED')}>
          {text('Selesai', 'Resolve')}
         </Button>
        )}
       </div>
      )}
     </div>
    </div>;
   })}
  </div>
 );
}

function RecommendationQueue({ data }: { data: FleetControlCenterResponse }) {
 const { en, text } = useFleetLocale();
 return (
  <div className="space-y-3">
   <div>
    <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-amber-600" /> {text('Cadangan Tindakan', 'Recommended Actions')}</h3>
    <p className="text-xs text-muted-foreground">{text('Susunan kerja berdasarkan keadaan fleet semasa.', 'Prioritized work based on current fleet conditions.')}</p>
   </div>
   <div className="divide-y rounded-md border bg-white">
    {data.recommendations.map((item) => {
     const copy = localizedRecommendation(item, en);
     return <div key={item.id} className="p-3">
      <div className="flex items-start gap-3">
       <Badge variant={item.priority === 'SEGERA' ? 'destructive' : item.priority === 'HARI_INI' ? 'default' : 'secondary'}>
        {item.priority === 'HARI_INI' ? text('Hari ini', 'Today') : item.priority === 'SEGERA' ? text('Segera', 'Urgent') : text('Rancang', 'Plan')}
       </Badge>
       <div>
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{copy.detail}</p>
       </div>
      </div>
     </div>;
    })}
   </div>
   <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-950">
    <strong>SOP:</strong> {text('GPS membantu membuat keputusan. OM tetap menyemak konteks driver, trafik, cuaca dan arahan operasi sebelum tindakan disiplin.', 'GPS supports decisions. The OM must still review driver context, traffic, weather and operating instructions before disciplinary action.')}
   </div>
  </div>
 );
}

function DeliveryEtaPanel({ data }: { data: FleetControlCenterResponse }) {
 const { text } = useFleetLocale();
 return (
  <div className="space-y-3">
   <div>
    <h3 className="font-semibold">{text('ETA Penghantaran', 'Delivery ETA')}</h3>
    <p className="text-xs text-muted-foreground">{text('Jarak dan anggaran masa berdasarkan GPS kenderaan serta koordinat destinasi.', 'Distance and estimated time based on vehicle GPS and destination coordinates.')}</p>
   </div>
   <div className="divide-y rounded-md border bg-white">
    {data.deliveries.length === 0 ? (
     <p className="p-4 text-sm text-muted-foreground">{text('Tiada penghantaran aktif.', 'No active deliveries.')}</p>
    ) : data.deliveries.slice(0, 6).map((delivery) => (
     <div key={delivery.id} className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
       <p className="truncate text-sm font-semibold">{delivery.order_number} - {delivery.destination}</p>
       <p className="text-xs text-muted-foreground">{delivery.plate_number ?? text('Kenderaan belum dipilih', 'Vehicle not assigned')} - {delivery.status}</p>
      </div>
      <div className="shrink-0 text-right">
       <p className="text-sm font-semibold tabular-nums">{delivery.eta_minutes !== null ? `${delivery.eta_minutes} min` : text('ETA belum ada', 'ETA unavailable')}</p>
       <p className="text-[11px] text-muted-foreground">{delivery.distance_km !== null ? `${delivery.distance_km} km` : text('Koordinat diperlukan', 'Coordinates required')}</p>
      </div>
     </div>
    ))}
   </div>
  </div>
 );
}

function MaintenancePanel({ data }: { data: FleetControlCenterResponse }) {
 const { en, text } = useFleetLocale();
 const sorted = useMemo(() => [...data.maintenance].sort((a, b) => (a.remaining_km ?? 999999) - (b.remaining_km ?? 999999)), [data.maintenance]);
 return (
  <div className="space-y-3">
   <div>
    <h3 className="font-semibold">{text('Kesihatan Kenderaan', 'Vehicle Health')}</h3>
    <p className="text-xs text-muted-foreground">{text('Servis dirancang berdasarkan tarikh dan odometer Cartrack.', 'Services are planned using dates and Cartrack odometer readings.')}</p>
   </div>
   <div className="divide-y rounded-md border bg-white">
    {sorted.length === 0 ? (
     <p className="p-4 text-sm text-muted-foreground">{text('Pelan servis belum tersedia.', 'No service plans are available yet.')}</p>
    ) : sorted.slice(0, 6).map((plan) => {
     const due = plan.remaining_km !== null && plan.remaining_km <= 500;
     return (
      <div key={plan.id} className="flex items-center justify-between gap-3 p-3">
       <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{plan.plate_number ?? text('Kenderaan', 'Vehicle')} - {plan.service_name}</p>
        <p className="text-xs text-muted-foreground">{plan.next_service_date ? `${text('Tarikh', 'Date')} ${new Date(plan.next_service_date).toLocaleDateString(en ? 'en-MY' : 'ms-MY')}` : text('Tarikh belum ditetapkan', 'Date not set')}</p>
       </div>
       <Badge variant={due ? 'destructive' : 'secondary'}>
        {plan.remaining_km === null ? plan.status : plan.remaining_km < 0 ? `${Math.abs(plan.remaining_km)} km ${text('lewat', 'overdue')}` : `${plan.remaining_km} km ${text('lagi', 'remaining')}`}
       </Badge>
      </div>
     );
    })}
   </div>
  </div>
 );
}

function DriverShiftPanel({ data, onUpdated }: { data: FleetControlCenterResponse; onUpdated: () => Promise<void> }) {
 const { en, text } = useFleetLocale();
 const setup = data.driver_setup;
 const active = data.active_sessions[0] ?? null;
 const [vehicleId, setVehicleId] = useState(setup?.vehicles[0]?.id ?? '');
 const [odometer, setOdometer] = useState('');
 const [notes, setNotes] = useState('');
 const [saving, setSaving] = useState(false);
 const [checks, setChecks] = useState<Record<string, boolean>>({
  vehicle_condition: false, tyres: false, load_secured: false, documents: false,
 });

 async function coordinates() {
  if (!navigator.geolocation) return { latitude: null, longitude: null };
  return new Promise<{ latitude: number | null; longitude: number | null }>((resolve) => {
   navigator.geolocation.getCurrentPosition(
    (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    () => resolve({ latitude: null, longitude: null }),
    { enableHighAccuracy: true, timeout: 7000, maximumAge: 60_000 });
  });
 }

 async function start() {
  if (!setup || !vehicleId) return;
  setSaving(true);
  try {
   const gps = await coordinates();
   await startFleetDriverSession({
    driver_id: setup.driver_id, vehicle_id: vehicleId, checklist: checks,
    odometer_km: odometer ? Number(odometer) : null, notes: notes || null, ...gps,
   });
   toast.success(text('Syif bermula. Pandu dengan selamat.', 'Shift started. Drive safely.'));
   await onUpdated();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : text('Gagal memulakan syif', 'Failed to start shift'));
  } finally { setSaving(false); }
 }

 async function end() {
  if (!active) return;
  setSaving(true);
  try {
   const gps = await coordinates();
   await endFleetDriverSession({ session_id: active.id, odometer_km: odometer ? Number(odometer) : null, notes: notes || null, ...gps });
   toast.success(text('Syif ditutup dan rekod perjalanan disimpan.', 'Shift closed and trip record saved.'));
   await onUpdated();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : text('Gagal menutup syif', 'Failed to close shift'));
  } finally { setSaving(false); }
 }

 if (!setup) return (
  <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
   {text('Profil driver atau kenderaan belum dipadankan. Hubungi OM/HQ sebelum memulakan perjalanan.', 'The driver profile or vehicle is not linked. Contact OM/HQ before starting a trip.')}
  </div>
 );

 if (active) return (
  <div className="flex flex-col justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center">
   <div>
    <p className="flex items-center gap-2 font-semibold text-emerald-950"><ShieldCheck className="h-4 w-4" /> {text('Syif aktif', 'Active shift')} - {active.plate_number}</p>
    <p className="mt-1 text-xs text-emerald-800">{text('Bermula', 'Started')} {new Date(active.started_at).toLocaleString(en ? 'en-MY' : 'ms-MY')} - {text('Lengkapkan POD sebelum tutup syif.', 'Complete all POD records before closing the shift.')}</p>
   </div>
   <div className="flex gap-2">
    <Input className="w-32 bg-white" inputMode="decimal" placeholder={text('Odometer akhir', 'End odometer')} value={odometer} onChange={(event) => setOdometer(event.target.value)} />
    <Button type="button" variant="outline" className="bg-white" disabled={saving} onClick={end}>
     {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {text('Tamat Syif', 'End Shift')}
    </Button>
   </div>
  </div>
 );

 const allChecked = Object.values(checks).every(Boolean);
 const checklist = [
  ['vehicle_condition', text('Lampu, brek dan keadaan kenderaan baik', 'Lights, brakes and vehicle condition are good')],
  ['tyres', text('Tayar dan tekanan angin diperiksa', 'Tyres and air pressure have been checked')],
  ['load_secured', text('Muatan dikira dan diikat dengan selamat', 'The load has been counted and secured safely')],
  ['documents', text('Lesen, road tax dan dokumen perjalanan tersedia', 'Licence, road tax and travel documents are available')],
 ] as const;
 return (
  <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
   <div className="flex items-center gap-2 text-sky-950"><TimerReset className="h-4 w-4" /><p className="font-semibold">{text('Mula Syif Driver', 'Start Driver Shift')}</p></div>
   <p className="mt-1 text-xs text-sky-800">{text('Checklist ringkas ini melindungi driver, kenderaan dan stok sebelum bergerak.', 'This short checklist protects the driver, vehicle and stock before departure.')}</p>
   <div className="mt-4 grid gap-4 lg:grid-cols-2">
    <div className="space-y-3">
     {checklist.map(([key, label]) => (
      <Label key={key} className="flex cursor-pointer items-start gap-2 rounded-md border bg-white p-3 text-sm font-normal">
       <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-950"
        checked={checks[key]}
        onChange={(event) => setChecks((current) => ({ ...current, [key]: event.target.checked }))}
       />
       <span>{label}</span>
      </Label>
     ))}
    </div>
    <div className="space-y-3">
     <div className="space-y-1.5">
      <Label>{text('Kenderaan', 'Vehicle')}</Label>
      <Select value={vehicleId} onValueChange={(value) => setVehicleId(value ?? '')}>
       <SelectTrigger className="bg-white"><SelectValue placeholder={text('Pilih kenderaan', 'Select vehicle')} /></SelectTrigger>
       <SelectContent>{setup.vehicles.map((vehicle) => <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.plate_number ?? vehicle.vehicle_type ?? text('Kenderaan', 'Vehicle')}</SelectItem>)}</SelectContent>
      </Select>
     </div>
     <Input className="bg-white" inputMode="decimal" placeholder={text('Odometer mula (pilihan)', 'Start odometer (optional)')} value={odometer} onChange={(event) => setOdometer(event.target.value)} />
     <Textarea className="min-h-20 bg-white" placeholder={text('Catatan keadaan kenderaan (pilihan)', 'Vehicle condition notes (optional)')} value={notes} onChange={(event) => setNotes(event.target.value)} />
     <Button type="button" className="w-full" disabled={!allChecked || !vehicleId || saving} onClick={start}>
      {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Gauge className="mr-1.5 h-4 w-4" />} {text('Mula Perjalanan', 'Start Trip')}
     </Button>
    </div>
   </div>
  </div>
 );
}

function ControlCenterSkeleton() {
 return (
  <div className="space-y-4 border-t pt-6">
   <div className="h-12 animate-pulse rounded-md bg-muted" />
   <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><div className="h-20 animate-pulse rounded-md bg-muted" /><div className="h-20 animate-pulse rounded-md bg-muted" /><div className="h-20 animate-pulse rounded-md bg-muted" /><div className="h-20 animate-pulse rounded-md bg-muted" /></div>
  </div>
 );
}
