'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
 AlertTriangle, Banknote, CalendarClock, Car, CheckCircle2, ClipboardCheck,
 ExternalLink, FileText, Fuel, Gauge, Loader2, MapPin, Plus, RefreshCw,
 Route, ShieldCheck, UserRound, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/components/i18n/language-provider';
import { fetchCompanyVehicles, submitCompanyVehicleAction } from '@/lib/fleet/api';
import type {
 CompanyVehicleActionPayload, CompanyVehicleCategory, CompanyVehicleDashboardResponse,
 CompanyVehicleRecord,
} from '@/lib/fleet/company-vehicle-types';
import { cn } from '@/lib/utils';

type DialogKind = 'usage' | 'expense' | 'document' | 'incident' | 'assign' | 'category' | 'details' | null;
type Filter = 'ALL' | CompanyVehicleCategory;

const CATEGORY_STYLE: Record<CompanyVehicleCategory, string> = {
 MANAGER: 'border-blue-200 bg-blue-50 text-blue-800',
 DELIVERY: 'border-emerald-200 bg-emerald-50 text-emerald-800',
 FACTORY: 'border-violet-200 bg-violet-50 text-violet-800',
 REPLACEMENT: 'border-amber-200 bg-amber-50 text-amber-800',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
 return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function isoDate(value?: string | null) {
 return value ? value.slice(0, 10) : '';
}

function gpsSummary(item: CompanyVehicleRecord, locale: string) {
 if (!item.gps) return locale === 'en' ? 'Location hidden / unavailable' : 'Lokasi disembunyikan / tiada data';
 const movement = `${item.gps.status} - ${Math.round(item.gps.speed_kph ?? 0)} km/j`;
 if (item.gps.active) return locale === 'en' ? `${movement} - current` : `${movement} - terkini`;
 const eventTime = item.gps.event_ts ? new Date(item.gps.event_ts) : null;
 const timestamp = eventTime && Number.isFinite(eventTime.getTime())
  ? eventTime.toLocaleString(locale === 'en' ? 'en-MY' : 'ms-MY')
  : (locale === 'en' ? 'unknown time' : 'masa tidak diketahui');
 return locale === 'en' ? `Last data: ${timestamp}` : `Data terakhir: ${timestamp}`;
}

export function CompanyVehicleDashboard() {
 const { locale } = useLanguage();
 const text = useCallback((bm: string, en: string) => locale === 'en' ? en : bm, [locale]);
 const [data, setData] = useState<CompanyVehicleDashboardResponse | null>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [filter, setFilter] = useState<Filter>('ALL');
 const [dialog, setDialog] = useState<DialogKind>(null);
 const [vehicle, setVehicle] = useState<CompanyVehicleRecord | null>(null);
 const [form, setForm] = useState<Record<string, string>>({});

 const load = useCallback(async () => {
  setLoading(true);
  try { setData(await fetchCompanyVehicles()); }
  catch (error) { toast.error(error instanceof Error ? error.message : text('Gagal memuatkan kenderaan syarikat.', 'Unable to load company vehicles.')); }
  finally { setLoading(false); }
 }, [text]);

 useEffect(() => { void load(); }, [load]);

 const open = (kind: DialogKind, selected: CompanyVehicleRecord) => {
  setVehicle(selected);
  setDialog(kind);
  setForm({
   expense_date: new Date().toISOString().slice(0, 10),
   incident_at: new Date().toISOString().slice(0, 16),
   usage_type: 'COMPANY', expense_type: 'FUEL', document_type: 'ROAD_TAX',
   incident_type: 'ACCIDENT', severity: 'MEDIUM', custodian_profile_id: selected.company_custodian_profile_id ?? '',
   vehicle_category: selected.vehicle_category,
  });
 };

 const close = () => { setDialog(null); setVehicle(null); setForm({}); };
 const setValue = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
 const numeric = (key: string) => form[key] ? Number(form[key]) : null;

 const runAction = async (payload: CompanyVehicleActionPayload, message: string) => {
  setSaving(true);
  try {
   await submitCompanyVehicleAction(payload);
   toast.success(message);
   close();
   await load();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : text('Tindakan gagal.', 'Action failed.'));
  } finally { setSaving(false); }
 };

 const submit = async () => {
  if (!vehicle || !dialog) return;
  if (dialog === 'usage') {
   if (vehicle.active_usage) {
    await runAction({ action: 'END_USAGE', vehicle_id: vehicle.id, odometer_km: numeric('odometer_km'), notes: form.notes }, text('Perjalanan ditamatkan.', 'Trip completed.'));
   } else {
    await runAction({ action: 'START_USAGE', vehicle_id: vehicle.id, purpose: form.purpose, usage_type: form.usage_type, destination: form.destination, odometer_km: numeric('odometer_km'), notes: form.notes }, text('Perjalanan rasmi dimulakan.', 'Official trip started.'));
   }
  } else if (dialog === 'expense') {
   await runAction({ action: 'ADD_EXPENSE', vehicle_id: vehicle.id, usage_log_id: vehicle.active_usage?.id, expense_type: form.expense_type, amount: numeric('amount') ?? 0, expense_date: form.expense_date, fuel_litres: numeric('fuel_litres'), odometer_km: numeric('odometer_km'), receipt_url: form.receipt_url, notes: form.notes }, text('Belanja dihantar untuk semakan.', 'Expense submitted for review.'));
  } else if (dialog === 'document') {
   await runAction({ action: 'SAVE_DOCUMENT', vehicle_id: vehicle.id, document_type: form.document_type, document_name: form.document_name, document_url: form.document_url, issued_at: form.issued_at, expires_at: form.expires_at }, text('Dokumen disimpan.', 'Document saved.'));
  } else if (dialog === 'incident') {
   await runAction({ action: 'REPORT_INCIDENT', vehicle_id: vehicle.id, incident_type: form.incident_type, severity: form.severity, incident_at: form.incident_at ? new Date(form.incident_at).toISOString() : undefined, location: form.location, description: form.description, estimated_cost: numeric('estimated_cost') }, text('Insiden dilaporkan kepada pengurusan.', 'Incident reported to management.'));
  } else if (dialog === 'assign') {
   await runAction({ action: 'ASSIGN', vehicle_id: vehicle.id, custodian_profile_id: form.custodian_profile_id, odometer_km: numeric('odometer_km'), notes: form.notes }, text('Serahan penjaga dikemas kini.', 'Custodian handover updated.'));
  } else if (dialog === 'category') {
   await runAction({ action: 'UPDATE_CATEGORY', vehicle_id: vehicle.id, vehicle_category: form.vehicle_category as CompanyVehicleCategory }, text('Kategori kenderaan dikemas kini.', 'Vehicle category updated.'));
  }
 };

 const filtered = useMemo(() => (data?.vehicles ?? []).filter((item) => filter === 'ALL' || item.vehicle_category === filter), [data, filter]);
 const categories: Array<{ value: Filter; bm: string; en: string }> = [
  { value: 'ALL', bm: 'Semua', en: 'All' }, { value: 'MANAGER', bm: 'Manager', en: 'Managers' },
  { value: 'DELIVERY', bm: 'Penghantaran', en: 'Delivery' }, { value: 'FACTORY', bm: 'Kilang', en: 'Factory' },
  { value: 'REPLACEMENT', bm: 'Gantian', en: 'Replacement' },
 ];

 if (loading && !data) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div>;
 if (!data) return null;

 return (
 <section className="space-y-5" data-rkj-i18n-skip>
  <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-950 text-white shadow-sm">
   <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
    <div>
     <div className="flex items-center gap-2 text-xs font-semibold uppercase text-amber-300"><ShieldCheck className="h-4 w-4" />{text('Tadbir urus aset syarikat', 'Company asset governance')}</div>
     <h2 className="mt-2 text-xl font-semibold text-white">{text('Kenderaan Syarikat', 'Company Vehicles')}</h2>
     <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-300">{text('Serahan penjaga, perjalanan rasmi, kos, dokumen, penyelenggaraan dan insiden dalam satu rekod audit.', 'Custody, official trips, costs, documents, maintenance and incidents in one audit trail.')}</p>
    </div>
    <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />{text('Segarkan', 'Refresh')}</Button>
   </div>
  </div>

  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-neutral-200 sm:grid-cols-4 xl:grid-cols-8">
   <Metric icon={Car} label={text('Kenderaan', 'Vehicles')} value={data.kpis.total} />
   <Metric icon={Route} label={text('Sedang digunakan', 'In use')} value={data.kpis.in_use} tone={data.kpis.in_use ? 'blue' : undefined} />
   <Metric icon={CalendarClock} label={text('Dokumen perlu tindakan', 'Documents due')} value={data.kpis.documents_due} tone={data.kpis.documents_due ? 'amber' : undefined} />
   <Metric icon={AlertTriangle} label={text('Insiden terbuka', 'Open incidents')} value={data.kpis.open_incidents} tone={data.kpis.open_incidents ? 'red' : undefined} />
   <Metric icon={Banknote} label={text('Kos bulan ini', 'Cost this month')} value={`RM ${data.kpis.monthly_cost.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`} />
   <Metric icon={ClipboardCheck} label={text('Belanja menunggu', 'Pending expenses')} value={data.kpis.pending_expenses} tone={data.kpis.pending_expenses ? 'amber' : undefined} />
   <Metric icon={Wrench} label={text('Servis perlu tindakan', 'Service due')} value={data.kpis.maintenance_due} tone={data.kpis.maintenance_due ? 'amber' : undefined} />
   <Metric icon={MapPin} label={text('GPS aktif', 'Active GPS')} value={data.kpis.tracked_gps} tone={data.kpis.tracked_gps ? 'blue' : undefined} />
  </div>

  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-white p-1">
    {categories.map((item) => <Button key={item.value} size="sm" variant={filter === item.value ? 'default' : 'ghost'} onClick={() => setFilter(item.value)} className={cn('shrink-0', filter === item.value && 'bg-neutral-900 hover:bg-neutral-800')}>{text(item.bm, item.en)}</Button>)}
   </div>
   <p className="text-xs text-muted-foreground">{text('Paparan mengikut akses peranan', 'Role-aware view')} - {data.mode}</p>
  </div>

  {filtered.length === 0 ? <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{text('Tiada kenderaan dalam kategori ini.', 'No vehicles in this category.')}</div> :
   <div className="grid gap-4 xl:grid-cols-2">{filtered.map((item) => (
    <article key={item.id} className="overflow-hidden rounded-lg border bg-white shadow-sm">
     <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-neutral-50 p-4">
      <div className="flex min-w-0 items-start gap-3">
       <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white"><Car className="h-5 w-5" /></span>
       <div className="min-w-0"><h3 className="text-base font-semibold">{item.plate_number ?? item.vehicle_code}</h3><p className="truncate text-xs text-muted-foreground">{item.vehicle_type} - {item.vehicle_code}</p></div>
      </div>
      <div className="flex flex-wrap gap-2"><Badge variant="outline" className={CATEGORY_STYLE[item.vehicle_category]}>{categories.find((category) => category.value === item.vehicle_category)?.[locale === 'en' ? 'en' : 'bm']}</Badge>{item.active_usage && <Badge className="bg-blue-600">{text('Dalam perjalanan', 'On trip')}</Badge>}</div>
     </div>
     <div className="grid gap-4 p-4 sm:grid-cols-2">
      <div className="space-y-3">
       <Info icon={UserRound} label={text('Penjaga syarikat', 'Company custodian')} value={item.company_custodian_name ?? text('Belum ditetapkan', 'Not assigned')} />
       <Info icon={MapPin} label="GPS Cartrack" value={gpsSummary(item, locale)} />
       <Info icon={Gauge} label={text('Odometer GPS', 'GPS odometer')} value={item.gps?.odometer_km ? `${Math.round(item.gps.odometer_km).toLocaleString()} km` : '-'} />
      </div>
      <div className="grid grid-cols-3 gap-2">
       <MiniStat label={text('Kos bulan', 'Monthly cost')} value={`RM ${item.monthly_cost.toFixed(0)}`} />
       <MiniStat label={text('Dokumen', 'Documents')} value={item.documents_due} warn={item.documents_due > 0} />
       <MiniStat label={text('Insiden', 'Incidents')} value={item.open_incidents} warn={item.open_incidents > 0} />
      </div>
     </div>
     {item.active_usage && <div className="mx-4 mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950"><p className="font-medium">{item.active_usage.purpose}</p><p className="mt-0.5 text-xs text-blue-800">{item.active_usage.destination || text('Destinasi tidak dinyatakan', 'Destination not specified')} - {new Date(item.active_usage.started_at).toLocaleString(locale === 'en' ? 'en-MY' : 'ms-MY')}</p></div>}
     <div className="flex flex-wrap gap-2 border-t bg-neutral-50 p-3">
      {(data.can_manage || item.company_custodian_profile_id === data.current_profile_id) && <>
       <Button size="sm" onClick={() => open('usage', item)} disabled={!data.can_manage && !item.assignment_acknowledged_at} className={item.active_usage ? 'bg-blue-700 hover:bg-blue-800' : 'bg-neutral-900 hover:bg-neutral-800'}><Route className="mr-2 h-4 w-4" />{item.active_usage ? text('Tamat perjalanan', 'End trip') : text('Mula perjalanan', 'Start trip')}</Button>
       <Button size="sm" variant="outline" onClick={() => open('expense', item)}><Fuel className="mr-2 h-4 w-4" />{text('Belanja', 'Expense')}</Button>
       <Button size="sm" variant="outline" onClick={() => open('incident', item)}><AlertTriangle className="mr-2 h-4 w-4" />{text('Insiden', 'Incident')}</Button>
      </>}
      <Button size="sm" variant="outline" onClick={() => open('details', item)}><FileText className="mr-2 h-4 w-4" />{text('Butiran', 'Details')}</Button>
      {data.can_manage_compliance && <Button size="sm" variant="outline" onClick={() => open('document', item)}><Plus className="mr-2 h-4 w-4" />{text('Dokumen', 'Document')}</Button>}
      {data.can_manage && <Button size="sm" variant="outline" onClick={() => open('assign', item)}><UserRound className="mr-2 h-4 w-4" />{text('Serahan', 'Handover')}</Button>}
      {data.can_manage && <Button size="sm" variant="outline" onClick={() => open('category', item)}><Car className="mr-2 h-4 w-4" />{text('Kategori', 'Category')}</Button>}
      {!item.assignment_acknowledged_at && item.company_custodian_profile_id === data.current_profile_id && <Button size="sm" variant="outline" onClick={() => void runAction({ action: 'ACKNOWLEDGE_HANDOVER', vehicle_id: item.id }, text('Penerimaan direkodkan.', 'Handover acknowledged.'))}><CheckCircle2 className="mr-2 h-4 w-4" />{text('Sahkan terima', 'Acknowledge')}</Button>}
     </div>
    </article>))}</div>}

  <Dialog open={dialog !== null} onOpenChange={(isOpen) => !isOpen && close()}>
   <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-rkj-i18n-skip>
    <DialogHeader><DialogTitle>{dialogTitle(dialog, vehicle, text)}</DialogTitle><DialogDescription>{vehicle?.plate_number ?? vehicle?.vehicle_code}</DialogDescription></DialogHeader>
    {vehicle && dialog === 'usage' && <div className="grid gap-4 sm:grid-cols-2">{!vehicle.active_usage && <><Field label={text('Tujuan perjalanan *', 'Trip purpose *')}><Input value={form.purpose ?? ''} onChange={(event) => setValue('purpose', event.target.value)} /></Field><Field label={text('Destinasi', 'Destination')}><Input value={form.destination ?? ''} onChange={(event) => setValue('destination', event.target.value)} /></Field><Field label={text('Jenis kegunaan', 'Usage type')}><Choice value={form.usage_type} onChange={(value) => setValue('usage_type', value)} options={[['COMPANY', text('Rasmi syarikat', 'Company')], ['EMERGENCY', text('Kecemasan', 'Emergency')], ['OTHER', text('Lain-lain', 'Other')]]} /></Field></>}<Field label={text('Bacaan odometer', 'Odometer reading')}><Input type="number" min="0" value={form.odometer_km ?? ''} onChange={(event) => setValue('odometer_km', event.target.value)} /></Field><div className="sm:col-span-2"><Field label={text('Catatan', 'Notes')}><Textarea value={form.notes ?? ''} onChange={(event) => setValue('notes', event.target.value)} /></Field></div></div>}
    {vehicle && dialog === 'expense' && <div className="grid gap-4 sm:grid-cols-2"><Field label={text('Jenis belanja *', 'Expense type *')}><Choice value={form.expense_type} onChange={(value) => setValue('expense_type', value)} options={[['FUEL', text('Minyak', 'Fuel')], ['TOLL', 'Tol / TNG'], ['PARKING', text('Parkir', 'Parking')], ['MAINTENANCE', text('Penyelenggaraan', 'Maintenance')], ['REPAIR', text('Pembaikan', 'Repair')], ['OTHER', text('Lain-lain', 'Other')]]} /></Field><Field label={text('Jumlah (RM) *', 'Amount (RM) *')}><Input type="number" min="0.01" step="0.01" value={form.amount ?? ''} onChange={(event) => setValue('amount', event.target.value)} /></Field><Field label={text('Tarikh', 'Date')}><Input type="date" value={form.expense_date ?? ''} onChange={(event) => setValue('expense_date', event.target.value)} /></Field><Field label={text('Liter minyak', 'Fuel litres')}><Input type="number" min="0" step="0.01" value={form.fuel_litres ?? ''} onChange={(event) => setValue('fuel_litres', event.target.value)} /></Field><Field label={text('Odometer', 'Odometer')}><Input type="number" min="0" value={form.odometer_km ?? ''} onChange={(event) => setValue('odometer_km', event.target.value)} /></Field><Field label={text('Pautan resit', 'Receipt URL')}><Input type="url" value={form.receipt_url ?? ''} onChange={(event) => setValue('receipt_url', event.target.value)} /></Field><div className="sm:col-span-2"><Field label={text('Catatan', 'Notes')}><Textarea value={form.notes ?? ''} onChange={(event) => setValue('notes', event.target.value)} /></Field></div></div>}
    {vehicle && dialog === 'document' && <div className="grid gap-4 sm:grid-cols-2"><Field label={text('Jenis dokumen *', 'Document type *')}><Choice value={form.document_type} onChange={(value) => setValue('document_type', value)} options={[['ROAD_TAX', text('Cukai jalan', 'Road tax')], ['INSURANCE', text('Insurans', 'Insurance')], ['INSPECTION', text('Pemeriksaan', 'Inspection')], ['PERMIT', text('Permit', 'Permit')], ['REGISTRATION', text('Pendaftaran', 'Registration')], ['OTHER', text('Lain-lain', 'Other')]]} /></Field><Field label={text('Nama dokumen *', 'Document name *')}><Input value={form.document_name ?? ''} onChange={(event) => setValue('document_name', event.target.value)} /></Field><Field label={text('Tarikh dikeluarkan', 'Issue date')}><Input type="date" value={form.issued_at ?? ''} onChange={(event) => setValue('issued_at', event.target.value)} /></Field><Field label={text('Tarikh tamat', 'Expiry date')}><Input type="date" value={form.expires_at ?? ''} onChange={(event) => setValue('expires_at', event.target.value)} /></Field><div className="sm:col-span-2"><Field label={text('Pautan fail', 'File URL')}><Input type="url" value={form.document_url ?? ''} onChange={(event) => setValue('document_url', event.target.value)} /></Field></div></div>}
    {vehicle && dialog === 'incident' && <div className="grid gap-4 sm:grid-cols-2"><Field label={text('Jenis insiden *', 'Incident type *')}><Choice value={form.incident_type} onChange={(value) => setValue('incident_type', value)} options={[['ACCIDENT', text('Kemalangan', 'Accident')], ['BREAKDOWN', text('Kerosakan jalan', 'Breakdown')], ['DAMAGE', text('Kerosakan', 'Damage')], ['SUMMONS', text('Saman', 'Summons')], ['THEFT', text('Kecurian', 'Theft')], ['OTHER', text('Lain-lain', 'Other')]]} /></Field><Field label={text('Tahap', 'Severity')}><Choice value={form.severity} onChange={(value) => setValue('severity', value)} options={[['LOW', text('Rendah', 'Low')], ['MEDIUM', text('Sederhana', 'Medium')], ['HIGH', text('Tinggi', 'High')], ['CRITICAL', text('Kritikal', 'Critical')]]} /></Field><Field label={text('Masa kejadian', 'Incident time')}><Input type="datetime-local" value={form.incident_at ?? ''} onChange={(event) => setValue('incident_at', event.target.value)} /></Field><Field label={text('Lokasi', 'Location')}><Input value={form.location ?? ''} onChange={(event) => setValue('location', event.target.value)} /></Field><Field label={text('Anggaran kos (RM)', 'Estimated cost (RM)')}><Input type="number" min="0" step="0.01" value={form.estimated_cost ?? ''} onChange={(event) => setValue('estimated_cost', event.target.value)} /></Field><div className="sm:col-span-2"><Field label={text('Penerangan *', 'Description *')}><Textarea value={form.description ?? ''} onChange={(event) => setValue('description', event.target.value)} /></Field></div></div>}
    {vehicle && dialog === 'assign' && <div className="grid gap-4 sm:grid-cols-2"><Field label={text('Penjaga baru *', 'New custodian *')}><Choice value={form.custodian_profile_id} onChange={(value) => setValue('custodian_profile_id', value)} options={data.custodians.map((item) => [item.id, `${item.full_name} - ${item.role}`])} /></Field><Field label={text('Odometer serahan', 'Handover odometer')}><Input type="number" min="0" value={form.odometer_km ?? ''} onChange={(event) => setValue('odometer_km', event.target.value)} /></Field><div className="sm:col-span-2"><Field label={text('Keadaan dan syarat penggunaan', 'Condition and usage terms')}><Textarea value={form.notes ?? ''} onChange={(event) => setValue('notes', event.target.value)} placeholder={text('Kegunaan rasmi syarikat; pulangkan dalam keadaan baik.', 'Official company use; return in good condition.')} /></Field></div></div>}
    {vehicle && dialog === 'category' && <Field label={text('Kategori operasi', 'Operating category')}><Choice value={form.vehicle_category} onChange={(value) => setValue('vehicle_category', value)} options={categories.filter((item) => item.value !== 'ALL').map((item) => [item.value, text(item.bm, item.en)])} /></Field>}
    {vehicle && dialog === 'details' && <VehicleDetails vehicle={vehicle} data={data} text={text} runAction={runAction} />}
    {dialog !== 'details' && <DialogFooter><Button variant="outline" onClick={close}>{text('Batal', 'Cancel')}</Button><Button onClick={() => void submit()} disabled={saving} className="bg-amber-500 text-black hover:bg-amber-600">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{text('Simpan', 'Save')}</Button></DialogFooter>}
   </DialogContent>
  </Dialog>
 </section>);
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Car; label: string; value: string | number; tone?: 'blue' | 'amber' | 'red' }) {
 return <div className="bg-white p-4"><div className={cn('flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-700', tone === 'blue' && 'bg-blue-50 text-blue-700', tone === 'amber' && 'bg-amber-50 text-amber-700', tone === 'red' && 'bg-red-50 text-red-700')}><Icon className="h-4 w-4" /></div><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}

