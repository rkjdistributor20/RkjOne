'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
 AlertTriangle,
 ClipboardCheck,
 Factory,
 PackageCheck,
 PackageOpen,
 RefreshCw,
 Save,
 Scale,
} from 'lucide-react';
import {
 fetchFactoryRawMaterials,
 recordFactoryRawMaterialUsage,
} from '@/lib/production/api';
import type { FactoryRawMaterialDashboard } from '@/lib/production/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { KpiCard, KpiGrid, SectionCard } from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';

type QtyDraft = Record<string, { received_qty: string; used_qty: string }>;

function todayIso() {
 return new Date().toISOString().slice(0, 10);
}

function n(value: number | string | null | undefined) {
 const num = Number(value ?? 0);
 return Number.isInteger(num) ? num.toLocaleString('ms-MY') : num.toLocaleString('ms-MY', { maximumFractionDigits: 2 });
}

function statusBadge(status: string) {
 if (status === 'CRITICAL') return <Badge variant="destructive">Kritikal</Badge>;
 if (status === 'LOW') return <Badge className="bg-amber-500 text-amber-950">Rendah</Badge>;
 return <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">OK</Badge>;
}

export function FactoryRawMaterialDashboard() {
 const [data, setData] = useState<FactoryRawMaterialDashboard | null>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [productionDate, setProductionDate] = useState(todayIso);
 const [notes, setNotes] = useState('');
 const [draft, setDraft] = useState<QtyDraft>({});

 const load = useCallback(async () => {
 setLoading(true);
 try {
 setData(await fetchFactoryRawMaterials());
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan stok bahan mentah');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 load();
 }, [load]);

 const alertBalances = useMemo(
 () => (data?.balances ?? []).filter((b) => b.status !== 'OK'),
 [data?.balances]);

 function updateDraft(stockItemId: string, key: 'received_qty' | 'used_qty', value: string) {
 setDraft((prev) => ({...prev,
 [stockItemId]: {
 received_qty: prev[stockItemId]?.received_qty ?? '',
 used_qty: prev[stockItemId]?.used_qty ?? '',
 [key]: value,
 },
 }));
 }

 async function handleSubmit() {
 const items = Object.entries(draft).map(([stock_item_id, value]) => ({
 stock_item_id,
 received_qty: Number(value.received_qty || 0),
 used_qty: Number(value.used_qty || 0),
 })).filter((item) => item.received_qty > 0 || item.used_qty > 0);

 if (items.length === 0) {
 toast.error('Masukkan sekurang-kurangnya satu rekod masuk atau guna');
 return;
 }

 setSaving(true);
 try {
 await recordFactoryRawMaterialUsage({
 production_date: productionDate,
 items,
 notes: notes || undefined,
 });
 toast.success('Stok bahan mentah dikemaskini');
 setDraft({});
 setNotes('');
 await load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan rekod bahan mentah');
 } finally {
 setSaving(false);
 }
 }

 if (loading) {
 return <p className="text-sm text-muted-foreground">Memuatkan dashboard bahan mentah...</p>;
 }

 if (!data) {
 return (
 <SectionCard title="Bahan Mentah Kilang">
 <p className="text-sm text-muted-foreground">Data bahan mentah belum tersedia.</p>
 </SectionCard>);
 }

 return (
 <div className="space-y-4">
 <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
 <p className="flex items-center gap-2 font-semibold">
 <Factory className="h-4 w-4" />
 Roti Kaya Junus Manufacturing Sdn Bhd - Stok Bahan Mentah Kilang
 </p>
 <p className="mt-1 text-emerald-900/80">
 Stok card Excel JAN-JUN 2026 telah dijadikan rekod sistem. Setiap rekod baru di sini
 disimpan bersama tarikh production dan staf yang merekod.
 </p>
 </div>

 <KpiGrid cols={4}>
 <KpiCard title="Bahan Aktif" value={data.summary.total_items} description={data.location?.name ?? 'Lokasi kilang'} icon={PackageOpen} />
 <KpiCard title="Stok Rendah" value={data.summary.low_count} icon={AlertTriangle} variant={data.summary.low_count > 0 ? 'warning' : 'success'} />
 <KpiCard title="Stok Kritikal" value={data.summary.critical_count} icon={AlertTriangle} variant={data.summary.critical_count > 0 ? 'danger' : 'success'} />
 <KpiCard title="Usage 14 Hari" value={n(data.summary.total_usage_14_days)} description={`Kemaskini akhir ${data.summary.latest_stock_card_date ?? '-'}`} icon={Scale} />
 </KpiGrid>

 <SectionCard
 title="Rekod Keluar Masuk Hari Production"
 description="Staf kilang rekod bahan masuk dan bahan digunakan. Sistem auto kira baki dan audit nama perekod."
 action={
 <Button type="button" variant="outline" size="sm" onClick={load}>
 <RefreshCw className="mr-1 h-4 w-4" /> Refresh
 </Button>
 }
 >
 <div className="grid gap-3 md:grid-cols-[220px_1fr]">
 <div className="space-y-2">
 <Label>Tarikh production</Label>
 <Input type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} />
 </div>
 <div className="space-y-2">
 <Label>Nota production</Label>
 <Textarea
 rows={2}
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 placeholder="Contoh: batch pagi, rekod oleh staf kilang, penggunaan untuk order HQ/ejen"
 />
 </div>
 </div>

 <div className="mt-4 overflow-hidden rounded-xl border">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Bahan</TableHead>
 <TableHead className="text-right">Baki Semasa</TableHead>
 <TableHead className="w-36">Masuk</TableHead>
 <TableHead className="w-36">Guna / Keluar</TableHead>
 <TableHead className="text-right">Status</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {data.balances.map((row) => (
 <TableRow key={row.stock_item_id}>
 <TableCell>
 <div className="font-medium">{row.stock_item.name}</div>
 <div className="text-xs text-muted-foreground">
 {row.stock_item.item_code}
 {row.stock_item.conversion_text ? ` - ${row.stock_item.conversion_text}` : ''}
 </div>
 </TableCell>
 <TableCell className="text-right font-semibold">
 {n(row.quantity)} {row.stock_item.storage_unit ?? row.unit}
 </TableCell>
 <TableCell>
 <Input
 type="number"
 min="0"
 step="0.01"
 value={draft[row.stock_item_id]?.received_qty ?? ''}
 onChange={(e) => updateDraft(row.stock_item_id, 'received_qty', e.target.value)}
 placeholder="0"
 />
 </TableCell>
 <TableCell>
 <Input
 type="number"
 min="0"
 step="0.01"
 value={draft[row.stock_item_id]?.used_qty ?? ''}
 onChange={(e) => updateDraft(row.stock_item_id, 'used_qty', e.target.value)}
 placeholder="0"
 />
 </TableCell>
 <TableCell className="text-right">{statusBadge(row.status)}</TableCell>
 </TableRow>))}
 </TableBody>
 </Table>
 </div>

 <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
 <p className="text-xs text-muted-foreground">
 Masuk menambah baki. Guna/Keluar menolak baki sebagai penggunaan production.
 </p>
 <Button type="button" className="bg-amber-500 hover:bg-amber-600" disabled={saving} onClick={handleSubmit}>
 <Save className="mr-1 h-4 w-4" />
 {saving ? 'Menyimpan...' : 'Simpan Rekod Stok'}
 </Button>
 </div>
 </SectionCard>

 <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
 <SectionCard title="Alert Bahan Mentah" description="Fokus bahan yang perlu dibeli atau disemak sebelum production.">
 {alertBalances.length === 0 ? (
 <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
 Semua bahan mentah berada pada paras selamat.
 </div>) : (
 <div className="space-y-2">
 {alertBalances.map((row) => (
 <div
 key={row.stock_item_id}
 className={cn(
 'rounded-xl border p-3 text-sm',
 row.status === 'CRITICAL' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50')}
 >
 <div className="flex items-center justify-between gap-3">
 <p className="font-semibold">{row.stock_item.name}</p>
 {statusBadge(row.status)}
 </div>
 <p className="mt-1 text-muted-foreground">
 Baki {n(row.quantity)} {row.stock_item.storage_unit ?? row.unit} - minimum {n(row.stock_item.min_threshold)} / kritikal {n(row.stock_item.critical_threshold)}
 </p>
 </div>))}
 </div>)}
 </SectionCard>

 <SectionCard title="Log Stok Card Terkini" description="Sejarah masuk, keluar dan baki daripada Excel serta rekod baru sistem.">
 <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
 {data.cards.slice(0, 30).map((card) => (
 <div key={card.id} className="rounded-xl border bg-background p-3 text-sm">
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div>
 <p className="font-semibold">{card.stock_item.name}</p>
 <p className="text-xs text-muted-foreground">
 {card.stock_date} - {card.source_month ?? 'Sistem'}
 {card.recorded_by_profile?.full_name ? ` - ${card.recorded_by_profile.full_name}` : ''}
 </p>
 </div>
 <Badge variant="outline">{card.unit_label}</Badge>
 </div>
 <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
 <div className="rounded-lg bg-muted/40 p-2">
 <p className="text-muted-foreground">Masuk</p>
 <p className="font-semibold">{n(card.stock_in_qty)}</p>
 </div>
 <div className="rounded-lg bg-muted/40 p-2">
 <p className="text-muted-foreground">Keluar/Guna</p>
 <p className="font-semibold">{n(card.stock_out_qty)}</p>
 </div>
 <div className="rounded-lg bg-muted/40 p-2">
 <p className="text-muted-foreground">Baki</p>
 <p className="font-semibold">{n(card.balance_qty)}</p>
 </div>
 </div>
 </div>))}
 </div>
 </SectionCard>
 </div>
 </div>);
}
