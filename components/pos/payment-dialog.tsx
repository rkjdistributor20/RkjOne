'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Banknote, QrCode, Split, Delete, CheckCircle2, Clock3, LoaderCircle, RefreshCw } from 'lucide-react';
import {
 createPosQrPayment,
 createSale,
 fetchPosQrPayment,
 PosQrPaymentError,
} from '@/lib/pos/api';
import {
 enqueueOfflineSale,
 getOfflineQueue,
} from '@/lib/pos/offline-queue';
import { formatRM, generateOfflineId } from '@/lib/pos/utils';
import { createPosPaymentIdempotencyKey } from '@/lib/pos/payment-idempotency';
import { useAuthStore } from '@/stores/auth-store';
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
 trainingMode?: boolean;
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

type ActiveQrPayment = {
 id: string;
 imageUrl: string;
 amountRm: number;
 expiresAt: string;
 environment: 'sandbox' | 'production';
};

function parseMoney(value: string) {
 const parsed = Number(value);
 return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

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
 aria-pressed={active}
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
 trainingMode = false,
}: PaymentDialogProps) {
 const profile = useAuthStore((s) => s.profile);
 const cart = usePosStore((s) => s.cart);
 const shift = usePosStore((s) => s.shift);
 const clearCart = usePosStore((s) => s.clearCart);
 const isOnline = usePosStore((s) => s.isOnline);
 const setOfflineCount = usePosStore((s) => s.setOfflineCount);

 const total = cart.reduce(
 (sum, item) => sum + item.price * item.quantity,
 0);
 const [method, setMethod] = useState<PaymentMethod>('CASH');
 const [cashTenderedOverride, setCashTenderedOverride] = useState<string | null>(null);
 const [qrAmountOverride, setQrAmountOverride] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);
 const [qrPayment, setQrPayment] = useState<ActiveQrPayment | null>(null);
 const [qrStatus, setQrStatus] = useState<'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED'>('PENDING');
 const [qrSecondsRemaining, setQrSecondsRemaining] = useState(0);
 const qrAttemptKeyRef = useRef<string | null>(null);

 const quickAmounts = useMemo(() => buildQuickAmounts(total), [total]);
 const defaultAmount = total > 0 ? total.toFixed(2) : '';
 const cashTendered = cashTenderedOverride ?? defaultAmount;
 const qrAmount = qrAmountOverride ?? defaultAmount;
 const cashNum = parseMoney(cashTendered);
 const qrNum = parseMoney(qrAmount);

 const changeAmount =
 method === 'CASH'
 ? Math.max(cashNum - total, 0)
 : method === 'MIXED'
 ? Math.max(cashNum + qrNum - total, 0)
 : 0;

 const paidAmount =
 method === 'CASH' ? cashNum : method === 'QR' ? qrNum : cashNum + qrNum;

 const shortfall = Math.max(total - paidAmount, 0);
 const paymentError =
 !shift && !trainingMode
 ? 'Buka syif POS dahulu.'
 : cart.length === 0
 ? 'Troli masih kosong.'
 : total <= 0
 ? 'Jumlah bayaran tidak sah.'
 : method !== 'CASH' && !isOnline
 ? 'QR manual perlu online untuk rekod audit dan pengesahan kewangan.'
 : profile?.role === 'AREA_MANAGER' && !isOnline
 ? 'AM emergency POS perlu online supaya jadual syif boleh disahkan.'
 : paidAmount < total
 ? `Bayaran kurang ${formatRM(shortfall)}.`
 : null;
 const canPay = !paymentError && total > 0;

 const resetPaymentForm = useCallback(() => {
 setMethod('CASH');
 setCashTenderedOverride(null);
 setQrAmountOverride(null);
 setQrPayment(null);
 setQrStatus('PENDING');
 setQrSecondsRemaining(0);
 qrAttemptKeyRef.current = null;
 }, []);

 const handleDialogOpenChange = useCallback((nextOpen: boolean) => {
 if (!nextOpen && qrPayment && qrStatus === 'PENDING') {
  toast.info('Tunggu keputusan QR atau tamat tempoh sebelum menutup bayaran.');
  return;
 }
 if (!nextOpen) resetPaymentForm();
 onOpenChange(nextOpen);
 }, [onOpenChange, qrPayment, qrStatus, resetPaymentForm]);

 useEffect(() => {
  if (!qrPayment || qrStatus !== 'PENDING') return;
  let active = true;
  let polling = false;

  const refreshCountdown = () => {
   const remaining = Math.max(0, Math.ceil((new Date(qrPayment.expiresAt).getTime() - Date.now()) / 1000));
   if (active) setQrSecondsRemaining(remaining);
  };
  const poll = async () => {
   if (polling) return;
   polling = true;
   try {
    const response = await fetchPosQrPayment(qrPayment.id);
    if (!active) return;
    if (response.payment.status === 'PAID' && response.result) {
     const paidReceipt: SaleResult = {
      ...response.result,
      payment_method: method,
      cash_amount: method === 'QR' ? 0 : cashNum,
      qr_amount: method === 'CASH' ? 0 : qrNum,
     };
     setQrStatus('PAID');
     toast.success('Bayaran DuitNow QR disahkan oleh Fiuu.');
     clearCart();
     resetPaymentForm();
     onOpenChange(false);
     onSuccess(paidReceipt);
     return;
    }
    if (response.payment.status === 'FAILED' || response.payment.status === 'EXPIRED') {
     setQrStatus(response.payment.status);
    }
   } catch {
    // A temporary polling failure must not convert a payment to failed.
   } finally {
    polling = false;
   }
  };

  refreshCountdown();
  void poll();
  const countdownTimer = window.setInterval(refreshCountdown, 1000);
  const pollTimer = window.setInterval(() => void poll(), 2000);
  return () => {
   active = false;
   window.clearInterval(countdownTimer);
   window.clearInterval(pollTimer);
  };
 }, [cashNum, clearCart, method, onOpenChange, onSuccess, qrNum, qrPayment, qrStatus, resetPaymentForm]);

 const appendNumpad = useCallback((key: string) => {
 setCashTenderedOverride((prevOverride) => {
 const prev = prevOverride ?? defaultAmount;
 if (key === 'C') return '';
 if (key === '.' && prev.includes('.')) return prev;
 if (prev === '' && key === '.') return '0.';
 if (prev === '0' && key !== '.') return key;
 return prev + key;
 });
 }, [defaultAmount]);

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
  const currentShift = shift;
  if (!currentShift && !trainingMode) {
 toast.error('Buka syif POS dahulu.');
 return;
 }
  if (!canPay) {
 toast.error(paymentError ?? 'Bayaran belum lengkap.');
 return;
  }
  if (trainingMode) {
   const trainingId = `TRAINING-${generateOfflineId()}`;
   const trainingReceipt: SaleResult = {
    transaction_id: trainingId,
    transaction_number: trainingId,
    receipt_number: `LATIHAN-${trainingId.slice(-8)}`,
    subtotal: total,
    discount: 0,
    total,
    change_amount: changeAmount,
    payment_method: method,
    cash_amount: 0,
    qr_amount: 0,
    items: cart.map((item) => ({
     name: item.name,
     sku: item.sku,
     quantity: item.quantity,
     unit_price: item.price,
     line_total: item.price * item.quantity,
    })),
   };
   toast.success('Latihan selesai. Tiada jualan, bayaran atau stok sebenar direkodkan.');
   clearCart();
   handleDialogOpenChange(false);
   onSuccess(trainingReceipt);
   return;
  }
  if (!currentShift) {
   toast.error('Buka syif POS dahulu.');
   return;
  }
  const payload = buildSalePayload();
 if (!payload) {
 toast.error('Buka syif POS dahulu.');
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
 shiftId: currentShift.id,
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
 receipt_number: `RC-OFF-${offlineId.slice(-8)}`,
 subtotal: total,
 discount: 0,
 total,
 change_amount: changeAmount,
 payment_method: method,
 cash_amount: payload.cash_amount,
 qr_amount: payload.qr_amount,
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
 handleDialogOpenChange(false);
 onSuccess(offlineReceipt);
 return;
 }

 const usesQr = method === 'QR' || (method === 'MIXED' && payload.qr_amount > 0);
 if (usesQr) {
  try {
   const idempotencyKey = qrAttemptKeyRef.current ?? createPosPaymentIdempotencyKey();
   qrAttemptKeyRef.current = idempotencyKey;
   const { payment } = await createPosQrPayment(payload, idempotencyKey);
   if (payment.status === 'PAID') {
    const existing = await fetchPosQrPayment(payment.id);
    if (!existing.result) throw new Error('Resit bayaran Fiuu belum tersedia. Cuba semula.');
    toast.success('Bayaran DuitNow QR telah disahkan oleh Fiuu.');
    clearCart();
    resetPaymentForm();
    onOpenChange(false);
    onSuccess({
     ...existing.result,
     payment_method: method,
     cash_amount: payload.cash_amount,
     qr_amount: payload.qr_amount,
    });
    return;
   }
   if (!payment.qr_image_url || !payment.expires_at) {
    throw new Error('Kod QR Fiuu masih dijana. Cuba semula sebentar lagi.');
   }
   setQrPayment({
    id: payment.id,
    imageUrl: payment.qr_image_url,
    amountRm: payment.amount_rm,
    expiresAt: payment.expires_at,
    environment: payment.environment,
   });
   setQrStatus('PENDING');
   toast.info('Imbas DuitNow QR dan tunggu pengesahan Fiuu.');
   return;
  } catch (error) {
   if (error instanceof PosQrPaymentError && error.mode !== 'FIUU_ATTEMPT_INITIALIZING') {
    qrAttemptKeyRef.current = null;
   }
   if (!(error instanceof PosQrPaymentError) || error.mode !== 'MANUAL_QR_ONLY') {
    throw error;
   }
  }
 }

 const { result } = await createSale(payload);
 if (usesQr) toast.success('Jualan direkod. QR perlu pengesahan manual kewangan.');
 else toast.success('Bayaran berjaya - stok ditolak');
 clearCart();
 handleDialogOpenChange(false);
 onSuccess({
  ...result,
  payment_method: method,
  cash_amount: payload.cash_amount,
  qr_amount: payload.qr_amount,
 });
 } catch (err) {
 const msg = err instanceof Error ? err.message : 'Bayaran gagal';
 toast.error(msg.includes('Stok') ? msg : `Bayaran gagal: ${msg}`);
 } finally {
 setLoading(false);
 }
 }

 return (
 <Dialog open={open} onOpenChange={handleDialogOpenChange}>
 <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
  <div className={cn('px-5 py-5 text-white', trainingMode ? 'bg-sky-700' : 'bg-gradient-to-br from-amber-500 to-orange-600')}>
 <p className="text-xs font-medium uppercase tracking-wider text-white/80">
  {trainingMode ? 'Simulasi Latihan' : 'Kaunter Tunai'}
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
  {qrPayment ? (
  <div className="space-y-4" aria-live="polite">
   <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4 text-center">
    <div className="flex items-center justify-between gap-3 text-left">
     <div>
      <p className="font-bold text-emerald-950">DuitNow QR melalui Fiuu</p>
      <p className="text-xs text-muted-foreground">Imbas menggunakan aplikasi bank atau e-dompet yang menyokong DuitNow.</p>
     </div>
     <span className={cn(
      'rounded-full px-2.5 py-1 text-xs font-semibold',
      qrStatus === 'PENDING' ? 'bg-amber-100 text-amber-900' :
      qrStatus === 'PAID' ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900')}
     >
      {qrStatus === 'PENDING' ? 'Menunggu' : qrStatus === 'PAID' ? 'Dibayar' : qrStatus === 'EXPIRED' ? 'Tamat tempoh' : 'Gagal'}
     </span>
    </div>

    {qrStatus === 'PENDING' ? (
     <>
      <div className="mx-auto mt-4 w-full max-w-[18rem] overflow-hidden rounded-2xl border bg-white p-3 shadow-sm">
       <Image
        src={qrPayment.imageUrl}
        alt={`Kod DuitNow QR untuk bayaran ${formatRM(qrPayment.amountRm)}`}
        width={360}
        height={360}
        className="h-auto w-full object-contain"
        unoptimized
       />
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums text-emerald-950">{formatRM(qrPayment.amountRm)}</p>
      <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
       <Clock3 className="h-4 w-4" aria-hidden="true" />
       <span>
        Tamat dalam <strong className="tabular-nums text-foreground">
         {String(Math.floor(qrSecondsRemaining / 60)).padStart(2, '0')}:{String(qrSecondsRemaining % 60).padStart(2, '0')}
        </strong>
       </span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-amber-800" role="status">
       <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
       Menunggu pengesahan selamat daripada Fiuu
      </div>
      {qrPayment.environment === 'sandbox' && (
       <p className="mt-3 rounded-lg bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900">
        Mod ujian - tiada wang sebenar dipindahkan
       </p>
      )}
     </>
    ) : (
     <div className="mt-5 rounded-xl border bg-white p-5">
      <QrCode className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 font-semibold text-foreground">
       {qrStatus === 'EXPIRED' ? 'Kod QR telah tamat tempoh.' : 'Bayaran tidak dapat disahkan.'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">Jana kod baharu. Jangan serahkan resit atau stok sebelum status Dibayar.</p>
     </div>
    )}
   </div>
  </div>
  ) : (
  <>
  <div className="grid grid-cols-3 gap-2">
 <MethodButton
 active={method === 'CASH'}
 onClick={() => {
 setMethod('CASH');
 setCashTenderedOverride(null);
 }}
 icon={Banknote}
 label="Tunai"
 />
 <MethodButton
 active={method === 'QR'}
 onClick={() => {
 setMethod('QR');
 setQrAmountOverride(null);
 }}
 icon={QrCode}
  label="DuitNow QR"
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
 onChange={(e) => setCashTenderedOverride(e.target.value.replace(/[^\d.]/g, ''))}
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
 onClick={() => setCashTenderedOverride(amt.toFixed(2))}
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
 aria-label={key === 'C' ? 'Kosongkan amaun tunai' : `Masukkan ${key}`}
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
 setQrAmountOverride(e.target.value);
 }}
 />
 </div>
 <Button
 type="button"
 variant="secondary"
 className="h-12 w-full text-base font-semibold"
 onClick={() => {
 setQrAmountOverride(null);
 }}
 >
 QR penuh - {formatRM(total)}
 </Button>
 </div>)}

  {method === 'QR' && (
  <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/70 p-4">
 <div className="flex items-start justify-between gap-3">
 <div>
  <p className="text-base font-bold text-amber-950">DuitNow QR</p>
  <p className="text-xs text-muted-foreground">
  Sistem akan menjana QR Fiuu apabila saluran diaktifkan. Jika belum tersedia, proses manual sedia ada kekal digunakan.
 </p>
 </div>
 <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
  Selamat
 </span>
 </div>
 <div className="mt-4 rounded-2xl border bg-white p-4 text-center shadow-sm">
 <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
 <QrCode className="h-12 w-12" />
 </div>
 <p className="mt-3 text-2xl font-bold tabular-nums text-amber-950">{formatRM(qrNum)}</p>
 <p className="text-xs text-muted-foreground">
  Jualan Fiuu hanya disahkan selepas callback bertandatangan dan jumlah bayaran sepadan.
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
 onChange={(e) => setCashTenderedOverride(e.target.value)}
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
 onChange={(e) => setQrAmountOverride(e.target.value)}
 />
 </div>
 <Button
 type="button"
 variant="outline"
 className="sm:col-span-2"
 onClick={() => {
 const half = (total / 2).toFixed(2);
 setCashTenderedOverride(half);
 setQrAmountOverride((total - total / 2).toFixed(2));
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

 {paymentError && !(shortfall > 0 && paidAmount > 0) && (
 <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive">
 {paymentError}
 </div>)}

  {canPay && !loading && (
 <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-700">
 <CheckCircle2 className="h-4 w-4" />
  Bayaran mencukupi - sedia sahkan
  </div>)}
  </>
  )}
  </div>

  <div className="flex gap-2 border-t bg-muted/20 p-4">
  {qrPayment ? (
   qrStatus === 'PENDING' ? (
    <Button className="h-12 w-full gap-2 rounded-xl" disabled aria-live="polite">
     <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
     Menunggu bayaran Fiuu
    </Button>
   ) : (
    <>
     <Button variant="outline" className="h-12 flex-1" onClick={() => handleDialogOpenChange(false)}>
      Tutup
     </Button>
     <Button
      className="h-12 flex-[2] gap-2 rounded-xl bg-amber-500 font-bold hover:bg-amber-600"
      onClick={() => {
       setQrPayment(null);
       setQrStatus('PENDING');
       setQrSecondsRemaining(0);
       qrAttemptKeyRef.current = null;
      }}
     >
      <RefreshCw className="h-5 w-5" aria-hidden="true" />
      Jana QR baharu
     </Button>
    </>
   )
  ) : (
  <>
  <Button
 variant="outline"
 className="h-12 flex-1"
 onClick={() => handleDialogOpenChange(false)}
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
  {loading ? 'Memproses...' : trainingMode ? 'Sahkan Simulasi' : 'Sahkan Bayaran'}
  </Button>
  </>
  )}
  </div>
 </DialogContent>
 </Dialog>);
}
