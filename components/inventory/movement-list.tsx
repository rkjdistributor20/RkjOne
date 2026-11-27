'use client';

import { useEffect, useState } from 'react';
import type { StockMovementRow } from '@/lib/inventory/types';
import { fetchMovements } from '@/lib/inventory/api';
import { MOVEMENT_TYPE_LABELS, labelFor } from '@/lib/ui/labels';
import { displayLabel } from '@/lib/ui/select-utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MovementListProps {
 movements: StockMovementRow[];
}

const TYPE_COLORS: Record<string, string> = {
 RECEIVE: 'bg-green-100 text-green-800',
 TRANSFER_IN: 'bg-blue-100 text-blue-800',
 TRANSFER_OUT: 'bg-orange-100 text-orange-800',
 ADJUSTMENT: 'bg-yellow-100 text-yellow-800',
 COUNT: 'bg-purple-100 text-purple-800',
 WRITE_OFF: 'bg-red-100 text-red-800',
 SALE_DEDUCT: 'bg-gray-100 text-gray-800',
};

export function MovementList({ movements }: MovementListProps) {
 if (!movements.length) {
 return (
 <p className="py-8 text-center text-sm text-muted-foreground">
 Tiada pergerakan stok direkodkan
 </p>);
 }

 return (
 <ScrollArea className="h-[400px]">
 <div className="space-y-2">
 {movements.map((m) => (
 <div key={m.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
 <div>
 <p className="font-medium">
 {displayLabel(
 m.stock_item?.name,
 m.stock_item?.item_code ?? 'Item stok')}
 </p>
 <p className="text-xs text-muted-foreground">
 {new Date(m.created_at).toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}
 {m.created_by_profile?.full_name &&
 ` - ${m.created_by_profile.full_name}`}
 </p>
 {m.balance_before != null && m.balance_after != null &&
 <p className="text-xs text-muted-foreground">Baki: {m.balance_before} → {m.balance_after} {m.unit}</p>}
 {m.notes && <p className="max-w-md break-words text-xs text-muted-foreground">{m.notes}</p>}
 </div>
 <div className="text-right">
 <p className={`font-semibold ${Number(m.quantity) < 0 ? 'text-red-600' : 'text-green-600'}`}>
 {Number(m.quantity) > 0 ? '+' : ''}
 {Number(m.quantity).toLocaleString()} {m.unit}
 </p>
 <Badge className={TYPE_COLORS[m.movement_type] ?? ''}>
 {labelFor(MOVEMENT_TYPE_LABELS, m.movement_type, m.movement_type.replace('_', ' '))}
 </Badge>
 </div>
 </div>))}
 </div>
 </ScrollArea>);
}

export function AmMovementHistory({ locationId }: { locationId: string }) {
 const [filters, setFilters] = useState<{ kind?: string; from?: string; to?: string }>({});
 const [rows, setRows] = useState<StockMovementRow[] | null>(null);
 const [error, setError] = useState('');
 useEffect(() => {
 let active = true;
 fetchMovements(locationId, 100, filters).then(({ movements }) => {
 if (active) setRows(movements);
 }).catch((err: unknown) => {
 if (active) setError(err instanceof Error ? err.message : 'Gagal memuatkan pergerakan stok');
 });
 return () => { active = false; };
 }, [locationId, filters]);

 return <div className="space-y-4">
 <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
 event.preventDefault();
 const form = new FormData(event.currentTarget);
 setError('');
 setRows(null);
 setFilters({ kind: String(form.get('kind') || ''), from: String(form.get('from') || ''), to: String(form.get('to') || '') });
 }}>
 <label className="space-y-1 text-sm">
 <span>Jenis pergerakan</span>
 <select name="kind" className="block h-9 rounded-md border bg-background px-2">
 <option value="">Semua</option>
 <option value="in">Stok masuk</option>
 <option value="out">Stok keluar</option>
 <option value="adjustment">Pelarasan dan kiraan</option>
 <option value="transfer">Pindahan</option>
 </select>
 </label>
 <label className="space-y-1 text-sm"><span>Dari (MYT)</span><Input name="from" type="date" /></label>
 <label className="space-y-1 text-sm"><span>Hingga (MYT)</span><Input name="to" type="date" /></label>
 <Button type="submit" size="sm" variant="outline">Tapis</Button>
 </form>
 {error ? <p role="alert" className="text-sm text-destructive">{error}</p>
 : rows ? <>
  {rows.length === 100 && <p className="text-xs text-muted-foreground">100 rekod terkini dipaparkan. Kecilkan julat tarikh untuk melihat rekod terdahulu.</p>}
  <MovementList movements={rows} />
 </> : <p role="status" className="text-sm text-muted-foreground">Memuatkan pergerakan stok…</p>}
 </div>;
}
