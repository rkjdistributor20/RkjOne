'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
 AlertTriangle,
 BellRing,
 CalendarCheck2,
 CalendarDays,
 CheckCircle2,
 Clock,
 Eye,
 Plus,
 RefreshCw,
 Search,
 XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { createBooking, fetchBookings } from '@/lib/bookings/api';
import type { BookingFormPayload, BookingPriority, BookingRecord, BookingType } from '@/lib/bookings/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
 EmptyState,
 KpiCard,
 KpiGrid,
 ModuleHeader,
 ModuleLayout,
 ModuleLoading,
 PrimaryActionButton,
 RecordRow,
 SectionCard,
} from '@/components/shared/module-ui';

type BranchOption = {
 id: string;
 branch_code: string;
 branch_name: string;
 area: string | null;
 region_name: string | null;
 status?: string | null;
};

type BookingFormState = {
 branch_id: string;
 booking_type: BookingType;
 priority: BookingPriority;
 title: string;
 scheduled_date: string;
 scheduled_time: string;
 expected_pax: string;
 customer_name: string;
 customer_phone: string;
 customer_email: string;
 description: string;
 notes: string;
};

const STATUS_LABEL: Record<string, string> = {
 PENDING: 'Menunggu',
 CONFIRMED: 'Disahkan',
 CANCELLED: 'Dibatalkan',
 COMPLETED: 'Selesai',
 NO_SHOW: 'Tidak Hadir',
};

const TYPE_LABEL: Record<BookingType, string> = {
 GENERAL: 'Umum',
 CUSTOMER: 'Pelanggan',
 EVENT: 'Event',
 MAINTENANCE: 'Maintenance',
 SALES_AGENT: 'Ejen',
 DELIVERY: 'Delivery',
 OTHER: 'Lain-lain',
};

const PRIORITY_LABEL: Record<BookingPriority, string> = {
 LOW: 'Rendah',
 NORMAL: 'Normal',
 HIGH: 'Tinggi',
 URGENT: 'Segera',
};

const BOOKING_TYPES = Object.keys(TYPE_LABEL) as BookingType[];
const PRIORITIES = Object.keys(PRIORITY_LABEL) as BookingPriority[];
const FILTER_STATUSES = ['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

function todayIso() {
 return new Date().toISOString().slice(0, 10);
}

function emptyForm(): BookingFormState {
 return {
 branch_id: 'AUTO',
 booking_type: 'GENERAL',
 priority: 'NORMAL',
 title: '',
 scheduled_date: todayIso(),
 scheduled_time: '',
 expected_pax: '',
 customer_name: '',
 customer_phone: '',
 customer_email: '',
 description: '',
 notes: '',
 };
}

function clean(value: string) {
 const text = value.trim();
 return text ? text : null;
}

function payloadFromForm(form: BookingFormState): BookingFormPayload {
 const pax = Number(form.expected_pax);
 return {
 branch_id: form.branch_id === 'AUTO' ? null : form.branch_id,
 booking_type: form.booking_type,
 priority: form.priority,
 title: form.title.trim(),
 scheduled_date: form.scheduled_date,
 scheduled_time: clean(form.scheduled_time),
 expected_pax: Number.isFinite(pax) && pax >= 0 ? Math.trunc(pax) : null,
 customer_name: clean(form.customer_name),
 customer_phone: clean(form.customer_phone),
 customer_email: clean(form.customer_email),
 description: clean(form.description),
 notes: clean(form.notes),
 source: 'UI',
 };
}

function formatDate(value: string) {
 return new Date(`${value}T00:00:00`).toLocaleDateString('ms-MY', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 });
}

function formatTime(value: string | null) {
 if (!value) return 'Masa belum ditetapkan';
 return value.slice(0, 5);
}

function isOpenStatus(status: string) {
 return status === 'PENDING' || status === 'CONFIRMED';
}

function isOverdue(booking: BookingRecord) {
 return isOpenStatus(booking.status) && booking.scheduled_date < todayIso();
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
 if (status === 'CANCELLED' || status === 'NO_SHOW') return 'destructive';
 if (status === 'COMPLETED') return 'secondary';
 if (status === 'CONFIRMED') return 'default';
 return 'outline';
}

