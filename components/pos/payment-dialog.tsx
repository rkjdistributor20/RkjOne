'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Banknote, QrCode, Split, Delete, CheckCircle2 } from 'lucide-react';
import { createSale } from '@/lib/pos/api';
import {
 enqueueOfflineSale,
 getOfflineQueue,
} from '@/lib/pos/offline-queue';
import { formatRM, generateOfflineId } from '@/lib/pos/utils';
import { usePosStore } from '@/stores/pos-store';
import type { PaymentMethod, SaleResult } from '@/lib/pos/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Dialog,
 DialogContent,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface PaymentDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 branchId: string;
 onSuccess: (receipt: SaleResult) => void;
}

function buildQuickAmounts(total: number): number[] {
 if (total <= 0) return [];
 const amounts = new Set<number>([total]);
 const round5 = Math.ceil(total / 5) * 5;
 const round10 = Math.ceil(total / 10) * 10;
 if (round5 > total) amounts.add(round5);
 if (round10 > total) amounts.add(round10);
 for (const bill of [10, 20, 50, 100]) {
 if (bill >= total) amounts.add(bill);
 }
 return [...amounts].sort((a, b) => a - b).slice(0, 6);
}

const NUMPAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '.', '0'] as const;

function MethodButton({
 active,
 onClick,
 icon: Icon,
 label,
}: {
 active: boolean;
 onClick: () => void;
 icon: typeof Banknote;
 label: string;
}) {
 return (
 <button
 type="button"
 onClick={onClick}
 className={cn(
 'flex flex-col items-center justify-center gap-1 rounded-xl border-2 py-3 text-sm font-semibold transition-all',
 active
 ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-sm'
 : 'border-border bg-background text-muted-foreground hover:bg-muted/50')}
 >
 <Icon className={cn('h-5 w-5', active && 'text-amber-600')} />
 {label}
 </button>);
}