function MiniStat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
 return <div className={cn('rounded-md border bg-neutral-50 p-2 text-center', warn && 'border-amber-200 bg-amber-50')}><p className="text-[11px] text-muted-foreground">{label}</p><p className={cn('mt-1 text-sm font-semibold', warn && 'text-amber-800')}>{value}</p></div>;
}

function Info({ icon: Icon, label, value }: { icon: typeof Car; label: string; value: string }) {
 return <div className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" /><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div></div>;
}

function Choice({ value, onChange, options }: { value?: string; onChange: (value: string) => void; options: string[][] }) {
 return <Select value={value ?? ''} onValueChange={(next) => next && onChange(next)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>;
}

function dialogTitle(kind: DialogKind, vehicle: CompanyVehicleRecord | null, text: (bm: string, en: string) => string) {
 if (kind === 'usage') return vehicle?.active_usage ? text('Tamatkan perjalanan', 'End trip') : text('Mulakan perjalanan rasmi', 'Start official trip');
 if (kind === 'expense') return text('Rekod belanja kenderaan', 'Record vehicle expense');
 if (kind === 'document') return text('Tambah dokumen pematuhan', 'Add compliance document');
 if (kind === 'incident') return text('Lapor insiden', 'Report incident');
 if (kind === 'assign') return text('Serahan kenderaan syarikat', 'Company vehicle handover');
 if (kind === 'category') return text('Tetapkan kategori kenderaan', 'Set vehicle category');
 return text('Rekod lengkap kenderaan', 'Complete vehicle record');
}

function VehicleDetails({ vehicle, data, text, runAction }: { vehicle: CompanyVehicleRecord; data: CompanyVehicleDashboardResponse; text: (bm: string, en: string) => string; runAction: (payload: CompanyVehicleActionPayload, message: string) => Promise<void> }) {
 const expiry = [['ROAD_TAX', text('Cukai jalan', 'Road tax'), vehicle.road_tax_expiry], ['INSURANCE', text('Insurans', 'Insurance'), vehicle.insurance_expiry], ['INSPECTION', text('Pemeriksaan', 'Inspection'), vehicle.inspection_expiry], ['PERMIT', 'Permit', vehicle.permit_expiry]];
 return <div className="space-y-5">
  <section><h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />{text('Pematuhan', 'Compliance')}</h4><div className="grid gap-2 sm:grid-cols-2">{expiry.map(([key, label, date]) => <div key={key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span>{label}</span><span className={cn(!date && 'text-muted-foreground')}>{date ? isoDate(date) : text('Belum direkod', 'Not recorded')}</span></div>)}</div></section>
  <section><h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" />{text('Dokumen', 'Documents')}</h4>{vehicle.documents.length ? <div className="divide-y rounded-md border">{vehicle.documents.map((document) => <div key={document.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><div><p className="font-medium">{document.document_name}</p><p className="text-xs text-muted-foreground">{document.document_type} - {document.expires_at || text('Tiada tarikh tamat', 'No expiry')}</p></div>{document.document_url && <Button size="icon-sm" variant="ghost" onClick={() => window.open(document.document_url ?? '', '_blank', 'noopener,noreferrer')} aria-label={text('Buka dokumen', 'Open document')}><ExternalLink className="h-4 w-4" /></Button>}</div>)}</div> : <p className="text-sm text-muted-foreground">{text('Tiada dokumen dimuat naik.', 'No documents uploaded.')}</p>}</section>
  <section><h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Banknote className="h-4 w-4" />{text('Belanja terkini', 'Recent expenses')}</h4>{vehicle.expenses.length ? <div className="divide-y rounded-md border">{vehicle.expenses.map((expense) => <div key={expense.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><div><p className="font-medium">{expense.expense_type} - RM {expense.amount.toFixed(2)}</p><p className="text-xs text-muted-foreground">{expense.expense_date} - {expense.submitted_by_name}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{expense.status}</Badge>{data.can_review_expenses && expense.status === 'SUBMITTED' && <><Button size="sm" variant="outline" onClick={() => void runAction({ action: 'REVIEW_EXPENSE', expense_id: expense.id, status: 'REJECTED' }, text('Belanja ditolak.', 'Expense rejected.'))}>{text('Tolak', 'Reject')}</Button><Button size="sm" onClick={() => void runAction({ action: 'REVIEW_EXPENSE', expense_id: expense.id, status: 'APPROVED' }, text('Belanja diluluskan.', 'Expense approved.'))}>{text('Lulus', 'Approve')}</Button></>}</div></div>)}</div> : <p className="text-sm text-muted-foreground">{text('Belum ada belanja.', 'No expenses yet.')}</p>}</section>
  <section><h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Wrench className="h-4 w-4" />{text('Insiden dan pembaikan', 'Incidents and repairs')}</h4>{vehicle.incidents.length ? <div className="divide-y rounded-md border">{vehicle.incidents.map((incident) => <div key={incident.id} className="px-3 py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{incident.incident_type} - {incident.severity}</p><div className="flex items-center gap-2"><Badge variant="outline">{incident.status}</Badge>{data.can_manage_compliance && !['RESOLVED', 'CLOSED'].includes(incident.status) && <Button size="sm" variant="outline" onClick={() => void runAction({ action: 'UPDATE_INCIDENT', incident_id: incident.id, status: 'RESOLVED', actual_cost: incident.actual_cost }, text('Insiden ditandakan selesai.', 'Incident marked resolved.'))}>{text('Selesai', 'Resolve')}</Button>}</div></div><p className="mt-1 text-xs text-muted-foreground">{incident.description}</p></div>)}</div> : <p className="text-sm text-muted-foreground">{text('Tiada insiden direkodkan.', 'No incidents recorded.')}</p>}</section>
  <section><h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Wrench className="h-4 w-4" />{text('Jadual penyelenggaraan pintar', 'Smart maintenance schedule')}</h4>{vehicle.maintenance.length ? <div className="divide-y rounded-md border">{vehicle.maintenance.map((plan) => <div key={plan.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><div><p className="font-medium">{plan.service_name}</p><p className="text-xs text-muted-foreground">{plan.next_service_date || text('Tarikh belum ditetapkan', 'Date not set')}{plan.remaining_km !== null ? ` - ${Math.round(plan.remaining_km).toLocaleString()} km` : ''}</p></div><Badge variant="outline" className={cn(['DUE', 'OVERDUE'].includes(plan.status) && 'border-amber-200 bg-amber-50 text-amber-800')}>{plan.status}</Badge></div>)}</div> : <p className="text-sm text-muted-foreground">{text('Pelan servis boleh diurus melalui Pusat Kawalan Fleet.', 'Service plans are managed in the Fleet Control Center.')}</p>}</section>
 </div>;
}
