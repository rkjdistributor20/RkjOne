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
import {
 createPosPaymentIdempotencyKey,
 isValidPosPaymentIdempotencyKey,
} from '@/lib/pos/payment-idempotency';
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
 cartFingerprint: string;
};

type QrPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

function activeQrStorageKey(branchId: string, shiftId: string) {
 return `rkj-pos-active-qr:${branchId}:${shiftId}`;
}

function paymentFingerprint(payload: {
 branchId: string;
 shiftId: string;
 items: Array<{ product_id: string; quantity: number }>;
 payment_method: PaymentMethod;
 cash_amount: number;
 qr_amount: number;
}) {
 return JSON.stringify({
  branchId: payload.branchId,
  shiftId: payload.shiftId,
  items: [...payload.items].sort((a, b) => a.product_id.localeCompare(b.product_id)),
  payment_method: payload.payment_method,
  cash_amount: Math.round(payload.cash_amount * 100),
  qr_amount: Math.round(payload.qr_amount * 100),
 });
}

function readStoredQrPayment(key: string): { payment: ActiveQrPayment; idempotencyKey: string } | null {
 try {
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const paymentValue = Reflect.get(parsed, 'payment');
  const idempotencyKey = Reflect.get(parsed, 'idempotencyKey');
  if (!paymentValue || typeof paymentValue !== 'object' || Array.isArray(paymentValue)
   || !isValidPosPaymentIdempotencyKey(idempotencyKey)) return null;

  const id = Reflect.get(paymentValue, 'id');
  const imageUrl = Reflect.get(paymentValue, 'imageUrl');
  const amountRm = Reflect.get(paymentValue, 'amountRm');
  const expiresAt = Reflect.get(paymentValue, 'expiresAt');
  const environment = Reflect.get(paymentValue, 'environment');
  const cartFingerprint = Reflect.get(paymentValue, 'cartFingerprint');
  if (typeof id !== 'string' || !id
   || typeof imageUrl !== 'string' || !imageUrl.startsWith('/api/pos/qr-payments/')
   || typeof amountRm !== 'number' || !Number.isFinite(amountRm) || amountRm <= 0
   || typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))
   || (environment !== 'sandbox' && environment !== 'production')
   || typeof cartFingerprint !== 'string' || !cartFingerprint) return null;

  return {
   payment: { id, imageUrl, amountRm, expiresAt, environment, cartFingerprint },
   idempotencyKey,
  };
 } catch {
  return null;
 }
}

