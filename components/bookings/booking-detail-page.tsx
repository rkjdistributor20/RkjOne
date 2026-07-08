'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
 ArrowLeft,
 BellRing,
 CalendarCheck2,
 CheckCircle2,
 ClipboardPenLine,
 Clock,
 RefreshCw,
 Save,
 UserRound,
 XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchBooking, updateBooking } from '@/lib/bookings/api';
import type { BookingFormPayload, BookingPriority, BookingRecord, BookingStatus, BookingType } from '@/lib/bookings/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
 SectionCard,
} from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';

type BranchOption = {
 id: string;
 branch_code: string;
 branch_name: string;
 area: string | null;
 region_name: string | null;
};

type EditFormState = {
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

const STATUS_LABEL: Record<BookingStatus, string> = {
 PENDING: 'Menunggu',
 CONFIRMED: 'Disahkan',
 CANCELLED: 'Dibatalkan',
 COMPLETED: 'Selesai',
 NO_SHOW: 'Tidak Hadir',
};

const TYPE_LABEL: Record<BookingType, string> = {
 GENERAL: 'Umum',
 CUSTOMER: 'Pelanggan',
 EVENT: 'Acara',
 MAINTENANCE: 'Penyelenggaraan',
 SALES_AGENT: 'Ejen',
 DELIVERY: 'Penghantaran',
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

function clean(value: string) {
 const text = value.trim();
 return text ? text : null;
}

function formFromBooking(booking: BookingRecord): EditFormState {
 return {
 branch_id: booking.branch?.id ?? 'AUTO',
 booking_type: booking.booking_type,
 priority: booking.priority,
 title: booking.title,
 scheduled_date: booking.scheduled_date,
 scheduled_time: booking.scheduled_time?.slice(0, 5) ?? '',
 expected_pax: booking.expected_pax === null ? '' : String(booking.expected_pax),
 customer_name: booking.customer_name ?? '',
 customer_phone: booking.customer_phone ?? '',
 customer_email: booking.customer_email ?? '',
 description: booking.description ?? '',
 notes: booking.notes ?? '',
 };
}

function payloadFromForm(form: EditFormState): BookingFormPayload {
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
 };
}

function formatDate(value: string) {
 return new Date(`${value}T00:00:00`).toLocaleDateString('ms-MY', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 });
}

function formatDateTime(value: string | null) {
 if (!value) return '-';
 return new Date(value).toLocaleString('ms-MY', {
 dateStyle: 'medium',
 timeStyle: 'short',
 });
}

function statusVariant(status: BookingStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
 if (status === 'CANCELLED' || status === 'NO_SHOW') return 'destructive';
 if (status === 'COMPLETED') return 'secondary';
 if (status === 'CONFIRMED') return 'default';
 return 'outline';
}

function isTerminal(status: BookingStatus) {
 return status === 'CANCELLED' || status === 'COMPLETED' || status === 'NO_SHOW';
}

async function fetchBranches() {
 const res = await fetch('/api/branches', { cache: 'no-store', credentials: 'same-origin' });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Gagal memuatkan cawangan');
 return data as { branches: BranchOption[] };
}

