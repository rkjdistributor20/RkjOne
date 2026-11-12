'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Banknote, QrCode, Split, Delete, CheckCircle2, Clock3, LoaderCircle, RefreshCw } from 'lucide-react';
import {
 abandonUnlaunchedFiuuVtAttempt,
 cancelUnlaunchedFiuuVtPayment,
 createFiuuVtAttempt,
 createPosQrPayment,
 createSale,
 confirmFiuuVtPayment,
 fetchPosQrConfig,
 fetchPosQrPayment,
 markFiuuVtAttemptLaunched,
 PosQrPaymentError,
 submitFiuuVtResult,
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
import { posPaymentFingerprint } from '@/lib/pos/payment-fingerprint';
import { useAuthStore } from '@/stores/auth-store';
import { usePosStore } from '@/stores/pos-store';
import type { PaymentMethod, PosQrConfig, SaleResult } from '@/lib/pos/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Dialog,
 DialogContent,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
 acknowledgeFiuuVtError,
 acknowledgeFiuuVtResult,
 clearPendingFiuuVtResult,
 fiuuVtNativeErrorCode,
 isFiuuVtSafePreLaunchError,
 launchFiuuVtSale,
 launchFiuuVtStatus,
 launchFiuuVtVoid,
 listenForFiuuVtResult,
 readFiuuVtStatus,
 readPendingFiuuVtResult,
 type FiuuVtNativeStatus,
 type FiuuVtNativeCallbackResult,
 type FiuuVtCallbackAttempt,
} from '@/lib/pos/fiuu-vt-client';
import {
 canFinalizeFiuuVtPayment,
 canReleaseFiuuVtCallbackDrain,
 getRecoveredFiuuVtLocalStatus,
 isFiuuVtErrorResult,
 paymentIdFromFiuuVtOrderId,
 shouldLaunchFiuuVtStatusAfterReconcile,
 type FiuuVtOperation,
} from '@/lib/pos/fiuu-vt';

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
 imageUrl: string | null;
 amountRm: number;
 expiresAt: string;
 environment: 'sandbox' | 'production';
 integration: 'opa' | 'vt_app' | 'cloudecr';
 providerOrderId: string | null;
 cartFingerprint: string;
};

type QrPaymentStatus = 'PENDING' | 'REPORTED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

type FiuuVtPrelaunchFailure = {
 attemptId: string;
 errorCode: string;
};

type FiuuVtCallbackDrainScope = {
 paymentId: string;
 generation: number;
 queueReadsInProgress: number;
 callbacksProcessing: number;
 consecutiveEmptyReads: number;
 lastEmptyReadAt: number | null;
};

type FiuuVtFinalizationSeal = {
 paymentId: string;
 generation: number;
 allowDetached: boolean;
};

type FiuuVtQueueReadOutcome = 'queued' | 'empty' | 'read_failed';

type StoredQrPayment = {
 payment: ActiveQrPayment;
 idempotencyKey: string;
 vtPrelaunchFailure: FiuuVtPrelaunchFailure | null;
};

const FIUU_VT_STATUS_RETRY_MS = 25_000;
const FIUU_VT_QUEUE_QUIESCENCE_MS = 250;

async function prepareFiuuVtCallbackAttempt(
 paymentId: string,
 opType: FiuuVtOperation,
) {
 const { attempt } = await createFiuuVtAttempt(paymentId, opType);
 return {
  attemptId: attempt.id,
  callbackHost: attempt.callback_host,
  generation: attempt.lease_generation,
 };
}

async function launchTrackedFiuuVt<T>(
 paymentId: string,
 attempt: FiuuVtCallbackAttempt,
 launch: () => Promise<T>,
): Promise<T> {
 try {
  const result = await launch();
  // The callback remains valid while PREPARED, so a transient PATCH failure
  // must never turn a successful native launch into a second SALE attempt.
  await markFiuuVtAttemptLaunched(paymentId, attempt.attemptId).catch(() => undefined);
  return result;
 } catch (error) {
  const errorCode = fiuuVtNativeErrorCode(error);
  if (errorCode && isFiuuVtSafePreLaunchError(error)) {
   await abandonUnlaunchedFiuuVtAttempt(paymentId, attempt.attemptId, errorCode)
    .catch(() => undefined);
  }
  throw error;
 }
}

function activeQrStorageKey(branchId: string, shiftId: string) {
 return `rkj-pos-active-qr:${branchId}:${shiftId}`;
}

function fiuuVtNativeCleanupStorageKey(branchId: string) {
 return `rkj-pos-fiuu-vt-native-cleanup:${branchId}`;
}

function readDeferredFiuuVtNativeCleanup(key: string): string | null {
 try {
  const orderId = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  return orderId && paymentIdFromFiuuVtOrderId(orderId) ? orderId : null;
 } catch {
  return null;
 }
}

function storeDeferredFiuuVtNativeCleanup(key: string, orderId: string) {
 try {
  window.localStorage.setItem(key, orderId);
  window.sessionStorage.removeItem(key);
 } catch {
  try {
   window.sessionStorage.setItem(key, orderId);
  } catch {
   // Native state remains fail-closed even if WebView storage is unavailable.
  }
 }
}

function removeDeferredFiuuVtNativeCleanup(key: string) {
 try {
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
 } catch {
  // A later bridge status check still prevents a second SALE.
 }
}