async function fetchBranches() {
 const res = await fetch('/api/branches', { cache: 'no-store', credentials: 'same-origin' });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Gagal memuatkan cawangan');
 return data as { branches: BranchOption[] };
}

function BookingStatusBadge({ booking }: { booking: BookingRecord }) {
 return (
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant={statusVariant(booking.status)}>
 {STATUS_LABEL[booking.status] ?? booking.status}
 </Badge>
 {isOverdue(booking) && (
 <Badge variant="destructive">
 <AlertTriangle className="h-3 w-3" />
 Lewat
 </Badge>)}
 {booking.priority === 'URGENT' && (
 <Badge variant="destructive">
 <BellRing className="h-3 w-3" />
 Segera
 </Badge>)}
 </div>);
}

function CreateBookingDialog({
 open,
 branches,
 saving,
 onOpenChange,
 onSubmit,
}: {
 open: boolean;
 branches: BranchOption[];
 saving: boolean;
 onOpenChange: (open: boolean) => void;
 onSubmit: (payload: BookingFormPayload) => Promise<void>;
}) {
 const [form, setForm] = useState(emptyForm);

 useEffect(() => {
 if (!open) return;
 setForm(emptyForm());
 }, [open]);

 async function handleSubmit() {
 const payload = payloadFromForm(form);
 if (!payload.title) {
 toast.error('Tajuk booking wajib diisi');
 return;
 }
 if (!payload.scheduled_date) {
 toast.error('Tarikh booking wajib diisi');
 return;
 }
 await onSubmit(payload);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
 <DialogHeader>
 <DialogTitle>Booking baharu</DialogTitle>
 <DialogDescription>
 Daftar rekod booking operasi supaya status, tarikh dan tindakan boleh dijejak.
 </DialogDescription>
 </DialogHeader>

 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5 sm:col-span-2">
 <Label>Tajuk</Label>
 <Input
 value={form.title}
 onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
 placeholder="Contoh: Tempahan event pelanggan / susulan delivery"
 />
 </div>
 <div className="space-y-1.5">
 <Label>Cawangan</Label>
 <Select
 value={form.branch_id}
 onValueChange={(value) => setForm((prev) => ({ ...prev, branch_id: String(value) }))}
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Auto ikut skop" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="AUTO">Auto ikut skop saya</SelectItem>
 {branches.map((branch) => (
 <SelectItem key={branch.id} value={branch.id}>
 {branch.branch_code} - {branch.branch_name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label>Jenis</Label>
 <Select
 value={form.booking_type}
 onValueChange={(value) => setForm((prev) => ({ ...prev, booking_type: value as BookingType }))}
 >
 <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
 <SelectContent>
 {BOOKING_TYPES.map((type) => (
 <SelectItem key={type} value={type}>{TYPE_LABEL[type]}</SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label>Tarikh</Label>
 <Input
 type="date"
 value={form.scheduled_date}
 onChange={(event) => setForm((prev) => ({ ...prev, scheduled_date: event.target.value }))}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Masa</Label>
 <Input
 type="time"
 value={form.scheduled_time}
 onChange={(event) => setForm((prev) => ({ ...prev, scheduled_time: event.target.value }))}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Priority</Label>
 <Select
 value={form.priority}
 onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value as BookingPriority }))}
 >
 <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
 <SelectContent>
 {PRIORITIES.map((priority) => (
 <SelectItem key={priority} value={priority}>{PRIORITY_LABEL[priority]}</SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label>Anggaran pax/unit</Label>
 <Input
 type="number"
 min="0"
 value={form.expected_pax}
 onChange={(event) => setForm((prev) => ({ ...prev, expected_pax: event.target.value }))}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Nama pelanggan</Label>
 <Input
 value={form.customer_name}
 onChange={(event) => setForm((prev) => ({ ...prev, customer_name: event.target.value }))}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Telefon</Label>
 <Input
 value={form.customer_phone}
 onChange={(event) => setForm((prev) => ({ ...prev, customer_phone: event.target.value }))}
 />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label>Email pelanggan</Label>
 <Input
 type="email"
 value={form.customer_email}
 onChange={(event) => setForm((prev) => ({ ...prev, customer_email: event.target.value }))}
 />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label>Penerangan</Label>
 <Textarea
 rows={3}
 value={form.description}
 onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
 />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label>Nota dalaman</Label>
 <Textarea
 rows={3}
 value={form.notes}
 onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
 />
 </div>
 </div>

 <DialogFooter>
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Batal
 </Button>
 <PrimaryActionButton onClick={handleSubmit} disabled={saving}>
 {saving ? 'Menyimpan...' : 'Cipta booking'}
 </PrimaryActionButton>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}

export function BookingsDashboard() {
 const [bookings, setBookings] = useState<BookingRecord[]>([]);
 const [branches, setBranches] = useState<BranchOption[]>([]);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [createOpen, setCreateOpen] = useState(false);
 const [statusFilter, setStatusFilter] = useState('ALL');
 const [branchFilter, setBranchFilter] = useState('ALL');
 const [search, setSearch] = useState('');

 const loadData = useCallback(async () => {
 setLoading(true);
 try {
 const [bookingData, branchData] = await Promise.all([
 fetchBookings({
 status: statusFilter === 'ALL' ? undefined : statusFilter,
 branch_id: branchFilter === 'ALL' ? undefined : branchFilter,
 limit: 100,
 }),
 fetchBranches(),
 ]);
 setBookings(bookingData.bookings);
 setBranches(branchData.branches);
 } catch (error) {
 toast.error(error instanceof Error ? error.message : 'Gagal memuatkan booking');
 } finally {
 setLoading(false);
 }
 }, [branchFilter, statusFilter]);

 useEffect(() => {
 const timer = window.setTimeout(() => {
 void loadData();
 }, 0);
 return () => window.clearTimeout(timer);
 }, [loadData]);

 const filteredBookings = useMemo(() => {
 const term = search.trim().toLowerCase();
 if (!term) return bookings;
 return bookings.filter((booking) => {
 const haystack = [
 booking.booking_number,
 booking.title,
 booking.customer_name,
 booking.customer_phone,
 booking.branch?.branch_code,
 booking.branch?.branch_name,
 ].filter(Boolean).join(' ').toLowerCase();
 return haystack.includes(term);
 });
 }, [bookings, search]);

 const summary = useMemo(() => {
 const open = bookings.filter((booking) => isOpenStatus(booking.status));
 return {
 total: bookings.length,
 open: open.length,
 urgent: open.filter((booking) => booking.priority === 'URGENT').length,
 overdue: open.filter(isOverdue).length,
 };
 }, [bookings]);

 async function handleCreate(payload: BookingFormPayload) {
 setSaving(true);
 try {
 const { booking } = await createBooking(payload);
 toast.success(`Booking ${booking.booking_number} dicipta`);
 setCreateOpen(false);
 await loadData();
 } catch (error) {
 toast.error(error instanceof Error ? error.message : 'Gagal cipta booking');
 } finally {
 setSaving(false);
 }
 }

 return (
 <ModuleLayout>
 <ModuleHeader
 title="Booking Operations"
 description="Create, track, edit dan follow up booking operasi dari satu flow yang boleh diaudit."
 icon={CalendarCheck2}
 actions={
 <>
 <Button variant="outline" onClick={loadData} disabled={loading}>
 <RefreshCw className="mr-2 h-4 w-4" />
 Refresh
 </Button>
 <PrimaryActionButton onClick={() => setCreateOpen(true)}>
 <Plus className="mr-2 h-4 w-4" />
 Booking
 </PrimaryActionButton>
 </>
 }
 badges={
 <>
 <Badge variant="secondary">M3 workflow</Badge>
 <Badge variant={summary.overdue > 0 ? 'destructive' : 'outline'}>
 {summary.overdue > 0 ? `${summary.overdue} lewat` : 'Tiada lewat'}
 </Badge>
 </>
 }
 />

 {loading ? (
 <ModuleLoading rows={1} />
 ) : (
 <>
 <KpiGrid cols={4}>
 <KpiCard title="Jumlah" value={summary.total} description="Rekod booking terlihat" icon={CalendarDays} />
 <KpiCard title="Open" value={summary.open} description="Menunggu / disahkan" icon={Clock} variant={summary.open > 0 ? 'warning' : 'success'} />
 <KpiCard title="Segera" value={summary.urgent} description="Priority urgent" icon={BellRing} variant={summary.urgent > 0 ? 'danger' : 'success'} />
 <KpiCard title="Selesai" value={bookings.filter((b) => b.status === 'COMPLETED').length} description="Booking completed" icon={CheckCircle2} variant="success" />
 </KpiGrid>

 <SectionCard
 title="Senarai booking"
 description="Filter ikut status, cawangan atau carian pelanggan."
 action={
 <Badge variant="outline">
 {filteredBookings.length} rekod
 </Badge>
 }
 >
 <div className="grid gap-3 md:grid-cols-[1fr_180px_260px]">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 value={search}
 onChange={(event) => setSearch(event.target.value)}
 placeholder="Cari tajuk, nombor booking, pelanggan atau cawangan"
 className="pl-9"
 />
 </div>
 <Select value={statusFilter} onValueChange={(value) => setStatusFilter(String(value))}>
 <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
 <SelectContent>
 {FILTER_STATUSES.map((status) => (
 <SelectItem key={status} value={status}>
 {status === 'ALL' ? 'Semua status' : STATUS_LABEL[status]}
 </SelectItem>))}
 </SelectContent>
 </Select>
 <Select value={branchFilter} onValueChange={(value) => setBranchFilter(String(value))}>
 <SelectTrigger className="w-full"><SelectValue placeholder="Semua cawangan" /></SelectTrigger>
 <SelectContent>
 <SelectItem value="ALL">Semua cawangan</SelectItem>
 {branches.map((branch) => (
 <SelectItem key={branch.id} value={branch.id}>
 {branch.branch_code} - {branch.branch_name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>

 <div className="mt-4 space-y-3">
 {filteredBookings.length === 0 ? (
 <EmptyState
 icon={CalendarDays}
 title="Tiada booking ditemui"
 description="Cipta booking baharu atau ubah filter untuk melihat rekod lain."
 action={
 <PrimaryActionButton onClick={() => setCreateOpen(true)}>
 <Plus className="mr-2 h-4 w-4" />
 Booking baharu
 </PrimaryActionButton>
 }
 />
 ) : (
 filteredBookings.map((booking) => (
 <RecordRow key={booking.id} className="items-start">
 <div className="min-w-0 flex-1 space-y-2">
 <div className="flex flex-wrap items-center gap-2">
 <span className="font-mono text-xs text-muted-foreground">{booking.booking_number}</span>
 <BookingStatusBadge booking={booking} />
 <Badge variant="outline">{TYPE_LABEL[booking.booking_type]}</Badge>
 </div>
 <div>
 <Link href={`/bookings/${booking.id}`} className="font-semibold text-stone-950 hover:text-amber-700">
 {booking.title}
 </Link>
 <p className="mt-1 text-xs text-muted-foreground">
 {formatDate(booking.scheduled_date)} - {formatTime(booking.scheduled_time)}
 {booking.branch ? ` - ${booking.branch.branch_code} ${booking.branch.branch_name}` : ' - Tiada cawangan'}
 </p>
 </div>
 <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
 {booking.customer_name && <span>Pelanggan: {booking.customer_name}</span>}
 {booking.customer_phone && <span>Tel: {booking.customer_phone}</span>}
 {booking.expected_pax !== null && <span>Pax/unit: {booking.expected_pax}</span>}
 </div>
 </div>
 <div className="flex shrink-0 flex-wrap gap-2">
 {booking.status === 'CANCELLED' ? (
 <Badge variant="destructive"><XCircle className="h-3 w-3" /> Batal</Badge>
 ) : (
 <Button variant="outline" size="sm" render={<Link href={`/bookings/${booking.id}`} />}>
 <Eye className="mr-1.5 h-4 w-4" />
 Detail
 </Button>)}
 </div>
 </RecordRow>)))}
 </div>
 </SectionCard>
 </>
 )}

 <CreateBookingDialog
 open={createOpen}
 branches={branches}
 saving={saving}
 onOpenChange={setCreateOpen}
 onSubmit={handleCreate}
 />
 </ModuleLayout>);
}
