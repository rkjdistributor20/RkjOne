'use client';

import { useCallback, useEffect, useState } from 'react';
import {
 AlertTriangle, Building2, CheckCircle2, CircleAlert, Clock3, Copy, Factory,
 Loader2, MapPinned, MessageCircle, Navigation, RefreshCw, Route, Settings2,
 Share2, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { fetchFleetNavigation, runFleetNavigationAction } from '@/lib/fleet/api';
import type { FleetNavigationResponse, FleetRoutePreferences } from '@/lib/fleet/types';
import { useLanguage } from '@/components/i18n/language-provider';
import { cn } from '@/lib/utils';

const eventLabels: Record<string, [string, string]> = {
 LAUNCHED: ['Waze dibuka', 'Waze launched'], SHARED: ['Laluan dikongsi', 'Route shared'],
 FALLBACK_COPIED: ['Alamat disalin', 'Address copied'], ARRIVED: ['Tiba disahkan', 'Arrival verified'],
 COMPLETED: ['Hentian selesai', 'Stop completed'], BLOCKED: ['Cubaan disekat', 'Attempt blocked'],
 ISSUE_REPORTED: ['Masalah dilaporkan', 'Issue reported'],
};

function browserPosition() {
 return new Promise<{ latitude: number | null; longitude: number | null }>((resolve) => {
  if (!navigator.geolocation) return resolve({ latitude: null, longitude: null });
  navigator.geolocation.getCurrentPosition(
   (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
   () => resolve({ latitude: null, longitude: null }),
   { enableHighAccuracy: true, maximumAge: 30_000, timeout: 5_000 },
  );
 });
}

export function WazeNavigationPanel() {
 const { locale } = useLanguage();
 const en = locale === 'en';
 const text = useCallback((ms: string, english: string) => en ? english : ms, [en]);
 const [data, setData] = useState<FleetNavigationResponse | null>(null);
 const [loading, setLoading] = useState(true);
 const [acting, setActing] = useState<string | null>(null);
 const [issue, setIssue] = useState('');
 const [preferences, setPreferences] = useState<FleetRoutePreferences | null>(null);

 const load = useCallback(async () => {
  try {
   const next = await fetchFleetNavigation();
   setData(next);
   if (next.session) setPreferences(next.session.route_preferences);
  } catch (error) {
   toast.error(error instanceof Error ? error.message : text('Navigasi Waze tidak dapat dimuatkan.', 'Waze navigation could not be loaded.'));
  } finally { setLoading(false); }
 }, [text]);

 useEffect(() => {
  const timeout = window.setTimeout(() => void load(), 0);
  return () => window.clearTimeout(timeout);
 }, [load]);

 async function act(action: Parameters<typeof runFleetNavigationAction>[0]['action'], extra: Record<string, unknown> = {}) {
  setActing(action);
  try {
   const position = await browserPosition();
   const result = await runFleetNavigationAction({ action, ...position, ...extra });
   if (result.waze_url && (action === 'LAUNCH_NEXT' || action === 'LAUNCH_QUICK')) {
    window.open(result.waze_url, '_blank', 'noopener,noreferrer');
   }
   await load();
   return result;
  } catch (error) {
   toast.error(error instanceof Error ? error.message : text('Tindakan navigasi gagal.', 'Navigation action failed.'));
   return null;
  } finally { setActing(null); }
 }

 async function share(mode: 'device' | 'whatsapp') {
  const result = await act('SHARE', { route_stop_id: data?.next_stop?.id });
  if (!result?.share_text) return;
  if (mode === 'whatsapp') {
   window.open(`https://wa.me/?text=${encodeURIComponent(result.share_text)}`, '_blank', 'noopener,noreferrer');
   return;
  }
  if (navigator.share) {
   await navigator.share({ title: data?.next_stop?.destination_name ?? 'RKJ One', text: result.share_text }).catch(() => undefined);
  } else {
   await navigator.clipboard.writeText(result.share_text);
   toast.success(text('Maklumat laluan disalin.', 'Route details copied.'));
  }
 }

 async function copyFallback() {
  if (!data?.next_stop) return;
  await navigator.clipboard.writeText(data.next_stop.destination_name);
  await act('FALLBACK_COPIED', { route_stop_id: data.next_stop.id });
  toast.success(text('Nama destinasi disalin.', 'Destination name copied.'));
 }

 if (loading) return <div className="flex min-h-36 items-center justify-center border-y"><Loader2 className="h-5 w-5 animate-spin" /></div>;
 if (!data) return null;
 if (data.mode === 'MANAGEMENT') return <ManagementNavigation data={data} en={en} text={text} onRefresh={load} />;

 const failed = data.readiness.filter((item) => !item.passed);
 const next = data.next_stop;
 const driving = Boolean(data.session?.safe_driving_mode);

 return (
  <section className={cn('border-y py-5', driving && 'border-emerald-300 bg-emerald-50/60 px-4')} aria-labelledby="waze-driver-title" data-rkj-i18n-skip>
   <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
    <div className="flex items-start gap-3">
     <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#05c8f7] text-neutral-950"><Navigation className="h-5 w-5" /></div>
     <div>
      <div className="flex flex-wrap items-center gap-2">
       <h3 id="waze-driver-title" className="text-base font-semibold">{text('Navigasi Driver', 'Driver Navigation')}</h3>
       <Badge variant="outline">Waze</Badge>
       {driving && <Badge className="bg-emerald-700">{text('MOD PEMANDUAN', 'DRIVING MODE')}</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
       {driving
        ? text('Fokus memandu. Arahan seterusnya dipaparkan secara minimum.', 'Stay focused. Only essential route controls are shown.')
        : text('Semakan syif, kenderaan dan laluan sebelum Waze dibuka.', 'Shift, vehicle and route checks before Waze opens.')}
      </p>
     </div>
    </div>
    <Button type="button" size="sm" variant="ghost" onClick={() => void load()}><RefreshCw className="mr-1.5 h-4 w-4" />{text('Segar semula', 'Refresh')}</Button>
   </div>

   {next ? (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
     <div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
       <span>{next.route_name}</span><span>•</span><span>{text('Hentian', 'Stop')} {next.sequence}</span><span>•</span><span>{data.remaining_stops} {text('berbaki', 'remaining')}</span>
      </div>
      <p className="mt-1 text-xl font-semibold">{next.destination_name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
       <Badge variant="outline" className={next.coordinate_status === 'VERIFIED' ? 'border-emerald-300 text-emerald-800' : 'border-amber-300 text-amber-900'}>
        {next.coordinate_status === 'VERIFIED' ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <CircleAlert className="mr-1 h-3.5 w-3.5" />}
        {next.coordinate_status === 'VERIFIED' ? text('Koordinat disahkan', 'Verified coordinates') : text('Fallback nama lokasi', 'Location-name fallback')}
       </Badge>
       {data.session?.plate_number && <Badge variant="outline">{data.session.plate_number}</Badge>}
      </div>
     </div>
     <Button
      type="button" size="lg" className="min-h-12 bg-[#05c8f7] text-neutral-950 hover:bg-[#00b7df]"
      disabled={!data.ready_to_navigate || acting !== null}
      onClick={() => void act('LAUNCH_NEXT', { route_stop_id: next.id })}
     >
      {acting === 'LAUNCH_NEXT' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Navigation className="mr-2 h-5 w-5" />}
      {text('Buka Waze - Hentian Seterusnya', 'Open Waze - Next Stop')}
     </Button>
    </div>
   ) : <div className="mt-5 border-l-4 border-amber-400 bg-amber-50 p-4 text-sm">{text('Tiada laluan READY. OM perlu menyusun dan menerbitkan laluan driver.', 'No READY route. The OM must arrange and publish a driver route.')}</div>}

   {!driving && (
    <>
     <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {data.readiness.map((item) => (
       <div key={item.key} className={cn('flex gap-2 border-l-2 px-3 py-2', item.passed ? 'border-emerald-500' : 'border-red-500 bg-red-50')}>
        {item.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />}
        <div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.detail}</p></div>
       </div>
      ))}
     </div>
     {failed.length > 0 && <p className="mt-3 text-sm font-medium text-red-700">{text('Selesaikan semakan merah sebelum memulakan perjalanan.', 'Resolve the red checks before starting the journey.')}</p>}

     <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <RoutePreferences preferences={preferences} setPreferences={setPreferences} saving={acting === 'SET_PREFERENCES'} onSave={() => preferences && void act('SET_PREFERENCES', { preferences })} text={text} />
      <div>
       <div className="mb-2 flex items-center gap-2"><MapPinned className="h-4 w-4" /><h4 className="text-sm font-semibold">{text('Lokasi operasi pantas', 'Quick operations locations')}</h4></div>
       <div className="flex flex-wrap gap-2">
        {data.quick_destinations.map((destination) => (
         <Button key={destination.id} type="button" variant="outline" size="sm" disabled={acting !== null} onClick={() => void act('LAUNCH_QUICK', { destination_id: destination.id })}>
          {destination.geofence_type === 'FACTORY' ? <Factory className="mr-1.5 h-4 w-4" /> : <Building2 className="mr-1.5 h-4 w-4" />}{destination.name}
         </Button>
        ))}
        {data.quick_destinations.length === 0 && <p className="text-sm text-muted-foreground">{text('OM belum menetapkan geofence HQ, hub atau kilang.', 'The OM has not configured HQ, hub or factory geofences.')}</p>}
       </div>
      </div>
     </div>
    </>
   )}

   <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
    <Button type="button" size="sm" variant="outline" disabled={!next || acting !== null} onClick={() => void share('device')}><Share2 className="mr-1.5 h-4 w-4" />{text('Kongsi', 'Share')}</Button>
    <Button type="button" size="sm" variant="outline" disabled={!next || acting !== null} onClick={() => void share('whatsapp')}><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp</Button>
    {next?.coordinate_status === 'NAME_FALLBACK' && <Button type="button" size="sm" variant="outline" onClick={() => void copyFallback()}><Copy className="mr-1.5 h-4 w-4" />{text('Salin lokasi', 'Copy location')}</Button>}
   </div>

   {!driving && (
    <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
     <div><Label htmlFor="driver-route-issue">{text('Laporkan masalah kepada OM', 'Report an issue to OM')}</Label><Textarea id="driver-route-issue" className="mt-1.5 min-h-20" value={issue} onChange={(event) => setIssue(event.target.value)} placeholder={text('Contoh: jalan ditutup, tayar bermasalah atau lokasi tidak tepat', 'Example: road closed, tyre issue or inaccurate location')} /></div>
     <Button type="button" variant="destructive" disabled={!issue.trim() || acting !== null} onClick={async () => { const result = await act('REPORT_ISSUE', { reason: issue }); if (result) { setIssue(''); toast.success(text('OM telah dimaklumkan.', 'The OM has been notified.')); } }}><CircleAlert className="mr-1.5 h-4 w-4" />{text('Hantar amaran', 'Send alert')}</Button>
    </div>
   )}
  </section>
 );
}

function RoutePreferences({ preferences, setPreferences, saving, onSave, text }: {
 preferences: FleetRoutePreferences | null; setPreferences: (value: FleetRoutePreferences) => void;
 saving: boolean; onSave: () => void; text: (ms: string, en: string) => string;
}) {
 if (!preferences) return null;
 const choices: Array<[keyof Pick<FleetRoutePreferences, 'avoid_tolls' | 'avoid_ferries' | 'avoid_freeways' | 'avoid_dangerous_turns'>, string]> = [
  ['avoid_tolls', text('Elak tol', 'Avoid tolls')], ['avoid_ferries', text('Elak feri', 'Avoid ferries')],
  ['avoid_freeways', text('Elak lebuh raya', 'Avoid freeways')], ['avoid_dangerous_turns', text('Elak selekoh berbahaya', 'Avoid dangerous turns')],
 ];
 return <div>
  <div className="mb-2 flex items-center gap-2"><Settings2 className="h-4 w-4" /><h4 className="text-sm font-semibold">{text('Pilihan laluan Waze', 'Waze route preferences')}</h4></div>
  <div className="grid gap-2 sm:grid-cols-2">
   {choices.map(([key, label]) => <label key={key} className="flex min-h-9 items-center gap-2 border px-3 text-sm"><input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} />{label}</label>)}
  </div>
  <div className="mt-2 flex gap-2">
   <Select value={preferences.avoid_trails} onValueChange={(value) => setPreferences({ ...preferences, avoid_trails: value as FleetRoutePreferences['avoid_trails'] })}>
    <SelectTrigger className="max-w-56"><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="avoid_all">{text('Elak jalan tanah', 'Avoid unpaved roads')}</SelectItem><SelectItem value="avoid_long">{text('Elak jika terlalu jauh', 'Avoid long unpaved routes')}</SelectItem><SelectItem value="allow">{text('Benarkan', 'Allow')}</SelectItem></SelectContent>
   </Select>
   <Button type="button" size="sm" variant="outline" onClick={onSave} disabled={saving}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{text('Simpan', 'Save')}</Button>
  </div>
 </div>;
}

function ManagementNavigation({ data, en, text, onRefresh }: { data: FleetNavigationResponse; en: boolean; text: (ms: string, en: string) => string; onRefresh: () => Promise<void> }) {
 const metrics = data.metrics;
 const metricRows = [
  [Navigation, text('Waze hari ini', 'Waze today'), metrics.launches_today],
  [ShieldCheck, text('Driver aktif', 'Active drivers'), metrics.active_drivers],
  [MapPinned, text('Koordinat lengkap', 'Coordinates ready'), metrics.locations_with_coordinates],
  [AlertTriangle, text('Lokasi belum lengkap', 'Locations incomplete'), metrics.locations_without_coordinates],
  [CircleAlert, text('Cubaan disekat', 'Blocked attempts'), metrics.blocked_attempts],
  [Route, text('Fallback lokasi', 'Location fallbacks'), metrics.coordinate_fallbacks],
 ] as const;
 return <section className="border-y py-5" aria-labelledby="waze-management-title" data-rkj-i18n-skip>
  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
   <div className="flex gap-3"><div className="grid h-10 w-10 place-items-center rounded-md bg-[#05c8f7] text-neutral-950"><Navigation className="h-5 w-5" /></div><div><h3 id="waze-management-title" className="text-base font-semibold">{text('Kawalan Navigasi Waze', 'Waze Navigation Control')}</h3><p className="text-sm text-muted-foreground">{text('Audit perjalanan driver, kualiti lokasi dan pengecualian operasi.', 'Driver journey audit, location quality and operations exceptions.')}</p></div></div>
   <Button type="button" size="sm" variant="ghost" onClick={() => void onRefresh()}><RefreshCw className="mr-1.5 h-4 w-4" />{text('Segar semula', 'Refresh')}</Button>
  </div>
  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
   {metricRows.map(([Icon, label, value]) => <div key={label} className="border px-3 py-3"><Icon className="h-4 w-4 text-muted-foreground" /><p className="mt-2 text-xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}
  </div>
  {metrics.locations_without_coordinates > 0 && <div className="mt-3 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm"><strong>{metrics.locations_without_coordinates} {text('lokasi perlu dikemaskan.', 'locations need attention.')}</strong> {text('Gunakan Geofence dengan lokasi Cartrack semasa supaya Waze membuka titik yang tepat.', 'Use Geofence with the current Cartrack location so Waze opens the exact point.')}</div>}
  <div className="mt-5">
   <h4 className="text-sm font-semibold">{text('Aktiviti navigasi terkini', 'Recent navigation activity')}</h4>
   <div className="mt-2 divide-y border-y">
    {data.recent_events.slice(0, 10).map((event) => <div key={event.id} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[140px_1fr_auto] sm:items-center">
     <span className="font-medium">{eventLabels[event.event_type]?.[en ? 1 : 0] ?? event.event_type}</span>
     <span><strong>{event.driver_name ?? text('Driver', 'Driver')}</strong> · {event.plate_number ?? '-'} · {event.destination_name}</span>
     <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{new Date(event.created_at).toLocaleString(en ? 'en-MY' : 'ms-MY')}</span>
     {event.reason && <span className="text-xs text-red-700 sm:col-start-2">{event.reason}</span>}
    </div>)}
    {data.recent_events.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{text('Belum ada aktiviti navigasi direkodkan.', 'No navigation activity has been recorded.')}</p>}
   </div>
  </div>
 </section>;
}
