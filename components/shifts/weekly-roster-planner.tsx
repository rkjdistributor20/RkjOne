'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
 AlertTriangle,
 CalendarRange,
 CheckCircle2,
 Save,
 Send,
} from 'lucide-react';
import type { RosterBranchStatus, RosterEntryInput } from '@/lib/roster/types';
import type { ShiftTemplate } from '@/lib/shifts/types';
import {
 DAY_LABELS,
 formatWeekRange,
 getNextWeekStart,
 getThisWeekStart,
} from '@/lib/roster/week-utils';
import {
 fetchRosterPlan,
 fetchRosterStatus,
 publishRosterPlan,
 saveRosterPlan,
} from '@/lib/roster/api';
import { fetchShiftTemplates, fetchStaffList } from '@/lib/shifts/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type CellValue = {
 is_off: boolean;
 template_id: string;
};

interface WeeklyRosterPlannerProps {
 branchId: string;
 initialWeek?: string;
}

function emptyGrid(
 staffIds: string[],
 existing: RosterEntryInput[] = []): Map<string, CellValue> {
 const map = new Map<string, CellValue>();
 for (const sid of staffIds) {
 for (let d = 0; d < 7; d++) {
 const key = `${sid}:${d}`;
 const ex = existing.find((e) => e.staff_id === sid && e.day_index === d);
 map.set(key, {
 is_off: ex?.is_off ?? (d === 6),
 template_id: ex?.template_id ?? '',
 });
 }
 }
 return map;
}