export function PaymentDialog({
 open,
 onOpenChange,
 branchId,
 onSuccess,
}: PaymentDialogProps) {
 const cart = usePosStore((s) => s.cart);
 const shift = usePosStore((s) => s.shift);
 const clearCart = usePosStore((s) => s.clearCart);
 const isOnline = usePosStore((s) => s.isOnline);
 const setOfflineCount = usePosStore((s) => s.setOfflineCount);

 const total = cart.reduce(
 (sum, item) => sum + item.price * item.quantity,
 0);
 const [method, setMethod] = useState<PaymentMethod>('CASH');
 const [cashTendered, setCashTendered] = useState('');
 const [qrAmount, setQrAmount] = useState('');
 const [loading, setLoading] = useState(false);

 const quickAmounts = useMemo(() => buildQuickAmounts(total), [total]);

 useEffect(() => {
 if (open) {
 setMethod('CASH');
 const amount = total > 0 ? total.toFixed(2) : '';
 setCashTendered(amount);
 setQrAmount(amount);
 }
 }, [open, total]);

 const cashNum = Number(cashTendered) || 0;
 const qrNum = Number(qrAmount) || 0;

 const changeAmount =
 method === 'CASH'
 ? Math.max(cashNum - total, 0)
 : method === 'MIXED'
 ? Math.max(cashNum ?? Math.max(total - qrNum, 0), 0)
 : 0;

 const paidAmount =
 method === 'CASH' ? cashNum : method === 'QR' ? qrNum : cashNum + qrNum;

 const shortfall = Math.max(total - paidAmount, 0);
 const canPay = total > 0 && paidAmount >= total && shift && cart.length > 0;

 const appendNumpad = useCallback((key: string) => {
 setCashTendered((prev) => {
 if (key === 'C') return '';
 if (key === '.' && prev.includes('.')) return prev;
 if (prev === '' && key === '.') return '0.';
 if (prev === '0' && key !== '.') return key;
 return prev + key;
 });
 }, []);

 function buildSalePayload(methodOverride: PaymentMethod = method) {
 if (!shift) return null;
 const items = cart.map((c) => ({
 product_id: c.productId,
 quantity: c.quantity,
 }));

 return {
 shiftId: shift.id,
 branchId,
 items,
 payment_method: methodOverride,
 cash_amount: methodOverride === 'QR' ? 0 : cashNum,
 qr_amount: methodOverride === 'CASH' ? 0 : qrNum,
 };
 }

 async function handlePay() {
 if (!shift || !canPay) return;
 const payload = buildSalePayload();
 if (!payload) return;

 if (!isOnline && method !== 'CASH') {
 toast.error('QR manual perlu online untuk rekod audit dan pengesahan kemudian.');
 return;
 }

 setLoading(true);
 const items = payload.items;

 try {
 if (!isOnline) {
 const offlineId = generateOfflineId();
 enqueueOfflineSale({
 offlineId,
 branchId,
 shiftId: shift.id,
 items,
 payment_method: method,
 cash_amount: payload.cash_amount,
 qr_amount: payload.qr_amount,
 created_at: new Date().toISOString(),
 });
 setOfflineCount(getOfflineQueue().length);

 const offlineReceipt: SaleResult = {
 transaction_id: offlineId,
 transaction_number: `OFFLINE-${offlineId.slice(-8)}`,
 receipt_number: `RC-OFF-${Date.now()}`,
 subtotal: total,
 discount: 0,
 total,
 change_amount: changeAmount,
 items: cart.map((c) => ({
 name: c.name,
 sku: c.sku,
 quantity: c.quantity,
 unit_price: c.price,
 line_total: c.price * c.quantity,
 })),
 };

 toast.warning('Disimpan luar talian - akan disegerak bila online');
 clearCart();
 onOpenChange(false);
 onSuccess(offlineReceipt);
 return;
 }

 const { result } = await createSale(payload);
 if (method === 'QR' || (method === 'MIXED' && payload.qr_amount > 0)) {
 toast.success('Jualan direkod. QR perlu pengesahan manual kewangan.');
 } else {
 toast.success('Bayaran berjaya - stok ditolak');
 }
 clearCart();
 onOpenChange(false);
 onSuccess(result);
 } catch (err) {
 const msg = err instanceof Error ? err.message : 'Bayaran gagal';
 toast.error(msg.includes('Stok') ? msg : `Bayaran gagal: ${msg}`);
 } finally {
 setLoading(false);
 }
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
 <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-5 py-5 text-white">
 <p className="text-xs font-medium uppercase tracking-wider text-white/80">
 Kounter Tunai
 </p>
 <p className="mt-1 text-sm text-white/90">Jumlah perlu bayar</p>
 <p className="mt-0.5 text-4xl font-bold tabular-nums tracking-tight">
 {formatRM(total)}
 </p>
 {cart.length > 0 && (
 <p className="mt-2 truncate text-xs text-white/75">
 {cart.slice(0, 2).map((c) => `${c.quantity} x ${c.name}`).join(' - ')}
 {cart.length > 2 ? ` - +${cart.length ?? 2} lagi` : ''}
 </p>)}
 </div>

 <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
 <div className="grid grid-cols-3 gap-2">
 <MethodButton
 active={method === 'CASH'}
 onClick={() => {
 setMethod('CASH');
 setCashTendered(total > 0 ? total.toFixed(2) : '');
 }}
 icon={Banknote}
 label="Tunai"
 />
 <MethodButton
 active={method === 'QR'}
 onClick={() => {
 setMethod('QR');
 setQrAmount(total > 0 ? total.toFixed(2) : '');
 }}
 icon={QrCode}
 label="QR Manual"
 />
 <MethodButton
 active={method === 'MIXED'}
 onClick={() => {
 setMethod('MIXED');
 }}
 icon={Split}
 label="Campur"
 />
 </div>

 {method === 'CASH' && (
 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Tunai diterima</Label>
 <Input
 type="text"
 inputMode="decimal"
 className="h-14 border-2 text-center text-2xl font-bold tabular-nums"
 value={cashTendered}
 onChange={(e) => setCashTendered(e.target.value.replace(/[^\d.]/g, ''))}
 autoFocus
 />
 </div>

 <div className="flex flex-wrap gap-2">
 {quickAmounts.map((amt) => (
 <Button
 key={amt}
 type="button"
 variant={Math.abs(amt - total) < 0.01 ? 'default' : 'outline'}
 className={cn(
 'h-11 flex-1 min-w-[4.5rem] text-base font-semibold',
 Math.abs(amt - total) < 0.01 && 'bg-amber-500 hover:bg-amber-600')}
 onClick={() => setCashTendered(amt.toFixed(2))}
 >
 {Math.abs(amt - total) < 0.01 ? 'Tepat' : formatRM(amt)}
 </Button>))}
 </div>

 <div className="grid grid-cols-3 gap-1.5">
 {NUMPAD.map((key) => (
 <Button
 key={key}
 type="button"
 variant="outline"
 className="h-12 text-lg font-semibold"
 onClick={() => appendNumpad(key)}
 >
 {key === 'C' ? <Delete className="mx-auto h-5 w-5" /> : key}
 </Button>))}
 </div>
 </div>)}

 {method === 'QR' && (
 <div className="space-y-3">
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Amaun QR</Label>
 <Input
 type="number"
 min="0"
 step="0.01"
 className="h-14 text-center text-2xl font-bold tabular-nums"
 value={qrAmount}
 onChange={(e) => {
 setQrAmount(e.target.value);
 }}
 />
 </div>
 <Button
 type="button"
 variant="secondary"
 className="h-12 w-full text-base font-semibold"
 onClick={() => {
 setQrAmount(total.toFixed(2));
 }}
 >
 QR penuh - {formatRM(total)}
 </Button>
 </div>)}

 {method === 'QR' && (
 <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/70 p-4">
 <div className="flex items-start justify-between gap-3">
 <div>
 <p className="text-base font-bold text-amber-950">QR manual dahulu</p>
 <p className="text-xs text-muted-foreground">
 Pembayaran online belum diaktifkan. Staf hanya rekod QR selepas semak bukti bayaran pelanggan.
 </p>
 </div>
 <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
 Manual
 </span>
 </div>
 <div className="mt-4 rounded-2xl border bg-white p-4 text-center shadow-sm">
 <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
 <QrCode className="h-12 w-12" />
 </div>
 <p className="mt-3 text-2xl font-bold tabular-nums text-amber-950">{formatRM(qrNum)}</p>
 <p className="text-xs text-muted-foreground">
 Rekod ini akan masuk senarai pengesahan manual di dashboard Kewangan.
 </p>
 </div>
 </div>)}

 {method === 'MIXED' && (
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Tunai (RM)</Label>
 <Input
 type="number"
 min="0"
 step="0.01"
 className="h-12 text-lg font-semibold tabular-nums"
 value={cashTendered}
 onChange={(e) => setCashTendered(e.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">QR (RM)</Label>
 <Input
 type="number"
 min="0"
 step="0.01"
 className="h-12 text-lg font-semibold tabular-nums"
 value={qrAmount}
 onChange={(e) => setQrAmount(e.target.value)}
 />
 </div>
 <Button
 type="button"
 variant="outline"
 className="sm:col-span-2"
 onClick={() => {
 const half = (total / 2).toFixed(2);
 setCashTendered(half);
 setQrAmount((total - total / 2).toFixed(2));
 }}
 >
 Bahagi sama - tunai + QR
 </Button>
 </div>)}

 {changeAmount > 0 && method !== 'QR' && (
 <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
 <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">
 Baki tunai untuk pelanggan
 </p>
 <p className="mt-1 text-4xl font-bold tabular-nums text-emerald-700">
 {formatRM(changeAmount)}
 </p>
 </div>)}

 {shortfall > 0 && paidAmount > 0 && (
 <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-center text-sm text-orange-900">
 Kurang <strong className="tabular-nums">{formatRM(shortfall)}</strong> lagi
 </div>)}

 {canPay && !loading && (
 <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-700">
 <CheckCircle2 className="h-4 w-4" />
 Bayaran mencukupi - sedia sahkan
 </div>)}
 </div>

 <div className="flex gap-2 border-t bg-muted/20 p-4">
 <Button
 variant="outline"
 className="h-12 flex-1"
 onClick={() => onOpenChange(false)}
 disabled={loading}
 >
 Batal
 </Button>
 <Button
 className="h-12 flex-[2] gap-2 rounded-xl bg-amber-500 text-base font-bold hover:bg-amber-600"
 disabled={!canPay || loading}
 onClick={handlePay}
 >
 {method === 'QR' ? <QrCode className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}
 {loading ? 'Memproses...' : 'Sahkan Bayaran'}
 </Button>
 </div>
 </DialogContent>
 </Dialog>);
}