function TimelineItem({
 label,
 value,
 active,
}: {
 label: string;
 value: string | null;
 active: boolean;
}) {
 return (
 <div className="flex gap-3">
 <div
 className={cn(
 'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
 active ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-muted bg-muted/40 text-muted-foreground')}
 >
 {active ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
 </div>
 <div>
 <p className="font-medium">{label}</p>
 <p className="text-xs text-muted-foreground">{formatDateTime(value)}</p>
 </div>
 </div>);
}

export function BookingDetailPage({ bookingId }: { bookingId: string }) {
 const [booking, setBooking] = useState<BookingRecord | null>(null);
 const [branches, setBranches] = useState<BranchOption[]>([]);
 const [form, setForm] = useState<EditFormState | null>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 const loadData = useCallback(async () => {
 setLoading(true);
 try {
 const [bookingData, branchData] = await Promise.all([
 fetchBooking(bookingId),
 fetchBranches(),
 ]);
 setBooking(bookingData.booking);
 setForm(formFromBooking(bookingData.booking));
 setBranches(branchData.branches);
 } catch (error) {
 toast.error(error instanceof Error ? error.message : 'Gagal memuatkan jadual operasi');
 } finally {
 setLoading(false);
 }
 }, [bookingId]);

 useEffect(() => {
 const timer = window.setTimeout(() => {
 void loadData();
 }, 0);
 return () => window.clearTimeout(timer);
 }, [loadData]);

 const canEdit = booking ? !isTerminal(booking.status) : false;
 const branchLabel = useMemo(() => {
 if (!booking?.branch) return 'Tiada cawangan';
 return `${booking.branch.branch_code} - ${booking.branch.branch_name}`;
 }, [booking]);

 async function saveEdit() {
 if (!booking || !form) return;
 const payload = payloadFromForm(form);
 if (!payload.title) {
 toast.error('Tajuk jadual operasi wajib diisi');
 return;
 }
 if (!payload.scheduled_date) {
 toast.error('Tarikh jadual operasi wajib diisi');
 return;
 }

 setSaving(true);
 try {
 const { booking: next } = await updateBooking(booking.id, payload);
 setBooking(next);
 setForm(formFromBooking(next));
 toast.success('Jadual operasi dikemaskini');
 } catch (error) {
 toast.error(error instanceof Error ? error.message : 'Gagal simpan jadual operasi');
 } finally {
 setSaving(false);
 }
 }

 async function updateStatus(status: BookingStatus) {
 if (!booking) return;
 setSaving(true);
 try {
 const { booking: next } = await updateBooking(booking.id, { status });
 setBooking(next);
 setForm(formFromBooking(next));
 toast.success(`Status jadual: ${STATUS_LABEL[status]}`);
 } catch (error) {
 toast.error(error instanceof Error ? error.message : 'Gagal kemas kini status');
 } finally {
 setSaving(false);
 }
 }

 if (loading) {
 return (
 <ModuleLayout>
 <ModuleLoading />
 </ModuleLayout>);
 }

 if (!booking || !form) {
 return (
 <ModuleLayout>
 <EmptyState
 icon={CalendarCheck2}
 title="Jadual operasi tidak dijumpai"
 description="Rekod mungkin tiada, sudah tidak terlihat oleh skop anda, atau sesi telah tamat."
 action={
 <Button render={<Link href="/bookings" />}>
 Kembali
 </Button>
 }
 />
 </ModuleLayout>);
 }

 return (
 <ModuleLayout>
 <ModuleHeader
 title={booking.title}
 description={`${booking.booking_number} - ${formatDate(booking.scheduled_date)} - ${branchLabel}`}
 icon={CalendarCheck2}
 actions={
 <>
 <Button variant="outline" render={<Link href="/bookings" />}>
 <ArrowLeft className="mr-2 h-4 w-4" />
 Senarai
 </Button>
 <Button variant="outline" onClick={loadData} disabled={loading || saving}>
 <RefreshCw className="mr-2 h-4 w-4" />
 Segar Semula
 </Button>
 </>
 }
 badges={
 <>
 <Badge variant={statusVariant(booking.status)}>{STATUS_LABEL[booking.status]}</Badge>
 <Badge variant={booking.priority === 'URGENT' ? 'destructive' : 'outline'}>
 {PRIORITY_LABEL[booking.priority]}
 </Badge>
 </>
 }
 />

 <KpiGrid cols={4}>
 <KpiCard title="Status" value={STATUS_LABEL[booking.status]} description="Keadaan jadual terkini" icon={ClipboardPenLine} />
 <KpiCard title="Tarikh" value={formatDate(booking.scheduled_date)} description={booking.scheduled_time?.slice(0, 5) ?? 'Masa belum ditetapkan'} icon={CalendarCheck2} />
 <KpiCard title="Pelanggan" value={booking.customer_name ?? '-'} description={booking.customer_phone ?? 'Telefon belum diisi'} icon={UserRound} />
 <KpiCard title="Notifikasi" value={booking.priority === 'URGENT' ? 'Segera' : 'Normal'} description="Status berubah akan dipaparkan melalui toast" icon={BellRing} variant={booking.priority === 'URGENT' ? 'danger' : 'default'} />
 </KpiGrid>

 <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
 <SectionCard
 title="Maklumat jadual operasi"
 description={canEdit ? 'Kemaskini rekod sebelum jadual ditutup.' : 'Rekod terminal tidak boleh diedit dari aliran ini.'}
 action={
 canEdit ? (
 <PrimaryActionButton onClick={saveEdit} disabled={saving}>
 <Save className="mr-2 h-4 w-4" />
 {saving ? 'Menyimpan...' : 'Simpan'}
 </PrimaryActionButton>
 ) : (
 <Badge variant="secondary">Paparan sahaja</Badge>
 )
 }
 >
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5 sm:col-span-2">
 <Label>Tajuk</Label>
 <Input
 value={form.title}
 onChange={(event) => setForm((prev) => prev ? { ...prev, title: event.target.value } : prev)}
 disabled={!canEdit || saving}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Cawangan</Label>
 <Select
 value={form.branch_id}
 onValueChange={(value) => setForm((prev) => prev ? { ...prev, branch_id: String(value) } : prev)}
 disabled={!canEdit || saving}
 >
 <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
 onValueChange={(value) => setForm((prev) => prev ? { ...prev, booking_type: value as BookingType } : prev)}
 disabled={!canEdit || saving}
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
 onChange={(event) => setForm((prev) => prev ? { ...prev, scheduled_date: event.target.value } : prev)}
 disabled={!canEdit || saving}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Masa</Label>
 <Input
 type="time"
 value={form.scheduled_time}
 onChange={(event) => setForm((prev) => prev ? { ...prev, scheduled_time: event.target.value } : prev)}
 disabled={!canEdit || saving}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Keutamaan</Label>
 <Select
 value={form.priority}
 onValueChange={(value) => setForm((prev) => prev ? { ...prev, priority: value as BookingPriority } : prev)}
 disabled={!canEdit || saving}
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
 onChange={(event) => setForm((prev) => prev ? { ...prev, expected_pax: event.target.value } : prev)}
 disabled={!canEdit || saving}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Nama pelanggan</Label>
 <Input
 value={form.customer_name}
 onChange={(event) => setForm((prev) => prev ? { ...prev, customer_name: event.target.value } : prev)}
 disabled={!canEdit || saving}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Telefon</Label>
 <Input
 value={form.customer_phone}
 onChange={(event) => setForm((prev) => prev ? { ...prev, customer_phone: event.target.value } : prev)}
 disabled={!canEdit || saving}
 />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label>Email pelanggan</Label>
 <Input
 type="email"
 value={form.customer_email}
 onChange={(event) => setForm((prev) => prev ? { ...prev, customer_email: event.target.value } : prev)}
 disabled={!canEdit || saving}
 />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label>Penerangan</Label>
 <Textarea
 rows={4}
 value={form.description}
 onChange={(event) => setForm((prev) => prev ? { ...prev, description: event.target.value } : prev)}
 disabled={!canEdit || saving}
 />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label>Nota dalaman</Label>
 <Textarea
 rows={4}
 value={form.notes}
 onChange={(event) => setForm((prev) => prev ? { ...prev, notes: event.target.value } : prev)}
 disabled={!canEdit || saving}
 />
 </div>
 </div>
 </SectionCard>

 <div className="space-y-4">
 <SectionCard title="Tindakan status" description="Batal digunakan sebagai arkib yang selamat untuk audit.">
 <div className="grid gap-2">
 <Button
 variant="outline"
 onClick={() => updateStatus('CONFIRMED')}
 disabled={saving || booking.status !== 'PENDING'}
 >
 <CheckCircle2 className="mr-2 h-4 w-4" />
 Sahkan
 </Button>
 <Button
 variant="outline"
 onClick={() => updateStatus('COMPLETED')}
 disabled={saving || !['PENDING', 'CONFIRMED'].includes(booking.status)}
 >
 <CheckCircle2 className="mr-2 h-4 w-4" />
 Selesai
 </Button>
 <Button
 variant="outline"
 onClick={() => updateStatus('NO_SHOW')}
 disabled={saving || !['PENDING', 'CONFIRMED'].includes(booking.status)}
 >
 <XCircle className="mr-2 h-4 w-4" />
 Tidak hadir
 </Button>
 <Button
 variant="destructive"
 onClick={() => updateStatus('CANCELLED')}
 disabled={saving || isTerminal(booking.status)}
 >
 <XCircle className="mr-2 h-4 w-4" />
 Batal
 </Button>
 </div>
 <p className="mt-3 text-xs text-muted-foreground">
 Delete fizikal tidak dibina supaya rekod operasi kekal boleh diaudit.
 </p>
 </SectionCard>

 <SectionCard title="Timeline status">
 <div className="space-y-4">
 <TimelineItem label="Dicipta" value={booking.created_at} active />
 <TimelineItem label="Disahkan" value={booking.confirmed_at} active={Boolean(booking.confirmed_at)} />
 <TimelineItem label="Selesai" value={booking.completed_at} active={Boolean(booking.completed_at)} />
 <TimelineItem label="Dibatalkan" value={booking.cancelled_at} active={Boolean(booking.cancelled_at)} />
 </div>
 </SectionCard>
 </div>
 </div>
 </ModuleLayout>);
}