export function WeeklyRosterPlanner({ branchId, initialWeek }: WeeklyRosterPlannerProps) {
 const [weekStart, setWeekStart] = useState(initialWeek ?? getNextWeekStart());
 const [staff, setStaff] = useState<
 Array<{ id: string; staff_code: string; full_name: string }>
 >([]);
 const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
 const [cells, setCells] = useState<Map<string, CellValue>>(new Map());
 const [planId, setPlanId] = useState<string | null>(null);
 const [planStatus, setPlanStatus] = useState<'DRAFT' | 'PUBLISHED' | null>(null);
 const [branchStatus, setBranchStatus] = useState<RosterBranchStatus | null>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 const isPublished = planStatus === 'PUBLISHED';
 const weekOptions = useMemo(() => {
 const thisW = getThisWeekStart();
 const nextW = getNextWeekStart();
 return [
 { value: thisW, label: `Minggu ini - ${formatWeekRange(thisW)}` },
 { value: nextW, label: `Minggu depan - ${formatWeekRange(nextW)}` },
 ];
 }, []);

 const load = useCallback(async () => {
 if (!branchId) return;
 setLoading(true);
 try {
 const [stf, tpl, planRes, statusRes] = await Promise.all([
 fetchStaffList(branchId),
 fetchShiftTemplates(),
 fetchRosterPlan(branchId, weekStart),
 fetchRosterStatus(weekStart),
 ]);
 setStaff(stf.staff);
 setTemplates(tpl.templates);
 const plan = planRes.plan;
 setPlanId(plan.id);
 setPlanStatus(plan.status);
 setCells(emptyGrid(stf.staff.map((s) => s.id), plan.entries ?? []));
 const bs = (statusRes.branches as RosterBranchStatus[]).find(
 (b) => b.branch_id === branchId);
 setBranchStatus(bs ?? null);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal muat jadual');
 } finally {
 setLoading(false);
 }
 }, [branchId, weekStart]);

 useEffect(() => {
 load();
 }, [load]);

 function setCell(staffId: string, dayIndex: number, value: Partial<CellValue>) {
 if (isPublished) return;
 const key = `${staffId}:${dayIndex}`;
 setCells((prev) => {
 const next = new Map(prev);
 const cur = next.get(key) ?? { is_off: false, template_id: '' };
 next.set(key, {...cur,...value });
 return next;
 });
 }

 function buildEntries(): RosterEntryInput[] {
 const entries: RosterEntryInput[] = [];
 for (const s of staff) {
 for (let d = 0; d < 7; d++) {
 const c = cells.get(`${s.id}:${d}`) ?? { is_off: true, template_id: '' };
 entries.push({
 staff_id: s.id,
 day_index: d,
 is_off: c.is_off,
 template_id: c.is_off ? null : c.template_id || null,
 });
 }
 }
 return entries;
 }

 async function handleSave() {
 setSaving(true);
 try {
 const res = await saveRosterPlan({
 branch_id: branchId,
 week_start: weekStart,
 entries: buildEntries(),
 });
 setPlanId(res.plan.id);
 setPlanStatus(res.plan.status);
 toast.success('Draf jadual disimpan');
 load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan');
 } finally {
 setSaving(false);
 }
 }

 async function handlePublish() {
 if (!planId) {
 await handleSave();
 }
 const id = planId;
 if (!id) return;
 setSaving(true);
 try {
 await saveRosterPlan({
 branch_id: branchId,
 week_start: weekStart,
 entries: buildEntries(),
 });
 await publishRosterPlan(id);
 toast.success('Jadual diterbitkan - staf boleh lihat');
 load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal terbitkan');
 } finally {
 setSaving(false);
 }
 }

 if (loading) {
 return <p className="text-sm text-muted-foreground">Memuatkan jadual mingguan...</p>;
 }

 if (!staff.length) {
 return (
 <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
 Tiada staf aktif di cawangan ini.
 </p>);
 }

 const defaultTemplate = templates[0]?.id ?? '';

 return (
 <div className="space-y-4">
 <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex items-start gap-3">
 <CalendarRange className="mt-0.5 h-5 w-5 text-primary" />
 <div>
 <p className="font-semibold">Jadual Mingguan Staf</p>
 <p className="text-sm text-muted-foreground">
 Siapkan sebelum Ahad - deadline: sehari sebelum Isnin minggu sasaran
 </p>
 {branchStatus && (
 <div className="mt-2 flex flex-wrap gap-2">
 {branchStatus.status === 'PUBLISHED' ? (
 <Badge className="gap-1 bg-emerald-600">
 <CheckCircle2 className="h-3 w-3" /> Diterbitkan
 </Badge>) : branchStatus.is_overdue ? (
 <Badge variant="destructive" className="gap-1">
 <AlertTriangle className="h-3 w-3" /> Lewat deadline
 </Badge>) : (
 <Badge variant="secondary">
 {branchStatus.days_until_deadline} hari sebelum deadline
 </Badge>)}
 <Badge variant="outline">
 {branchStatus.entries_count}/{branchStatus.expected_entries} slot
 </Badge>
 </div>)}
 </div>
 </div>
 <Select value={weekStart} onValueChange={(v) => v && setWeekStart(v)}>
 <SelectTrigger className="w-[260px]">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {weekOptions.map((o) => (
 <SelectItem key={o.value} value={o.value}>
 {o.label}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>

 <div className="overflow-x-auto rounded-xl border shadow-sm">
 <table className="w-full min-w-[800px] text-sm">
 <thead>
 <tr className="border-b bg-muted/50">
 <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-semibold">
 Staf
 </th>
 {DAY_LABELS.map((label) => (
 <th key={label} className="px-2 py-2 text-center font-medium text-muted-foreground">
 {label}
 </th>))}
 </tr>
 </thead>
 <tbody>
 {staff.map((s) => (
 <tr key={s.id} className="border-b last:border-0">
 <td className="sticky left-0 z-10 bg-background px-3 py-2">
 <p className="font-medium">{s.full_name}</p>
 <p className="text-xs text-muted-foreground">{s.staff_code}</p>
 </td>
 {DAY_LABELS.map((_, dayIndex) => {
 const c = cells.get(`${s.id}:${dayIndex}`) ?? {
 is_off: dayIndex === 6,
 template_id: defaultTemplate,
 };
 return (
 <td key={dayIndex} className="px-1 py-1">
 <select
 disabled={isPublished}
 value={c.is_off ? 'OFF' : c.template_id || defaultTemplate}
 onChange={(e) => {
 const v = e.target.value;
 if (v === 'OFF') {
 setCell(s.id, dayIndex, { is_off: true, template_id: '' });
 } else {
 setCell(s.id, dayIndex, { is_off: false, template_id: v });
 }
 }}
 className={cn(
 'w-full rounded-md border px-1 py-1.5 text-xs',
 c.is_off ? 'bg-muted text-muted-foreground' : 'bg-white')}
 >
 <option value="OFF">Cuti</option>
 {templates.map((t) => (
 <option key={t.id} value={t.id}>
 {t.name}
 </option>))}
 </select>
 </td>);
 })}
 </tr>))}
 </tbody>
 </table>
 </div>

 {!isPublished && (
 <div className="flex flex-wrap gap-2">
 <Button onClick={handleSave} disabled={saving} variant="outline" className="gap-1">
 <Save className="h-4 w-4" />
 Simpan Draf
 </Button>
 <Button onClick={handlePublish} disabled={saving} className="gap-1">
 <Send className="h-4 w-4" />
 Terbitkan Jadual
 </Button>
 </div>)}
 </div>);
}
