'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { fetchStockItems as fetchInventoryStockItems } from '@/lib/inventory/api';
import { submitPosRejectStock } from '@/lib/pos/api';
import type { StockItemOption } from '@/lib/inventory/types';
import type { ExpiredRejectPrefill } from '@/components/pos/expired-stock-alert';
import {
 RKJ_STOCK_CATALOG,
 HQ_STOCK_ITEM_CODES,
} from '@/lib/stock/catalog';
import { ROTI_SHELF_LIFE_DAYS } from '@/lib/stock/expiry';
import { StockLineForm } from '@/components/inventory/stock-line-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const REJECT_REASONS = [
 'Tamat tempoh melebihi 5 hari',
 'Dimakan / tercemar',
 'Roti rosak / keras',
 'Kaya / butter basi',
 'Plastik rosak / koyak',
 'Tamat tempoh jual',
 'Pecahan semasa handling',
 'Salah jumlah selepas kiraan fizikal',
] as const;

interface RejectStockPanelProps {
 branchId: string;
 onSuccess?: () => void;
 prefill?: ExpiredRejectPrefill[];
}

export function RejectStockPanel({ branchId, onSuccess, prefill }: RejectStockPanelProps) {
 const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
 const [loading, setLoading] = useState(true);
 const [presetReason, setPresetReason] = useState<string>(prefill?.[0]?.reason ?? '');

 useEffect(() => {
 fetchInventoryStockItems().then(({ items }) => {
 const codes = new Set<string>(HQ_STOCK_ITEM_CODES);
 setStockItems(items.filter((i) => codes.has(i.item_code)));
 }).catch(() => toast.error('Gagal memuatkan senarai stok')).finally(() => setLoading(false));
 }, []);

 useEffect(() => {
 if (prefill?.[0]?.reason) setPresetReason(prefill[0].reason);
 }, [prefill]);

 const rotiItems = RKJ_STOCK_CATALOG.filter((i) => i.category === 'Roti');
 const bahanItems = RKJ_STOCK_CATALOG.filter((i) => i.category === 'Bahan');
 const plastikItems = RKJ_STOCK_CATALOG.filter((i) => i.category === 'Packaging');

 async function handleReject(
 reason: string,
 items: Array<{ stock_item_id: string; quantity: number; unit?: string; production_date?: string; note?: string }>) {
 await submitPosRejectStock(branchId, reason, items);
 toast.success('Reject stok direkod - baki kiosk dikemas kini');
 setPresetReason('');
 onSuccess?.();
 }

 return (
 <div className="mx-auto max-w-2xl space-y-4">
 <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
 <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
 <div>
 <p className="font-semibold">Reject stok (staf kaunter)</p>
 <p className="mt-1 text-amber-900/90">
 Masukkan dalam unit operasi kiosk - sistem auto tukar ke unit asas sebelum
 tolak baki. Untuk roti/kaya, pilih tarikh production supaya batch yang betul direkod.
 Roti melebihi {ROTI_SHELF_LIFE_DAYS} hari wajib diasingkan dan reject.
 </p>
 </div>
 </div>

 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-base">Panduan unit reject</CardTitle>
 </CardHeader>
 <CardContent className="space-y-3 text-sm">
 <div>
 <p className="mb-1.5 font-medium text-muted-foreground">
 Roti (4 jenis) - shelf life {ROTI_SHELF_LIFE_DAYS} hari
 </p>
 <div className="flex flex-wrap gap-1.5">
 {rotiItems.map((i) => (
 <Badge key={i.item_code} variant="secondary" className="font-normal">
 {i.name}: masuk <strong className="mx-0.5">bag</strong> - {i.conversion_text}
 </Badge>))}
 </div>
 </div>
 <div>
 <p className="mb-1.5 font-medium text-muted-foreground">Bahan</p>
 <div className="flex flex-wrap gap-1.5">
 {bahanItems.map((i) => (
 <Badge key={i.item_code} variant="secondary" className="font-normal">
 {i.name}: masuk <strong className="mx-0.5">tong</strong> - {i.conversion_text}
 </Badge>))}
 </div>
 </div>
 <div>
 <p className="mb-1.5 font-medium text-muted-foreground">Plastik</p>
 <div className="flex flex-wrap gap-1.5">
 {plastikItems.map((i) => (
 <Badge key={i.item_code} variant="secondary" className="font-normal">
 {i.name}: masuk <strong className="mx-0.5">bag</strong> - {i.conversion_text}
 </Badge>))}
 </div>
 </div>
 <p className="text-xs text-muted-foreground">
 Contoh: reject 0.5 tong Kaya ke 2,500 g ditolak - reject 2 bag Plastic M ke 200 pcs
 ditolak - reject 1 bag Roti Kaya ke 20 pcs ditolak
 </p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle className="text-base">Lapor Reject Stok</CardTitle>
 </CardHeader>
 <CardContent>
 {loading ? (
 <p className="text-sm text-muted-foreground">Memuatkan item stok...</p>) : stockItems.length === 0 ? (
 <p className="text-sm text-muted-foreground">Tiada item stok dijumpai.</p>) : (
 <>
 <div className="mb-4 space-y-2">
 <p className="text-xs font-medium text-muted-foreground">
 Sebab pantas (pilihan)
 </p>
 <div className="flex flex-wrap gap-1.5">
 {REJECT_REASONS.map((r) => (
 <button
 key={r}
 type="button"
 onClick={() => setPresetReason(r)}
 className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
 presetReason === r
 ? 'border-amber-500 bg-amber-100 text-amber-950'
 : 'bg-background hover:bg-muted'
 }`}
 >
 {r}
 </button>))}
 </div>
 </div>
 <StockLineForm
 mode="writeoff"
 stockItems={stockItems}
 rejectMode
 defaultReason={presetReason || prefill?.[0]?.reason}
 prefillLines={prefill?.map((p) => ({
 stock_item_id: p.stock_item_id,
 quantity: p.quantity,
 production_date: p.production_date,
 note: p.reason,
 }))}
 prefillUseBaseUnit={Boolean(prefill?.length)}
 requireProductionDateForTrackedItems
 onSubmitWriteOff={handleReject}
 />
 </>)}
 </CardContent>
 </Card>
 </div>);
}
