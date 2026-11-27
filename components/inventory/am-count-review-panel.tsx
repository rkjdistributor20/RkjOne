'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { fetchPendingInventoryCounts, reviewInventoryCount } from '@/lib/inventory/api';
import type { PendingInventoryCount } from '@/lib/inventory/types';

export function AmCountReviewPanel({ locationId, onReviewed }: { locationId: string; onReviewed: () => void }) {
 const [counts, setCounts] = useState<PendingInventoryCount[] | null>(null);
 const [loadError, setLoadError] = useState('');
 const [decisionError, setDecisionError] = useState('');
 const [selection, setSelection] = useState<{ id: string; action: 'APPROVE' | 'REJECT' } | null>(null);
 const [reason, setReason] = useState('');
 const [saving, setSaving] = useState(false);

 const load = useCallback(async () => {
  try {
   const response = await fetchPendingInventoryCounts(locationId);
   setCounts(response.counts);
   setLoadError('');
  } catch (err) {
   setLoadError(err instanceof Error ? err.message : 'Gagal memuatkan kiraan stok');
  }
 }, [locationId]);

 useEffect(() => { void load(); }, [load]);

 async function decide() {
  if (!selection || saving || (selection.action === 'REJECT' && !reason.trim())) return;
  setSaving(true);
  setDecisionError('');
  try {
   await reviewInventoryCount(selection.id, selection.action, reason.trim());
   toast.success(selection.action === 'APPROVE' ? 'Kiraan stok diluluskan' : 'Kiraan stok ditolak; notifikasi dihantar');
   onReviewed();
   setSelection(null);
   await load();
  } catch (err) {
   setDecisionError(err instanceof Error ? err.message : 'Gagal memutuskan kiraan stok');
   await load();
  } finally {
   setSaving(false);
  }
 }

 if (loadError) return <div role="alert" className="space-y-2">
  <p>{loadError}</p><Button variant="outline" onClick={() => void load()}>Cuba semula</Button>
 </div>;
 if (!counts) return <p role="status">Memuatkan kiraan stok…</p>;

 return <div className="space-y-3">
  <p className="text-sm text-muted-foreground">
   Semak versi kiraan sebelum memutuskan. Kelulusan menyelaraskan perbezaan kiraan tanpa menimpa pergerakan stok selepas kiraan.
  </p>
  <Button variant="outline" size="sm" disabled={saving} onClick={() => void load()}>Muat semula</Button>
  {decisionError && <p role="alert" className="text-sm text-destructive">{decisionError}</p>}
  {!counts.length && <p className="text-sm">Tiada kiraan stok menunggu semakan di kiosk ini.</p>}
  {counts.map((count) => <Card key={count.id}>
   <CardHeader className="pb-2">
    <CardTitle className="text-base">{count.count_number}</CardTitle>
    <p className="text-sm text-muted-foreground">
     {count.counter?.full_name ?? 'Penghantar kiraan'} · Dihantar {new Date(count.created_at).toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}
    </p>
    {count.captured_at && <p className="text-sm text-muted-foreground">
     Snapshot {new Date(count.captured_at).toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}
    </p>}
   </CardHeader>
   <CardContent className="space-y-3 text-sm">
    {count.notes && <p>{count.notes}</p>}
    <div className="space-y-1 text-xs text-muted-foreground">
     {[...new Set(count.items.map((item) => item.stock_item_id))].map((itemId) => {
      const lines = count.items.filter((item) => item.stock_item_id === itemId);
      const baseline = lines.some((item) => item.system_quantity === null) ? null
       : lines.reduce((total, item) => total + Number(item.system_quantity), 0);
      const counted = lines.reduce((total, item) => total + Number(item.counted_quantity), 0);
      return <p key={itemId}>{lines[0].stock_item?.name ?? itemId}: {count.captured_at ? 'baki snapshot' : 'baki rujukan'} {baseline ?? 'tidak tersedia'}, jumlah dikira {counted} {lines[0].unit}</p>;
     })}
    </div>
    {count.items.map((item, index) => <p key={`${item.stock_item_id}-${index}`}>
     {item.stock_item?.name ?? item.stock_item_id}{item.production_date ? ` (${item.production_date})` : ''}:
     {' '}{item.counted_quantity} {item.unit} dikira
    </p>)}
    <div className="flex flex-wrap gap-2">
     <Button size="sm" variant="outline" disabled={saving || !count.items.length}
      onClick={() => { setSelection({ id: count.id, action: 'APPROVE' }); setReason(''); setDecisionError(''); }}>
      Luluskan
     </Button>
     <Button size="sm" variant="outline" disabled={saving}
      onClick={() => { setSelection({ id: count.id, action: 'REJECT' }); setReason(''); setDecisionError(''); }}>
      Tolak
     </Button>
    </div>
    {selection?.id === count.id && <div className="space-y-2 rounded-md border p-3">
     {selection.action === 'REJECT'
      ? <label className="block space-y-1"><span>Sebab penolakan (wajib)</span>
       <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} disabled={saving} />
      </label>
      : <p>Pos kelulusan untuk versi {count.count_number}?</p>}
     <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={saving || (selection.action === 'REJECT' && !reason.trim())}
       onClick={() => void decide()}>{selection.action === 'REJECT' ? 'Sahkan tolak' : 'Sahkan lulus'}</Button>
      <Button size="sm" variant="outline" disabled={saving} onClick={() => setSelection(null)}>Batal</Button>
     </div>
    </div>}
   </CardContent>
  </Card>)}
 </div>;
}
