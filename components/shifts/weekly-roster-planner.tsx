'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarRange, Copy, Save, Send } from 'lucide-react';
import type { RosterBranchStatus, RosterEntryInput, RosterPlannerData } from '@/lib/roster/types';
import { DAY_LABELS, crossesMidnight, formatWeekRange, getThisWeekStart, isRosterWeek, shiftDateForWeek } from '@/lib/roster/week-utils';
import { fetchRosterPlan, fetchRosterStatus, publishRosterPlan, saveRosterPlan } from '@/lib/roster/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RosterActualsPanel } from './roster-actuals-panel';

const cellKey = (staff: string, day: number) => `${staff}:${day}`;
const selectClass = 'h-9 rounded-md border bg-background px-2 text-sm';
const statusLabels = { PUBLISHED: 'Diterbitkan', DRAFT: 'Draf', MISSING: 'Belum disediakan' };

export function WeeklyRosterPlanner({ initialBranch, initialWeek }: { initialBranch?: string; initialWeek?: string }) {
 const [week, setWeek] = useState(() => isRosterWeek(initialWeek) ? initialWeek : getThisWeekStart());
 const [selected, setSelected] = useState(initialBranch ?? '');
 const [branches, setBranches] = useState<RosterBranchStatus[]>([]);
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(true);
 const [refresh, setRefresh] = useState(0);
 const branch = branches.find((b) => b.branch_id === selected);
 const branchId = branch?.branch_id;

 useEffect(() => {
  let active = true;
  setError('');
  fetchRosterStatus(week).then(({ branches }) => {
   if (active) setBranches(branches);
  }).catch((err) => {
   if (active) { setBranches([]); setError(err.message); }
  }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [week, refresh]);

 return (
  <div className="space-y-4">
   <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-muted/30 p-4">
    <div>
     <p className="flex items-center gap-2 font-semibold"><CalendarRange className="h-5 w-5 text-primary" /> Jadual Mingguan Staf</p>
     <p className="text-sm text-muted-foreground">{formatWeekRange(week)} (MYT) · Terbitkan sebelum Isnin</p>
    </div>
    <div className="flex flex-wrap items-end gap-2">
     <div className="grid gap-1">
      <Label htmlFor="roster-branch">Cawangan jadual</Label>
      <select id="roster-branch" className={selectClass} value={branchId ?? ''} onChange={(e) => setSelected(e.target.value)}>
       <option value="">Semua cawangan jagaan</option>
       {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_code} · {b.branch_name}</option>)}
      </select>
     </div>
     <div className="flex gap-1">
      <Button variant="outline" onClick={() => setWeek(shiftDateForWeek(week, -7))}>← Minggu</Button>
      <Button variant="outline" onClick={() => setWeek(getThisWeekStart())}>Minggu ini</Button>
      <Button variant="outline" onClick={() => setWeek(shiftDateForWeek(week, 7))}>Minggu →</Button>
     </div>
    </div>
   </div>

   {error ? <p role="alert" className="text-destructive">{error}</p> : loading ? (
    <p className="text-muted-foreground">Memuatkan skop jadual...</p>
   ) : branch ? (
    <BranchPlanner key={`${branch.branch_id}:${week}`} branch={branch} week={week} onSaved={() => setRefresh((v) => v + 1)} />
   ) : branches.length ? (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
     {branches.map((b) => (
      <Button key={b.branch_id} variant="outline" className="h-auto justify-between whitespace-normal p-3 text-left"
       onClick={() => setSelected(b.branch_id)}>
       <span>{b.branch_code} · {b.branch_name}</span>
       <Badge variant={b.is_overdue && b.status !== 'PUBLISHED' ? 'destructive' : 'secondary'}>{statusLabels[b.status]}</Badge>
      </Button>
     ))}
    </div>
   ) : <p className="text-muted-foreground">Tiada cawangan aktif dalam skop jadual anda.</p>}

   {!loading && !error && <RosterActualsPanel key={`${branchId ?? 'all'}:${week}:${refresh}`} branchId={branchId} week={week} />}
  </div>
 );
}