function hasValidCurrencyPrecision(value: string) {
 return /^\d+(?:\.\d{1,2})?$/.test(value);
}

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
 const [qrStatus, setQrStatus] = useState<QrPaymentStatus>('PENDING');
 const [qrSecondsRemaining, setQrSecondsRemaining] = useState(0);
 const qrAttemptKeyRef = useRef<string | null>(null);
 const [qrPollError, setQrPollError] = useState<string | null>(null);
 const [checkingQrStatus, setCheckingQrStatus] = useState(false);
 const [qrImageError, setQrImageError] = useState(false);
 const [qrImageRetry, setQrImageRetry] = useState(0);

 const quickAmounts = useMemo(() => buildQuickAmounts(total), [total]);
 const defaultAmount = total > 0 ? total.toFixed(2) : '';
 const cashTendered = cashTenderedOverride ?? defaultAmount;
 const qrAmount = qrAmountOverride ?? defaultAmount;
 const cashNum = parseMoney(cashTendered);
 const qrNum = parseMoney(qrAmount);
 const totalCents = Math.round(total * 100);
 const qrCents = Math.round(qrNum * 100);
 const currentPaymentFingerprint = shift ? paymentFingerprint({
  branchId,
  shiftId: shift.id,
  items: cart.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
  payment_method: method,
  cash_amount: method === 'QR' ? 0 : cashNum,
  qr_amount: method === 'CASH' ? 0 : qrNum,
 }) : null;

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
 ? 'DuitNow QR perlu online untuk menjana kod dan menyemak pengesahan bayaran.'
 : profile?.role === 'AREA_MANAGER' && !isOnline
 ? 'AM emergency POS perlu online supaya jadual syif boleh disahkan.'
 : method === 'QR' && (!hasValidCurrencyPrecision(qrAmount) || qrCents !== totalCents)
 ? 'Amaun DuitNow QR mesti sama tepat dengan jumlah jualan.'
 : method === 'MIXED' && (!hasValidCurrencyPrecision(qrAmount) || qrCents > totalCents)
 ? 'Amaun DuitNow QR campur tidak sah atau melebihi jumlah jualan.'
 : paidAmount < total
 ? `Bayaran kurang ${formatRM(shortfall)}.`
 : null;
 const canPay = !paymentError && total > 0;
 const qrDisplayExpired = Boolean(qrPayment && qrStatus === 'PENDING' && qrSecondsRemaining <= 0);

 const resetPaymentForm = useCallback(() => {
 setMethod('CASH');
 setCashTenderedOverride(null);
 setQrAmountOverride(null);
 setQrPayment(null);
 setQrStatus('PENDING');
 setQrSecondsRemaining(0);
 setQrPollError(null);
 setCheckingQrStatus(false);
 setQrImageError(false);
 setQrImageRetry(0);
 qrAttemptKeyRef.current = null;
 }, []);

 const storageKey = shift ? activeQrStorageKey(branchId, shift.id) : null;

 const removeStoredQrPayment = useCallback(() => {
  if (!storageKey) return;
  try {
   window.sessionStorage.removeItem(storageKey);
  } catch {
   // Storage may be unavailable in a restricted WebView; polling remains authoritative.
  }
 }, [storageKey]);

 useEffect(() => {
  if (!open || !storageKey || qrPayment) return;
  const stored = readStoredQrPayment(storageKey);
  if (!stored) return;
  qrAttemptKeyRef.current = stored.idempotencyKey;
  setQrPayment(stored.payment);
  setQrStatus('PENDING');
  setQrSecondsRemaining(Math.max(
   0,
   Math.ceil((new Date(stored.payment.expiresAt).getTime() - Date.now()) / 1000),
  ));
  setQrPollError('Percubaan DuitNow QR terdahulu dipulihkan. Menyemak status bayaran...');
 }, [open, qrPayment, storageKey]);

 const handleDialogOpenChange = useCallback((nextOpen: boolean) => {
 if (!nextOpen && qrPayment && (qrStatus === 'PENDING' || qrStatus === 'PAID')) {
  toast.info('Tunggu keputusan QR atau tamat tempoh sebelum menutup bayaran.');
  return;
 }
 if (!nextOpen) resetPaymentForm();
 onOpenChange(nextOpen);
 }, [onOpenChange, qrPayment, qrStatus, resetPaymentForm]);

 const reconcileQrPayment = useCallback(async (activePayment: ActiveQrPayment, manual = false) => {
  if (manual) setCheckingQrStatus(true);
  try {
   const response = await fetchPosQrPayment(activePayment.id);
   setQrPollError(null);
   if (response.payment.status === 'PAID') {
    setQrStatus('PAID');
    removeStoredQrPayment();
    if (!response.result) {
     setQrPollError('Bayaran telah diterima tetapi resit belum tersedia. Semak status semula; jangan jana QR baharu.');
     return;
    }
    if (currentPaymentFingerprint === activePayment.cartFingerprint) {
     clearCart();
    }
    toast.success('Bayaran DuitNow QR disahkan oleh Fiuu.');
    resetPaymentForm();
    onOpenChange(false);
    onSuccess(response.result);
    return;
   }
   if (response.payment.status === 'EXPIRED') {
    setQrStatus('EXPIRED');
    removeStoredQrPayment();
    return;
   }
   if (response.payment.status === 'FAILED' || response.payment.status === 'CANCELLED') {
    setQrStatus(response.payment.status);
    removeStoredQrPayment();
   }
  } catch (error) {
   setQrPollError(error instanceof Error
    ? `Status bayaran tidak dapat disemak: ${error.message}`
    : 'Status bayaran tidak dapat disemak. Semak sambungan dan cuba lagi.');
  } finally {
   if (manual) setCheckingQrStatus(false);
  }
 }, [clearCart, currentPaymentFingerprint, onOpenChange, onSuccess, removeStoredQrPayment, resetPaymentForm]);

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
   await reconcileQrPayment(qrPayment);
   polling = false;
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
 }, [qrPayment, qrStatus, reconcileQrPayment]);

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
   if (storageKey) {
    const stored = readStoredQrPayment(storageKey);
    if (stored) {
     qrAttemptKeyRef.current = stored.idempotencyKey;
     setQrPayment(stored.payment);
     setQrStatus('PENDING');
     setQrSecondsRemaining(1);
     setQrPollError('Percubaan DuitNow QR terdahulu dipulihkan. Menyemak status bayaran...');
     toast.info('Bayaran QR terdahulu masih perlu diselesaikan.');
     return;
    }
   }
   const idempotencyKey = qrAttemptKeyRef.current ?? createPosPaymentIdempotencyKey();
   qrAttemptKeyRef.current = idempotencyKey;
   const { payment } = await createPosQrPayment(payload, idempotencyKey);
   if (payment.status === 'PAID') {
    const existing = await fetchPosQrPayment(payment.id);
    if (!existing.result) throw new Error('Resit bayaran Fiuu belum tersedia. Cuba semula.');
    removeStoredQrPayment();
    toast.success('Bayaran DuitNow QR telah disahkan oleh Fiuu.');
    clearCart();
    resetPaymentForm();
    onOpenChange(false);
    onSuccess(existing.result);
    return;
   }
   if (!payment.qr_image_url || !payment.expires_at) {
    throw new Error('Kod QR Fiuu masih dijana. Cuba semula sebentar lagi.');
   }
   const activePayment: ActiveQrPayment = {
    id: payment.id,
    imageUrl: payment.qr_image_url,
    amountRm: payment.amount_rm,
    expiresAt: payment.expires_at,
    environment: payment.environment,
    cartFingerprint: paymentFingerprint(payload),
   };
   setQrPayment(activePayment);
   setQrStatus('PENDING');
   setQrSecondsRemaining(1);
   setQrPollError(null);
   setQrImageError(false);
   if (storageKey) {
    try {
     window.sessionStorage.setItem(storageKey, JSON.stringify({
      payment: activePayment,
      idempotencyKey,
     }));
    } catch {
     // Keep the active in-memory attempt usable when WebView storage is unavailable.
    }
   }
   toast.info('Imbas DuitNow QR dan tunggu pengesahan Fiuu.');
   return;
  } catch (error) {
   if (error instanceof PosQrPaymentError && error.mode !== 'FIUU_ATTEMPT_INITIALIZING') {
    qrAttemptKeyRef.current = null;
    removeStoredQrPayment();
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
 onSuccess(result);
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
      {qrStatus === 'PENDING' ? (qrDisplayExpired ? 'Menyemak tamat tempoh' : 'Menunggu') : qrStatus === 'PAID' ? 'Dibayar' : qrStatus === 'EXPIRED' ? 'Tamat tempoh' : qrStatus === 'CANCELLED' ? 'Dibatalkan' : 'Gagal'}
     </span>
    </div>

    {qrStatus === 'PENDING' && !qrDisplayExpired ? (
     <>
      <div className="mx-auto mt-4 w-full max-w-[18rem] overflow-hidden rounded-2xl border bg-white p-3 shadow-sm">
       {qrImageError ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-900">
         <QrCode className="h-10 w-10" aria-hidden="true" />
         <p className="font-semibold">Imej QR tidak dapat dimuatkan.</p>
         <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-white"
          onClick={() => {
           setQrImageError(false);
           setQrImageRetry((value) => value + 1);
          }}
         >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Cuba imej semula
         </Button>
        </div>
       ) : (
        <Image
         key={qrImageRetry}
         src={`${qrPayment.imageUrl}${qrPayment.imageUrl.includes('?') ? '&' : '?'}retry=${qrImageRetry}`}
         alt={`Kod DuitNow QR untuk bayaran ${formatRM(qrPayment.amountRm)}`}
         width={360}
         height={360}
         className="h-auto w-full object-contain"
         unoptimized
         onError={() => setQrImageError(true)}
        />
       )}
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
       {qrStatus === 'PAID'
        ? 'Bayaran diterima. Resit sedang dipulihkan.'
        : qrDisplayExpired || qrStatus === 'EXPIRED'
        ? 'Kod QR telah tamat tempoh.'
        : qrStatus === 'CANCELLED'
        ? 'Bayaran telah dibatalkan.'
        : 'Bayaran tidak dapat disahkan.'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
       {qrStatus === 'PAID'
        ? 'Semak status semula. Jangan jana QR baharu untuk jualan ini.'
        : qrDisplayExpired || qrStatus === 'EXPIRED'
        ? 'Callback lewat masih direkonsiliasi. Jangan jana QR baharu untuk jualan ini.'
        : 'Jana kod baharu. Jangan serahkan resit atau stok sebelum status Dibayar.'}
      </p>
     </div>
    )}
    {qrPollError && (
     <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-sm text-red-900" role="alert">
      {qrPollError}
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
  Sistem menjana QR Fiuu dalam mod online. Mod manual hanya digunakan apabila server menetapkan operasi manual.
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
    qrStatus === 'PENDING' || qrStatus === 'PAID' ? (
     <div className="flex w-full gap-2">
      <Button className="h-12 flex-1 gap-2 rounded-xl" disabled aria-live="polite">
       <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
       {qrStatus === 'PAID'
        ? 'Memulihkan resit'
        : qrDisplayExpired
        ? 'Merekonsiliasi callback lewat'
        : 'Menunggu bayaran Fiuu'}
      </Button>
      <Button
       type="button"
       variant="outline"
       className="h-12 gap-2"
       disabled={checkingQrStatus}
       onClick={() => void reconcileQrPayment(qrPayment, true)}
      >
       <RefreshCw className={cn('h-5 w-5', checkingQrStatus && 'animate-spin')} aria-hidden="true" />
       Semak status
      </Button>
     </div>
    ) : (
    <>
     <Button variant="outline" className="h-12 flex-1" onClick={() => handleDialogOpenChange(false)}>
      Tutup
     </Button>
     <Button
      className="h-12 flex-[2] gap-2 rounded-xl bg-amber-500 font-bold hover:bg-amber-600"
       onClick={() => {
        removeStoredQrPayment();
        setQrPayment(null);
        setQrStatus('PENDING');
        setQrSecondsRemaining(0);
        setQrPollError(null);
        setQrImageError(false);
        setQrImageRetry(0);
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
