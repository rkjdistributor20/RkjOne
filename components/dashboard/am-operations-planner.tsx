'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarCheck2, CheckCircle2, ClipboardList, Handshake, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type BranchOption = {
 id: string;
 branch_code: string;
 branch_name: string;
 status: string;
};

type AmOperationEvent = {
 id: string;
 event_type: 'SPRING_CLEANING' | 'HIGHWAY_MEETING';
 title: string;
 scheduled_date: string;
 scheduled_time: string | null;
 branch_ids: string[];
 branches?: BranchOption[];
 branch_count: number;
 highway_party: string | null;
 status: 'PLANNED' | 'DONE' | 'CANCELLED';
 notes: string | null;
};

const EVENT_OPTIONS = [
 {
 value: 'SPRING_CLEANING',
 label: 'Spring Cleaning Bulanan',
 description: 'Jadual pembersihan mendalam kiosk setiap bulan.',
 icon: Sparkles,
 },
 {
 value: 'HIGHWAY_MEETING',
 label: 'Meeting Pengurusan Highway',
 description: 'Meeting bersama pihak highway untuk cawangan terlibat.',
 icon: Handshake,
 },
] as const;

function todayIso() {
 return new Date().toISOString().slice(0, 10);
}

function nextMonthSameDayIso() {
 const date = new Date();
 date.setMonth(date.getMonth() + 1);
 return date.toISOString().slice(0, 10);
}

function eventTypeLabel(type: AmOperationEvent['event_type']) {
 return type === 'SPRING_CLEANING' ? 'Spring Cleaning' : 'Meeting Highway';
}

function statusBadge(event: AmOperationEvent) {
 if (event.status === 'DONE') return <Badge className="bg-emerald-600">Selesai</Badge>;
 if (event.status === 'CANCELLED') return <Badge variant="secondary">Batal</Badge>;
 return <Badge variant="outline">Dirancang</Badge>;
}