function readStoredQrPayment(key: string): StoredQrPayment | null {
 try {
  const raw = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
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
  const integrationValue = Reflect.get(paymentValue, 'integration');
  const providerOrderIdValue = Reflect.get(paymentValue, 'providerOrderId');
  const cartFingerprint = Reflect.get(paymentValue, 'cartFingerprint');
  const prelaunchFailureValue = Reflect.get(parsed, 'vtPrelaunchFailure');
  const integration = integrationValue === 'vt_app' || integrationValue === 'cloudecr'
   ? integrationValue
   : 'opa';
  const providerOrderId = typeof providerOrderIdValue === 'string' && providerOrderIdValue
   ? providerOrderIdValue
   : null;
  if (typeof id !== 'string' || !id
   || (integration === 'opa'
    && (typeof imageUrl !== 'string' || !imageUrl.startsWith('/api/pos/qr-payments/')))
   || ((integration === 'vt_app' || integration === 'cloudecr') && !providerOrderId)
   || typeof amountRm !== 'number' || !Number.isFinite(amountRm) || amountRm <= 0
   || typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))
   || (environment !== 'sandbox' && environment !== 'production')
   || typeof cartFingerprint !== 'string' || !cartFingerprint) return null;

  let vtPrelaunchFailure: FiuuVtPrelaunchFailure | null = null;
  if (prelaunchFailureValue !== undefined && prelaunchFailureValue !== null) {
   if (typeof prelaunchFailureValue !== 'object' || Array.isArray(prelaunchFailureValue)) return null;
   const attemptId = Reflect.get(prelaunchFailureValue, 'attemptId');
   const errorCode = Reflect.get(prelaunchFailureValue, 'errorCode');
   if (typeof attemptId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)
    || typeof errorCode !== 'string'
    || !/^[A-Z0-9_]{3,64}$/.test(errorCode)) return null;
   vtPrelaunchFailure = { attemptId: attemptId.toLowerCase(), errorCode };
  }

  return {
    payment: {
     id,
     imageUrl: integration === 'opa' ? imageUrl as string : null,
     amountRm,
     expiresAt,
     environment,
     integration,
     providerOrderId,
     cartFingerprint,
    },
   idempotencyKey,
   vtPrelaunchFailure,
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

type FiuuVtStaffStage = 'READY' | 'PAYMENT' | 'FINALIZING';

function FiuuVtStaffSteps({ stage }: { stage: FiuuVtStaffStage }) {
 const activeStep = stage === 'READY' ? 0 : stage === 'PAYMENT' ? 1 : 2;
 const steps = [
  { title: 'Buka Fiuu VT', detail: 'Amaun dihantar automatik' },
  { title: 'Pelanggan imbas & bayar', detail: 'Tunjuk QR dalam aplikasi Fiuu' },
  { title: 'Tunggu pengesahan', detail: 'Resit dan stok siap automatik' },
 ] as const;

 return (
  <ol className="mt-4 grid gap-2 text-left sm:grid-cols-3" aria-label="Langkah pembayaran Fiuu VT">
   {steps.map((step, index) => {
    const completed = index < activeStep;
    const active = index === activeStep;
    return (
     <li
      key={step.title}
      aria-current={active ? 'step' : undefined}
      aria-label={`${index + 1}. ${step.title}: ${completed ? 'Selesai' : active ? 'Langkah semasa' : 'Belum mula'}`}
      className={cn(
       'rounded-xl border p-3',
       completed && 'border-emerald-200 bg-emerald-50',
       active && 'border-amber-300 bg-amber-50 ring-1 ring-amber-200',
       !completed && !active && 'border-slate-200 bg-slate-50',
      )}
     >
      <div className="flex items-center gap-2">
       <span className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        completed ? 'bg-emerald-600 text-white' : active ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600',
       )}>
        {completed
         ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
         : active && stage === 'FINALIZING'
         ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
         : index + 1}
       </span>
       <p className="text-xs font-bold text-slate-950">{step.title}</p>
      </div>
      <p className="mt-1 pl-8 text-[11px] leading-4 text-slate-600">{step.detail}</p>
      <span className="sr-only">{completed ? 'Selesai' : active ? 'Langkah semasa' : 'Belum mula'}</span>
     </li>
    );
   })}
  </ol>
 );
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
	const vtResultFingerprintRef = useRef<string | null>(null);
 const vtRecoveryOrderRef = useRef<string | null>(null);
 const activeQrPaymentIdRef = useRef<string | null>(null);
 const processFiuuVtResultRef = useRef<(result: FiuuVtNativeCallbackResult) => Promise<void>>(async () => undefined);
 const statusCheckInFlightRef = useRef<Promise<void> | null>(null);
	const [qrPollError, setQrPollError] = useState<string | null>(null);
	const [checkingQrStatus, setCheckingQrStatus] = useState(false);
	const [qrImageError, setQrImageError] = useState(false);
	const [qrImageRetry, setQrImageRetry] = useState(0);
	const [qrConfig, setQrConfig] = useState<PosQrConfig | null>(null);
	const [qrConfigLoading, setQrConfigLoading] = useState(false);
	const [qrConfigError, setQrConfigError] = useState<string | null>(null);
	const [qrConfigRetry, setQrConfigRetry] = useState(0);
	const [manualQrVerified, setManualQrVerified] = useState(false);
 const [vtNativeStatus, setVtNativeStatus] = useState<FiuuVtNativeStatus | null>(null);
 const [vtStatusLoading, setVtStatusLoading] = useState(false);
 const [vtSaleOpened, setVtSaleOpened] = useState(false);
 const [vtCancelConfirming, setVtCancelConfirming] = useState(false);
 const [vtCancelRequested, setVtCancelRequested] = useState(false);
 const [vtStatusRetryPending, setVtStatusRetryPending] = useState(false);
 const [vtReviewRequired, setVtReviewRequired] = useState(false);
 const vtReviewRequiredRef = useRef(false);
 const [vtCallbackDrainInProgress, setVtCallbackDrainInProgress] = useState(false);
 const vtCallbackDrainInProgressRef = useRef(false);
 const vtCallbackDrainGenerationRef = useRef(0);
 const vtCallbackDrainScopeRef = useRef<FiuuVtCallbackDrainScope | null>(null);
 const [vtRecoveryRetry, setVtRecoveryRetry] = useState(0);
 const vtRecoveryRetryTimerRef = useRef<number | null>(null);
 const vtCallbackRetryTimerRef = useRef<number | null>(null);
 const [vtPrelaunchFailure, setVtPrelaunchFailure] = useState<FiuuVtPrelaunchFailure | null>(null);
 const vtOperationRetryAtRef = useRef(0);
 const nativeCleanupKey = fiuuVtNativeCleanupStorageKey(branchId);

 const beginFiuuVtCallbackDrain = useCallback((paymentId: string) => {
  let scope = vtCallbackDrainScopeRef.current;
  if (!scope || scope.paymentId !== paymentId) {
   vtCallbackDrainGenerationRef.current += 1;
   scope = {
    paymentId,
    generation: vtCallbackDrainGenerationRef.current,
    queueReadsInProgress: 0,
    callbacksProcessing: 0,
    consecutiveEmptyReads: 0,
    lastEmptyReadAt: null,
   };
   vtCallbackDrainScopeRef.current = scope;
  }
  vtCallbackDrainInProgressRef.current = true;
  setVtCallbackDrainInProgress(true);
  return scope;
 }, []);

 const completeFiuuVtCallbackDrain = useCallback((
  scope: FiuuVtCallbackDrainScope,
  queueReadProvedEmpty: boolean,
 ) => {
  const currentScope = vtCallbackDrainScopeRef.current;
  if (currentScope !== scope
   || !canReleaseFiuuVtCallbackDrain(
    queueReadProvedEmpty,
    scope.queueReadsInProgress,
    scope.callbacksProcessing,
   )) return false;
  vtCallbackDrainScopeRef.current = null;
  vtCallbackDrainInProgressRef.current = false;
  setVtCallbackDrainInProgress(false);
  return true;
 }, []);

 const resetFiuuVtCallbackDrain = useCallback(() => {
  vtCallbackDrainGenerationRef.current += 1;
  vtCallbackDrainScopeRef.current = null;
  vtCallbackDrainInProgressRef.current = false;
  setVtCallbackDrainInProgress(false);
 }, []);

 const readActiveFiuuVtResult = useCallback(async (paymentId: string) => {
  const scope = beginFiuuVtCallbackDrain(paymentId);
  scope.queueReadsInProgress += 1;
  let queueReadProvedEmpty = false;
  try {
   const result = await readPendingFiuuVtResult();
   queueReadProvedEmpty = result === null;
   if (queueReadProvedEmpty) {
    const now = Date.now();
    if (scope.lastEmptyReadAt !== null
     && now - scope.lastEmptyReadAt >= FIUU_VT_QUEUE_QUIESCENCE_MS) {
     scope.consecutiveEmptyReads += 1;
    } else if (scope.lastEmptyReadAt === null) {
     scope.consecutiveEmptyReads = 1;
    }
    scope.lastEmptyReadAt = now;
   } else {
    scope.consecutiveEmptyReads = 0;
    scope.lastEmptyReadAt = null;
   }
   return result;
  } finally {
   scope.queueReadsInProgress = Math.max(0, scope.queueReadsInProgress - 1);
   completeFiuuVtCallbackDrain(
    scope,
    queueReadProvedEmpty && scope.consecutiveEmptyReads >= 2,
   );
  }
 }, [beginFiuuVtCallbackDrain, completeFiuuVtCallbackDrain]);

 const captureFiuuVtFinalizationSeal = useCallback((
  paymentId: string,
  allowDetached = false,
 ): FiuuVtFinalizationSeal | null => {
  const activePaymentId = activeQrPaymentIdRef.current;
  const activePaymentMatches = allowDetached
   ? activePaymentId === null || activePaymentId === paymentId
   : activePaymentId === paymentId;
  if (!activePaymentMatches
   || !canFinalizeFiuuVtPayment(
    vtCallbackDrainInProgressRef.current,
    vtReviewRequiredRef.current,
   )
   || vtCallbackDrainScopeRef.current !== null) return null;
  return {
   paymentId,
   generation: vtCallbackDrainGenerationRef.current,
   allowDetached,
  };
 }, []);

 const isFiuuVtFinalizationSealValid = useCallback((seal: FiuuVtFinalizationSeal) => {
  const activePaymentId = activeQrPaymentIdRef.current;
  const activePaymentMatches = seal.allowDetached
   ? activePaymentId === null || activePaymentId === seal.paymentId
   : activePaymentId === seal.paymentId;
  return activePaymentMatches
   && vtCallbackDrainGenerationRef.current === seal.generation
   && vtCallbackDrainScopeRef.current === null
   && canFinalizeFiuuVtPayment(
    vtCallbackDrainInProgressRef.current,
    vtReviewRequiredRef.current,
   );
 }, []);

 const scheduleFiuuVtRecoveryRetry = useCallback((delayMs = 2_000) => {
  if (vtRecoveryRetryTimerRef.current !== null) return;
  vtRecoveryRetryTimerRef.current = window.setTimeout(() => {
   vtRecoveryRetryTimerRef.current = null;
   setVtRecoveryRetry((value) => value + 1);
  }, delayMs);
 }, []);

 useEffect(() => () => {
  if (vtRecoveryRetryTimerRef.current !== null) {
   window.clearTimeout(vtRecoveryRetryTimerRef.current);
   vtRecoveryRetryTimerRef.current = null;
  }
  if (vtCallbackRetryTimerRef.current !== null) {
   window.clearTimeout(vtCallbackRetryTimerRef.current);
   vtCallbackRetryTimerRef.current = null;
  }
 }, []);

 const quickAmounts = useMemo(() => buildQuickAmounts(total), [total]);
 const defaultAmount = total > 0 ? total.toFixed(2) : '';
 const cashTendered = cashTenderedOverride ?? defaultAmount;
 const qrAmount = qrAmountOverride ?? defaultAmount;
 const cashNum = parseMoney(cashTendered);
 const qrNum = parseMoney(qrAmount);
 const totalCents = Math.round(total * 100);
 const qrCents = Math.round(qrNum * 100);
 const currentPaymentFingerprint = shift ? posPaymentFingerprint({
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
 const requiresQrConfig = method !== 'CASH' && !trainingMode;
 const vtManualFallback = qrConfig?.mode === 'FIUU_VT_APP'
  && Boolean(vtNativeStatus && (
   !vtNativeStatus.nativeAndroid
   || !vtNativeStatus.installed
   || !vtNativeStatus.trustedInstall
  ));
 const isFiuuVtCheckout = method !== 'CASH'
  && qrCents > 0
  && !trainingMode
  && qrConfig?.mode === 'FIUU_VT_APP'
  && !vtManualFallback;
 const requiresManualQrVerification = requiresQrConfig
  && (qrConfig?.mode === 'FIUU_STATIC_MANUAL' || vtManualFallback);
 const paymentError =
 !shift && !trainingMode
 ? 'Buka syif POS dahulu.'
 : cart.length === 0
 ? 'Troli masih kosong.'
 : total <= 0
 ? 'Jumlah bayaran tidak sah.'
 : method !== 'CASH' && !isOnline
 ? 'DuitNow QR perlu online untuk menjana kod dan menyemak pengesahan bayaran.'
	: requiresQrConfig && (qrConfigLoading || (!qrConfig && !qrConfigError))
	? 'Maklumat DuitNow QR cawangan sedang dimuatkan.'
	: requiresQrConfig && qrConfigError
	? qrConfigError
	: requiresQrConfig && qrConfig?.mode === 'FIUU_VT_APP' && vtStatusLoading
	? 'Menyemak aplikasi Fiuu VT pada tablet.'
	: requiresManualQrVerification && !qrConfig?.staticQr
	? 'DuitNow QR belum dipadankan untuk cawangan ini. Hubungi HQ.'
 : profile?.role === 'AREA_MANAGER' && !isOnline
 ? 'AM emergency POS perlu online supaya jadual syif boleh disahkan.'
 : method === 'QR' && (!hasValidCurrencyPrecision(qrAmount) || qrCents !== totalCents)
 ? 'Amaun DuitNow QR mesti sama tepat dengan jumlah jualan.'
 : method === 'MIXED' && (!hasValidCurrencyPrecision(qrAmount) || qrCents > totalCents)
 ? 'Amaun DuitNow QR campur tidak sah atau melebihi jumlah jualan.'
 : method === 'MIXED' && (
  !hasValidCurrencyPrecision(cashTendered)
  || Math.round((cashNum + qrNum) * 100) !== totalCents
 )
 ? 'Bayaran campur memerlukan amaun tunai dan QR yang tepat tanpa baki.'
 : paidAmount < total
 ? `Bayaran kurang ${formatRM(shortfall)}.`
 : requiresManualQrVerification && !manualQrVerified
 ? 'Semak bukti bayaran pelanggan dan tandakan pengesahan DuitNow QR.'
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
	setQrConfig(null);
	setQrConfigLoading(false);
	setQrConfigError(null);
	setQrConfigRetry(0);
	setManualQrVerified(false);
	setVtNativeStatus(null);
	setVtStatusLoading(false);
	setVtSaleOpened(false);
	setVtCancelConfirming(false);
	setVtCancelRequested(false);
	setVtStatusRetryPending(false);
	setVtReviewRequired(false);
	vtReviewRequiredRef.current = false;
	resetFiuuVtCallbackDrain();
	setVtPrelaunchFailure(null);
	qrAttemptKeyRef.current = null;
	vtResultFingerprintRef.current = null;
	vtRecoveryOrderRef.current = null;
	if (vtRecoveryRetryTimerRef.current !== null) {
	 window.clearTimeout(vtRecoveryRetryTimerRef.current);
	 vtRecoveryRetryTimerRef.current = null;
	}
	if (vtCallbackRetryTimerRef.current !== null) {
	 window.clearTimeout(vtCallbackRetryTimerRef.current);
	 vtCallbackRetryTimerRef.current = null;
	}
	activeQrPaymentIdRef.current = null;
	statusCheckInFlightRef.current = null;
	vtOperationRetryAtRef.current = 0;
	}, [resetFiuuVtCallbackDrain]);

	useEffect(() => {
		activeQrPaymentIdRef.current = qrPayment?.id ?? null;
	}, [qrPayment]);

	const storageKey = shift ? activeQrStorageKey(branchId, shift.id) : null;

	const removeStoredQrPayment = useCallback(() => {
		if (!storageKey) return;
		try {
			window.localStorage.removeItem(storageKey);
			window.sessionStorage.removeItem(storageKey);
		} catch {
			// Storage may be unavailable in a restricted WebView; polling remains authoritative.
		}
	}, [storageKey]);

	const storeActiveQrPayment = useCallback((
		payment: ActiveQrPayment,
		idempotencyKey: string | null,
		prelaunchFailure: FiuuVtPrelaunchFailure | null = null,
	) => {
		if (!storageKey || !idempotencyKey || !isValidPosPaymentIdempotencyKey(idempotencyKey)) return;
		try {
			window.localStorage.setItem(storageKey, JSON.stringify({
				payment,
				idempotencyKey,
				vtPrelaunchFailure: prelaunchFailure,
			}));
		} catch {
			// In-memory recovery remains usable when the managed WebView blocks storage.
		}
	}, [storageKey]);

 const releaseFiuuVtNativeState = useCallback(async (orderId: string): Promise<boolean> => {
  try {
   await clearPendingFiuuVtResult(orderId);
   removeDeferredFiuuVtNativeCleanup(nativeCleanupKey);
   setVtNativeStatus((current) => current ? {
    ...current,
    pendingOrderId: null,
    pendingOperation: null,
    resultAvailable: false,
   } : current);
   return true;
  } catch {
   const status = await readFiuuVtStatus().catch(() => null);
   if (status && status.pendingOrderId !== orderId && !status.resultAvailable) {
    removeDeferredFiuuVtNativeCleanup(nativeCleanupKey);
    setVtNativeStatus(status);
    return true;
   }
   storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId);
   return false;
  }
 }, [nativeCleanupKey]);

 const drainAndReleaseDeferredFiuuVtNativeState = useCallback(async (
  orderId: string,
 ): Promise<boolean> => {
  const paymentId = paymentIdFromFiuuVtOrderId(orderId);
  if (!paymentId) return false;

  let queuedResult: FiuuVtNativeCallbackResult | null;
  try {
   queuedResult = await readActiveFiuuVtResult(paymentId);
  } catch {
   scheduleFiuuVtRecoveryRetry(500);
   return false;
  }
  if (queuedResult) {
   vtResultFingerprintRef.current = null;
   await processFiuuVtResultRef.current(queuedResult);
   scheduleFiuuVtRecoveryRetry(500);
   return false;
  }

  // One empty read is not enough: a provider callback can be in flight while
  // the WebView is resuming. Keep the drain latch closed until a second empty
  // read, separated by the quiescence interval, proves the queue stayed empty.
  if (vtCallbackDrainInProgressRef.current || vtCallbackDrainScopeRef.current) {
   scheduleFiuuVtRecoveryRetry(500);
   return false;
  }

  const finalizationSeal = captureFiuuVtFinalizationSeal(paymentId, true);
  if (!finalizationSeal) {
   scheduleFiuuVtRecoveryRetry(500);
   return false;
  }
  const nativeReleased = await releaseFiuuVtNativeState(orderId);
  if (!nativeReleased || !isFiuuVtFinalizationSealValid(finalizationSeal)) {
   scheduleFiuuVtRecoveryRetry(500);
   return false;
  }
  return true;
 }, [captureFiuuVtFinalizationSeal, isFiuuVtFinalizationSealValid, readActiveFiuuVtResult, releaseFiuuVtNativeState, scheduleFiuuVtRecoveryRetry]);

 useEffect(() => {
  let cancelled = false;
  let cleanupInFlight = false;
  const retryDeferredCleanup = async () => {
   if (cancelled || cleanupInFlight) return;
   const orderId = readDeferredFiuuVtNativeCleanup(nativeCleanupKey);
   if (!orderId) return;
   cleanupInFlight = true;
   try {
     await drainAndReleaseDeferredFiuuVtNativeState(orderId);
   } finally {
    cleanupInFlight = false;
   }
  };
  void retryDeferredCleanup();
  window.addEventListener('online', retryDeferredCleanup);
  window.addEventListener('focus', retryDeferredCleanup);
  window.addEventListener('pageshow', retryDeferredCleanup);
  return () => {
   cancelled = true;
   window.removeEventListener('online', retryDeferredCleanup);
   window.removeEventListener('focus', retryDeferredCleanup);
   window.removeEventListener('pageshow', retryDeferredCleanup);
  };
 }, [drainAndReleaseDeferredFiuuVtNativeState, nativeCleanupKey, vtRecoveryRetry]);

	useEffect(() => {
		if (!open || !storageKey || qrPayment) return;
		const stored = readStoredQrPayment(storageKey);
		if (!stored) return;
		if (stored.payment.integration === 'vt_app') beginFiuuVtCallbackDrain(stored.payment.id);
		qrAttemptKeyRef.current = stored.idempotencyKey;
		setQrPayment(stored.payment);
		setVtPrelaunchFailure(stored.vtPrelaunchFailure);
		setQrStatus('PENDING');
		setQrSecondsRemaining(Math.max(
			0,
			Math.ceil((new Date(stored.payment.expiresAt).getTime() - Date.now()) / 1000),
		));
		setQrPollError(stored.vtPrelaunchFailure
			? 'Fiuu VT tidak sempat dibuka sebelum aplikasi dimuat semula. Anda boleh cuba semula atau kembali ke troli.'
			: 'Percubaan DuitNow QR terdahulu dipulihkan. Menyemak status bayaran...');
	}, [beginFiuuVtCallbackDrain, open, qrPayment, storageKey]);

	useEffect(() => {
  if (!open || method === 'CASH' || trainingMode) return;

  let cancelled = false;
  setQrConfigLoading(true);
  setQrConfigError(null);
  setManualQrVerified(false);

  void fetchPosQrConfig(branchId)
   .then((config) => {
    if (!cancelled) setQrConfig(config);
   })
   .catch((error: unknown) => {
    if (!cancelled) {
     setQrConfig(null);
     setQrConfigError(error instanceof Error
      ? error.message
      : 'DuitNow QR cawangan gagal dimuatkan.');
    }
   })
   .finally(() => {
    if (!cancelled) setQrConfigLoading(false);
   });

  return () => {
   cancelled = true;
 };
	}, [branchId, method, open, qrConfigRetry, trainingMode]);

 useEffect(() => {
  if (!open || qrConfig?.mode !== 'FIUU_VT_APP' || trainingMode) {
   setVtNativeStatus(null);
   setVtStatusLoading(false);
   return;
  }
  let cancelled = false;
  setVtStatusLoading(true);
  void readFiuuVtStatus()
   .then((status) => {
    if (!cancelled) setVtNativeStatus(status);
   })
   .catch(() => {
    if (!cancelled) setVtNativeStatus({
     nativeAndroid: false,
     installed: false,
     trustedInstall: false,
     packageName: 'com.rms.mobile.razervt',
     versionName: '',
     pendingOrderId: null,
     pendingOperation: null,
     resultAvailable: false,
    });
   })
   .finally(() => {
    if (!cancelled) setVtStatusLoading(false);
   });
  return () => {
   cancelled = true;
  };
 }, [open, qrConfig?.mode, trainingMode]);

 const recoverFiuuVtPayment = useCallback(async (nativeStatus: FiuuVtNativeStatus) => {
  const orderId = nativeStatus.pendingOrderId;
  const currentShift = shift;
  if (!open || qrPayment || !currentShift || !storageKey || !orderId) return;
  if (vtRecoveryOrderRef.current === orderId) return;

  const paymentId = paymentIdFromFiuuVtOrderId(orderId);
  if (!paymentId) {
   setQrPollError('Rekod native Fiuu VT tidak sepadan dengan format transaksi RKJ One. Jangan jana SALE baharu.');
   return;
  }

  vtRecoveryOrderRef.current = orderId;
  beginFiuuVtCallbackDrain(paymentId);
  setCheckingQrStatus(true);
  try {
   const response = await fetchPosQrPayment(paymentId);
   const payment = response.payment;
   if (payment.provider !== 'fiuu_vt'
    || payment.provider_order_id !== orderId
    || payment.branch_id !== branchId
    || payment.shift_id !== currentShift.id) {
     throw new Error('Transaksi native Fiuu VT bukan milik sesi tablet cawangan yang aktif.');
   }
   if (['EXPIRED', 'FAILED', 'CANCELLED'].includes(payment.status)) {
    let queuedResult: FiuuVtNativeCallbackResult | null;
    try {
     queuedResult = await readActiveFiuuVtResult(paymentId);
    } catch {
     vtRecoveryOrderRef.current = null;
     scheduleFiuuVtRecoveryRetry(500);
     setQrPollError('Transaksi sudah tamat, tetapi antrean callback tablet belum dapat dibaca. Kaunter akan cuba dilepaskan semula secara automatik.');
     return;
    }
    if (queuedResult) {
     vtResultFingerprintRef.current = null;
     await processFiuuVtResultRef.current(queuedResult);
     vtRecoveryOrderRef.current = null;
     scheduleFiuuVtRecoveryRetry(500);
     setQrPollError('Transaksi sudah tamat. Callback terakhir sedang disahkan sebelum kaunter dilepaskan.');
     return;
    }
    if (vtCallbackDrainInProgressRef.current) {
     vtRecoveryOrderRef.current = null;
     scheduleFiuuVtRecoveryRetry(500);
     setQrPollError('Transaksi sudah tamat. RKJ One sedang membuat semakan kosong terakhir sebelum kembali ke troli.');
     return;
    }
    const finalizationSeal = captureFiuuVtFinalizationSeal(paymentId, true);
    if (!finalizationSeal) {
     vtRecoveryOrderRef.current = null;
     scheduleFiuuVtRecoveryRetry(500);
     setQrPollError('Transaksi sudah tamat, tetapi callback lewat sedang diproses. Kaunter kekal dikunci buat sementara.');
     return;
    }
    const nativeReleased = await releaseFiuuVtNativeState(orderId);
    const finalizationStillValid = isFiuuVtFinalizationSealValid(finalizationSeal);
    vtRecoveryOrderRef.current = null;
    if (!nativeReleased || !finalizationStillValid) scheduleFiuuVtRecoveryRetry(500);
    setQrPollError(
     nativeReleased && finalizationStillValid
      ? `Transaksi Fiuu VT sudah ${payment.status}. Kaunter telah dilepaskan dan troli boleh digunakan semula.`
      : `Transaksi Fiuu VT sudah ${payment.status}. Troli dikekalkan; callback lewat atau pembersihan terminal sedang diselesaikan secara automatik.`,
    );
    return;
   }
   if (!['PENDING', 'REPORTED', 'PAID'].includes(payment.status)) {
    throw new Error(`Status transaksi Fiuu VT ${payment.status} memerlukan semakan HQ.`);
   }
   if (Math.round(payment.amount_rm * 100) !== Math.round(total * 100)) {
    throw new Error('Amaun transaksi Fiuu VT tidak sepadan dengan troli semasa. Jangan jana SALE baharu.');
   }

   const fingerprint = payment.cart_fingerprint;
   if (!fingerprint) {
    throw new Error('Cap jari troli transaksi Fiuu VT tidak tersedia. Jangan kosongkan troli secara automatik.');
   }
   const activePayment: ActiveQrPayment = {
    id: payment.id,
    imageUrl: null,
    amountRm: payment.amount_rm,
    expiresAt: payment.expires_at ?? new Date().toISOString(),
    environment: 'production',
    integration: 'vt_app',
    providerOrderId: orderId,
    cartFingerprint: fingerprint,
   };
   const idempotencyKey = createPosPaymentIdempotencyKey();
   qrAttemptKeyRef.current = idempotencyKey;
   setMethod('QR');
   setCashTenderedOverride(null);
   setQrAmountOverride(payment.amount_rm.toFixed(2));
   setQrPayment(activePayment);
   setQrStatus(getRecoveredFiuuVtLocalStatus(payment.status));
   setQrSecondsRemaining(Math.max(
    0,
    Math.ceil((new Date(activePayment.expiresAt).getTime() - Date.now()) / 1000),
   ));
   setQrPollError(payment.reconciliation_expired
    ? 'Transaksi berbayar lama dipulihkan untuk rekonsiliasi cawangan ini. Jangan jana QR atau SALE baharu.'
    : payment.status === 'REPORTED' || payment.status === 'PAID'
     ? 'Bayaran terdahulu ditemui. Menyemak antrean callback tablet sebelum resit dikeluarkan...'
     : 'Transaksi Fiuu VT aktif dipulihkan daripada tablet. Menyemak keputusan yang sama...');
   storeActiveQrPayment(activePayment, idempotencyKey);
  } catch (error) {
    // A transient recovery read must be retryable on focus/online/manual
    // checks.  Keeping the order latched here would block every later attempt
    // until the WebView was fully reloaded.
    vtRecoveryOrderRef.current = null;
    scheduleFiuuVtRecoveryRetry();
   setQrPollError(error instanceof Error
    ? `Transaksi Fiuu VT tidak dapat dipulihkan: ${error.message}`
    : 'Transaksi Fiuu VT tidak dapat dipulihkan. Jangan jana SALE baharu.');
  } finally {
   setCheckingQrStatus(false);
  }
 }, [beginFiuuVtCallbackDrain, branchId, captureFiuuVtFinalizationSeal, isFiuuVtFinalizationSealValid, open, qrPayment, readActiveFiuuVtResult, releaseFiuuVtNativeState, scheduleFiuuVtRecoveryRetry, shift, storageKey, storeActiveQrPayment, total]);

 const handleDialogOpenChange = useCallback((nextOpen: boolean) => {
 if (!nextOpen && !vtReviewRequired && qrPayment
  && (qrStatus === 'PENDING' || qrStatus === 'REPORTED' || qrStatus === 'PAID')) {
   if (qrStatus === 'PENDING' && qrPayment.integration === 'vt_app') {
    setVtCancelConfirming(true);
   }
   toast.info(qrDisplayExpired
    ? 'Mulakan pembatalan di Fiuu VT. Pelepasan selamat boleh mengambil kira-kira 30 saat sementara STATUS disahkan.'
    : qrStatus === 'PENDING' && qrPayment.integration === 'vt_app'
    ? 'Sahkan pembatalan Fiuu VT untuk kembali ke troli, atau teruskan menunggu bayaran.'
    : 'Tunggu keputusan QR atau tekan “Semak sekarang” sebelum menutup bayaran.');
  return;
 }
 if (!nextOpen) resetPaymentForm();
 onOpenChange(nextOpen);
 }, [onOpenChange, qrDisplayExpired, qrPayment, qrStatus, resetPaymentForm, vtReviewRequired]);

 const reconcileQrPayment = useCallback(async (activePayment: ActiveQrPayment, manual = false) => {
  if (manual) setCheckingQrStatus(true);
  try {
   const response = await fetchPosQrPayment(activePayment.id);
   if (activeQrPaymentIdRef.current !== activePayment.id) return null;
   const status = response.payment.status;
    if (response.payment.fiuu_vt_review_required) {
     setVtPrelaunchFailure(null);
     vtReviewRequiredRef.current = true;
     setVtReviewRequired(true);
     setQrStatus(status);
     setQrPollError(
      'Bayaran ini dikunci untuk semakan HQ kerana keputusan Fiuu lewat atau bercanggah. Jangan caj pelanggan semula.',
     );
     return status;
    }
    if (!vtReviewRequiredRef.current) setVtReviewRequired(false);
   setQrPollError(null);
    const finalizationAllowed = canFinalizeFiuuVtPayment(
     vtCallbackDrainInProgressRef.current,
     vtReviewRequiredRef.current,
    );
    if (!finalizationAllowed && (status === 'REPORTED' || status === 'PAID')) {
     setQrStatus('PENDING');
     setQrPollError(vtReviewRequiredRef.current
      ? 'Bayaran ini dikunci untuk semakan HQ. Jangan caj pelanggan semula.'
      : 'Bayaran diterima. RKJ One sedang mengesahkan semua callback Fiuu VT sebelum mengeluarkan resit.');
     return status;
    }
    if (status === 'REPORTED') {
     setQrStatus('REPORTED');
     setQrPollError('Fiuu VT melaporkan bayaran berjaya. RKJ One sedang memuktamadkan jualan secara automatik.');
     return status;
    }
   if (status === 'PAID') {
    setQrStatus('PAID');
    if (!response.result) {
     setQrPollError('Bayaran telah diterima tetapi resit belum tersedia. Semak status semula; jangan jana QR baharu.');
     return status;
    }
    if (activePayment.integration === 'vt_app' && activePayment.providerOrderId) {
     const finalizationSeal = captureFiuuVtFinalizationSeal(activePayment.id);
     if (!finalizationSeal) {
      setQrStatus('PENDING');
      setQrPollError('Bayaran diterima. Callback terakhir sedang disahkan sebelum resit dikeluarkan.');
      return 'PENDING';
     }
     const nativeReleased = await releaseFiuuVtNativeState(activePayment.providerOrderId);
     if (!nativeReleased || !isFiuuVtFinalizationSealValid(finalizationSeal)) {
      setQrStatus('PENDING');
      setQrPollError(nativeReleased
       ? 'Bayaran diterima, tetapi callback lewat sedang diproses sebelum resit dipaparkan.'
       : 'Bayaran diterima, tetapi terminal masih mempunyai callback belum diproses. Semakan akan disambung automatik.');
      return 'PENDING';
     }
    }
    removeStoredQrPayment();
    if (currentPaymentFingerprint === activePayment.cartFingerprint) {
     clearCart();
    }
    toast.success('Bayaran disahkan. Resit dikeluarkan dan stok dikemas kini.');
    resetPaymentForm();
    onOpenChange(false);
    onSuccess(response.result);
    return status;
   }
   if (status === 'EXPIRED' || status === 'FAILED' || status === 'CANCELLED') {
    if (activePayment.integration === 'vt_app') {
     let queuedResult: FiuuVtNativeCallbackResult | null;
     try {
      queuedResult = await readActiveFiuuVtResult(activePayment.id);
     } catch {
      setQrStatus('PENDING');
      setQrPollError('Antrean callback Fiuu VT belum dapat disahkan. Kaunter kekal dikunci dan semakan akan dicuba semula.');
      return 'PENDING';
     }
     if (queuedResult) {
      vtResultFingerprintRef.current = null;
      queueMicrotask(() => void processFiuuVtResultRef.current(queuedResult));
      setQrStatus('PENDING');
      setQrPollError('Callback Fiuu VT tambahan sedang disahkan sebelum kaunter dilepaskan.');
      return 'PENDING';
     }
     if (vtCallbackDrainInProgressRef.current) {
      setQrStatus('PENDING');
      setQrPollError('Transaksi sudah tamat. RKJ One sedang membuat semakan kosong terakhir sebelum kembali ke troli.');
      return 'PENDING';
     }
    }
    if (activePayment.integration === 'vt_app' && activePayment.providerOrderId) {
     const finalizationSeal = captureFiuuVtFinalizationSeal(activePayment.id);
     if (!finalizationSeal) {
      setQrStatus('PENDING');
      setQrPollError('Callback lewat sedang diproses. Kaunter belum dilepaskan supaya transaksi tidak hilang.');
      return 'PENDING';
     }
     const nativeReleased = await releaseFiuuVtNativeState(activePayment.providerOrderId);
     if (!nativeReleased || !isFiuuVtFinalizationSealValid(finalizationSeal)) {
      setQrStatus('PENDING');
      setQrPollError('Terminal masih menyelesaikan callback terakhir. Troli dikekalkan dan pelepasan akan dicuba semula.');
      return 'PENDING';
     }
    }
    setQrStatus(status);
    removeStoredQrPayment();
    if (status === 'EXPIRED') {
     setQrPollError('Kod QR telah tamat tempoh. Troli masih ada dan bayaran baharu boleh dimulakan.');
    }
   }
   return status;
  } catch (error) {
   if (activeQrPaymentIdRef.current !== activePayment.id) return null;
   setQrPollError(error instanceof Error
    ? `Status bayaran tidak dapat disemak: ${error.message}`
    : 'Status bayaran tidak dapat disemak. Semak sambungan dan cuba lagi.');
   return null;
  } finally {
   if (manual) setCheckingQrStatus(false);
  }
 }, [captureFiuuVtFinalizationSeal, clearCart, currentPaymentFingerprint, isFiuuVtFinalizationSealValid, onOpenChange, onSuccess, readActiveFiuuVtResult, releaseFiuuVtNativeState, removeStoredQrPayment, resetPaymentForm]);

 const processFiuuVtResult = useCallback(async (result: FiuuVtNativeCallbackResult) => {
  const callbackPaymentId = paymentIdFromFiuuVtOrderId(result.orderId);
  if (!callbackPaymentId) {
   setQrPollError('Callback Fiuu VT tidak mempunyai nombor pesanan RKJ One yang sah.');
   return;
  }

  const activePayment = qrPayment;
  const isActivePayment = Boolean(
   activePayment
   && activePayment.integration === 'vt_app'
   && activePayment.id === callbackPaymentId
   && activePayment.providerOrderId === result.orderId,
  );
  const fingerprint = isFiuuVtErrorResult(result)
   ? [result.callbackAttemptId, result.callbackValidation, result.kind, result.opType, result.orderId, result.errorCode].join(':')
   : [result.callbackAttemptId, result.callbackValidation, result.opType, result.orderId, result.transactionId, result.status, result.amountRm].join(':');
  if (vtResultFingerprintRef.current === fingerprint) return;
  vtResultFingerprintRef.current = fingerprint;
  const drainPaymentId = activePayment?.integration === 'vt_app'
   ? activePayment.id
   : vtCallbackDrainScopeRef.current?.paymentId ?? callbackPaymentId;
  const callbackDrainScope = beginFiuuVtCallbackDrain(drainPaymentId);
  callbackDrainScope.callbacksProcessing += 1;
  if (isActivePayment) {
   setVtSaleOpened(true);
   setCheckingQrStatus(true);
  }
  let verifyDrainAfterCallback = false;

  const acknowledgeResult = async () => {
   if (isFiuuVtErrorResult(result)) await acknowledgeFiuuVtError(result);
   else await acknowledgeFiuuVtResult(result);
  };
  const processNextQueuedResult = async (): Promise<FiuuVtQueueReadOutcome> => {
   let nextResult: FiuuVtNativeCallbackResult | null;
   try {
    nextResult = await readActiveFiuuVtResult(drainPaymentId);
   } catch {
    // The queue could not be proven empty, so keep the drain latch closed and
    // let normal polling retry instead of exposing a premature receipt.
    if (isActivePayment) {
     setQrStatus('PENDING');
     setQrPollError('Antrean callback Fiuu VT belum dapat disahkan. RKJ One akan cuba semula secara automatik.');
    } else {
     vtRecoveryOrderRef.current = null;
     scheduleFiuuVtRecoveryRetry();
    }
    return 'read_failed';
   }
   if (!nextResult) {
    return 'empty';
   }
   vtResultFingerprintRef.current = null;
   queueMicrotask(() => void processFiuuVtResultRef.current(nextResult));
   return 'queued';
  };

  try {
   const response = await submitFiuuVtResult(callbackPaymentId, result);
   // The native queue is cleared only after the server durably accepts the exact
   // one-time callback. A network failure therefore remains safely retryable.
    await acknowledgeResult();
    if (vtCallbackRetryTimerRef.current !== null) {
     window.clearTimeout(vtCallbackRetryTimerRef.current);
     vtCallbackRetryTimerRef.current = null;
    }

   if (!isActivePayment || !activePayment) {
    vtResultFingerprintRef.current = null;
    const queueOutcome = await processNextQueuedResult();
    if (queueOutcome === 'empty') {
     vtRecoveryOrderRef.current = null;
     const refreshedStatus = await readFiuuVtStatus().catch(() => null);
     if (refreshedStatus) setVtNativeStatus(refreshedStatus);
     if (vtCallbackDrainInProgressRef.current) scheduleFiuuVtRecoveryRetry(500);
    } else if (queueOutcome === 'read_failed') {
     vtRecoveryOrderRef.current = null;
     scheduleFiuuVtRecoveryRetry();
    }
    return;
   }

   setQrPollError(response.warning ?? null);
   if (response.next_action === 'ACK_ONLY') {
    const queueOutcome = await processNextQueuedResult();
    if (queueOutcome !== 'empty') return;
    verifyDrainAfterCallback = true;
    setQrStatus('PENDING');
    setQrPollError('Callback diterima. RKJ One sedang membuat semakan kosong terakhir sebelum meneruskan jualan.');
    return;
   }
   if (response.next_action === 'ACK_AND_QUARANTINE') {
    // Latch the review state before exposing any server status. This prevents
    // the REPORTED auto-confirm effect from finalising a receipt while another
    // contradictory native callback is still being drained.
    vtReviewRequiredRef.current = true;
    setVtReviewRequired(true);
    setQrStatus(response.payment.status as QrPaymentStatus);
    setQrPollError(response.warning
     ?? 'Callback Fiuu VT bercanggah dan telah dikunci untuk semakan HQ. Jangan ulang bayaran pelanggan.');
    toast.warning('Transaksi dikunci untuk semakan HQ; callback bercanggah tidak digunakan.');
    const queueOutcome = await processNextQueuedResult();
    if (queueOutcome === 'empty') verifyDrainAfterCallback = true;
    return;
   }
   if (response.next_action === 'CHECK_STATUS') {
    setQrStatus('PENDING');
    setVtStatusRetryPending(true);
    if (result.opType === 'VOID') {
     setVtCancelRequested(true);
     toast.info('Keputusan pembatalan diterima. Menjalankan semakan STATUS Fiuu VT.');
    } else if (result.opType === 'SALE') {
     toast.info('Laporan SALE diterima. Menjalankan semakan STATUS Fiuu VT.');
    }
    const queueOutcome = await processNextQueuedResult();
    if (queueOutcome !== 'empty') return;
    vtResultFingerprintRef.current = null;
    try {
     const attempt = await prepareFiuuVtCallbackAttempt(activePayment.id, 'STATUS');
      vtOperationRetryAtRef.current = 0;
      await launchTrackedFiuuVt(
       activePayment.id,
       attempt,
       () => launchFiuuVtStatus(result.orderId, activePayment.amountRm, attempt),
      );
    } catch (statusError) {
     if (statusError instanceof PosQrPaymentError
      && statusError.mode === 'FIUU_VT_OPERATION_ACTIVE') {
      const retryAfterMs = statusError.retryAfterMs ?? FIUU_VT_STATUS_RETRY_MS;
      vtOperationRetryAtRef.current = Date.now() + retryAfterMs;
      setQrPollError(
       `Semakan STATUS sedang aktif. RKJ One akan menyambung automatik dalam kira-kira ${Math.max(1, Math.ceil(retryAfterMs / 1000))} saat tanpa membuka SALE kedua.`,
      );
      return;
     }
     throw statusError;
    }
    return;
   }
   if (response.next_action === 'CHECK_STATUS_LATER') {
    const queueOutcome = await processNextQueuedResult();
    if (queueOutcome !== 'empty') return;
    verifyDrainAfterCallback = true;
    setQrStatus('PENDING');
    setVtStatusRetryPending(true);
    vtOperationRetryAtRef.current = Date.now() + 2_000;
    setQrPollError(response.warning ?? 'Bayaran masih diproses oleh Fiuu. Semakan boleh diulang sebentar lagi.');
    return;
   }
   if (response.next_action === 'AUTO_CONFIRMATION') {
    // Android deliberately prioritizes STATUS=00, so another late SALE/STATUS
    // callback can still remain behind the successful result. Drain it before
    // exposing REPORTED to the auto-confirm effect. Otherwise a receipt can be
    // finalised before a later contradictory callback is quarantined.
    const queueOutcome = await processNextQueuedResult();
    if (queueOutcome === 'queued') {
     setQrStatus('PENDING');
     setQrPollError('Bayaran berjaya. RKJ One sedang mengesahkan callback tambahan sebelum terminal dilepaskan.');
     return;
    }
    if (queueOutcome === 'read_failed') return;
    // The successful callback itself has been consumed, but the queue was
    // observed while this callback processor was still active. Keep polling
    // until a fresh, successful empty read proves that no late callback can
    // contradict the payment before exposing REPORTED to auto-confirmation.
    setQrStatus('PENDING');
    setVtStatusRetryPending(false);
    setVtCancelConfirming(false);
    setVtCancelRequested(false);
    setQrPollError('Bayaran berjaya. RKJ One sedang melengkapkan semakan callback sebelum mengeluarkan resit.');
    verifyDrainAfterCallback = true;
    return;
   }

   if (response.payment.status === 'PAID') {
    const queueOutcome = await processNextQueuedResult();
    if (queueOutcome !== 'empty') return;
    setQrStatus('PENDING');
    setQrPollError('Bayaran dan resit telah direkodkan. RKJ One sedang memastikan antrean callback kosong sebelum melepaskan kaunter.');
    verifyDrainAfterCallback = true;
    return;
   }
   const queueOutcome = await processNextQueuedResult();
   if (queueOutcome === 'queued') {
    setQrStatus('PENDING');
    setQrPollError('Callback Fiuu VT tambahan sedang disahkan sebelum kaunter dilepaskan.');
    return;
   }
   if (queueOutcome === 'read_failed') return;
   setQrStatus('PENDING');
   setVtStatusRetryPending(false);
   setVtCancelConfirming(false);
   setVtCancelRequested(false);
   setQrPollError('Keputusan akhir diterima. RKJ One sedang membuat semakan kosong terakhir sebelum melepaskan kaunter.');
   verifyDrainAfterCallback = true;
  } catch (error) {
   if (isActivePayment && activePayment
    && error instanceof PosQrPaymentError
    && error.status === 409
    && error.mode === 'FIUU_VT_CALLBACK_ACTIVE') {
    const retryAfterMs = Math.max(500, Math.min(10_000, error.retryAfterMs ?? 1_000));
    vtResultFingerprintRef.current = fingerprint;
    setQrStatus('PENDING');
    setQrPollError(
     `Callback yang sama sedang disahkan. RKJ One akan cuba semula dalam kira-kira ${Math.max(1, Math.ceil(retryAfterMs / 1000))} saat tanpa membuka SALE kedua.`,
    );
    if (vtCallbackRetryTimerRef.current === null) {
     vtCallbackRetryTimerRef.current = window.setTimeout(() => {
      vtCallbackRetryTimerRef.current = null;
      if (activeQrPaymentIdRef.current !== callbackPaymentId) return;
      vtResultFingerprintRef.current = null;
      void readActiveFiuuVtResult(callbackPaymentId)
       .then((nextResult) => {
        if (nextResult) void processFiuuVtResultRef.current(nextResult);
       })
       .catch(() => {
        setQrStatus('PENDING');
        setQrPollError('Callback belum dapat dibaca semula. RKJ One akan terus mencuba secara automatik.');
       });
     }, retryAfterMs);
    }
    return;
   }
   vtResultFingerprintRef.current = null;
   if (isActivePayment) {
    setQrPollError(error instanceof Error
     ? `Keputusan Fiuu VT tidak dapat disahkan: ${error.message}`
     : 'Keputusan Fiuu VT tidak dapat disahkan.');
   } else {
    vtRecoveryOrderRef.current = null;
    scheduleFiuuVtRecoveryRetry(500);
   }
  } finally {
   callbackDrainScope.callbacksProcessing = Math.max(0, callbackDrainScope.callbacksProcessing - 1);
   if (isActivePayment) setCheckingQrStatus(false);
   if (!isActivePayment
    && callbackDrainScope.callbacksProcessing === 0
    && vtCallbackDrainInProgressRef.current) {
    scheduleFiuuVtRecoveryRetry(500);
   }
   if (verifyDrainAfterCallback && callbackDrainScope.callbacksProcessing === 0) {
     const expectedGeneration = callbackDrainScope.generation;
     queueMicrotask(() => {
      const currentScope = vtCallbackDrainScopeRef.current;
      if (currentScope !== callbackDrainScope
       || currentScope.generation !== expectedGeneration
       || activeQrPaymentIdRef.current !== activePayment?.id
       || !activePayment) return;
      void (async () => {
       try {
        const lateResult = await readActiveFiuuVtResult(callbackPaymentId);
        if (lateResult) {
         vtResultFingerprintRef.current = null;
         await processFiuuVtResultRef.current(lateResult);
         return;
        }
        await reconcileQrPayment(activePayment, true);
       } catch (verificationError) {
        setQrStatus('PENDING');
        setQrPollError(verificationError instanceof Error
         ? `Semakan akhir callback belum selesai: ${verificationError.message}`
         : 'Semakan akhir callback belum selesai. RKJ One akan cuba semula secara automatik.');
       }
      })();
     });
   }
  }
 }, [beginFiuuVtCallbackDrain, qrPayment, readActiveFiuuVtResult, reconcileQrPayment, scheduleFiuuVtRecoveryRetry]);

 useEffect(() => {
  processFiuuVtResultRef.current = processFiuuVtResult;
 }, [processFiuuVtResult]);

 useEffect(() => {
  if (!open
   || qrPayment
   || !vtNativeStatus?.nativeAndroid
   || (!vtNativeStatus.pendingOrderId
    && !vtNativeStatus.resultAvailable
    && !vtCallbackDrainInProgressRef.current
    && !vtCallbackDrainScopeRef.current)) return;
  let cancelled = false;
  void (async () => {
   const status = await readFiuuVtStatus();
   if (cancelled) return;
   setVtNativeStatus(status);
   if (status.pendingOrderId) {
    await recoverFiuuVtPayment(status);
    return;
   }

   const drainScope = vtCallbackDrainScopeRef.current;
   if (status.resultAvailable) {
    const result = drainScope
     ? await readActiveFiuuVtResult(drainScope.paymentId)
     : await readPendingFiuuVtResult();
    if (cancelled) return;
    if (result) {
     vtResultFingerprintRef.current = null;
     await processFiuuVtResultRef.current(result);
     return;
    }
   }

   const remainingScope = vtCallbackDrainScopeRef.current;
   if (remainingScope) {
    const result = await readActiveFiuuVtResult(remainingScope.paymentId);
    if (cancelled) return;
    if (result) {
     vtResultFingerprintRef.current = null;
     await processFiuuVtResultRef.current(result);
     return;
    }
    if (vtCallbackDrainInProgressRef.current) {
     scheduleFiuuVtRecoveryRetry(500);
     return;
    }
   }

   vtRecoveryOrderRef.current = null;
   resetFiuuVtCallbackDrain();
  })().catch(() => {
   if (!cancelled) scheduleFiuuVtRecoveryRetry(500);
  });
  return () => {
   cancelled = true;
  };
 }, [
  open,
  qrPayment,
  readActiveFiuuVtResult,
  recoverFiuuVtPayment,
  resetFiuuVtCallbackDrain,
  scheduleFiuuVtRecoveryRetry,
  vtNativeStatus?.nativeAndroid,
  vtNativeStatus?.pendingOrderId,
  vtNativeStatus?.resultAvailable,
  vtCallbackDrainInProgress,
  vtRecoveryRetry,
 ]);

 useEffect(() => {
  let cancelled = false;
  let listener: Awaited<ReturnType<typeof listenForFiuuVtResult>> = null;
  void listenForFiuuVtResult((result) => {
   if (!cancelled) void processFiuuVtResultRef.current(result);
  }).then((handle) => {
   if (cancelled) {
    void handle?.remove();
    return;
   }
   listener = handle;
  }).catch(() => {
   // The durable native queue is also read below, so listener registration
   // failure remains recoverable without duplicating callbacks.
  });
  void readPendingFiuuVtResult()
   .then((result) => {
    if (!cancelled && result) void processFiuuVtResultRef.current(result);
   })
   .catch(() => {
    if (!cancelled) scheduleFiuuVtRecoveryRetry(500);
   });
  return () => {
   cancelled = true;
   void listener?.remove();
  };
 }, [scheduleFiuuVtRecoveryRetry]);

 const runActiveQrStatusCheck = useCallback(async () => {
  if (!qrPayment) return;
  if (qrPayment.integration === 'vt_app') {
   if (!qrPayment.providerOrderId) return;
   const operationWaitMs = vtOperationRetryAtRef.current - Date.now();
   if (operationWaitMs > 0) {
    setQrPollError(
     `Semakan Fiuu VT akan disambung automatik dalam kira-kira ${Math.max(1, Math.ceil(operationWaitMs / 1000))} saat.`,
    );
    return;
   }
   vtOperationRetryAtRef.current = 0;
   setCheckingQrStatus(true);
   setQrPollError(null);
   vtResultFingerprintRef.current = null;
   try {
    const pendingResult = await readActiveFiuuVtResult(qrPayment.id);
     if (pendingResult) {
      await processFiuuVtResult(pendingResult);
       if (!isFiuuVtErrorResult(pendingResult)) return;
       if (pendingResult.opType === 'SALE' && !qrDisplayExpired) return;
     }
     const nativeStatus = await readFiuuVtStatus();
      if (nativeStatus.pendingOperation === 'VOID') {
       setVtCancelRequested(true);
        const startedAt = nativeStatus.pendingOperationStartedAt ?? Date.now();
        const retryInSeconds = Math.max(1, Math.ceil((30_000 - (Date.now() - startedAt)) / 1000));
        setQrPollError(
         `Pembatalan sedang diproses oleh Fiuu VT. Semakan STATUS akan disambung automatik dalam kira-kira ${retryInSeconds} saat.`,
        );
       return;
      }
      if (nativeStatus.pendingOperation === 'STATUS'
       && nativeStatus.pendingOperationStartedAt
       && Date.now() - nativeStatus.pendingOperationStartedAt < FIUU_VT_STATUS_RETRY_MS) {
       setQrPollError('Semakan STATUS sedang diproses oleh Fiuu VT. RKJ One akan cuba semula secara automatik jika tiada jawapan.');
       return;
      }
     if (nativeStatus.pendingOperation === 'SALE' && !qrDisplayExpired) {
       setVtSaleOpened(true);
      setQrPollError('RKJ One masih menunggu keputusan SALE asal daripada Fiuu VT. Jangan buka STATUS atau SALE baharu.');
      return;
     }
    const serverStatus = await reconcileQrPayment(qrPayment);
    if (!shouldLaunchFiuuVtStatusAfterReconcile(serverStatus)) return;
    if (qrDisplayExpired) {
     setQrPollError('Meminta status akhir daripada Fiuu VT untuk melepaskan kaunter dengan selamat...');
    }
    const attempt = await prepareFiuuVtCallbackAttempt(qrPayment.id, 'STATUS');
    setVtStatusRetryPending(true);
    await launchTrackedFiuuVt(
     qrPayment.id,
     attempt,
     () => launchFiuuVtStatus(qrPayment.providerOrderId!, qrPayment.amountRm, attempt),
    );
   } catch (error) {
    if (error instanceof PosQrPaymentError
     && error.mode === 'FIUU_VT_OPERATION_ACTIVE') {
     const retryAfterMs = error.retryAfterMs ?? FIUU_VT_STATUS_RETRY_MS;
     vtOperationRetryAtRef.current = Date.now() + retryAfterMs;
     setVtStatusRetryPending(true);
     setQrPollError(
      `Semakan STATUS sedang aktif. RKJ One akan cuba semula automatik dalam kira-kira ${Math.max(1, Math.ceil(retryAfterMs / 1000))} saat; semakan kedua tidak dibuka.`,
     );
    } else {
     setQrPollError(error instanceof Error ? error.message : 'Fiuu VT tidak dapat dibuka.');
    }
   } finally {
    setCheckingQrStatus(false);
   }
   return;
  }
  await reconcileQrPayment(qrPayment, true);
 }, [processFiuuVtResult, qrDisplayExpired, qrPayment, readActiveFiuuVtResult, reconcileQrPayment]);

 const checkActiveQrStatus = useCallback((): Promise<void> => {
  if (statusCheckInFlightRef.current) return statusCheckInFlightRef.current;
  const inFlight = runActiveQrStatusCheck().finally(() => {
   if (statusCheckInFlightRef.current === inFlight) {
    statusCheckInFlightRef.current = null;
   }
  });
  statusCheckInFlightRef.current = inFlight;
  return inFlight;
 }, [runActiveQrStatusCheck]);

 const requestFiuuVtCancellation = useCallback(async () => {
  if (!qrPayment || qrPayment.integration !== 'vt_app' || !qrPayment.providerOrderId) return;
  setCheckingQrStatus(true);
  setVtCancelConfirming(false);
  setQrPollError(null);
  vtResultFingerprintRef.current = null;
  try {
   const pendingResult = await readActiveFiuuVtResult(qrPayment.id);
   if (pendingResult) {
    await processFiuuVtResult(pendingResult);
    if (!isFiuuVtErrorResult(pendingResult)) return;
   }

   const serverStatus = await reconcileQrPayment(qrPayment);
   if (serverStatus === null) {
    throw new Error('Status bayaran tidak dapat disahkan. Sambungkan internet dan cuba semula.');
   }
   if (serverStatus !== 'PENDING') return;

   const nativeStatus = await readFiuuVtStatus();
   setVtNativeStatus(nativeStatus);
   if ((nativeStatus.bridgeApiVersion ?? 1) < 3) {
    throw new Error('Kemas kini RKJ One Staff diperlukan sebelum bayaran boleh dibatalkan dengan selamat.');
   }
   if (nativeStatus.pendingOrderId !== qrPayment.providerOrderId) {
    throw new Error('Percubaan Fiuu VT aktif tidak sepadan. Semak status sebelum memulakan bayaran baharu.');
   }

   const attempt = await prepareFiuuVtCallbackAttempt(qrPayment.id, 'VOID');
    vtOperationRetryAtRef.current = 0;
    await launchTrackedFiuuVt(
     qrPayment.id,
     attempt,
     () => launchFiuuVtVoid(qrPayment.providerOrderId!, attempt),
    );
   setVtCancelRequested(true);
   setQrPollError(
    'Sahkan pembatalan dalam aplikasi Fiuu VT. Kaunter kekal dikunci sehingga Fiuu mengesahkan status dibatalkan atau tamat.',
   );
  } catch (error) {
   if (error instanceof PosQrPaymentError
    && error.mode === 'FIUU_VT_OPERATION_ACTIVE') {
    const retryAfterMs = error.retryAfterMs ?? FIUU_VT_STATUS_RETRY_MS;
    vtOperationRetryAtRef.current = Date.now() + retryAfterMs;
    setVtCancelRequested(true);
    setQrPollError(
     `Permintaan batal sedang aktif. RKJ One akan menyemak semula dalam kira-kira ${Math.max(1, Math.ceil(retryAfterMs / 1000))} saat; VOID kedua tidak dihantar.`,
    );
   } else {
    setVtCancelRequested(false);
    setQrPollError(error instanceof Error ? error.message : 'Pembatalan Fiuu VT tidak dapat dimulakan.');
   }
  } finally {
   setCheckingQrStatus(false);
  }
 }, [processFiuuVtResult, qrPayment, readActiveFiuuVtResult, reconcileQrPayment]);

 const retryFiuuVtSaleLaunch = useCallback(async () => {
  if (!qrPayment || qrPayment.integration !== 'vt_app' || !qrPayment.providerOrderId) return;
  setCheckingQrStatus(true);
  setQrPollError(null);
  let attempt: FiuuVtCallbackAttempt | null = null;
  try {
   const serverStatus = await reconcileQrPayment(qrPayment);
   if (serverStatus === null) {
    throw new Error('Status bayaran tidak dapat disahkan. Sambungkan internet dan cuba semula.');
   }
   if (serverStatus !== 'PENDING') return;

   attempt = await prepareFiuuVtCallbackAttempt(qrPayment.id, 'SALE');
   // Keep the earlier safe-cancellation proof until the server has prepared a
   // replacement callback identity. From this point onward the new provider
   // launch is authoritative and only its own pre-launch failure may release it.
   setVtPrelaunchFailure(null);
   storeActiveQrPayment(qrPayment, qrAttemptKeyRef.current);
   await launchTrackedFiuuVt(
    qrPayment.id,
    attempt,
    () => launchFiuuVtSale(qrPayment.providerOrderId!, qrPayment.amountRm, attempt!),
   );
   setVtSaleOpened(true);
   toast.info('Fiuu VT dibuka semula. Paparkan QR kepada pelanggan.');
  } catch (error) {
   const errorCode = fiuuVtNativeErrorCode(error);
   if (attempt && errorCode && isFiuuVtSafePreLaunchError(error)) {
    const failure = { attemptId: attempt.attemptId, errorCode };
    setVtPrelaunchFailure(failure);
    storeActiveQrPayment(qrPayment, qrAttemptKeyRef.current, failure);
   }
   setQrPollError(error instanceof Error ? error.message : 'Aplikasi Fiuu VT tidak dapat dibuka.');
  } finally {
   setCheckingQrStatus(false);
  }
 }, [qrPayment, reconcileQrPayment, storeActiveQrPayment]);

 const cancelPrelaunchFiuuVtPayment = useCallback(async () => {
  if (!qrPayment || !vtPrelaunchFailure) return;
  setCheckingQrStatus(true);
  setQrPollError(null);
  try {
   await cancelUnlaunchedFiuuVtPayment(
    qrPayment.id,
    vtPrelaunchFailure.attemptId,
    vtPrelaunchFailure.errorCode,
   );
   removeStoredQrPayment();
   resetPaymentForm();
   onOpenChange(false);
   toast.info('Percubaan yang tidak sempat membuka Fiuu VT dibatalkan. Troli dikekalkan.');
  } catch (error) {
   setQrPollError(error instanceof Error
    ? error.message
    : 'Percubaan belum dapat dibatalkan. Semak status sebelum cuba lagi.');
  } finally {
   setCheckingQrStatus(false);
  }
 }, [onOpenChange, qrPayment, removeStoredQrPayment, resetPaymentForm, vtPrelaunchFailure]);

 const confirmReportedFiuuVt = useCallback(async (): Promise<boolean> => {
  if (!qrPayment || qrPayment.integration !== 'vt_app' || !qrPayment.providerOrderId) return false;
  const finalizationSeal = captureFiuuVtFinalizationSeal(qrPayment.id);
  if (!finalizationSeal) {
   setQrStatus('PENDING');
   setQrPollError(vtReviewRequiredRef.current
    ? 'Bayaran ini dikunci untuk semakan HQ. Jangan caj pelanggan semula.'
    : 'RKJ One sedang mengesahkan callback Fiuu VT tambahan sebelum mengeluarkan resit.');
   return false;
  }
  setLoading(true);
  setQrPollError(null);
  try {
   const response = await confirmFiuuVtPayment(qrPayment.id);
   let receipt = response.result;
   if (!receipt) {
    const current = await fetchPosQrPayment(qrPayment.id);
    receipt = current.result ?? undefined;
   }
   if (!receipt) throw new Error('Bayaran disahkan tetapi resit belum tersedia. Semak status semula.');
   if (!isFiuuVtFinalizationSealValid(finalizationSeal)) {
    setQrStatus('PENDING');
    setQrPollError('Bayaran diterima, tetapi callback lewat sedang disahkan sebelum resit dipaparkan.');
    return false;
   }
   const nativeReleased = await releaseFiuuVtNativeState(qrPayment.providerOrderId);
   if (!nativeReleased || !isFiuuVtFinalizationSealValid(finalizationSeal)) {
    setQrStatus('PENDING');
    setQrPollError(nativeReleased
     ? 'Bayaran diterima, tetapi callback lewat sedang diproses. Resit akan dipaparkan selepas semakan selesai.'
     : 'Bayaran diterima, tetapi terminal masih mempunyai callback belum diproses. Semakan akan disambung automatik.');
    return false;
   }
   removeStoredQrPayment();
   if (currentPaymentFingerprint === qrPayment.cartFingerprint) clearCart();
   toast.success('Bayaran disahkan. Resit dikeluarkan dan stok dikemas kini.');
   resetPaymentForm();
   onOpenChange(false);
   onSuccess(receipt);
    return true;
  } catch (error) {
   const message = error instanceof Error ? error.message : 'Bayaran Fiuu VT gagal disahkan.';
   setQrPollError(message);
   toast.error(message);
    return false;
  } finally {
   setLoading(false);
  }
 }, [captureFiuuVtFinalizationSeal, clearCart, currentPaymentFingerprint, isFiuuVtFinalizationSealValid, onOpenChange, onSuccess, qrPayment, releaseFiuuVtNativeState, removeStoredQrPayment, resetPaymentForm]);

 useEffect(() => {
  if (!open || vtReviewRequired || vtCallbackDrainInProgress || qrStatus !== 'REPORTED'
   || !qrPayment || qrPayment.integration !== 'vt_app') return;
  let cancelled = false;
  let retryTimer: number | undefined;
  let attempt = 0;
  const confirm = async () => {
   const completed = await confirmReportedFiuuVt();
   if (completed || cancelled) return;
   if (attempt >= 4) {
    setQrPollError(
     'Bayaran berjaya tetapi resit belum dapat dimuktamadkan selepas beberapa cubaan. Tekan “Cuba sahkan automatik semula”; jangan caj pelanggan lagi.',
    );
    return;
   }
   const delay = Math.min(2_000 * (2 ** attempt), 15_000);
   attempt += 1;
   retryTimer = window.setTimeout(() => void confirm(), delay);
  };
  void confirm();
  return () => {
   cancelled = true;
   if (retryTimer !== undefined) window.clearTimeout(retryTimer);
  };
 }, [confirmReportedFiuuVt, open, qrPayment, qrStatus, vtCallbackDrainInProgress, vtReviewRequired]);

 useEffect(() => {
  if (!qrPayment
   || vtReviewRequired
   || (qrStatus !== 'PENDING'
    && qrStatus !== 'PAID'
    && !(qrStatus === 'REPORTED' && qrPayment.integration === 'cloudecr'))) return;
  let active = true;
  let polling = false;
  let pollTimer: number | undefined;
  let pollAttempt = 0;
  const pollDelaysMs = [750, 1_500, 2_500, 4_000];

  const refreshCountdown = () => {
   const remaining = Math.max(0, Math.ceil((new Date(qrPayment.expiresAt).getTime() - Date.now()) / 1000));
   if (active) setQrSecondsRemaining(remaining);
  };
  const poll = async () => {
   if (polling) return;
   polling = true;
   try {
    if (!active) return;
    if (qrPayment.integration === 'vt_app') {
      let pendingResult: FiuuVtNativeCallbackResult | null;
      try {
       pendingResult = await readActiveFiuuVtResult(qrPayment.id);
      } catch {
       setQrStatus('PENDING');
       setQrPollError('Antrean callback Fiuu VT belum dapat dibaca. Kaunter kekal dikunci dan semakan akan dicuba semula.');
       return;
      }
     if (pendingResult) {
      await processFiuuVtResult(pendingResult);
       if (!isFiuuVtErrorResult(pendingResult)) return;
     }
      if (vtCancelRequested || vtStatusRetryPending || qrDisplayExpired) {
       await checkActiveQrStatus();
       return;
      }
    }
    await reconcileQrPayment(qrPayment);
   } finally {
    polling = false;
    if (active) pollAttempt = Math.min(pollAttempt + 1, pollDelaysMs.length - 1);
   }
  };

  refreshCountdown();
   void poll();
  const countdownTimer = window.setInterval(refreshCountdown, 1000);
    const schedulePoll = () => {
     if (!active) return;
     const delay = pollDelaysMs[pollAttempt] + Math.floor(Math.random() * 500);
     pollTimer = window.setTimeout(async () => {
      await poll();
      schedulePoll();
     }, delay);
    };
    schedulePoll();
   const resumePolling = () => {
     if (document.visibilityState === 'visible') {
      pollAttempt = 0;
      refreshCountdown();
      void poll();
     }
   };
   window.addEventListener('online', resumePolling);
    window.addEventListener('focus', resumePolling);
    window.addEventListener('pageshow', resumePolling);
   document.addEventListener('visibilitychange', resumePolling);
  return () => {
   active = false;
   window.clearInterval(countdownTimer);
     if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    window.removeEventListener('online', resumePolling);
     window.removeEventListener('focus', resumePolling);
     window.removeEventListener('pageshow', resumePolling);
    document.removeEventListener('visibilitychange', resumePolling);
  };
 }, [checkActiveQrStatus, processFiuuVtResult, qrDisplayExpired, qrPayment, qrStatus, readActiveFiuuVtResult, reconcileQrPayment, vtCancelRequested, vtReviewRequired, vtStatusRetryPending]);

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
  const usesAutomaticQr = qrConfig?.mode === 'FIUU_DYNAMIC'
   || qrConfig?.mode === 'FIUU_CLOUDECR'
   || (qrConfig?.mode === 'FIUU_VT_APP' && !vtManualFallback);
  if (usesQr && usesAutomaticQr) {
  try {
    if (qrConfig?.mode === 'FIUU_VT_APP'
     && (!vtNativeStatus?.nativeAndroid || !vtNativeStatus.installed || !vtNativeStatus.trustedInstall)) {
     throw new Error('Aplikasi rasmi Fiuu VT daripada Managed Google Play belum tersedia. Gunakan QR cawangan manual.');
    }
   if (qrConfig?.mode === 'FIUU_VT_APP') {
    const deferredCleanupOrderId = readDeferredFiuuVtNativeCleanup(nativeCleanupKey);
    if (deferredCleanupOrderId
      && !await drainAndReleaseDeferredFiuuVtNativeState(deferredCleanupOrderId)) {
     throw new Error('Terminal Fiuu VT sedang membersihkan transaksi terdahulu. Tunggu beberapa saat dan tekan Sahkan Bayaran semula.');
    }
   }
   if (storageKey) {
    const stored = readStoredQrPayment(storageKey);
    if (stored) {
     if (stored.payment.integration === 'vt_app') {
      beginFiuuVtCallbackDrain(stored.payment.id);
     }
     qrAttemptKeyRef.current = stored.idempotencyKey;
     setQrPayment(stored.payment);
     setVtPrelaunchFailure(stored.vtPrelaunchFailure);
     setQrStatus('PENDING');
     setQrSecondsRemaining(1);
     setQrPollError(stored.vtPrelaunchFailure
      ? 'Fiuu VT tidak sempat dibuka sebelum aplikasi dimuat semula. Anda boleh cuba semula atau kembali ke troli.'
      : 'Percubaan DuitNow QR terdahulu dipulihkan. Menyemak status bayaran...');
     toast.info('Bayaran QR terdahulu masih perlu diselesaikan.');
     return;
    }
   }
    if (qrConfig?.mode === 'FIUU_VT_APP') {
     if (vtReviewRequiredRef.current) {
      throw new Error('Transaksi Fiuu VT terdahulu memerlukan semakan HQ. SALE baharu disekat.');
     }
     const freshNativeStatus = await readFiuuVtStatus();
     setVtNativeStatus(freshNativeStatus);
     if (!freshNativeStatus.nativeAndroid
      || !freshNativeStatus.installed
      || !freshNativeStatus.trustedInstall) {
      throw new Error('Terminal Fiuu VT rasmi tidak tersedia atau tidak dipercayai. SALE baharu tidak dihantar.');
     }
     if (freshNativeStatus.pendingOrderId) {
      await recoverFiuuVtPayment(freshNativeStatus);
      throw new Error('Transaksi Fiuu VT terdahulu sedang dipulihkan. Selesaikan atau batalkan transaksi itu dahulu.');
     }
     if (freshNativeStatus.resultAvailable || vtCallbackDrainInProgressRef.current) {
      scheduleFiuuVtRecoveryRetry(500);
      throw new Error('Antrean callback Fiuu VT masih disahkan. Tunggu sebentar; SALE baharu tidak dihantar.');
     }
    }
   const idempotencyKey = qrAttemptKeyRef.current ?? createPosPaymentIdempotencyKey();
   qrAttemptKeyRef.current = idempotencyKey;
   const { payment } = await createPosQrPayment(payload, idempotencyKey);
   if (payment.status === 'PAID' && payment.integration !== 'vt_app') {
    const existing = await fetchPosQrPayment(payment.id);
    if (!existing.result) throw new Error('Resit bayaran Fiuu belum tersedia. Cuba semula.');
    removeStoredQrPayment();
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
    if (!payment.expires_at
     || (payment.integration === 'opa' && !payment.qr_image_url)
     || ((payment.integration === 'vt_app' || payment.integration === 'cloudecr')
      && !payment.provider_order_id)) {
     throw new Error(payment.integration === 'vt_app' || payment.integration === 'cloudecr'
      ? 'Percubaan Fiuu sedang disediakan. Cuba semula sebentar lagi.'
      : 'Kod QR Fiuu masih dijana. Cuba semula sebentar lagi.');
   }
   const activePayment: ActiveQrPayment = {
    id: payment.id,
    imageUrl: payment.qr_image_url,
    amountRm: payment.amount_rm,
    expiresAt: payment.expires_at,
    environment: payment.environment,
     integration: payment.integration,
     providerOrderId: payment.provider_order_id,
    cartFingerprint: posPaymentFingerprint(payload),
   };
   if (activePayment.integration === 'vt_app') {
    beginFiuuVtCallbackDrain(activePayment.id);
   }
   setQrPayment(activePayment);
   setQrStatus(activePayment.integration === 'vt_app'
    ? 'PENDING'
    : payment.status === 'REPORTED' ? 'REPORTED' : 'PENDING');
   setQrSecondsRemaining(1);
   setQrPollError(null);
   setQrImageError(false);
   storeActiveQrPayment(activePayment, idempotencyKey);
   if (activePayment.integration === 'vt_app'
    && (payment.status === 'REPORTED' || payment.status === 'PAID')) {
     setVtSaleOpened(true);
     setQrPollError(payment.status === 'PAID'
      ? 'Bayaran dan resit terdahulu ditemui. RKJ One sedang menyemak antrean callback tablet sebelum melepaskan kaunter.'
      : 'Fiuu VT telah melaporkan bayaran berjaya. RKJ One sedang menyemak antrean callback tablet sebelum memuktamadkan jualan.');
     toast.info('Bayaran Fiuu VT terdahulu sedang disahkan dengan selamat.');
    return;
   }
   if (payment.status === 'REPORTED') {
      setVtSaleOpened(true);
     setQrPollError('Fiuu VT telah melaporkan bayaran berjaya. Jangan buka SALE baharu; RKJ One sedang memuktamadkan jualan secara automatik.');
     toast.info('Bayaran Fiuu VT terdahulu sedang disahkan secara automatik.');
    return;
   }
    if (activePayment.integration === 'vt_app' && activePayment.providerOrderId) {
      setVtSaleOpened(false);
      setVtPrelaunchFailure(null);
      let attempt: FiuuVtCallbackAttempt | null = null;
     try {
       attempt = await prepareFiuuVtCallbackAttempt(activePayment.id, 'SALE');
       await launchTrackedFiuuVt(
        activePayment.id,
        attempt,
         () => launchFiuuVtSale(activePayment.providerOrderId!, activePayment.amountRm, attempt!),
       );
       setVtSaleOpened(true);
      toast.info('Selesaikan pembayaran dalam aplikasi Fiuu VT.');
     } catch (launchError) {
       const errorCode = fiuuVtNativeErrorCode(launchError);
       if (attempt && errorCode && isFiuuVtSafePreLaunchError(launchError)) {
        const failure = { attemptId: attempt.attemptId, errorCode };
        setVtPrelaunchFailure(failure);
        storeActiveQrPayment(activePayment, idempotencyKey, failure);
       }
      setQrPollError(launchError instanceof Error
       ? launchError.message
       : 'Aplikasi Fiuu VT tidak dapat dibuka.');
     }
    } else {
     toast.info('Imbas DuitNow QR dan tunggu pengesahan Fiuu.');
    }
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

 const { result, manual_payment_review_error: manualReviewError } = await createSale(payload);
 if (usesQr && manualReviewError) {
  toast.warning(
   `Jualan ${result.receipt_number} direkod, tetapi senarai semakan Kewangan gagal dikemas kini. Hubungi HQ dan jangan rekod jualan semula.`,
   { duration: 12_000 },
  );
 } else if (usesQr) toast.success('Bayaran DuitNow QR cawangan telah direkod untuk semakan Kewangan.');
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
       <p className="font-bold text-emerald-950">
        {qrPayment.integration === 'cloudecr'
         ? 'DuitNow QR melalui Fiuu VT+'
         : qrPayment.integration === 'vt_app'
          ? 'DuitNow QR melalui Fiuu VT'
          : 'DuitNow QR melalui Fiuu'}
       </p>
       <p className="text-xs text-muted-foreground">
        {qrPayment.integration === 'cloudecr'
         ? 'QR amaun tepat dihantar secara selamat ke aplikasi Fiuu VT+ yang terikat pada tablet.'
         : qrPayment.integration === 'vt_app'
         ? 'QR amaun tepat dipaparkan oleh aplikasi rasmi Fiuu pada tablet.'
         : 'Imbas menggunakan aplikasi bank atau e-dompet yang menyokong DuitNow.'}
       </p>
     </div>
     <span className={cn(
      'rounded-full px-2.5 py-1 text-xs font-semibold',
       qrStatus === 'PENDING' ? 'bg-amber-100 text-amber-900' :
       qrStatus === 'REPORTED' ? 'bg-sky-100 text-sky-900' :
      qrStatus === 'PAID' ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900')}
     >
       {qrStatus === 'PENDING'
        ? (vtCancelRequested ? 'Membatalkan' : qrDisplayExpired ? 'Menyemak tamat tempoh' : 'Menunggu')
        : qrStatus === 'REPORTED' ? 'Dilaporkan berjaya'
        : qrStatus === 'PAID' ? 'Dibayar'
        : qrStatus === 'EXPIRED' ? 'Tamat tempoh'
        : qrStatus === 'CANCELLED' ? 'Dibatalkan'
        : 'Gagal'}
     </span>
    </div>

     {qrPayment.integration === 'vt_app'
      && (qrStatus === 'PENDING' || qrStatus === 'REPORTED' || qrStatus === 'PAID') && (
       <FiuuVtStaffSteps stage={qrStatus === 'PENDING' ? (vtSaleOpened ? 'PAYMENT' : 'READY') : 'FINALIZING'} />
     )}

     {qrStatus === 'REPORTED' ? (
      <div className="mt-5 rounded-xl border-2 border-sky-200 bg-sky-50 p-5">
       <CheckCircle2 className="mx-auto h-11 w-11 text-sky-700" aria-hidden="true" />
       <p className="mt-3 font-bold text-sky-950">Fiuu VT melaporkan status berjaya</p>
       <p className="mt-1 text-sm text-sky-900">
         RKJ One sedang mengesahkan amaun {formatRM(qrPayment.amountRm)}, mengeluarkan resit dan mengemas kini stok secara automatik.
       </p>
       <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-amber-900">
         Jika sambungan terputus, transaksi kekal terkunci dan boleh dicuba semula tanpa mencipta jualan berganda.
       </p>
      </div>
     ) : qrStatus === 'PENDING' && (!qrDisplayExpired || vtCancelRequested) ? (
     <>
       {qrPayment.integration === 'vt_app' || qrPayment.integration === 'cloudecr' ? (
        <div className="mx-auto mt-4 flex min-h-56 w-full max-w-[18rem] flex-col items-center justify-center gap-3 rounded-2xl border bg-white p-5 shadow-sm">
         <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-100 to-emerald-100">
          <QrCode className="h-12 w-12 text-amber-800" aria-hidden="true" />
         </div>
         <p className="font-semibold text-foreground">
          {qrPayment.integration === 'cloudecr' ? 'Teruskan pada aplikasi Fiuu VT+' : 'Teruskan pada aplikasi Fiuu VT'}
         </p>
         <p className="text-xs text-muted-foreground">Pelanggan mengimbas QR yang dipaparkan dalam aplikasi Fiuu.</p>
        </div>
       ) : (
       <div className="mx-auto mt-4 w-full max-w-[18rem] overflow-hidden rounded-2xl border bg-white p-3 shadow-sm">
        {qrImageError || !qrPayment.imageUrl ? (
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
       )}
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
         {vtCancelRequested
          ? 'Menunggu keputusan pembatalan daripada Fiuu VT'
          : qrPayment.integration === 'cloudecr'
         ? 'Menunggu pengesahan selamat daripada Fiuu cloudECR'
         : qrPayment.integration === 'vt_app'
         ? 'Menunggu keputusan daripada aplikasi Fiuu VT'
         : 'Menunggu pengesahan selamat daripada Fiuu'}
      </div>
      {qrPayment.integration === 'vt_app' ? (
       <p className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-900">
        Terminal Fiuu VT aktif — bayaran ini menggunakan transaksi sebenar
       </p>
      ) : qrPayment.environment === 'sandbox' && (
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
        : qrStatus === 'EXPIRED'
        ? 'Fiuu mengesahkan QR telah tamat. Troli dikekalkan; cuba bayaran baharu. Jika pelanggan menunjukkan bukti debit, jangan cuba semula dan hubungi HQ.'
        : qrDisplayExpired
        ? 'Tekan “Semak status & lepaskan kaunter”. Selepas Fiuu mengesahkan tamat, troli kekal dan staf boleh terus cuba bayaran baharu.'
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
 setManualQrVerified(false);
 }}
 icon={Banknote}
 label="Tunai"
 />
 <MethodButton
 active={method === 'QR'}
 onClick={() => {
 setMethod('QR');
 setQrAmountOverride(null);
 setManualQrVerified(false);
 }}
 icon={QrCode}
  label="DuitNow QR"
 />
 <MethodButton
 active={method === 'MIXED'}
 onClick={() => {
 setMethod('MIXED');
 const half = total / 2;
 setCashTenderedOverride(half.toFixed(2));
 setQrAmountOverride((total - half).toFixed(2));
 setManualQrVerified(false);
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
 setManualQrVerified(false);
 }}
 />
 </div>
 <Button
 type="button"
 variant="secondary"
 className="h-12 w-full text-base font-semibold"
 onClick={() => {
 setQrAmountOverride(null);
 setManualQrVerified(false);
 }}
 >
 QR penuh - {formatRM(total)}
 </Button>
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
 onChange={(e) => {
 setQrAmountOverride(e.target.value);
 setManualQrVerified(false);
 }}
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
 setManualQrVerified(false);
 }}
 >
 Bahagi sama - tunai + QR
 </Button>
 </div>)}

 {(method === 'QR' || method === 'MIXED') && (
 <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-b from-amber-50 to-white p-4">
  <div className="flex items-start justify-between gap-3">
   <div>
    <p className="text-base font-bold text-amber-950">
      {qrConfig?.mode === 'FIUU_DYNAMIC'
       ? 'DuitNow QR Fiuu — auto disahkan'
       : qrConfig?.mode === 'FIUU_CLOUDECR'
       ? 'Fiuu VT+ cloudECR — auto disahkan'
       : qrConfig?.mode === 'FIUU_VT_APP' && !vtManualFallback
       ? 'Fiuu VT — semakan STATUS + auto sah'
       : 'DuitNow QR cawangan — pengesahan manual'}
    </p>
    <p className="text-xs text-muted-foreground">
      {qrConfig?.mode === 'FIUU_DYNAMIC'
       ? 'QR amaun tepat akan dijana dan disahkan secara automatik oleh Fiuu.'
       : qrConfig?.mode === 'FIUU_CLOUDECR'
       ? 'RKJ One menghantar SALE ke Fiuu cloudECR; Fiuu VT+ memaparkan QR dan resit hanya dikeluarkan selepas respons bertandatangan disahkan.'
       : qrConfig?.mode === 'FIUU_VT_APP' && !vtManualFallback
       ? 'Aplikasi Fiuu VT akan menjana QR amaun tepat. STATUS berjaya dimuktamadkan secara automatik kepada resit dan kemas kini stok.'
       : 'QR rasmi cawangan dipaparkan. Pembayaran ini memerlukan pengesahan manual staf.'}
    </p>
   </div>
   <span className={cn(
    'rounded-full px-2 py-1 text-xs font-semibold',
     qrConfig?.mode === 'FIUU_DYNAMIC'
      || qrConfig?.mode === 'FIUU_CLOUDECR'
      || (qrConfig?.mode === 'FIUU_VT_APP' && !vtManualFallback)
     ? 'bg-emerald-100 text-emerald-800'
     : 'bg-amber-100 text-amber-800')}
   >
     {qrConfig?.mode === 'FIUU_DYNAMIC'
      ? 'Automatik'
      : qrConfig?.mode === 'FIUU_CLOUDECR'
      ? 'Pilot VT+'
      : qrConfig?.mode === 'FIUU_VT_APP' && !vtManualFallback
      ? 'Pilot VT'
      : 'Manual'}
   </span>
  </div>

  <div className="mt-4 rounded-2xl border bg-white p-4 text-center shadow-sm">
   {qrConfigLoading && (
    <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
     <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
     Memuatkan QR rasmi cawangan...
    </div>
   )}

   {!qrConfigLoading && qrConfigError && (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-red-800" role="alert">
     <QrCode className="h-12 w-12" aria-hidden="true" />
     <p>{qrConfigError}</p>
     <Button
      type="button"
      variant="outline"
      onClick={() => {
       setQrConfigRetry((current) => current + 1);
      }}
     >
      <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Cuba semula
     </Button>
    </div>
   )}

    {!qrConfigLoading && !qrConfigError
     && (qrConfig?.mode === 'FIUU_STATIC_MANUAL' || vtManualFallback)
     && qrConfig.staticQr && (
    <>
     <div className="mx-auto max-w-72 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-md ring-1 ring-slate-200">
      <Image
       src={qrConfig.staticQr.imageUrl}
       alt={`DuitNow QR ${qrConfig.branch.code} ${qrConfig.branch.name}`}
       width={910}
       height={910}
       className="h-auto w-full"
       unoptimized
      />
     </div>
     <p className="mt-3 text-sm font-bold text-slate-900">
      {qrConfig.branch.name} <span className="text-slate-500">({qrConfig.branch.code})</span>
     </p>
     <p className="text-xs text-emerald-700">
      Pastikan penerima: <strong>{qrConfig.staticQr.recipientName}</strong>
     </p>
    </>
   )}

    {!qrConfigLoading && !qrConfigError
     && (qrConfig?.mode === 'FIUU_DYNAMIC'
      || qrConfig?.mode === 'FIUU_CLOUDECR'
      || (qrConfig?.mode === 'FIUU_VT_APP' && !vtManualFallback)) && (
    <div className="mx-auto flex min-h-40 flex-col items-center justify-center gap-3 text-amber-800">
     <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-amber-100">
      <QrCode className="h-12 w-12" aria-hidden="true" />
     </div>
      {qrConfig.mode === 'FIUU_VT_APP' ? (
       <div className="w-full">
        <FiuuVtStaffSteps stage="READY" />
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
         Satu klik sahaja. Selepas pelanggan bayar, tunggu RKJ One mengesahkan, mengemas kini stok dan membuka resit.
        </p>
       </div>
      ) : (
       <p className="text-xs text-muted-foreground">
        {qrConfig.mode === 'FIUU_CLOUDECR'
         ? 'Tekan Sahkan Bayaran untuk menghantar amaun ke Fiuu VT+ melalui cloudECR.'
         : 'Tekan Sahkan Bayaran untuk menjana QR amaun tepat.'}
       </p>
      )}
    </div>
   )}

   {trainingMode && (
    <div className="mx-auto flex min-h-40 flex-col items-center justify-center gap-3 text-sky-800">
     <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-sky-100">
      <QrCode className="h-12 w-12" aria-hidden="true" />
     </div>
     <p className="text-xs">Simulasi latihan sahaja - tiada bayaran sebenar dipindahkan.</p>
    </div>
   )}

   <p className="mt-3 text-3xl font-bold tabular-nums text-amber-950">{formatRM(qrNum)}</p>
  </div>

  {requiresManualQrVerification && qrConfig?.staticQr && (
   <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
    <input
     type="checkbox"
     className="mt-0.5 h-5 w-5 accent-emerald-600"
     checked={manualQrVerified}
     onChange={(event) => setManualQrVerified(event.target.checked)}
    />
    <span>
     Saya telah melihat status <strong>Berjaya</strong> pada telefon pelanggan dan amaun sepadan.
    </span>
   </label>
  )}
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
      vtPrelaunchFailure ? (
       <div className="flex w-full flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
        <p className="text-sm font-semibold text-amber-950">
         Fiuu VT tidak sempat dibuka. Tiada SALE dihantar; anda boleh cuba buka semula atau kembali ke troli.
        </p>
        <div className="flex gap-2">
         <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 border-red-300 bg-white font-semibold text-red-800"
          disabled={checkingQrStatus}
          onClick={() => void cancelPrelaunchFiuuVtPayment()}
         >
          {checkingQrStatus ? 'Melepaskan...' : 'Batal & kembali ke troli'}
         </Button>
         <Button
          type="button"
          className="h-11 flex-1 gap-2 bg-amber-500 font-bold text-amber-950 hover:bg-amber-600"
          disabled={checkingQrStatus}
          onClick={() => void retryFiuuVtSaleLaunch()}
         >
          <RefreshCw className={cn('h-4 w-4', checkingQrStatus && 'animate-spin')} aria-hidden="true" />
          Cuba buka semula
         </Button>
        </div>
       </div>
      ) : vtReviewRequired ? (
      <div className="flex w-full flex-col gap-2 rounded-xl border border-red-300 bg-red-50 p-3">
       <p className="text-sm font-semibold text-red-950">
        Transaksi dikunci untuk semakan HQ. Jangan caj pelanggan semula atau jana transaksi pengganti.
       </p>
       <Button
        type="button"
        variant="outline"
        className="h-11 w-full bg-white"
        onClick={() => handleDialogOpenChange(false)}
       >
        Tutup dan hubungi HQ
       </Button>
      </div>
     ) : qrStatus === 'REPORTED' ? (
     <div className="flex w-full gap-2">
      <Button
       type="button"
       variant="outline"
       className="h-12 gap-2"
       disabled={checkingQrStatus || loading}
       onClick={() => void checkActiveQrStatus()}
      >
       <RefreshCw className={cn('h-5 w-5', checkingQrStatus && 'animate-spin')} aria-hidden="true" />
       Semak semula
      </Button>
      <Button
       type="button"
       className="h-12 flex-1 gap-2 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700"
       disabled={loading || checkingQrStatus}
       onClick={() => void (qrPayment.integration === 'cloudecr'
        ? checkActiveQrStatus()
        : confirmReportedFiuuVt())}
      >
       <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
       {loading || checkingQrStatus ? 'Memuktamadkan...' : 'Cuba sahkan automatik semula'}
      </Button>
     </div>
    ) : qrStatus === 'PENDING' && vtCancelConfirming ? (
     <div className="flex w-full flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
       <p className="text-sm font-semibold text-red-950">
        Mulakan pembatalan? Fiuu VT mungkin meminta kod laluan. Kaunter hanya dilepaskan selepas keputusan VOID/STATUS disahkan, biasanya dalam kira-kira 30 saat.
       </p>
      <div className="flex gap-2">
       <Button
        type="button"
        variant="outline"
        className="h-11 flex-1 bg-white"
        disabled={checkingQrStatus}
        onClick={() => setVtCancelConfirming(false)}
       >
        Terus tunggu
       </Button>
       <Button
        type="button"
        variant="destructive"
        className="h-11 flex-[1.5] font-bold"
        disabled={checkingQrStatus}
        onClick={() => void requestFiuuVtCancellation()}
       >
        {checkingQrStatus ? 'Menyemak dahulu...' : 'Buka Fiuu VT untuk batal'}
       </Button>
      </div>
     </div>
    ) : qrStatus === 'PENDING' && vtCancelRequested ? (
     <div className="flex w-full gap-2">
      <Button className="h-12 flex-1 gap-2 rounded-xl" disabled aria-live="polite">
       <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
       Menunggu pembatalan Fiuu
      </Button>
      <Button
       type="button"
       variant="outline"
       className="h-12 gap-2"
       disabled={checkingQrStatus}
       onClick={() => void checkActiveQrStatus()}
      >
       <RefreshCw className={cn('h-5 w-5', checkingQrStatus && 'animate-spin')} aria-hidden="true" />
       Semak keputusan
      </Button>
     </div>
    ) : qrStatus === 'PENDING' || qrStatus === 'PAID' ? (
     qrStatus === 'PENDING' && qrDisplayExpired ? (
       <div className="flex w-full flex-col gap-2">
        <Button
         type="button"
         className="h-12 w-full gap-2 rounded-xl bg-amber-500 font-bold text-amber-950 hover:bg-amber-600"
         disabled={checkingQrStatus}
         onClick={() => void checkActiveQrStatus()}
        >
         <RefreshCw className={cn('h-5 w-5', checkingQrStatus && 'animate-spin')} aria-hidden="true" />
         {checkingQrStatus ? 'Menyemak status akhir...' : 'Semak status akhir'}
        </Button>
        {qrPayment.integration === 'vt_app' && (
         <Button
          type="button"
          variant="outline"
          className="h-11 w-full border-red-300 bg-red-50 font-semibold text-red-800 hover:bg-red-100 hover:text-red-900"
          disabled={checkingQrStatus}
          onClick={() => setVtCancelConfirming(true)}
         >
          Pelanggan tidak bayar — mula batal
         </Button>
        )}
       </div>
     ) : (
       <div className="grid w-full gap-2 sm:grid-cols-2">
        <div className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-50 px-3 text-center text-xs font-semibold text-amber-950 sm:col-span-2" aria-live="polite">
         <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
         {qrStatus === 'PAID'
          ? 'Memulihkan resit'
          : qrPayment.integration === 'cloudecr'
          ? 'Menunggu Fiuu VT+'
          : qrPayment.integration === 'vt_app'
          ? 'Menunggu bayaran pelanggan'
          : 'Menunggu bayaran Fiuu'}
        </div>
        {qrStatus === 'PENDING' && qrPayment.integration === 'vt_app' ? (
         <Button
          type="button"
          variant="outline"
          className="h-12 border-red-300 bg-red-50 font-bold text-red-800 hover:bg-red-100 hover:text-red-900"
          disabled={checkingQrStatus}
          onClick={() => setVtCancelConfirming(true)}
         >
          Batalkan pembayaran
         </Button>
        ) : <span />}
        <Button
         type="button"
         variant="outline"
         className="h-12 gap-2 font-semibold"
         disabled={checkingQrStatus}
         onClick={() => void checkActiveQrStatus()}
        >
         <RefreshCw className={cn('h-5 w-5', checkingQrStatus && 'animate-spin')} aria-hidden="true" />
         Semak sekarang
        </Button>
      </div>
     )
    ) : (
    <>
     <Button variant="outline" className="h-12 flex-1" onClick={() => handleDialogOpenChange(false)}>
      Kembali ke troli
     </Button>
     <Button
      className="h-12 flex-[2] gap-2 rounded-xl bg-amber-500 font-bold hover:bg-amber-600"
       onClick={() => {
        removeStoredQrPayment();
        setQrPayment(null);
         setVtSaleOpened(false);
        setQrStatus('PENDING');
        setQrSecondsRemaining(0);
        setQrPollError(null);
        setQrImageError(false);
        setQrImageRetry(0);
        qrAttemptKeyRef.current = null;
       }}
     >
      <RefreshCw className="h-5 w-5" aria-hidden="true" />
      Cuba bayaran QR semula
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
  {loading
   ? isFiuuVtCheckout ? 'Membuka Fiuu VT...' : 'Memproses...'
   : trainingMode
   ? 'Sahkan Simulasi'
   : isFiuuVtCheckout
   ? 'Buka Fiuu VT & Papar QR'
   : 'Sahkan Bayaran'}
  </Button>
  </>
  )}
  </div>
 </DialogContent>
 </Dialog>);
}
