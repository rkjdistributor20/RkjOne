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

const severityStyle: Record<FleetAlertSeverity, string> = {
 LOW: 'border-emerald-200 bg-emerald-50 text-emerald-800',
 MEDIUM: 'border-amber-200 bg-amber-50 text-amber-900',
 HIGH: 'border-orange-200 bg-orange-50 text-orange-900',
 CRITICAL: 'border-red-200 bg-red-50 text-red-900',
};

const severityLabel: Record<FleetAlertSeverity, string> = {
 LOW: 'Makluman', MEDIUM: 'Perhatian', HIGH: 'Tinggi', CRITICAL: 'Kritikal',
};

export function FleetControlCenter() {
 const [data, setData] = useState<FleetControlCenterResponse | null>(null);
 const [loading, setLoading] = useState(true);
 const [syncing, setSyncing] = useState(false);
 const [geofenceOpen, setGeofenceOpen] = useState(false);

 const load = useCallback(async () => {
  try {
   setData(await fetchFleetControlCenter());
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Gagal memuatkan Fleet Control Center');
  } finally {
   setLoading(false);
  }
 }, []);

 useEffect(() => {
  const timer = window.setTimeout(() => void load(), 0);
  return () => window.clearTimeout(timer);
 }, [load]);

 async function handleSync() {
  setSyncing(true);
  try {
   const result = await syncFleetGps();
   toast.success(`${result.snapshots} GPS dianalisis, ${result.alerts} isyarat diproses`);
   await load();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Analisis GPS gagal');
  } finally {
   setSyncing(false);
  }
 }

 async function handleAlert(alert: FleetControlAlert, status: 'ACKNOWLEDGED' | 'RESOLVED') {
  if (alert.live) {
   toast.info('Jalankan Analisis GPS dahulu untuk merekodkan amaran ini.');
   return;
  }
  try {
   await updateFleetAlert(alert.id, status);
   toast.success(status === 'ACKNOWLEDGED' ? 'Amaran telah diambil tindakan' : 'Amaran telah diselesaikan');
   await load();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Gagal mengemaskini amaran');
  }
 }

 if (loading) return <ControlCenterSkeleton />;
 if (!data) return null;

 return (
  <section className="space-y-5 border-t pt-6" aria-labelledby="fleet-control-title">
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
         ? 'Syif, keselamatan dan tugasan anda dalam satu paparan.'
         : 'Pantau pengecualian, ETA, keselamatan dan kos tanpa perlu memerhati peta sepanjang masa.'}
       </p>
      </div>
     </div>
    </div>
    <div className="flex items-center gap-2">
     <span className="text-xs text-muted-foreground">
      {new Date(data.generated_at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}
     </span>
     {data.mode === 'MANAGEMENT' && (
      <>
       <Button type="button" size="sm" variant="outline" onClick={() => setGeofenceOpen(true)}>
        <MapPinned className="mr-1.5 h-4 w-4" /> Geofence
       </Button>
       <Button type="button" size="sm" onClick={handleSync} disabled={syncing}>
        {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
        Analisis GPS
       </Button>
      </>
     )}
    </div>
   </div>

   {data.mode === 'DRIVER' && (
    <DriverShiftPanel data={data} onUpdated={load} />
   )}

   <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
    <ControlMetric icon={Truck} label="Kenderaan" value={data.kpis.total_vehicles} />
    <ControlMetric icon={Navigation} label="Bergerak" value={data.kpis.moving} tone="success" />
    <ControlMetric icon={Clock3} label="Idle" value={data.kpis.idle} tone={data.kpis.idle ? 'warning' : 'neutral'} />
    <ControlMetric icon={AlertTriangle} label="Offline" value={data.kpis.offline} tone={data.kpis.offline ? 'danger' : 'neutral'} />
    <ControlMetric icon={BellRing} label="Amaran" value={data.kpis.open_alerts} tone={data.kpis.critical_alerts ? 'danger' : 'neutral'} />
    <ControlMetric icon={Route} label="Penghantaran" value={data.kpis.active_deliveries} />
    <ControlMetric icon={Wrench} label="Servis" value={data.kpis.maintenance_due} tone={data.kpis.maintenance_due ? 'warning' : 'success'} />
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
   toast.success('Geofence disimpan daripada lokasi GPS semasa');
   onOpenChange(false);
   await onSaved();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Gagal menyimpan geofence');
  } finally { setSaving(false); }
 }

 return (
  <Dialog open={open} onOpenChange={onOpenChange}>
   <DialogContent className="sm:max-w-lg">
    <DialogHeader>
     <DialogTitle>Tambah Geofence Operasi</DialogTitle>
     <DialogDescription>Pilih kenderaan yang sedang berada di lokasi sebenar. RKJ One akan menggunakan koordinat Cartrack tanpa taip manual.</DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
     <div className="space-y-1.5">
      <Label>Sumber lokasi Cartrack</Label>
      <Select value={vehicleKey} onValueChange={(value) => setVehicleKey(value ?? '')}>
       <SelectTrigger><SelectValue placeholder="Pilih kenderaan di lokasi" /></SelectTrigger>
       <SelectContent>{usableVehicles.map((vehicle) => <SelectItem key={vehicle.vehicle_id ?? vehicle.registration ?? vehicle.label} value={vehicle.vehicle_id ?? vehicle.registration ?? vehicle.label}>{vehicle.plate_number ?? vehicle.label} · {vehicle.location_description ?? 'Lokasi GPS'}</SelectItem>)}</SelectContent>
      </Select>
     </div>
     <div className="space-y-1.5">
      <Label>Pautkan cawangan (pilihan)</Label>
      <Select value={branchId} onValueChange={selectBranch}>
       <SelectTrigger><SelectValue /></SelectTrigger>
       <SelectContent>
        <SelectItem value="none">Bukan cawangan</SelectItem>
        {data.geofence_options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
       </SelectContent>
      </Select>
     </div>
     <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label>Nama lokasi</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: HQ Distributor" /></div>
      <div className="space-y-1.5"><Label>Jenis</Label><Select value={type} onValueChange={(value) => setType(value ?? 'OTHER')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BRANCH">Cawangan</SelectItem><SelectItem value="HQ">HQ</SelectItem><SelectItem value="FACTORY">Kilang</SelectItem><SelectItem value="HUB">Hub</SelectItem><SelectItem value="AGENT_PICKUP">Pickup ejen</SelectItem><SelectItem value="OTHER">Lain-lain</SelectItem></SelectContent></Select></div>
     </div>
     <div className="space-y-1.5"><Label>Radius (meter)</Label><Input inputMode="numeric" value={radius} onChange={(event) => setRadius(event.target.value)} /></div>
     {selectedVehicle && <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground"><strong>{selectedVehicle.plate_number}</strong> · {selectedVehicle.latitude?.toFixed(5)}, {selectedVehicle.longitude?.toFixed(5)}<br />Pastikan kenderaan benar-benar berada di lokasi sebelum menyimpan.</div>}
    </div>
    <DialogFooter>
     <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
     <Button type="button" disabled={!selectedVehicle || !name.trim() || saving} onClick={save}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Simpan Geofence</Button>
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
 const visible = data.alerts.slice(0, 7);
 return (
  <div className="min-w-0 space-y-3">
   <div className="flex items-center justify-between gap-3">
    <div>
     <h3 className="font-semibold">Pusat Amaran</h3>
     <p className="text-xs text-muted-foreground">Utamakan perkara yang memerlukan tindakan, bukan semua pergerakan.</p>
    </div>
    <Badge variant={data.kpis.critical_alerts ? 'destructive' : 'secondary'}>
     {data.kpis.critical_alerts} kritikal/tinggi
    </Badge>
   </div>
   {visible.length === 0 ? (
    <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
     <CheckCircle2 className="h-5 w-5" /> Tiada amaran aktif. Operasi dalam keadaan terkawal.
    </div>
   ) : visible.map((alert) => (
    <div key={alert.id} className={cn('rounded-md border p-3', severityStyle[alert.severity])}>
     <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
      <div className="min-w-0">
       <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="bg-white/70">{severityLabel[alert.severity]}</Badge>
        {alert.plate_number && <span className="text-xs font-semibold">{alert.plate_number}</span>}
        {alert.live && <span className="text-[11px]">Live</span>}
       </div>
       <p className="mt-1.5 text-sm font-semibold">{alert.title}</p>
       <p className="mt-0.5 text-xs leading-relaxed opacity-85">{alert.message}</p>
      </div>
      {data.mode === 'MANAGEMENT' && (
       <div className="flex shrink-0 gap-1.5">
        {alert.status === 'OPEN' && (
         <Button type="button" size="sm" variant="outline" className="bg-white/80" onClick={() => onAlert(alert, 'ACKNOWLEDGED')}>
          <Check className="mr-1 h-3.5 w-3.5" /> Ambil
         </Button>
        )}
        {!alert.live && (
         <Button type="button" size="sm" variant="outline" className="bg-white/80" onClick={() => onAlert(alert, 'RESOLVED')}>
          Selesai
         </Button>
        )}
       </div>
      )}
     </div>
    </div>
   ))}
  </div>
 );
}

function RecommendationQueue({ data }: { data: FleetControlCenterResponse }) {
 return (
  <div className="space-y-3">
   <div>
    <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-amber-600" /> Cadangan Tindakan</h3>
    <p className="text-xs text-muted-foreground">Susunan kerja berdasarkan keadaan fleet semasa.</p>
   </div>
   <div className="divide-y rounded-md border bg-white">
    {data.recommendations.map((item) => (
     <div key={item.id} className="p-3">
      <div className="flex items-start gap-3">
       <Badge variant={item.priority === 'SEGERA' ? 'destructive' : item.priority === 'HARI_INI' ? 'default' : 'secondary'}>
        {item.priority === 'HARI_INI' ? 'Hari ini' : item.priority === 'SEGERA' ? 'Segera' : 'Rancang'}
       </Badge>
       <div>
        <p className="text-sm font-semibold">{item.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
       </div>
      </div>
     </div>
    ))}
   </div>
   <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-950">
    <strong>SOP:</strong> GPS membantu membuat keputusan. OM tetap menyemak konteks driver, trafik, cuaca dan arahan operasi sebelum tindakan disiplin.
   </div>
  </div>
 );
}

function DeliveryEtaPanel({ data }: { data: FleetControlCenterResponse }) {
 return (
  <div className="space-y-3">
   <div>
    <h3 className="font-semibold">ETA Penghantaran</h3>
    <p className="text-xs text-muted-foreground">Jarak dan anggaran masa berdasarkan GPS kenderaan serta koordinat destinasi.</p>
   </div>
   <div className="divide-y rounded-md border bg-white">
    {data.deliveries.length === 0 ? (
     <p className="p-4 text-sm text-muted-foreground">Tiada penghantaran aktif.</p>
    ) : data.deliveries.slice(0, 6).map((delivery) => (
     <div key={delivery.id} className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
       <p className="truncate text-sm font-semibold">{delivery.order_number} · {delivery.destination}</p>
       <p className="text-xs text-muted-foreground">{delivery.plate_number ?? 'Kenderaan belum dipilih'} · {delivery.status}</p>
      </div>
      <div className="shrink-0 text-right">
       <p className="text-sm font-semibold tabular-nums">{delivery.eta_minutes !== null ? `${delivery.eta_minutes} min` : 'ETA belum ada'}</p>
       <p className="text-[11px] text-muted-foreground">{delivery.distance_km !== null ? `${delivery.distance_km} km` : 'Koordinat diperlukan'}</p>
      </div>
     </div>
    ))}
   </div>
  </div>
 );
}

function MaintenancePanel({ data }: { data: FleetControlCenterResponse }) {
 const sorted = useMemo(() => [...data.maintenance].sort((a, b) => (a.remaining_km ?? 999999) - (b.remaining_km ?? 999999)), [data.maintenance]);
 return (
  <div className="space-y-3">
   <div>
    <h3 className="font-semibold">Kesihatan Kenderaan</h3>
    <p className="text-xs text-muted-foreground">Servis dirancang berdasarkan tarikh dan odometer Cartrack.</p>
   </div>
   <div className="divide-y rounded-md border bg-white">
    {sorted.length === 0 ? (
     <p className="p-4 text-sm text-muted-foreground">Pelan servis belum tersedia.</p>
    ) : sorted.slice(0, 6).map((plan) => {
     const due = plan.remaining_km !== null && plan.remaining_km <= 500;
     return (
      <div key={plan.id} className="flex items-center justify-between gap-3 p-3">
       <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{plan.plate_number ?? 'Kenderaan'} · {plan.service_name}</p>
        <p className="text-xs text-muted-foreground">{plan.next_service_date ? `Tarikh ${new Date(plan.next_service_date).toLocaleDateString('ms-MY')}` : 'Tarikh belum ditetapkan'}</p>
       </div>
       <Badge variant={due ? 'destructive' : 'secondary'}>
        {plan.remaining_km === null ? plan.status : plan.remaining_km < 0 ? `${Math.abs(plan.remaining_km)} km lewat` : `${plan.remaining_km} km lagi`}
       </Badge>
      </div>
     );
    })}
   </div>
  </div>
 );
}

function DriverShiftPanel({ data, onUpdated }: { data: FleetControlCenterResponse; onUpdated: () => Promise<void> }) {
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
   toast.success('Syif bermula. Pandu dengan selamat.');
   await onUpdated();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Gagal memulakan syif');
  } finally { setSaving(false); }
 }

 async function end() {
  if (!active) return;
  setSaving(true);
  try {
   const gps = await coordinates();
   await endFleetDriverSession({ session_id: active.id, odometer_km: odometer ? Number(odometer) : null, notes: notes || null, ...gps });
   toast.success('Syif ditutup dan rekod perjalanan disimpan.');
   await onUpdated();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Gagal menutup syif');
  } finally { setSaving(false); }
 }

 if (!setup) return (
  <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
   Profil driver atau kenderaan belum dipadankan. Hubungi OM/HQ sebelum memulakan perjalanan.
  </div>
 );

 if (active) return (
  <div className="flex flex-col justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center">
   <div>
    <p className="flex items-center gap-2 font-semibold text-emerald-950"><ShieldCheck className="h-4 w-4" /> Syif aktif · {active.plate_number}</p>
    <p className="mt-1 text-xs text-emerald-800">Bermula {new Date(active.started_at).toLocaleString('ms-MY')} · Lengkapkan POD sebelum tutup syif.</p>
   </div>
   <div className="flex gap-2">
    <Input className="w-32 bg-white" inputMode="decimal" placeholder="Odometer akhir" value={odometer} onChange={(event) => setOdometer(event.target.value)} />
    <Button type="button" variant="outline" className="bg-white" disabled={saving} onClick={end}>
     {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Tamat Syif
    </Button>
   </div>
  </div>
 );

 const allChecked = Object.values(checks).every(Boolean);
 const checklist = [
  ['vehicle_condition', 'Lampu, brek dan keadaan kenderaan baik'],
  ['tyres', 'Tayar dan tekanan angin diperiksa'],
  ['load_secured', 'Muatan dikira dan diikat dengan selamat'],
  ['documents', 'Lesen, road tax dan dokumen perjalanan tersedia'],
 ] as const;
 return (
  <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
   <div className="flex items-center gap-2 text-sky-950"><TimerReset className="h-4 w-4" /><p className="font-semibold">Mula Syif Driver</p></div>
   <p className="mt-1 text-xs text-sky-800">Checklist ringkas ini melindungi driver, kenderaan dan stok sebelum bergerak.</p>
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
      <Label>Kenderaan</Label>
      <Select value={vehicleId} onValueChange={(value) => setVehicleId(value ?? '')}>
       <SelectTrigger className="bg-white"><SelectValue placeholder="Pilih kenderaan" /></SelectTrigger>
       <SelectContent>{setup.vehicles.map((vehicle) => <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.plate_number ?? vehicle.vehicle_type ?? 'Kenderaan'}</SelectItem>)}</SelectContent>
      </Select>
     </div>
     <Input className="bg-white" inputMode="decimal" placeholder="Odometer mula (pilihan)" value={odometer} onChange={(event) => setOdometer(event.target.value)} />
     <Textarea className="min-h-20 bg-white" placeholder="Catatan keadaan kenderaan (pilihan)" value={notes} onChange={(event) => setNotes(event.target.value)} />
     <Button type="button" className="w-full" disabled={!allChecked || !vehicleId || saving} onClick={start}>
      {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Gauge className="mr-1.5 h-4 w-4" />} Mula Perjalanan
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