function BranchPlanner({ branch, week, onSaved }: { branch: RosterBranchStatus; week: string; onSaved: () => void }) {
 const [data, setData] = useState<RosterPlannerData | null>(null);
 const [loadError, setLoadError] = useState('');
 const [changes, setChanges] = useState<Record<string, RosterEntryInput>>({});
 const [editing, setEditing] = useState<RosterEntryInput | null>(null);
 const [copyFrom, setCopyFrom] = useState(shiftDateForWeek(week, -7));
 const [busy, setBusy] = useState(false);
 const branchId = branch.branch_id;

 useEffect(() => {
  let active = true;
  fetchRosterPlan(branchId, week).then((result) => { if (active) setData(result); })
   .catch((err) => { if (active) setLoadError(err.message); });
  return () => { active = false; };
 }, [branchId, week]);

 async function apply(action: 'save' | 'copy' | 'publish') {
  setBusy(true);
  let committed = false;
  try {
   if (action === 'publish' && Object.keys(changes).length === 0 && data?.plan) {
    await publishRosterPlan(data.plan.id);
    committed = true;
   } else {
    const { plan_id } = await saveRosterPlan({
     branch_id: branchId, week_start: week,
     ...(action === 'copy' ? { copy_from_week: copyFrom } : { entries: Object.values(changes) }),
    });
    committed = true;
    if (action === 'publish') await publishRosterPlan(plan_id);
   }
   toast.success(action === 'copy' ? 'Jadual disalin sebagai draf' : action === 'publish'
    ? 'Jadual diterbitkan — staf boleh lihat' : 'Perubahan jadual disimpan');
  } catch (err) {
   toast.error(err instanceof Error ? err.message : 'Gagal mengemas kini jadual');
  } finally {
   if (committed) {
    setChanges({});
    onSaved();
    try {
     setData(await fetchRosterPlan(branchId, week));
    } catch {
     setLoadError('Perubahan disimpan, tetapi jadual tidak dapat dimuat semula.');
    }
   }
   setBusy(false);
  }
 }

 if (loadError) return <p role="alert" className="text-destructive">{loadError}</p>;
 if (!data) return <p className="text-muted-foreground">Memuatkan jadual cawangan...</p>;
 if (!data.staff.length) return <p className="rounded-lg border border-dashed p-4 text-muted-foreground">Tiada staf aktif di cawangan ini.</p>;

 const { plan, staff, templates } = data;
 const published = plan?.status === 'PUBLISHED';
 const changed = Object.keys(changes).length > 0;
 const saved = new Map(plan?.entries.map((e) => [cellKey(e.staff_id, e.day_index), e]));
 const templateMap = new Map(templates.map((t) => [t.id, t]));

 function startEditing(staffId: string, day: number) {
  const key = cellKey(staffId, day);
  const slot = changes[key] ?? saved.get(key);
  const tpl = slot?.template_id ? templateMap.get(slot.template_id) : undefined;
  setEditing({
   staff_id: staffId, day_index: day, is_off: slot?.is_off ?? false, template_id: tpl?.id ?? null,
   scheduled_start: (slot?.scheduled_start ?? tpl?.start_time)?.slice(0, 5) ?? '',
   scheduled_end: (slot?.scheduled_end ?? tpl?.end_time)?.slice(0, 5) ?? '', notes: slot?.notes ?? null,
  });
 }

 return (
  <section className="space-y-3">
   <div className="flex flex-wrap items-center gap-2">
    <h3 className="font-semibold">{branch.branch_code} · {branch.branch_name}</h3>
    <Badge variant={branch.is_overdue && !published ? 'destructive' : 'secondary'}>{statusLabels[plan?.status ?? 'MISSING']}</Badge>
    {changed && <Badge variant="outline">Belum disimpan</Badge>}
   </div>
   <p className="text-muted-foreground">
    Pilih slot untuk menetapkan cuti, template atau masa fleksibel. Masa tamat lebih awal bermaksud hari berikutnya.
    {published && ' Perubahan jadual direkodkan dan tidak mengubah rekod kehadiran sebenar.'}
   </p>

   <div className="overflow-x-auto rounded-xl border">
    <table className="w-full min-w-[780px] text-sm">
     <thead className="border-b bg-muted/50"><tr>
      <th className="px-3 py-2 text-left">Staf</th>
      {DAY_LABELS.map((day, i) => <th key={day} className="px-1 py-2">{day} {shiftDateForWeek(week, i).slice(8)}</th>)}
     </tr></thead>
     <tbody>
      {staff.map((s) => <tr key={s.id} className="border-b last:border-0">
       <th scope="row" className="p-3 text-left font-medium">{s.full_name}<div className="text-xs text-muted-foreground">{s.staff_code}</div></th>
       {DAY_LABELS.map((day, i) => {
        const key = cellKey(s.id, i);
        const slot = changes[key] ?? saved.get(key);
        const tpl = slot?.template_id ? templateMap.get(slot.template_id) : undefined;
        const start = (slot?.scheduled_start ?? tpl?.start_time)?.slice(0, 5);
        const end = (slot?.scheduled_end ?? tpl?.end_time)?.slice(0, 5);
        return <td key={day} className="p-1 text-center">
         <Button variant={changes[key] ? 'secondary' : 'outline'} size="sm" disabled={busy} className="h-auto min-h-8 w-full px-1 text-xs"
          aria-label={`Edit ${s.full_name}, ${day} ${shiftDateForWeek(week, i)}`} onClick={() => startEditing(s.id, i)}>
          {!slot ? 'Tetapkan' : slot.is_off ? 'Cuti' : start && end
           ? `${start}–${end}${crossesMidnight(start, end) ? ' +1' : ''}` : 'Isi masa'}
         </Button>
        </td>;
       })}
      </tr>)}
     </tbody>
    </table>
   </div>

   <div className="flex flex-wrap items-end gap-2">
    <Button disabled={busy || !changed} onClick={() => apply('save')} variant="outline"><Save className="h-4 w-4" />
     {published ? 'Simpan Perubahan' : 'Simpan Draf'}
    </Button>
    {!published && <Button disabled={busy || (!changed && !saved.size)} onClick={() => apply('publish')}>
     <Send className="h-4 w-4" /> Terbitkan Jadual
    </Button>}
    {!published && !saved.size && !changed && (
     <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
       <Label htmlFor="roster-copy-week">Isnin minggu sumber</Label>
       <Input id="roster-copy-week" type="date" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} disabled={busy} />
      </div>
      <Button variant="outline" disabled={busy || !isRosterWeek(copyFrom) || copyFrom === week} onClick={() => apply('copy')}
       aria-describedby="roster-copy-scope">
       <Copy className="h-4 w-4" /> Salin ke Draf
      </Button>
      <p id="roster-copy-scope" className="text-xs text-muted-foreground">Slot lengkap staf aktif sahaja.</p>
     </div>
    )}
   </div>

   <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
    {editing && <DialogContent>
     <DialogHeader>
      <DialogTitle>{staff.find((s) => s.id === editing.staff_id)?.full_name} · {shiftDateForWeek(week, editing.day_index)}</DialogTitle>
      <DialogDescription>Masa jadual (MYT). Perubahan disimpan bersama jadual mingguan.</DialogDescription>
     </DialogHeader>
     <form className="grid gap-3" onSubmit={(event) => {
      event.preventDefault();
      if (!editing.is_off && editing.scheduled_start === editing.scheduled_end) {
       toast.error('Masa mula dan tamat mesti berbeza');
       return;
      }
      setChanges((prev) => ({ ...prev, [cellKey(editing.staff_id, editing.day_index)]: editing }));
      setEditing(null);
     }}>
      <div className="grid gap-1">
       <Label htmlFor="roster-slot-type">Jenis slot</Label>
       <select id="roster-slot-type" className={selectClass} value={editing.is_off ? 'OFF' : editing.template_id ?? 'FLEX'}
        onChange={(e) => {
         const value = e.target.value;
         const tpl = templateMap.get(value);
         setEditing({ ...editing, is_off: value === 'OFF', template_id: tpl?.id ?? null,
          scheduled_start: tpl ? tpl.start_time?.slice(0, 5) ?? '' : editing.scheduled_start,
          scheduled_end: tpl ? tpl.end_time?.slice(0, 5) ?? '' : editing.scheduled_end });
        }}>
        <option value="OFF">Cuti</option>
        <option value="FLEX">Masa fleksibel</option>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
       </select>
      </div>
      {!editing.is_off && (
       <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
         <Label htmlFor="roster-start">Mula</Label>
         <Input required id="roster-start" type="time" value={editing.scheduled_start ?? ''}
          onChange={(e) => setEditing({ ...editing, scheduled_start: e.target.value })} />
        </div>
        <div className="grid gap-1">
         <Label htmlFor="roster-end">Tamat{crossesMidnight(editing.scheduled_start, editing.scheduled_end) && ' (+1 hari)'}</Label>
         <Input required id="roster-end" type="time" value={editing.scheduled_end ?? ''}
          onChange={(e) => setEditing({ ...editing, scheduled_end: e.target.value })} />
        </div>
       </div>
      )}
      <DialogFooter><Button type="submit">Tetapkan Slot</Button></DialogFooter>
     </form>
    </DialogContent>}
   </Dialog>
  </section>
 );
}
