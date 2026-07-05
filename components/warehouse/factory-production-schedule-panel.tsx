'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchProductionWeek, saveProductionWeek } from '@/lib/production/api';
import {
 activeProductionPlanningWeek,
 addWeeks,
 formatProductionDayLabel,
 formatWeekRange,
 mondayForProductionDate,
 normalizeProductionWeekStart,
 todayIsoDate,
 weekDayDates,
} from '@/lib/production/week-utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function FactoryProductionSchedulePanel() {
 const [weekStart, setWeekStart] = useState(() => activeProductionPlanningWeek());
 const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
 const [notes, setNotes] = useState('');
 const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | null>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 const normalizedWeekStart = normalizeProductionWeekStart(weekStart);
 const weekDays = weekDayDates(normalizedWeekStart);
 const todayIso = todayIsoDate();

 useEffect(() => {
 if (weekStart !== normalizedWeekStart) {
 setWeekStart(normalizedWeekStart);
 }
 }, [weekStart, normalizedWeekStart]);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const { week } = await fetchProductionWeek(normalizedWeekStart);
 if (week) {
 setSelectedDays(new Set(week.days));
 setNotes(week.notes ?? '');
 setStatus(week.status);
 } else {
 setSelectedDays(new Set());
 setNotes('');
 setStatus(null);
 }
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan jadual');
 } finally {
 setLoading(false);
 }
 }, [normalizedWeekStart]);

 useEffect(() => {
 load();
 }, [load]);

 function toggleDay(iso: string) {
 setSelectedDays((prev) => {
 const next = new Set(prev);
 if (next.has(iso)) next.delete(iso);
 else next.add(iso);
 return next;
 });
 }

 async function handleSave(publish: boolean) {
 const productionDates = [...selectedDays]
 .filter((d) => !publish || d >= todayIso)
 .sort();
 const submitWeekStart = productionDates[0]
 ? mondayForProductionDate(productionDates[0])
 : normalizedWeekStart;
 if (publish && productionDates.length === 0) {
 toast.error('Pilih sekurang-kurangnya satu hari production');
 return;
 }
 setSaving(true);
 try {
 await saveProductionWeek({
 week_start: submitWeekStart,
 production_dates: productionDates,
 notes: notes || undefined,
 publish,
 });
 toast.success(publish ? 'Jadual production diterbitkan' : 'Draf jadual disimpan');
 load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan jadual');
 } finally {
 setSaving(false);
 }
 }

 return (
 <div className="space-y-4">
 <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
 <p className="font-semibold">Kilang - Jadual Production Mingguan</p>
 <p className="mt-1 text-blue-900/80">
 Tetapkan hari kilang beroperasi production. HQ hanya boleh order &amp; terima stok roti
 pada tarikh yang diterbitkan di sini.
 </p>
 </div>

 <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-2">
 <Button
 type="button"
 variant="outline"
 size="icon"
 onClick={() => setWeekStart((w) => addWeeks(w, -1))}
 >
 <ChevronLeft className="h-4 w-4" />
 </Button>
 <div>
 <p className="flex items-center gap-2 text-sm font-semibold">
 <CalendarDays className="h-4 w-4" />
 Minggu {formatWeekRange(normalizedWeekStart)}
 </p>
 {status && (
 <Badge variant={status === 'PUBLISHED' ? 'default' : 'secondary'} className="mt-1">
 {status === 'PUBLISHED' ? 'Diterbitkan' : 'Draf'}
 </Badge>)}
 </div>
 <Button
 type="button"
 variant="outline"
 size="icon"
 onClick={() => setWeekStart((w) => addWeeks(w, 1))}
 >
 <ChevronRight className="h-4 w-4" />
 </Button>
 </div>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 onClick={() => setWeekStart(activeProductionPlanningWeek())}
 >
 Minggu aktif
 </Button>
 </div>

 {loading ? (
 <p className="text-sm text-muted-foreground">Memuatkan...</p>) : (
 <>
 <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
 {weekDays.map((iso) => {
 const active = selectedDays.has(iso);
 const isPast = iso < todayIso;
 return (
 <button
 key={iso}
 type="button"
 disabled={isPast}
 onClick={() => toggleDay(iso)}
 className={cn(
 'rounded-xl border-2 px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50',
 active
 ? 'border-amber-500 bg-amber-50 shadow-sm'
 : 'border-border bg-background hover:bg-muted/50')}
 >
 <p className="text-sm font-semibold">{formatProductionDayLabel(iso)}</p>
 <p className="mt-1 text-xs text-muted-foreground">
 {isPast ? 'Tarikh lepas - tidak boleh preorder' : active ? 'Hari production' : 'Tiada production'}
 </p>
 </button>);
 })}
 </div>

 <div className="space-y-1.5">
 <Label>Nota minggu (pilihan)</Label>
 <Textarea
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 rows={2}
 placeholder="Contoh: Jumaat cuti - Sabtu production penuh"
 />
 </div>

 <div className="flex flex-wrap gap-2">
 <Button
 type="button"
 variant="outline"
 disabled={saving}
 onClick={() => handleSave(false)}
 >
 Simpan Draf
 </Button>
 <Button
 type="button"
 className="bg-amber-500 hover:bg-amber-600"
 disabled={saving}
 onClick={() => handleSave(true)}
 >
 Terbitkan ke HQ
 </Button>
 </div>
 </>)}
 </div>);
}