export function AmOperationsPlanner() {
 const [branches, setBranches] = useState<BranchOption[]>([]);
 const [events, setEvents] = useState<AmOperationEvent[]>([]);
 const [eventType, setEventType] = useState<(typeof EVENT_OPTIONS)[number]['value']>('SPRING_CLEANING');
 const [scheduledDate, setScheduledDate] = useState(nextMonthSameDayIso);
 const [scheduledTime, setScheduledTime] = useState('10:00');
 const [title, setTitle] = useState('');
 const [highwayParty, setHighwayParty] = useState('');
 const [notes, setNotes] = useState('');
 const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 const selectedEvent = EVENT_OPTIONS.find((option) => option.value === eventType) ?? EVENT_OPTIONS[0];
 const selectedBranches = useMemo(
 () => branches.filter((branch) => selectedBranchIds.includes(branch.id)),
 [branches, selectedBranchIds]);

 const loadData = useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetch('/api/area-manager/operations');
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Gagal memuatkan perancangan AM');
 setBranches(data.branches ?? []);
 setEvents(data.events ?? []);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan perancangan AM');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 loadData();
 }, [loadData]);

 function toggleBranch(branchId: string) {
 setSelectedBranchIds((current) =>
 current.includes(branchId)
 ? current.filter((id) => id !== branchId)
 : [...current, branchId]);
 }

 function selectAllBranches() {
 setSelectedBranchIds(branches.map((branch) => branch.id));
 }

 function clearBranches() {
 setSelectedBranchIds([]);
 }

 async function handleSubmit() {
 if (!selectedBranchIds.length) {
 toast.error('Pilih sekurang-kurangnya satu cawangan');
 return;
 }

 setSaving(true);
 try {
 const res = await fetch('/api/area-manager/operations', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 event_type: eventType,
 title,
 scheduled_date: scheduledDate || todayIso(),
 scheduled_time: scheduledTime || null,
 branch_ids: selectedBranchIds,
 highway_party: highwayParty,
 notes,
 }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Gagal simpan tugasan');

 toast.success('Perancangan operasi AM disimpan');
 setTitle('');
 setHighwayParty('');
 setNotes('');
 setSelectedBranchIds([]);
 await loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan tugasan');
 } finally {
 setSaving(false);
 }
 }

 async function updateStatus(id: string, status: AmOperationEvent['status']) {
 try {
 const res = await fetch('/api/area-manager/operations', {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ id, status }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Gagal kemaskini status');
 toast.success(status === 'DONE' ? 'Tugasan ditanda selesai' : 'Tugasan dibatalkan');
 await loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemaskini status');
 }
 }

 return (
 <Card id="am-operations-planner" className="overflow-hidden border-[#E5A812]/30 shadow-sm">
 <CardHeader className="border-b bg-gradient-to-r from-[#FFF4D6] via-white to-white">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <CardTitle className="flex items-center gap-2">
 <CalendarCheck2 className="h-5 w-5 text-primary" />
 Perancangan Operasi AM
 </CardTitle>
 <p className="mt-1 text-sm text-muted-foreground">
 Jadual spring cleaning bulanan dan meeting highway untuk satu atau banyak cawangan dalam kawasan.
 </p>
 </div>
 <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
 <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
 Refresh
 </Button>
 </div>
 </CardHeader>
 <CardContent className="space-y-5 p-4 md:p-5">
 <div className="grid gap-3 md:grid-cols-2">
 {EVENT_OPTIONS.map((option) => {
 const Icon = option.icon;
 const selected = option.value === eventType;
 return (
 <button
 key={option.value}
 type="button"
 onClick={() => setEventType(option.value)}
 className={cn(
 'rounded-xl border p-4 text-left transition hover:border-primary/50',
 selected ? 'border-primary bg-primary/10 shadow-sm' : 'bg-card')}
 >
 <div className="flex items-start gap-3">
 <div className={cn('rounded-lg p-2', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
 <Icon className="h-5 w-5" />
 </div>
 <div>
 <p className="font-semibold">{option.label}</p>
 <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
 </div>
 </div>
 </button>);
 })}
 </div>

 <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
 <div className="space-y-4 rounded-xl border bg-card p-4">
 <div className="space-y-1.5">
 <Label>Tajuk tugasan</Label>
 <Input
 value={title}
 onChange={(event) => setTitle(event.target.value)}
 placeholder={selectedEvent.label}
 />
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label>Tarikh</Label>
 <Input
 type="date"
 value={scheduledDate}
 onChange={(event) => setScheduledDate(event.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Masa</Label>
 <Input
 type="time"
 value={scheduledTime}
 onChange={(event) => setScheduledTime(event.target.value)}
 />
 </div>
 </div>
 {eventType === 'HIGHWAY_MEETING' && (
 <div className="space-y-1.5">
 <Label>Pihak highway / lokasi meeting</Label>
 <Input
 value={highwayParty}
 onChange={(event) => setHighwayParty(event.target.value)}
 placeholder="Contoh: PLUS RNR Juru / WCE Taiping"
 />
 </div>)}
 <div className="space-y-1.5">
 <Label>Nota / agenda</Label>
 <Textarea
 value={notes}
 onChange={(event) => setNotes(event.target.value)}
 placeholder={
 eventType === 'SPRING_CLEANING'
 ? 'Contoh: bersih freezer, rak display, kaunter POS, semak peralatan kiosk.'
 : 'Contoh: isu lokasi stok, permit, laluan staf, kebersihan kawasan dan operasi kiosk.'}
 />
 </div>
 </div>

 <div className="rounded-xl border bg-card p-4">
 <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
 <div>
 <p className="font-semibold">Pilih cawangan terlibat</p>
 <p className="text-sm text-muted-foreground">
 {selectedBranches.length} dipilih daripada {branches.length} cawangan kawasan.
 </p>
 </div>
 <div className="flex gap-2">
 <Button type="button" variant="outline" size="sm" onClick={selectAllBranches}>
 Pilih semua
 </Button>
 <Button type="button" variant="ghost" size="sm" onClick={clearBranches}>
 Kosongkan
 </Button>
 </div>
 </div>
 <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
 {loading ? (
 <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">Memuat cawangan...</p>
 ) : branches.length === 0 ? (
 <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">Tiada cawangan dalam skop.</p>
 ) : branches.map((branch) => {
 const selected = selectedBranchIds.includes(branch.id);
 return (
 <button
 key={branch.id}
 type="button"
 onClick={() => toggleBranch(branch.id)}
 className={cn(
 'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition',
 selected ? 'border-primary bg-primary/10' : 'bg-background hover:border-primary/40')}
 >
 <span>
 <span className="font-semibold">{branch.branch_code}</span> - {branch.branch_name}
 </span>
 {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
 </button>);
 })}
 </div>
 </div>
 </div>

 <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
 <div className="text-sm text-muted-foreground">
 AI cadang: spring cleaning dibuat sekurang-kurangnya sebulan sekali; meeting highway direkod jika melibatkan permit, kebersihan kawasan, laluan staf atau isu operasi cawangan.
 </div>
 <Button onClick={handleSubmit} disabled={saving || loading}>
 <ClipboardList className="mr-2 h-4 w-4" />
 {saving ? 'Menyimpan...' : 'Simpan Jadual'}
 </Button>
 </div>

 <div className="space-y-3">
 <div className="flex items-center justify-between gap-2">
 <h3 className="font-semibold">Senarai perancangan terbaru</h3>
 <Badge variant="outline">{events.length} rekod</Badge>
 </div>
 {events.length === 0 ? (
 <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
 Belum ada jadual spring cleaning atau meeting highway direkodkan.
 </p>
 ) : (
 <div className="grid gap-3 lg:grid-cols-2">
 {events.map((event) => (
 <div key={event.id} className="rounded-xl border bg-card p-4 shadow-sm">
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div>
 <p className="text-xs font-semibold uppercase tracking-wide text-primary">
 {eventTypeLabel(event.event_type)}
 </p>
 <p className="mt-1 font-bold">{event.title}</p>
 <p className="mt-1 text-sm text-muted-foreground">
 {new Date(event.scheduled_date).toLocaleDateString('ms-MY')}
 {event.scheduled_time ? ` - ${event.scheduled_time.slice(0, 5)}` : ''}
 </p>
 </div>
 {statusBadge(event)}
 </div>
 {event.highway_party && (
 <p className="mt-2 text-sm text-muted-foreground">Pihak: {event.highway_party}</p>)}
 <div className="mt-3 flex flex-wrap gap-1.5">
 {(event.branches ?? []).slice(0, 5).map((branch) => (
 <Badge key={branch.id} variant="secondary">
 {branch.branch_code}
 </Badge>))}
 {event.branch_count > 5 && <Badge variant="outline">+{event.branch_count - 5}</Badge>}
 </div>
 {event.notes && <p className="mt-3 text-sm text-muted-foreground">{event.notes}</p>}
 {event.status === 'PLANNED' && (
 <div className="mt-4 flex flex-wrap gap-2">
 <Button size="sm" onClick={() => updateStatus(event.id, 'DONE')}>
 <CheckCircle2 className="mr-2 h-4 w-4" />
 Selesai
 </Button>
 <Button size="sm" variant="outline" onClick={() => updateStatus(event.id, 'CANCELLED')}>
 <XCircle className="mr-2 h-4 w-4" />
 Batal
 </Button>
 </div>)}
 </div>))}
 </div>)}
 </div>
 </CardContent>
 </Card>);
}
