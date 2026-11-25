'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { ClientJsonError } from '@/lib/client/fetch-json';
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
 parkFiuuVtProviderErrorPayment,
 PosQrPaymentError,
 releaseFiuuVtCashierAfterVoidLaunch,
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
import {
 posFiuuVtPaymentFingerprint,
 posPaymentFingerprintFromSalePayload,
} from '@/lib/pos/payment-fingerprint';
import { readBrowserStorageItem } from '@/lib/pos/browser-storage';
import { useAuthStore } from '@/stores/auth-store';
import { usePosStore } from '@/stores/pos-store';
import type { PaymentMethod, PosDeviceContext, PosQrConfig, SaleResult } from '@/lib/pos/types';
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
 recoverOrphanedFiuuVtCallbackRegistry,
 type FiuuVtNativeStatus,
 type FiuuVtNativeCallbackResult,
 type FiuuVtCallbackAttempt,
} from '@/lib/pos/fiuu-vt-client';
import {
 canFinalizeFiuuVtPayment,
 canReleaseFiuuVtCallbackDrain,
 decideFiuuVtCleanupAction,
 getRecoveredFiuuVtLocalStatus,
 isFiuuVtErrorResult,
 matchesFiuuVtPaymentIdentity,
 paymentIdFromFiuuVtOrderId,
 resolveFiuuVtCleanupOrderId,
 shouldLaunchFiuuVtStatusAfterReconcile,
 shouldProbeFiuuVtSaleStatus,
 type FiuuVtOperation,
} from '@/lib/pos/fiuu-vt';

interface PaymentDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 branchId: string;
 deviceContext: PosDeviceContext | null;
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
 paymentMethod: 'QR' | 'MIXED';
 cashAmountRm: number;
 saleTotalRm: number;
 expiresAt: string;
 environment: 'sandbox' | 'production';
 integration: 'opa' | 'vt_app' | 'cloudecr';
 providerOrderId: string | null;
 cartFingerprint: string;
};

type QrPaymentStatus = 'PENDING' | 'REPORTED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'QUARANTINED';

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

type FiuuVtCartRetirementLatch = {
 cartSessionId: string;
 cartFingerprint: string;
 amountRm: number;
};

type FiuuVtQueueReadOutcome = 'queued' | 'empty' | 'read_failed';
type FiuuVtRecoveryOutcome =
 | 'STILL_BLOCKED'
 | 'CLEAN_FOR_NEW_CART'
 | 'RETIRED_CURRENT_CART'
 | 'CART_RETIRED_RELEASE_PENDING';

type StoredQrPayment = {
 payment: ActiveQrPayment;
 idempotencyKey: string;
 vtPrelaunchFailure: FiuuVtPrelaunchFailure | null;
};

type DeferredFiuuVtFinalization = {
 version: 1;
 paymentId: string;
 orderId: string;
 amountRm: number;
 cartFingerprint: string;
 retiredAt: string;
};

type DeferredFiuuVtCashierRelease = {
 version: 1;
 paymentId: string;
 orderId: string;
 attemptId: string;
 amountRm: number;
 cartFingerprint: string;
 nativeLaunchObserved: boolean;
 recordedAt: string;
};

type FiuuVtCancellationPaymentIdentity = Pick<
 ActiveQrPayment,
 'id' | 'integration' | 'providerOrderId' | 'amountRm' | 'cartFingerprint'
>;

const FIUU_VT_STATUS_RETRY_MS = 25_000;
const FIUU_VT_QUEUE_QUIESCENCE_MS = 250;
const FIUU_VT_NATIVE_RELEASE_WINDOW_MS = 90_000;
const FIUU_VT_CLEANUP_UI_TIMEOUT_MS = 30_000;
const FIUU_VT_CASHIER_CLEANUP_RETRY_MS = 500;

class FiuuVtCleanupUiTimeoutError extends Error {}

function waitForFiuuVtQueueQuiescence(): Promise<void> {
 return new Promise((resolve) => window.setTimeout(resolve, FIUU_VT_QUEUE_QUIESCENCE_MS));
}

function waitForFiuuVtCleanupUi<T>(work: Promise<T>): Promise<T> {
 return new Promise<T>((resolve, reject) => {
  const timer = window.setTimeout(() => {
   reject(new FiuuVtCleanupUiTimeoutError(
    'Semakan terminal masih berjalan di belakang. Butang telah dibuka semula supaya kaunter tidak kelihatan tergantung.',
   ));
  }, FIUU_VT_CLEANUP_UI_TIMEOUT_MS);
  work.then((value) => {
   window.clearTimeout(timer);
   resolve(value);
  }, (error: unknown) => {
   window.clearTimeout(timer);
   reject(error);
  });
 });
}

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
 onNativeLaunchSucceeded?: () => void,
): Promise<T> {
 try {
  const result = await launch();
  // Persist caller-owned recovery evidence synchronously before the first
  // network request after Android returns from the provider application.
  onNativeLaunchSucceeded?.();
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

function fiuuVtDeferredFinalizationStorageKey(branchId: string) {
 return `rkj-pos-fiuu-vt-deferred-finalization:${branchId}`;
}

function fiuuVtCashierReleaseStorageKey(branchId: string) {
 return `rkj-pos-fiuu-vt-cashier-release:${branchId}`;
}

function readDeferredFiuuVtNativeCleanup(key: string): string | null {
 const orderId = readBrowserStorageItem(key);
 return orderId && paymentIdFromFiuuVtOrderId(orderId) ? orderId : null;
}

function storeDeferredFiuuVtNativeCleanup(key: string, orderId: string) {
 try {
  window.localStorage.setItem(key, orderId);
  try {
   window.sessionStorage.removeItem(key);
  } catch {
   // The durable local copy is authoritative when session storage is denied.
  }
  return;
 } catch {
  // Fall through to the independent sessionStorage fallback.
 }
 try {
  window.sessionStorage.setItem(key, orderId);
 } catch {
  // Native state remains fail-closed even if WebView storage is unavailable.
 }
}

function preserveDeferredFiuuVtNativeCleanup(key: string, orderId: string): boolean {
 const existingOrderId = readDeferredFiuuVtNativeCleanup(key);
 if (existingOrderId && existingOrderId !== orderId) return false;
 storeDeferredFiuuVtNativeCleanup(key, orderId);
 return readDeferredFiuuVtNativeCleanup(key) === orderId;
}

function canPreserveDeferredFiuuVtNativeCleanup(key: string, orderId: string): boolean {
 const existingOrderId = readDeferredFiuuVtNativeCleanup(key);
 return !existingOrderId || existingOrderId === orderId;
}

function removeDeferredFiuuVtNativeCleanup(key: string) {
 try {
  window.localStorage.removeItem(key);
 } catch {
  // Try the independent session copy below.
 }
 try {
  window.sessionStorage.removeItem(key);
 } catch {
  // A later bridge status check still prevents a second SALE.
 }
}

function readDeferredFiuuVtCashierRelease(
 key: string,
): DeferredFiuuVtCashierRelease | null {
 const raw = readBrowserStorageItem(key);
 if (!raw) return null;
 try {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const version = Reflect.get(parsed, 'version');
  const paymentId = Reflect.get(parsed, 'paymentId');
  const orderId = Reflect.get(parsed, 'orderId');
  const attemptId = Reflect.get(parsed, 'attemptId');
  const amountRm = Reflect.get(parsed, 'amountRm');
  const cartFingerprint = Reflect.get(parsed, 'cartFingerprint');
  const nativeLaunchObserved = Reflect.get(parsed, 'nativeLaunchObserved');
  const recordedAt = Reflect.get(parsed, 'recordedAt');
  if (version !== 1
   || typeof paymentId !== 'string'
   || typeof orderId !== 'string'
   || paymentIdFromFiuuVtOrderId(orderId) !== paymentId
   || typeof attemptId !== 'string'
   || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)
   || typeof amountRm !== 'number'
   || !Number.isFinite(amountRm)
   || amountRm <= 0
   || typeof cartFingerprint !== 'string'
   || !cartFingerprint
   || typeof nativeLaunchObserved !== 'boolean'
   || typeof recordedAt !== 'string'
   || !Number.isFinite(Date.parse(recordedAt))) return null;
  return {
   version,
   paymentId,
   orderId,
   attemptId: attemptId.toLowerCase(),
   amountRm,
   cartFingerprint,
   nativeLaunchObserved,
   recordedAt,
  };
 } catch {
  return null;
 }
}

function storeDeferredFiuuVtCashierRelease(
 key: string,
 release: DeferredFiuuVtCashierRelease,
): boolean {
 const serialized = JSON.stringify(release);
 try {
  window.localStorage.setItem(key, serialized);
  try {
   window.sessionStorage.removeItem(key);
  } catch {
   // The durable local copy is authoritative when session storage is denied.
  }
  return true;
 } catch {
  // Fall through to the independent sessionStorage fallback.
 }
 try {
  window.sessionStorage.setItem(key, serialized);
  return true;
 } catch {
  return false;
 }
}

function removeDeferredFiuuVtCashierRelease(
 key: string,
 expectedAttemptId?: string,
) {
 if (expectedAttemptId) {
  const current = readDeferredFiuuVtCashierRelease(key);
  if (current && current.attemptId !== expectedAttemptId.toLowerCase()) return;
 }
 try {
  window.localStorage.removeItem(key);
 } catch {
  // Try the independent session copy below.
 }
 try {
  window.sessionStorage.removeItem(key);
 } catch {
  // The exact marker remains retryable on the next app start.
 }
}

function readDeferredFiuuVtFinalization(key: string): DeferredFiuuVtFinalization | null {
 const raw = readBrowserStorageItem(key);
 if (!raw) return null;
 try {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const version = Reflect.get(parsed, 'version');
  const paymentId = Reflect.get(parsed, 'paymentId');
  const orderId = Reflect.get(parsed, 'orderId');
  const amountRm = Reflect.get(parsed, 'amountRm');
  const cartFingerprint = Reflect.get(parsed, 'cartFingerprint');
  const retiredAt = Reflect.get(parsed, 'retiredAt');
  if (version !== 1
   || typeof paymentId !== 'string'
   || typeof orderId !== 'string'
   || paymentIdFromFiuuVtOrderId(orderId) !== paymentId
   || typeof amountRm !== 'number'
   || !Number.isFinite(amountRm)
   || amountRm <= 0
   || typeof cartFingerprint !== 'string'
   || !cartFingerprint
   || typeof retiredAt !== 'string'
   || !Number.isFinite(Date.parse(retiredAt))) return null;
  return { version, paymentId, orderId, amountRm, cartFingerprint, retiredAt };
 } catch {
  return null;
 }
}

function storeDeferredFiuuVtFinalization(
 key: string,
 finalization: DeferredFiuuVtFinalization,
): boolean {
 const serialized = JSON.stringify(finalization);
 try {
  window.localStorage.setItem(key, serialized);
  try {
   window.sessionStorage.removeItem(key);
  } catch {
   // The durable local copy is authoritative when session storage is denied.
  }
  return true;
 } catch {
  // Fall through to the independent sessionStorage fallback.
 }
 try {
  window.sessionStorage.setItem(key, serialized);
  return true;
 } catch {
  return false;
 }
}

function preserveDeferredFiuuVtFinalization(
 key: string,
 finalization: DeferredFiuuVtFinalization,
): boolean {
 const existing = readDeferredFiuuVtFinalization(key);
 if (existing) {
  return existing.paymentId === finalization.paymentId
   && existing.orderId === finalization.orderId
   && Math.round(existing.amountRm * 100) === Math.round(finalization.amountRm * 100)
   && existing.cartFingerprint === finalization.cartFingerprint;
 }
 if (!storeDeferredFiuuVtFinalization(key, finalization)) return false;
 const stored = readDeferredFiuuVtFinalization(key);
 return Boolean(stored
  && stored.paymentId === finalization.paymentId
  && stored.orderId === finalization.orderId
  && Math.round(stored.amountRm * 100) === Math.round(finalization.amountRm * 100)
  && stored.cartFingerprint === finalization.cartFingerprint);
}

function removeDeferredFiuuVtFinalization(key: string) {
 try {
  window.localStorage.removeItem(key);
 } catch {
  // Try the independent session copy below.
 }
 try {
  window.sessionStorage.removeItem(key);
 } catch {
  // The durable marker remains fail-closed until a later successful cleanup.
 }
}

function readStoredQrPayment(key: string): StoredQrPayment | null {
 const raw = readBrowserStorageItem(key);
 if (!raw) return null;
 try {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const paymentValue = Reflect.get(parsed, 'payment');
  const idempotencyKey = Reflect.get(parsed, 'idempotencyKey');
  if (!paymentValue || typeof paymentValue !== 'object' || Array.isArray(paymentValue)
   || !isValidPosPaymentIdempotencyKey(idempotencyKey)) return null;

  const id = Reflect.get(paymentValue, 'id');
  const imageUrl = Reflect.get(paymentValue, 'imageUrl');
  const amountRm = Reflect.get(paymentValue, 'amountRm');
  const paymentMethodValue = Reflect.get(paymentValue, 'paymentMethod');
  const cashAmountRmValue = Reflect.get(paymentValue, 'cashAmountRm');
  const saleTotalRmValue = Reflect.get(paymentValue, 'saleTotalRm');
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
  const paymentMethod = paymentMethodValue === 'MIXED' ? 'MIXED' : 'QR';
  const cashAmountRm = typeof cashAmountRmValue === 'number' && Number.isFinite(cashAmountRmValue)
   ? cashAmountRmValue
   : 0;
  const saleTotalRm = typeof saleTotalRmValue === 'number' && Number.isFinite(saleTotalRmValue)
   ? saleTotalRmValue
   : typeof amountRm === 'number' ? amountRm + cashAmountRm : Number.NaN;
  if (typeof id !== 'string' || !id
   || (integration === 'opa'
    && (typeof imageUrl !== 'string' || !imageUrl.startsWith('/api/pos/qr-payments/')))
   || ((integration === 'vt_app' || integration === 'cloudecr') && !providerOrderId)
   || typeof amountRm !== 'number' || !Number.isFinite(amountRm) || amountRm <= 0
   || (paymentMethod === 'QR' && cashAmountRm !== 0)
   || (paymentMethod === 'MIXED' && cashAmountRm <= 0)
   || !Number.isFinite(saleTotalRm) || saleTotalRm <= 0
   || Math.round((amountRm + cashAmountRm) * 100) !== Math.round(saleTotalRm * 100)
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
      paymentMethod,
      cashAmountRm,
      saleTotalRm,
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
 deviceContext,
 onSuccess,
 trainingMode = false,
}: PaymentDialogProps) {
 const profile = useAuthStore((s) => s.profile);
 const cart = usePosStore((s) => s.cart);
 const cartSessionId = usePosStore((s) => s.cartSessionId);
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
 const [vtCleanupRunning, setVtCleanupRunning] = useState(false);
 const [qrPayment, setQrPayment] = useState<ActiveQrPayment | null>(null);
 const [qrStatus, setQrStatus] = useState<QrPaymentStatus>('PENDING');
 const [qrSecondsRemaining, setQrSecondsRemaining] = useState(0);
 const qrAttemptKeyRef = useRef<string | null>(null);
	const vtResultFingerprintRef = useRef<string | null>(null);
 const vtRecoveryOrderRef = useRef<string | null>(null);
 const activeQrPaymentIdRef = useRef<string | null>(null);
 const activeQrPaymentRef = useRef<ActiveQrPayment | null>(null);
 const vtServerPaidCompletionRef = useRef(new Set<string>());
 const vtSaleWatchdogStartedAtRef = useRef<number | null>(null);
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
 const [vtCancelRequesting, setVtCancelRequesting] = useState(false);
 const [vtCancelRequested, setVtCancelRequested] = useState(false);
 const [vtStatusRetryPending, setVtStatusRetryPending] = useState(false);
 const [vtParkAvailable, setVtParkAvailable] = useState(false);
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
 const vtNativeCleanupInFlightRef = useRef(new Map<string, Promise<FiuuVtRecoveryOutcome>>());
 const vtCurrentCartRetirementRef = useRef(new Map<string, FiuuVtCartRetirementLatch>());
 const vtCartRetiredPendingReleaseRef = useRef(new Set<string>());
 const vtPendingReceiptAfterReleaseRef = useRef(new Map<string, SaleResult>());
 const vtCashierReleasedPaymentRef = useRef<string | null>(null);
 const vtCancellationRequestInFlightRef = useRef(false);
 const vtCancellationReleaseInFlightRef = useRef(new Map<string, Promise<boolean>>());
 const dialogOpenRef = useRef(open);
 const vtNativeReleaseWindowRef = useRef<{ orderId: string; startedAt: number } | null>(null);
 const nativeCleanupKey = fiuuVtNativeCleanupStorageKey(branchId);
 const deferredFinalizationKey = fiuuVtDeferredFinalizationStorageKey(branchId);
 const cashierReleaseKey = fiuuVtCashierReleaseStorageKey(branchId);

 useEffect(() => {
  dialogOpenRef.current = open;
 }, [open]);

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

 // Native release is deliberately independent from the Finance/HQ review
 // latch. A quarantined payment must never produce a receipt, but its exact
 // terminal can still be released once the callback queue is proven empty.
 const captureFiuuVtNativeReleaseSeal = useCallback((
  paymentId: string,
  allowDetached = false,
 ): FiuuVtFinalizationSeal | null => {
  const activePaymentId = activeQrPaymentIdRef.current;
  const activePaymentMatches = allowDetached
   ? activePaymentId === null || activePaymentId === paymentId
   : activePaymentId === paymentId;
  if (!activePaymentMatches
   || vtCallbackDrainInProgressRef.current
   || vtCallbackDrainScopeRef.current !== null) return null;
  return {
   paymentId,
   generation: vtCallbackDrainGenerationRef.current,
   allowDetached,
  };
 }, []);

 const isFiuuVtNativeReleaseSealValid = useCallback((seal: FiuuVtFinalizationSeal) => {
  const activePaymentId = activeQrPaymentIdRef.current;
  const activePaymentMatches = seal.allowDetached
   ? activePaymentId === null || activePaymentId === seal.paymentId
   : activePaymentId === seal.paymentId;
  return activePaymentMatches
   && vtCallbackDrainGenerationRef.current === seal.generation
   && vtCallbackDrainScopeRef.current === null
   && !vtCallbackDrainInProgressRef.current;
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
 // Full QR is always the cart total. Only mixed payments may carry an editable
 // QR override; this also ignores stale React/storage state during a method
 // transition so the amount shown and submitted can never diverge.
 const qrAmount = method === 'QR'
  ? defaultAmount
  : (qrAmountOverride ?? defaultAmount);
 const cashNum = parseMoney(cashTendered);
 const qrNum = parseMoney(qrAmount);
 const totalCents = Math.round(total * 100);
 const qrCents = Math.round(qrNum * 100);
 const currentFiuuVtPaymentFingerprint = useCallback((amountRm: number) => {
  // Always read the live store snapshot. Async cleanup may outlive the render
  // that started it; a captured cart value could otherwise match and erase a
  // replacement customer's cart.
  const current = usePosStore.getState();
  const currentTotal = current.cart.reduce(
   (sum, item) => sum + item.price * item.quantity,
   0,
  );
  return current.shift && current.branchId === branchId ? posFiuuVtPaymentFingerprint({
   branchId,
   shiftId: current.shift.id,
   cartSessionId: current.cartSessionId,
   items: current.cart.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
   })),
   total: currentTotal,
   qrAmount: amountRm,
  }) : null;
 }, [branchId]);
 const activeQrPaymentMatchesCurrentCart = useCallback((payment: ActiveQrPayment) => {
  if (payment.integration === 'vt_app') {
   return currentFiuuVtPaymentFingerprint(payment.amountRm) === payment.cartFingerprint;
  }
  const current = usePosStore.getState();
  if (!current.shift || current.branchId !== branchId) return false;
  const fingerprint = posPaymentFingerprintFromSalePayload({
   branchId,
   shiftId: current.shift.id,
   cart_session_id: current.cartSessionId,
   items: current.cart.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
   payment_method: payment.paymentMethod,
   cash_amount: payment.cashAmountRm,
   qr_amount: payment.amountRm,
  });
  return fingerprint !== null && fingerprint === payment.cartFingerprint;
 }, [branchId, currentFiuuVtPaymentFingerprint]);

 const latchCurrentFiuuVtCartRetirement = useCallback((
  paymentId: string,
  amountRm: number,
  expectedFingerprint?: string | null,
 ) => {
  const current = usePosStore.getState();
  const cartFingerprint = currentFiuuVtPaymentFingerprint(amountRm);
  if (!cartFingerprint
   || (expectedFingerprint && cartFingerprint !== expectedFingerprint)) return false;
  vtCurrentCartRetirementRef.current.set(paymentId, {
   cartSessionId: current.cartSessionId,
   cartFingerprint,
   amountRm,
  });
  return true;
 }, [currentFiuuVtPaymentFingerprint]);

 const currentCartMatchesFiuuVtRetirementLatch = useCallback((paymentId: string) => {
  const latch = vtCurrentCartRetirementRef.current.get(paymentId);
  if (!latch) return false;
  const current = usePosStore.getState();
  return current.cartSessionId === latch.cartSessionId
   && currentFiuuVtPaymentFingerprint(latch.amountRm) === latch.cartFingerprint;
 }, [currentFiuuVtPaymentFingerprint]);

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
 const fiuuVtCashierReleaseEnabled = qrConfig?.mode === 'FIUU_VT_APP'
  && qrConfig.vt?.cashierReleaseEnabled === true;
 const fiuuVtNativeCleanupPending = Boolean(
  method !== 'CASH'
  && !qrPayment
  && qrConfig?.mode === 'FIUU_VT_APP'
  && vtNativeStatus?.nativeAndroid
  && (vtNativeStatus.pendingOrderId
   || vtNativeStatus.resultAvailable
   || vtNativeStatus.quarantineBlocksRelease
   || vtNativeStatus.callbackRegistryRecoveryRequired
   || vtCallbackDrainInProgress),
 );
 const requiresManualQrVerification = requiresQrConfig
  && (qrConfig?.mode === 'FIUU_STATIC_MANUAL' || vtManualFallback);
 const paymentErrorWithoutNativeCleanup =
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
 const paymentError = fiuuVtNativeCleanupPending
  ? 'Terminal Fiuu VT sedang membersihkan transaksi terdahulu. Troli pelanggan ini dikekalkan; tunggu beberapa saat.'
  : paymentErrorWithoutNativeCleanup;
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
	setVtCleanupRunning(false);
	setVtSaleOpened(false);
	setVtCancelConfirming(false);
	setVtCancelRequesting(false);
	setVtCancelRequested(false);
	setVtStatusRetryPending(false);
	setVtParkAvailable(false);
	setVtReviewRequired(false);
	vtReviewRequiredRef.current = false;
	resetFiuuVtCallbackDrain();
	setVtPrelaunchFailure(null);
	qrAttemptKeyRef.current = null;
	vtResultFingerprintRef.current = null;
	vtRecoveryOrderRef.current = null;
	activeQrPaymentRef.current = null;
	if (vtRecoveryRetryTimerRef.current !== null) {
	 window.clearTimeout(vtRecoveryRetryTimerRef.current);
	 vtRecoveryRetryTimerRef.current = null;
	}
	if (vtCallbackRetryTimerRef.current !== null) {
	 window.clearTimeout(vtCallbackRetryTimerRef.current);
	 vtCallbackRetryTimerRef.current = null;
	}
	activeQrPaymentIdRef.current = null;
	vtSaleWatchdogStartedAtRef.current = null;
	statusCheckInFlightRef.current = null;
	vtOperationRetryAtRef.current = 0;
	vtCashierReleasedPaymentRef.current = null;
	vtNativeReleaseWindowRef.current = null;
	}, [resetFiuuVtCallbackDrain]);

	useEffect(() => {
		activeQrPaymentIdRef.current = qrPayment?.id ?? null;
		activeQrPaymentRef.current = qrPayment;
	}, [qrPayment]);

	const storageKey = shift ? activeQrStorageKey(branchId, shift.id) : null;

	const removeStoredQrPayment = useCallback(() => {
		if (!storageKey) return;
		try {
			window.localStorage.removeItem(storageKey);
		} catch {
			// Try the independent session copy below.
		}
		try {
			window.sessionStorage.removeItem(storageKey);
		} catch {
			// Storage may be unavailable in a restricted WebView; polling remains authoritative.
		}
	}, [storageKey]);

 const removeStoredQrPaymentFor = useCallback((paymentId: string) => {
  if (!storageKey) return;
  const stored = readStoredQrPayment(storageKey);
  if (stored?.payment.id === paymentId) removeStoredQrPayment();
 }, [removeStoredQrPayment, storageKey]);

	const storeActiveQrPayment = useCallback((
		payment: ActiveQrPayment,
		idempotencyKey: string | null,
		prelaunchFailure: FiuuVtPrelaunchFailure | null = null,
	) => {
		if (!storageKey || !idempotencyKey || !isValidPosPaymentIdempotencyKey(idempotencyKey)) return;
		const serialized = JSON.stringify({
			payment,
			idempotencyKey,
			vtPrelaunchFailure: prelaunchFailure,
		});
		try {
			window.localStorage.setItem(storageKey, serialized);
			try {
				window.sessionStorage.removeItem(storageKey);
			} catch {
				// The durable local copy is authoritative when session storage is denied.
			}
			return;
		} catch {
			// Fall through to sessionStorage so managed WebViews retain recovery identity.
		}
		try {
			window.sessionStorage.setItem(storageKey, serialized);
		} catch {
			// In-memory recovery remains usable when all WebView storage is unavailable.
		}
	}, [storageKey]);

 const retireCurrentFiuuVtCart = useCallback((message: string, paymentId: string) => {
  // Revalidate against the live store immediately before the destructive cart
  // reset. A background retry from customer A must never clear customer B.
  if (!currentCartMatchesFiuuVtRetirementLatch(paymentId)) {
   vtCurrentCartRetirementRef.current.delete(paymentId);
   return false;
  }
  clearCart();
  resetPaymentForm();
  vtCurrentCartRetirementRef.current.delete(paymentId);
  vtCartRetiredPendingReleaseRef.current.delete(paymentId);
  dialogOpenRef.current = false;
  onOpenChange(false);
  toast.warning(message);
  return true;
 }, [clearCart, currentCartMatchesFiuuVtRetirementLatch, onOpenChange, resetPaymentForm]);

 const retireCurrentFiuuVtCartForPendingRelease = useCallback((
  paymentId: string,
  orderId: string,
 ) => {
  if (!currentCartMatchesFiuuVtRetirementLatch(paymentId)) {
   vtCurrentCartRetirementRef.current.delete(paymentId);
   return false;
  }
  const latch = vtCurrentCartRetirementRef.current.get(paymentId);
  if (!latch
   || !canPreserveDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId)
   || !preserveDeferredFiuuVtFinalization(deferredFinalizationKey, {
   version: 1,
   paymentId,
   orderId,
   amountRm: latch.amountRm,
   cartFingerprint: latch.cartFingerprint,
   retiredAt: new Date().toISOString(),
  })) {
   // Never erase the original cart unless the server payment identity needed
   // after a WebView reload has first been persisted successfully.
   return false;
  }
  if (!preserveDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId)) {
   return false;
  }
  // Remove only the exact original cart now so it cannot be charged again.
  // Keep the payment UI/receipt state alive until the native release seal is
  // satisfied; a later retry/reload re-fetches the durable server receipt.
  clearCart();
  vtCurrentCartRetirementRef.current.delete(paymentId);
  vtCartRetiredPendingReleaseRef.current.add(paymentId);
  return true;
 }, [clearCart, currentCartMatchesFiuuVtRetirementLatch, deferredFinalizationKey, nativeCleanupKey]);

 const detachFiuuVtCheckoutAfterCashierRelease = useCallback((
  payment: FiuuVtCancellationPaymentIdentity,
  currentCartLatched: boolean,
 ): boolean => {
  const orderId = payment.providerOrderId;
  if (!orderId) return false;

  if (!currentCartLatched
   && !canPreserveDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId)) return false;
  const recoveryPersisted = currentCartLatched
   ? retireCurrentFiuuVtCartForPendingRelease(payment.id, orderId)
   : preserveDeferredFiuuVtFinalization(deferredFinalizationKey, {
    version: 1,
    paymentId: payment.id,
    orderId,
    amountRm: payment.amountRm,
    cartFingerprint: payment.cartFingerprint,
    retiredAt: new Date().toISOString(),
   });
  if (!recoveryPersisted) return false;
  if (!currentCartLatched
   && !preserveDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId)) return false;

  // The original cart has already been retired. Consume this UI-only marker
  // now so detached native cleanup cannot later close customer B's dialog.
  if (currentCartLatched) vtCartRetiredPendingReleaseRef.current.delete(payment.id);

  // The server has already committed the exact VOID identity and cashier
  // release. Keep that payment in the deferred recovery lane, but stop making
  // the next customer wait for native STATUS/queue cleanup. A late success is
  // still fetched by payment id and can never clear a replacement cart.
  removeStoredQrPaymentFor(payment.id);
  const originalCheckoutStillActive = matchesFiuuVtPaymentIdentity(
   activeQrPaymentRef.current,
   payment.id,
   orderId,
  );
  if (originalCheckoutStillActive) {
   resetPaymentForm();
   dialogOpenRef.current = false;
   onOpenChange(false);
   toast.warning(currentCartLatched
    ? 'Permintaan batal direkodkan. Troli asal diasingkan; kaunter sedia untuk pelanggan seterusnya.'
    : 'Permintaan batal transaksi lama direkodkan. Kaunter sedia untuk pelanggan seterusnya.');
  } else {
   if (vtCashierReleasedPaymentRef.current === payment.id) {
    vtCashierReleasedPaymentRef.current = null;
   }
   toast.info('Permintaan batal transaksi lama direkodkan. Troli dan dialog pelanggan semasa dikekalkan.');
  }
  return true;
 }, [deferredFinalizationKey, nativeCleanupKey, onOpenChange, removeStoredQrPaymentFor, resetPaymentForm, retireCurrentFiuuVtCartForPendingRelease]);

 const releaseFiuuVtNativeState = useCallback(async (
  orderId: string,
  allowReviewedRecovery = true,
 ): Promise<boolean> => {
  const paymentId = paymentIdFromFiuuVtOrderId(orderId);
  try {
   await clearPendingFiuuVtResult(
    orderId,
    allowReviewedRecovery
     ? {
      // Terminal/reviewed server evidence lets bridge v10 archive a corrupt
      // legacy registry without clearing app data. A cashier-released PENDING
      // payment deliberately omits this authority: any quarantine or corrupt
      // registry remains blocked for Finance/HQ review.
      reviewReference: paymentId ? `server-payment:${paymentId}` : undefined,
     }
     : undefined,
   );
  } catch {
   const status = await readFiuuVtStatus().catch(() => null);
   if (status
    && status.pendingOrderId === null
    && !status.resultAvailable
    && !status.quarantineBlocksRelease
    && !status.callbackRegistryRecoveryRequired) {
    removeDeferredFiuuVtNativeCleanup(nativeCleanupKey);
    setVtNativeStatus(status);
    return true;
   }
   if (status) setVtNativeStatus(status);
   const retryOrderId = resolveFiuuVtCleanupOrderId(status?.pendingOrderId ?? null, orderId);
   if (retryOrderId) storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, retryOrderId);
   return false;
  }

  const verifiedStatus = await readFiuuVtStatus().catch(() => null);
  if (!verifiedStatus
   || verifiedStatus.pendingOrderId !== null
   || verifiedStatus.resultAvailable
   || verifiedStatus.quarantineBlocksRelease
   || verifiedStatus.callbackRegistryRecoveryRequired) {
   if (verifiedStatus) setVtNativeStatus(verifiedStatus);
   const retryOrderId = resolveFiuuVtCleanupOrderId(
    verifiedStatus?.pendingOrderId ?? null,
    orderId,
   );
   if (retryOrderId) storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, retryOrderId);
   return false;
  }
  removeDeferredFiuuVtNativeCleanup(nativeCleanupKey);
  setVtNativeStatus(verifiedStatus);
  return true;
 }, [nativeCleanupKey]);

 const drainAndReleaseDeferredFiuuVtNativeState = useCallback((
  orderId: string,
  options: {
   restartExpiredWindow?: boolean;
   retirement?: { amountRm: number; cartFingerprint?: string | null };
  } = {},
 ): Promise<FiuuVtRecoveryOutcome> => {
  const releaseWindow = vtNativeReleaseWindowRef.current;
  if (options.restartExpiredWindow
   && releaseWindow?.orderId === orderId
   && Date.now() - releaseWindow.startedAt >= FIUU_VT_NATIVE_RELEASE_WINDOW_MS) {
   vtNativeReleaseWindowRef.current = null;
  }
  const paymentId = paymentIdFromFiuuVtOrderId(orderId);
  if (!paymentId) return Promise.resolve('STILL_BLOCKED');
  // Capture the exact cart identity before joining an existing cleanup. A
  // late caller can upgrade the in-flight operation, but only for that same
  // cart session/fingerprint.
  if (options.retirement) {
   latchCurrentFiuuVtCartRetirement(
    paymentId,
    options.retirement.amountRm,
    options.retirement.cartFingerprint,
   );
  }
  const existingCleanup = vtNativeCleanupInFlightRef.current.get(orderId);
  if (existingCleanup) return existingCleanup;

  const cleanup = (async () => {
   let cashierReleasedPending = false;
   let nativeStatus = await readFiuuVtStatus().catch(() => null);
   if (nativeStatus) setVtNativeStatus(nativeStatus);
   const authoritativeOrderId = resolveFiuuVtCleanupOrderId(
    nativeStatus?.pendingOrderId ?? null,
    orderId,
   );
   if (authoritativeOrderId && authoritativeOrderId !== orderId) {
    storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, authoritativeOrderId);
    setQrPollError('Order terminal berubah. RKJ One telah menyelaraskan pembersihan kepada transaksi yang benar-benar aktif pada tablet.');
    scheduleFiuuVtRecoveryRetry(250);
    return 'STILL_BLOCKED';
   }

   let retireCurrentCart = currentCartMatchesFiuuVtRetirementLatch(paymentId);

   let queuedResult: FiuuVtNativeCallbackResult | null;
   try {
    queuedResult = await readActiveFiuuVtResult(paymentId);
   } catch {
    scheduleFiuuVtRecoveryRetry(500);
    return 'STILL_BLOCKED';
   }
   if (queuedResult) {
    vtResultFingerprintRef.current = null;
    await processFiuuVtResultRef.current(queuedResult);
    scheduleFiuuVtRecoveryRetry(500);
    return 'STILL_BLOCKED';
   }

   // Complete both quiescence reads inside one shared operation. The first
   // click for the next customer waits for this same promise instead of
   // becoming a cleanup-only click that staff must repeat.
   if (vtCallbackDrainInProgressRef.current || vtCallbackDrainScopeRef.current) {
    await waitForFiuuVtQueueQuiescence();
    try {
     queuedResult = await readActiveFiuuVtResult(paymentId);
    } catch {
     scheduleFiuuVtRecoveryRetry(500);
     return 'STILL_BLOCKED';
    }
    if (queuedResult) {
     vtResultFingerprintRef.current = null;
     await processFiuuVtResultRef.current(queuedResult);
     scheduleFiuuVtRecoveryRetry(500);
     return 'STILL_BLOCKED';
    }
   }

   if (vtCallbackDrainInProgressRef.current || vtCallbackDrainScopeRef.current) {
    scheduleFiuuVtRecoveryRetry(500);
    return 'STILL_BLOCKED';
   }

   nativeStatus = await readFiuuVtStatus().catch(() => nativeStatus);
   if (nativeStatus) setVtNativeStatus(nativeStatus);
   const refreshedOrderId = resolveFiuuVtCleanupOrderId(
    nativeStatus?.pendingOrderId ?? null,
    orderId,
   );
   if (refreshedOrderId && refreshedOrderId !== orderId) {
    storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, refreshedOrderId);
    setQrPollError('Order terminal berubah semasa semakan. Pembersihan akan disambung pada transaksi native yang aktif.');
    scheduleFiuuVtRecoveryRetry(250);
    return 'STILL_BLOCKED';
   }
   if (nativeStatus?.pendingOrderId === orderId) {
    try {
     const response = await fetchPosQrPayment(paymentId);
     let payment = response.payment;
     if (payment.provider !== 'fiuu_vt'
      || payment.provider_order_id !== orderId
      || payment.branch_id !== branchId) {
      throw new Error('Transaksi Fiuu VT terdahulu bukan milik tablet cawangan ini.');
     }
     cashierReleasedPending = payment.status === 'PENDING'
      && Boolean(payment.fiuu_vt_cashier_released_at);
     const currentCartMatchesPayment = currentCartMatchesFiuuVtRetirementLatch(paymentId)
      || Boolean(
       payment.cart_fingerprint
       && currentFiuuVtPaymentFingerprint(payment.amount_rm) === payment.cart_fingerprint,
      );
     const mustRetireCurrentCart = vtCurrentCartRetirementRef.current.has(paymentId);
     if (mustRetireCurrentCart && currentCartMatchesPayment) {
      retireCurrentCart = true;
     }
     if (payment.status === 'PENDING'
      && nativeStatus.callbackRegistryRecoveryRequired) {
      const parked = await parkFiuuVtProviderErrorPayment(
       payment.id,
       'NATIVE_CALLBACK_REGISTRY',
      );
      payment = {
       ...payment,
       status: parked.payment.status,
       fiuu_vt_review_required: parked.payment.fiuu_vt_review_required,
       fiuu_vt_reconciliation_state: parked.payment.fiuu_vt_reconciliation_state,
      };
      if (currentCartMatchesPayment) {
       latchCurrentFiuuVtCartRetirement(
        paymentId,
        payment.amount_rm,
        payment.cart_fingerprint,
       );
      }
      retireCurrentCart = currentCartMatchesPayment;
      setQrPollError(parked.warning
       ?? 'Bukti transaksi lama telah dikuarantin untuk semakan Finance/HQ. Terminal sedang dilepaskan tanpa membuang rekod audit.');
     }
    if (payment.fiuu_vt_review_required && currentCartMatchesPayment) {
      retireCurrentCart = true;
     }
     const cleanupAction = decideFiuuVtCleanupAction({
      serverStatus: payment.status,
      reviewRequired: payment.fiuu_vt_review_required,
      cashierReleased: Boolean(payment.fiuu_vt_cashier_released_at),
      currentCartMatchesPayment: mustRetireCurrentCart ? false : currentCartMatchesPayment,
      nativeQuarantineBlocksRelease: nativeStatus.quarantineBlocksRelease,
      nativeResultAvailable: nativeStatus.resultAvailable,
      callbackDrainInProgress: vtCallbackDrainInProgressRef.current
       || vtCallbackDrainScopeRef.current !== null,
     });

     if (cleanupAction === 'DRAIN_CALLBACKS') {
      setQrPollError('Callback Fiuu VT baharu dikesan semasa pelepasan. Antrean akan dikosongkan sebelum sebarang semakan STATUS lain.');
      scheduleFiuuVtRecoveryRetry(250);
      return 'STILL_BLOCKED';
     }

     if (cleanupAction === 'RECOVER_CURRENT_CART') {
      // Keep native state authoritative and let the normal recovery path
      // restore this exact cart. A different cart never enters this branch.
      removeDeferredFiuuVtNativeCleanup(nativeCleanupKey);
      setQrPollError('Transaksi Fiuu VT aktif untuk troli ini ditemui dan sedang dipulihkan. Tiada SALE kedua dihantar.');
      scheduleFiuuVtRecoveryRetry(250);
      return 'STILL_BLOCKED';
     }

     if (cleanupAction === 'REVIEW_REQUIRED') {
      setQrPollError('Transaksi terdahulu memerlukan semakan Finance/HQ. Terminal kekal dikunci supaya bukti bayaran tidak hilang.');
      return 'STILL_BLOCKED';
     }

     if (cleanupAction === 'CHECK_STATUS') {
      // Never open another app from a background focus/online event. A cashier
      // must have the checkout dialog open before STATUS reconciliation starts.
      if (!dialogOpenRef.current) return 'STILL_BLOCKED';

      const now = Date.now();
      const currentReleaseWindow = vtNativeReleaseWindowRef.current;
      if (!currentReleaseWindow || currentReleaseWindow.orderId !== orderId) {
       vtNativeReleaseWindowRef.current = { orderId, startedAt: now };
      } else if (now - currentReleaseWindow.startedAt >= FIUU_VT_NATIVE_RELEASE_WINDOW_MS) {
       setQrPollError('Semakan automatik transaksi terdahulu dihentikan selepas 90 saat. Troli dikekalkan; cuba semula secara manual atau hubungi HQ.');
       return 'STILL_BLOCKED';
      }

      const operationWaitMs = vtOperationRetryAtRef.current - Date.now();
      if (operationWaitMs > 0) {
       scheduleFiuuVtRecoveryRetry(Math.min(operationWaitMs, 2_000));
       setQrPollError(
        `Semakan STATUS transaksi terdahulu sedang diproses. Kaunter akan cuba dilepaskan semula dalam kira-kira ${Math.max(1, Math.ceil(operationWaitMs / 1000))} saat.`,
       );
       return 'STILL_BLOCKED';
      }
      if (nativeStatus.pendingOperation === 'VOID') {
       scheduleFiuuVtRecoveryRetry(2_000);
       setQrPollError('Pembatalan transaksi terdahulu masih diproses oleh Fiuu VT. Kaunter akan disemak semula secara automatik.');
       return 'STILL_BLOCKED';
      }

      const attempt = await prepareFiuuVtCallbackAttempt(paymentId, 'STATUS');
      await launchTrackedFiuuVt(
       paymentId,
       attempt,
       () => launchFiuuVtStatus(orderId, payment.amount_rm, attempt),
      );
      vtOperationRetryAtRef.current = Date.now() + FIUU_VT_STATUS_RETRY_MS;
      setQrPollError('Fiuu VT sedang mengesahkan status akhir transaksi terdahulu. Selepas selesai, kaunter dilepaskan secara automatik.');
      scheduleFiuuVtRecoveryRetry(500);
      return 'STILL_BLOCKED';
     }

     if (cleanupAction === 'CONFIRM_REPORTED') {
      const confirmationSeal = captureFiuuVtFinalizationSeal(paymentId, true);
      if (!confirmationSeal) {
       scheduleFiuuVtRecoveryRetry(500);
       return 'STILL_BLOCKED';
      }
      const confirmation = await confirmFiuuVtPayment(paymentId);
      if (confirmation.payment.status !== 'PAID'
       || !isFiuuVtFinalizationSealValid(confirmationSeal)) {
       scheduleFiuuVtRecoveryRetry(500);
       return 'STILL_BLOCKED';
      }
      setQrPollError('Bayaran pelanggan terdahulu telah dimuktamadkan secara idempoten. Troli pelanggan semasa tidak diubah dan terminal sedang dilepaskan.');
     } else if (payment.status === 'QUARANTINED') {
      setQrPollError('Transaksi terdahulu kekal dikuarantin untuk semakan Finance/HQ. Terminal sedang dilepaskan tanpa semakan STATUS tambahan.');
     }
    } catch (error) {
     let releaseAfterReview = false;
     if (error instanceof PosQrPaymentError
      && error.mode === 'FIUU_VT_RELEASE_RETRY_LIMIT') {
      if (error.reason === 'PAYMENT_EXPIRED'
       || error.reason === 'STATUS_ATTEMPT_BUDGET_EXHAUSTED') {
       try {
        const parked = await parkFiuuVtProviderErrorPayment(
         paymentId,
         'STATUS_RETRY_LIMIT',
        );
        retireCurrentCart = retireCurrentCart
         || currentCartMatchesFiuuVtRetirementLatch(paymentId);
        setQrPollError(parked.warning
         ?? 'Had semakan STATUS telah dicapai. Transaksi asal dikuarantin bersama semua bukti untuk semakan Finance/HQ; terminal sedang dilepaskan tanpa mencipta SALE baharu.');
        releaseAfterReview = true;
        // Continue into the sealed native-release path below. The server row
        // is now review-locked, so a late callback remains tied to this exact
        // payment while the next customer's cart stays independent.
       } catch (parkError) {
        const parkNotReady = parkError instanceof PosQrPaymentError
         && parkError.mode === 'FIUU_VT_STATUS_RETRY_LIMIT_NOT_READY';
        const retryAfterMs = Math.max(
         1_000,
         parkError instanceof PosQrPaymentError
          ? parkError.retryAfterMs ?? 2_000
          : 2_000,
        );
        vtOperationRetryAtRef.current = Date.now() + retryAfterMs;
        setQrPollError(parkNotReady
         ? 'Bukti callback atau lease Fiuu VT masih aktif. RKJ One mengekalkan transaksi asal dan akan cuba kuarantin semula tanpa membuka SALE baharu.'
         : parkError instanceof Error
          ? `Transaksi asal belum dapat dikuarantin: ${parkError.message}`
          : 'Transaksi asal belum dapat dikuarantin dengan selamat.');
        scheduleFiuuVtRecoveryRetry(Math.min(retryAfterMs, 2_000));
        return 'STILL_BLOCKED';
       }
      } else {
       const retryAfterMs = Math.max(1_000, error.retryAfterMs ?? 5_000);
       vtOperationRetryAtRef.current = Date.now() + retryAfterMs;
       setQrPollError(
        `Semakan STATUS sedang dihadkan sementara. Troli dikekalkan; RKJ One akan cuba semula dalam kira-kira ${Math.max(1, Math.ceil(retryAfterMs / 1000))} saat tanpa membuka SALE baharu.`,
       );
       scheduleFiuuVtRecoveryRetry(Math.min(retryAfterMs, 2_000));
       return 'STILL_BLOCKED';
      }
     }
     if (!releaseAfterReview) {
      if (error instanceof PosQrPaymentError
       && error.mode === 'FIUU_VT_OPERATION_ACTIVE') {
       const retryAfterMs = Math.max(1_000, error.retryAfterMs ?? FIUU_VT_STATUS_RETRY_MS);
       vtOperationRetryAtRef.current = Date.now() + retryAfterMs;
       setQrPollError(
        `Semakan STATUS transaksi terdahulu sudah aktif. Kaunter akan cuba dilepaskan semula dalam kira-kira ${Math.max(1, Math.ceil(retryAfterMs / 1000))} saat.`,
       );
       scheduleFiuuVtRecoveryRetry(Math.min(retryAfterMs, 2_000));
       return 'STILL_BLOCKED';
      }
      if (error instanceof PosQrPaymentError
       && error.mode === 'FIUU_VT_NATIVE_RECOVERY_NOT_READY') {
       setQrPollError('Bukti transaksi lama masih diperiksa. RKJ One akan mengasingkannya secara selamat selepas tempoh callback tamat; troli pelanggan semasa tidak berubah.');
       scheduleFiuuVtRecoveryRetry(1_000);
       return 'STILL_BLOCKED';
      }
      const retryable = error instanceof TypeError
       || (error instanceof PosQrPaymentError
        && (error.status === 429 || error.status >= 500))
       || (error instanceof ClientJsonError
        && (error.status === 429 || error.status >= 500));
      setQrPollError(error instanceof Error
       ? `Status akhir transaksi terdahulu belum dapat disahkan: ${error.message}`
       : 'Status akhir transaksi terdahulu belum dapat disahkan.');
      if (retryable) scheduleFiuuVtRecoveryRetry(2_000);
      return 'STILL_BLOCKED';
     }
    }
   }

   // Re-read the sticky latch after every await. A concurrent active-payment
   // recovery may have joined this cleanup and upgraded it to retire the cart.
   retireCurrentCart = retireCurrentCart
    || currentCartMatchesFiuuVtRetirementLatch(paymentId);
   const nativeReleaseSeal = captureFiuuVtNativeReleaseSeal(paymentId, true);
   if (!nativeReleaseSeal) {
    scheduleFiuuVtRecoveryRetry(500);
    return 'STILL_BLOCKED';
   }
   const nativeReleased = await releaseFiuuVtNativeState(
    orderId,
    // Cashier release is not provider cancellation confirmation and is not a
    // Finance review. It may clear only an already-empty, healthy registry.
    !cashierReleasedPending,
   );
   if (!nativeReleased || !isFiuuVtNativeReleaseSealValid(nativeReleaseSeal)) {
    if (retireCurrentCart) {
     const retired = retireCurrentFiuuVtCartForPendingRelease(paymentId, orderId);
     if (retired) {
      setQrPollError('Troli pelanggan asal sudah ditutup untuk mengelakkan caj semula. Terminal masih menyelesaikan pelepasan selamat dan resit kekal disimpan.');
     }
     scheduleFiuuVtRecoveryRetry(500);
     return retired ? 'CART_RETIRED_RELEASE_PENDING' : 'STILL_BLOCKED';
    }
    scheduleFiuuVtRecoveryRetry(500);
    return 'STILL_BLOCKED';
   }
   vtNativeReleaseWindowRef.current = null;
   // Keep persisted recovery identity until native release is sealed. If the
   // WebView reloads mid-cleanup, the server receipt/payment can still be
   // re-fetched instead of being silently orphaned.
   removeStoredQrPaymentFor(paymentId);
   if (retireCurrentCart && retireCurrentFiuuVtCart(
     'Transaksi pelanggan ini telah ditutup dengan selamat. Jangan caj semula; kaunter sedia untuk pelanggan seterusnya.',
     paymentId,
    )) {
    return 'RETIRED_CURRENT_CART';
   }
   // A late retirement request may arrive after native release but before this
   // promise resolves. Never return CLEAN while that exact payment is latched.
   if (currentCartMatchesFiuuVtRetirementLatch(paymentId)
    && retireCurrentFiuuVtCart(
     'Transaksi pelanggan ini telah ditutup dengan selamat. Jangan caj semula pelanggan yang sama.',
     paymentId,
    )) {
    return 'RETIRED_CURRENT_CART';
   }
   vtCurrentCartRetirementRef.current.delete(paymentId);
   if (vtCartRetiredPendingReleaseRef.current.delete(paymentId)) {
    if (matchesFiuuVtPaymentIdentity(activeQrPaymentRef.current, paymentId, orderId)) {
     resetPaymentForm();
     dialogOpenRef.current = false;
     onOpenChange(false);
     toast.warning('Terminal telah dilepaskan dengan selamat. Kaunter sedia untuk pelanggan seterusnya.');
     return 'RETIRED_CURRENT_CART';
    }
    return 'CLEAN_FOR_NEW_CART';
   }
   return 'CLEAN_FOR_NEW_CART';
  })();

  const trackedCleanup = cleanup.finally(() => {
   if (vtNativeCleanupInFlightRef.current.get(orderId) === trackedCleanup) {
    vtNativeCleanupInFlightRef.current.delete(orderId);
   }
  });
  vtNativeCleanupInFlightRef.current.set(orderId, trackedCleanup);
  return trackedCleanup;
 }, [branchId, captureFiuuVtFinalizationSeal, captureFiuuVtNativeReleaseSeal, currentCartMatchesFiuuVtRetirementLatch, currentFiuuVtPaymentFingerprint, isFiuuVtFinalizationSealValid, isFiuuVtNativeReleaseSealValid, latchCurrentFiuuVtCartRetirement, nativeCleanupKey, onOpenChange, readActiveFiuuVtResult, releaseFiuuVtNativeState, removeStoredQrPaymentFor, resetPaymentForm, retireCurrentFiuuVtCart, retireCurrentFiuuVtCartForPendingRelease, scheduleFiuuVtRecoveryRetry]);

 const completeFiuuVtCashierCleanup = useCallback(async (
  orderId: string,
 ): Promise<FiuuVtRecoveryOutcome> => {
  const deadline = Date.now() + FIUU_VT_CLEANUP_UI_TIMEOUT_MS - 1_000;
  let firstAttempt = true;
  while (dialogOpenRef.current && Date.now() < deadline) {
   const outcome = await drainAndReleaseDeferredFiuuVtNativeState(
    orderId,
    { restartExpiredWindow: firstAttempt },
   );
   firstAttempt = false;
   if (outcome !== 'STILL_BLOCKED') return outcome;

   // A STATUS callback resumes the WebView asynchronously. Keep this cashier
   // click attached to the same cleanup operation so staff do not need to
   // press the button again after the native migration/acknowledgement lands.
   await new Promise<void>((resolve) => {
    window.setTimeout(resolve, FIUU_VT_CASHIER_CLEANUP_RETRY_MS);
   });
  }
  return 'STILL_BLOCKED';
 }, [drainAndReleaseDeferredFiuuVtNativeState]);

 const detachStoredFiuuVtPaymentFromCurrentCart = useCallback((
  stored: StoredQrPayment,
 ): boolean => {
  if (stored.payment.integration !== 'vt_app'
   || activeQrPaymentMatchesCurrentCart(stored.payment)) return false;

  const staleOrderId = stored.payment.providerOrderId;
  beginFiuuVtCallbackDrain(stored.payment.id);
  removeStoredQrPayment();
  qrAttemptKeyRef.current = null;
  setVtPrelaunchFailure(null);
  setQrPollError('Transaksi QR terdahulu diasingkan daripada troli pelanggan ini. Troli dikekalkan sementara terminal dibersihkan.');
  if (staleOrderId) {
   storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, staleOrderId);
   queueMicrotask(() => void drainAndReleaseDeferredFiuuVtNativeState(staleOrderId));
  }
  return true;
 }, [activeQrPaymentMatchesCurrentCart, beginFiuuVtCallbackDrain, drainAndReleaseDeferredFiuuVtNativeState, nativeCleanupKey, removeStoredQrPayment]);

 useEffect(() => {
  let cancelled = false;
  let cleanupInFlight = false;
  const retryDeferredCleanup = async () => {
   if (cancelled || cleanupInFlight) return;
   const deferredFinalization = readDeferredFiuuVtFinalization(deferredFinalizationKey);
   const storedCleanupOrderId = readDeferredFiuuVtNativeCleanup(nativeCleanupKey);
   if (storedCleanupOrderId && deferredFinalization
    && storedCleanupOrderId !== deferredFinalization.orderId) {
    setQrPollError('Dua identiti transaksi terminal bercanggah dikesan. Kaunter kekal dikunci untuk semakan HQ; tiada SALE baharu dihantar.');
    return;
   }
   const orderId = storedCleanupOrderId ?? deferredFinalization?.orderId ?? null;
   if (!orderId) return;
   cleanupInFlight = true;
   try {
     const outcome = await drainAndReleaseDeferredFiuuVtNativeState(orderId);
     const paymentId = paymentIdFromFiuuVtOrderId(orderId);
     if (paymentId
      && (outcome === 'RETIRED_CURRENT_CART' || outcome === 'CLEAN_FOR_NEW_CART')) {
      let receipt = vtPendingReceiptAfterReleaseRef.current.get(paymentId) ?? null;
      if (deferredFinalization?.paymentId === paymentId) {
       let response: Awaited<ReturnType<typeof fetchPosQrPayment>>;
       try {
        response = await fetchPosQrPayment(paymentId);
       } catch {
        scheduleFiuuVtRecoveryRetry(1_000);
        setQrPollError('Terminal sudah dilepaskan, tetapi rekod akhir server belum dapat dibaca. Pemulihan resit akan dicuba semula; tiada SALE baharu dihantar.');
        return;
       }
       const payment = response.payment;
       const cashierReleasedPending = payment.status === 'PENDING'
        && Boolean(payment.fiuu_vt_cashier_released_at);
       const safeDetachedPayment = ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'QUARANTINED'].includes(payment.status)
        || payment.fiuu_vt_review_required
        || cashierReleasedPending;
       if (payment.provider !== 'fiuu_vt'
        || payment.provider_order_id !== orderId
        || payment.branch_id !== branchId
        || !safeDetachedPayment
        || (payment.status === 'PAID' && !response.result)) {
        scheduleFiuuVtRecoveryRetry(1_000);
        setQrPollError('Rekod akhir transaksi belum lengkap. Kaunter kekal fail-closed sehingga resit atau keputusan semakan server tersedia.');
        return;
       }
       receipt = receipt ?? response.result;
       if (cashierReleasedPending) {
        toast.info('Terminal sedia. Transaksi pelanggan terdahulu kekal dipantau mengikut ID asal; QR baharu tidak akan menimpanya.');
       }
      }
      if (receipt) {
       vtPendingReceiptAfterReleaseRef.current.delete(paymentId);
       removeStoredQrPaymentFor(paymentId);
       toast.success('Terminal telah dilepaskan. Resit bayaran yang telah disahkan kini dipulihkan.');
       onSuccess(receipt);
      }
      if (deferredFinalization?.paymentId === paymentId) {
       removeDeferredFiuuVtFinalization(deferredFinalizationKey);
       vtPendingReceiptAfterReleaseRef.current.delete(paymentId);
       removeStoredQrPaymentFor(paymentId);
      }
     }
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
 }, [branchId, deferredFinalizationKey, drainAndReleaseDeferredFiuuVtNativeState, nativeCleanupKey, onSuccess, removeStoredQrPaymentFor, scheduleFiuuVtRecoveryRetry, vtRecoveryRetry]);

	useEffect(() => {
		if (!open || !storageKey || qrPayment) return;
		const stored = readStoredQrPayment(storageKey);
		if (!stored) return;
		if (detachStoredFiuuVtPaymentFromCurrentCart(stored)) return;
		if (stored.payment.integration === 'vt_app') {
			// Do not restore a checkout over a corrupt native callback registry.
			// With a pending native order, the reviewed quarantine/release path owns
			// the exact payment. Without one, the cashier's cleanup action archives
			// the orphaned identities first; only then may this payment be restored.
			if (!vtNativeStatus) {
				if (!vtStatusLoading) {
					setVtStatusLoading(true);
					void readFiuuVtStatus()
						.then(setVtNativeStatus)
						.catch(() => setQrPollError('Status terminal Fiuu VT belum dapat dibaca. Tiada SALE baharu dihantar.'))
						.finally(() => setVtStatusLoading(false));
				}
				return;
			}
			if (vtStatusLoading) return;
			if (vtNativeStatus.callbackRegistryRecoveryRequired) {
				if (vtNativeStatus.pendingOrderId
					&& stored.payment.providerOrderId === vtNativeStatus.pendingOrderId) {
					// Preserve the exact current-checkout identity even if an older server
					// row has no cart fingerprint.  Once quarantined, this cart must be
					// retired instead of being mistaken for a safe previous customer.
					latchCurrentFiuuVtCartRetirement(
						stored.payment.id,
						stored.payment.amountRm,
						stored.payment.cartFingerprint,
					);
				}
				setQrPollError(vtNativeStatus.pendingOrderId
					? 'Daftar callback terminal perlu dipulihkan. Tiada SALE baharu dihantar; transaksi yang sama sedang dikuarantin dengan bukti audit.'
					: 'Daftar callback terminal tiada order aktif. Tekan semak dan bersihkan terminal untuk mengarkib bukti sebelum meneruskan.');
				if (vtNativeStatus.pendingOrderId) {
					storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, vtNativeStatus.pendingOrderId);
					queueMicrotask(() => void drainAndReleaseDeferredFiuuVtNativeState(
						vtNativeStatus.pendingOrderId!,
					));
				}
				return;
			}
			beginFiuuVtCallbackDrain(stored.payment.id);
		}
		qrAttemptKeyRef.current = stored.idempotencyKey;
		setMethod(stored.payment.paymentMethod);
		setCashTenderedOverride(stored.payment.paymentMethod === 'MIXED'
			? stored.payment.cashAmountRm.toFixed(2)
			: null);
		setQrAmountOverride(stored.payment.paymentMethod === 'MIXED'
			? stored.payment.amountRm.toFixed(2)
			: null);
		activeQrPaymentIdRef.current = stored.payment.id;
		activeQrPaymentRef.current = stored.payment;
		vtSaleWatchdogStartedAtRef.current = 1;
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
	}, [beginFiuuVtCallbackDrain, detachStoredFiuuVtPaymentFromCurrentCart, drainAndReleaseDeferredFiuuVtNativeState, latchCurrentFiuuVtCartRetirement, nativeCleanupKey, open, qrPayment, storageKey, vtNativeStatus, vtStatusLoading]);

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

 const recoverFiuuVtPayment = useCallback(async (
  nativeStatus: FiuuVtNativeStatus,
 ): Promise<FiuuVtRecoveryOutcome> => {
  const orderId = nativeStatus.pendingOrderId;
  const currentShift = shift;
  if (!open || qrPayment || !currentShift || !storageKey || !orderId) return 'STILL_BLOCKED';
  if (vtRecoveryOrderRef.current === orderId) return 'STILL_BLOCKED';

  const paymentId = paymentIdFromFiuuVtOrderId(orderId);
  if (!paymentId) {
   setQrPollError('Rekod native Fiuu VT tidak sepadan dengan format transaksi RKJ One. Jangan jana SALE baharu.');
   return 'STILL_BLOCKED';
  }

  vtRecoveryOrderRef.current = orderId;
  beginFiuuVtCallbackDrain(paymentId);
  setCheckingQrStatus(true);
  try {
   const response = await fetchPosQrPayment(paymentId);
   const payment = response.payment;
   if (payment.provider !== 'fiuu_vt'
    || payment.provider_order_id !== orderId
    || payment.branch_id !== branchId) {
     throw new Error('Transaksi native Fiuu VT bukan milik sesi tablet cawangan yang aktif.');
   }
    const paymentFromPriorShift = payment.shift_id !== currentShift.id;
    const fingerprint = payment.cart_fingerprint;
    const currentCartMatchesPayment = currentCartMatchesFiuuVtRetirementLatch(payment.id)
     || (!paymentFromPriorShift
      && Boolean(fingerprint
       && currentFiuuVtPaymentFingerprint(payment.amount_rm) === fingerprint));

    if (payment.status === 'PENDING'
     && nativeStatus.callbackRegistryRecoveryRequired) {
     if (currentCartMatchesPayment) {
      latchCurrentFiuuVtCartRetirement(
       payment.id,
       payment.amount_rm,
       fingerprint,
      );
     }
     await parkFiuuVtProviderErrorPayment(payment.id, 'NATIVE_CALLBACK_REGISTRY');
     storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId);
     vtRecoveryOrderRef.current = null;
     const outcome = await drainAndReleaseDeferredFiuuVtNativeState(
      orderId,
      { retirement: currentCartMatchesPayment
       ? { amountRm: payment.amount_rm, cartFingerprint: fingerprint }
       : undefined },
     );
     if (outcome === 'STILL_BLOCKED') {
      setQrPollError('Daftar callback rosak telah dikuarantin. Tiada SALE kedua dihantar; terminal sedang menyimpan bukti dan akan dicuba semula.');
      scheduleFiuuVtRecoveryRetry(500);
     }
     return outcome;
    }

   if (payment.status === 'QUARANTINED' && payment.fiuu_vt_review_required) {
    storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId);
    vtRecoveryOrderRef.current = null;
     const outcome = await drainAndReleaseDeferredFiuuVtNativeState(
      orderId,
      { retirement: currentCartMatchesPayment
       ? { amountRm: payment.amount_rm, cartFingerprint: fingerprint }
       : undefined },
     );
     if (currentCartMatchesPayment && outcome === 'CLEAN_FOR_NEW_CART') {
      if (retireCurrentFiuuVtCart(
       'Transaksi pelanggan ini sudah dikuarantin untuk semakan Finance/HQ. Jangan caj semula pelanggan yang sama.',
       paymentId,
      )) return 'RETIRED_CURRENT_CART';
     }
     setQrPollError(outcome === 'CLEAN_FOR_NEW_CART'
      ? null
     : 'Transaksi lama sudah dikuarantin. Troli pelanggan semasa selamat; terminal sedang dibersihkan secara automatik.');
     toast.info(outcome === 'CLEAN_FOR_NEW_CART'
     ? 'Transaksi lama telah dikuarantin dan terminal sudah sedia untuk pelanggan semasa.'
     : 'Transaksi lama telah dikuarantin. Troli pelanggan semasa dikekalkan sementara terminal dibersihkan.');
     return outcome;
   }
    if (['PAID', 'EXPIRED', 'FAILED', 'CANCELLED'].includes(payment.status)) {
    let queuedResult: FiuuVtNativeCallbackResult | null;
    try {
     queuedResult = await readActiveFiuuVtResult(paymentId);
    } catch {
     vtRecoveryOrderRef.current = null;
     scheduleFiuuVtRecoveryRetry(500);
     setQrPollError('Transaksi sudah tamat, tetapi antrean callback tablet belum dapat dibaca. Kaunter akan cuba dilepaskan semula secara automatik.');
      return 'STILL_BLOCKED';
    }
    if (queuedResult) {
     vtResultFingerprintRef.current = null;
     await processFiuuVtResultRef.current(queuedResult);
     vtRecoveryOrderRef.current = null;
     scheduleFiuuVtRecoveryRetry(500);
     setQrPollError('Transaksi sudah tamat. Callback terakhir sedang disahkan sebelum kaunter dilepaskan.');
      return 'STILL_BLOCKED';
    }
    if (vtCallbackDrainInProgressRef.current) {
     vtRecoveryOrderRef.current = null;
     scheduleFiuuVtRecoveryRetry(500);
     setQrPollError('Transaksi sudah tamat. RKJ One sedang membuat semakan kosong terakhir sebelum kembali ke troli.');
      return 'STILL_BLOCKED';
    }
     if (payment.status === 'PAID' && currentCartMatchesPayment && !response.result) {
      vtRecoveryOrderRef.current = null;
      scheduleFiuuVtRecoveryRetry(500);
      setQrPollError('Bayaran telah diterima tetapi resit belum tersedia. Troli dan terminal kekal dikunci; jangan jana SALE baharu.');
      return 'STILL_BLOCKED';
     }
    const finalizationSeal = captureFiuuVtFinalizationSeal(paymentId, true);
    if (!finalizationSeal) {
     vtRecoveryOrderRef.current = null;
     scheduleFiuuVtRecoveryRetry(500);
     setQrPollError('Transaksi sudah tamat, tetapi callback lewat sedang diproses. Kaunter kekal dikunci buat sementara.');
      return 'STILL_BLOCKED';
    }
    if (currentCartMatchesPayment) {
     latchCurrentFiuuVtCartRetirement(
      payment.id,
      payment.amount_rm,
      fingerprint,
     );
    }
    const nativeReleased = await releaseFiuuVtNativeState(orderId);
    const finalizationStillValid = isFiuuVtFinalizationSealValid(finalizationSeal);
    vtRecoveryOrderRef.current = null;
     if (nativeReleased && !finalizationStillValid && currentCartMatchesPayment) {
      if (response.result) {
       vtPendingReceiptAfterReleaseRef.current.set(paymentId, response.result);
      }
      const retired = retireCurrentFiuuVtCartForPendingRelease(paymentId, orderId);
      setQrPollError('Keputusan akhir berubah ketika callback lewat diterima. Troli asal ditutup; rekod bayaran kekal disimpan sehingga semakan callback selesai.');
      scheduleFiuuVtRecoveryRetry(500);
      return retired ? 'CART_RETIRED_RELEASE_PENDING' : 'STILL_BLOCKED';
     }
     if (!nativeReleased || !finalizationStillValid) {
      scheduleFiuuVtRecoveryRetry(500);
      setQrPollError(`Transaksi Fiuu VT sudah ${payment.status}. Troli dikekalkan; callback lewat atau pembersihan terminal sedang diselesaikan secara automatik.`);
      return 'STILL_BLOCKED';
     }
     if (payment.status === 'PAID' && currentCartMatchesPayment && response.result) {
      removeStoredQrPaymentFor(paymentId);
      const retired = retireCurrentFiuuVtCart(
       'Bayaran terdahulu disahkan. Troli asal telah ditutup tanpa menghantar SALE kedua.',
       paymentId,
      );
      toast.success('Bayaran terdahulu disahkan. Resit dipulihkan tanpa menghantar SALE kedua.');
      onSuccess(response.result);
      return retired ? 'RETIRED_CURRENT_CART' : 'CLEAN_FOR_NEW_CART';
     }
     if (currentCartMatchesPayment) {
      removeStoredQrPaymentFor(paymentId);
      const retired = retireCurrentFiuuVtCart(
       `Transaksi Fiuu VT sudah ${payment.status} dan troli lama telah ditutup. Kaunter sedia untuk pelanggan seterusnya.`,
       paymentId,
      );
      return retired ? 'RETIRED_CURRENT_CART' : 'CLEAN_FOR_NEW_CART';
     }
     setQrPollError(`Transaksi Fiuu VT sudah ${payment.status}. Kaunter telah dilepaskan dan troli boleh digunakan semula.`);
     return 'CLEAN_FOR_NEW_CART';
   }
   if (!['PENDING', 'REPORTED', 'PAID'].includes(payment.status)) {
    throw new Error(`Status transaksi Fiuu VT ${payment.status} memerlukan semakan HQ.`);
   }
    if (paymentFromPriorShift) {
     // A current branch shift may reconcile STATUS on the same enrolled tablet,
     // but it must never adopt an old shift's cart even when the amount/items
     // happen to match the next customer.
     storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId);
     removeStoredQrPaymentFor(paymentId);
     vtRecoveryOrderRef.current = null;
     setQrPollError('Transaksi syif terdahulu sedang disahkan secara berasingan. Troli pelanggan semasa dikekalkan dan tiada SALE baharu dihantar.');
     scheduleFiuuVtRecoveryRetry(250);
     return 'STILL_BLOCKED';
    }
   if (!fingerprint
    || currentFiuuVtPaymentFingerprint(payment.amount_rm) !== fingerprint) {
    // This is a previous customer's order, not a corrupt current checkout.
    // Keep the current cart untouched and route the exact native/server order
    // through detached STATUS/confirmation/release instead of bouncing back
    // into this recovery function forever.
    storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId);
    removeStoredQrPaymentFor(paymentId);
    vtRecoveryOrderRef.current = null;
    setQrPollError('Transaksi pelanggan terdahulu sedang disahkan secara berasingan. Troli pelanggan semasa dikekalkan dan tiada SALE baharu dihantar.');
    scheduleFiuuVtRecoveryRetry(250);
    return 'STILL_BLOCKED';
   }
   const recoveredMethod: PaymentMethod = Math.round(payment.amount_rm * 100) === Math.round(total * 100)
    ? 'QR'
    : 'MIXED';
   const activePayment: ActiveQrPayment = {
    id: payment.id,
    imageUrl: null,
    amountRm: payment.amount_rm,
    paymentMethod: recoveredMethod,
    cashAmountRm: recoveredMethod === 'MIXED' ? total - payment.amount_rm : 0,
    saleTotalRm: total,
    expiresAt: payment.expires_at ?? new Date().toISOString(),
    environment: 'production',
    integration: 'vt_app',
    providerOrderId: orderId,
    cartFingerprint: fingerprint,
   };
   const idempotencyKey = createPosPaymentIdempotencyKey();
   qrAttemptKeyRef.current = idempotencyKey;
   setMethod(recoveredMethod);
   setCashTenderedOverride(recoveredMethod === 'MIXED'
    ? (total - payment.amount_rm).toFixed(2)
    : null);
   setQrAmountOverride(recoveredMethod === 'MIXED'
    ? payment.amount_rm.toFixed(2)
    : null);
   activeQrPaymentIdRef.current = activePayment.id;
   activeQrPaymentRef.current = activePayment;
   vtSaleWatchdogStartedAtRef.current = 1;
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
   return 'STILL_BLOCKED';
  } catch (error) {
    // A transient recovery read must be retryable on focus/online/manual
    // checks.  Keeping the order latched here would block every later attempt
    // until the WebView was fully reloaded.
    vtRecoveryOrderRef.current = null;
    const retryable = error instanceof TypeError
     || (error instanceof ClientJsonError
      && (error.status === 429 || error.status >= 500));
    if (retryable) scheduleFiuuVtRecoveryRetry();
   setQrPollError(error instanceof Error
    ? `Transaksi Fiuu VT tidak dapat dipulihkan: ${error.message}`
    : 'Transaksi Fiuu VT tidak dapat dipulihkan. Jangan jana SALE baharu.');
   return 'STILL_BLOCKED';
  } finally {
   setCheckingQrStatus(false);
  }
 }, [beginFiuuVtCallbackDrain, branchId, captureFiuuVtFinalizationSeal, currentCartMatchesFiuuVtRetirementLatch, currentFiuuVtPaymentFingerprint, drainAndReleaseDeferredFiuuVtNativeState, isFiuuVtFinalizationSealValid, latchCurrentFiuuVtCartRetirement, nativeCleanupKey, onSuccess, open, qrPayment, readActiveFiuuVtResult, releaseFiuuVtNativeState, removeStoredQrPaymentFor, retireCurrentFiuuVtCart, retireCurrentFiuuVtCartForPendingRelease, scheduleFiuuVtRecoveryRetry, shift, storageKey, storeActiveQrPayment, total]);

 const handleDialogOpenChange = useCallback((nextOpen: boolean) => {
 if (!nextOpen
  && qrPayment?.integration === 'vt_app'
  && qrPayment.providerOrderId
  && vtCashierReleasedPaymentRef.current === qrPayment.id) {
   const currentCartLatched = activeQrPaymentMatchesCurrentCart(qrPayment)
    ? latchCurrentFiuuVtCartRetirement(
     qrPayment.id,
     qrPayment.amountRm,
     qrPayment.cartFingerprint,
    )
    : false;
   if (!detachFiuuVtCheckoutAfterCashierRelease(qrPayment, currentCartLatched)) {
    toast.error('Pelepasan kaunter sudah direkodkan tetapi identiti pemulihan tablet belum selamat. Dialog dikekalkan; hubungi HQ.');
   }
   return;
  }
 if (!nextOpen && !vtReviewRequired && qrPayment
  && (qrStatus === 'PENDING' || qrStatus === 'REPORTED' || qrStatus === 'PAID')) {
   if (qrStatus === 'PENDING' && qrPayment.integration === 'vt_app' && !vtParkAvailable) {
    setVtCancelConfirming(true);
   }
   toast.info(vtParkAvailable
    ? 'Transaksi ini boleh dikuarantin untuk semakan Finance/HQ supaya kaunter boleh meneruskan jualan.'
    : qrDisplayExpired
    ? 'Mulakan pembatalan di Fiuu VT. Pelepasan selamat boleh mengambil kira-kira 30 saat sementara STATUS disahkan.'
    : qrStatus === 'PENDING' && qrPayment.integration === 'vt_app'
    ? 'Sahkan pembatalan Fiuu VT untuk kembali ke troli, atau teruskan menunggu bayaran.'
    : 'Tunggu keputusan QR atau tekan “Semak sekarang” sebelum menutup bayaran.');
  return;
 }
 dialogOpenRef.current = nextOpen;
 if (!nextOpen) resetPaymentForm();
 onOpenChange(nextOpen);
 }, [activeQrPaymentMatchesCurrentCart, detachFiuuVtCheckoutAfterCashierRelease, latchCurrentFiuuVtCartRetirement, onOpenChange, qrDisplayExpired, qrPayment, qrStatus, resetPaymentForm, vtParkAvailable, vtReviewRequired]);

 const completeServerPaidFiuuVtCheckout = useCallback((
  activePayment: ActiveQrPayment,
  receipt: SaleResult,
 ) => {
  const orderId = activePayment.providerOrderId;
  if (!orderId) return false;
  if (vtServerPaidCompletionRef.current.has(activePayment.id)) return true;

  vtServerPaidCompletionRef.current.add(activePayment.id);
  const currentCartMatchesPayment = activeQrPaymentMatchesCurrentCart(activePayment);
  if (currentCartMatchesPayment) {
   const latched = latchCurrentFiuuVtCartRetirement(
    activePayment.id,
    activePayment.amountRm,
    activePayment.cartFingerprint,
   );
   if (!latched
    || !retireCurrentFiuuVtCartForPendingRelease(activePayment.id, orderId)) {
    vtServerPaidCompletionRef.current.delete(activePayment.id);
    return false;
   }
  } else {
   // A restored payment can finish after the cashier has already moved to a
   // different cart. Persist its exact identity, but never clear that newer
   // cart. The marker makes a WebView crash between close and receipt safe.
   const cleanupIdentityAvailable = canPreserveDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId);
   const persisted = cleanupIdentityAvailable && preserveDeferredFiuuVtFinalization(deferredFinalizationKey, {
    version: 1,
    paymentId: activePayment.id,
    orderId,
    amountRm: activePayment.amountRm,
    cartFingerprint: activePayment.cartFingerprint,
    retiredAt: new Date().toISOString(),
   });
   if (!persisted || !preserveDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId)) {
    vtServerPaidCompletionRef.current.delete(activePayment.id);
    return false;
   }
  }

  // Server PAID + durable receipt is authoritative for the cashier. Native
  // callback cleanup continues separately and can never trigger SALE again.
  removeStoredQrPaymentFor(activePayment.id);
  vtPendingReceiptAfterReleaseRef.current.delete(activePayment.id);
  vtCartRetiredPendingReleaseRef.current.delete(activePayment.id);
  setQrStatus('PAID');
  toast.success('Bayaran disahkan. Resit dikeluarkan; terminal dibersihkan di belakang tanpa caj kedua.');
  resetPaymentForm();
  dialogOpenRef.current = false;
  onOpenChange(false);

  let receiptPresented = false;
  try {
   onSuccess(receipt);
   receiptPresented = true;
  } finally {
   if (receiptPresented) {
    removeDeferredFiuuVtFinalization(deferredFinalizationKey);
   }
   queueMicrotask(() => void drainAndReleaseDeferredFiuuVtNativeState(orderId));
  }
  return true;
 }, [activeQrPaymentMatchesCurrentCart, deferredFinalizationKey, drainAndReleaseDeferredFiuuVtNativeState, latchCurrentFiuuVtCartRetirement, nativeCleanupKey, onOpenChange, onSuccess, removeStoredQrPaymentFor, resetPaymentForm, retireCurrentFiuuVtCartForPendingRelease]);

 const reconcileQrPayment = useCallback(async (activePayment: ActiveQrPayment, manual = false) => {
  if (manual) setCheckingQrStatus(true);
  try {
   const response = await fetchPosQrPayment(activePayment.id);
   if (activeQrPaymentIdRef.current !== activePayment.id) return null;
   const status = response.payment.status;
   if (response.payment.fiuu_vt_cashier_released_at) {
    vtCashierReleasedPaymentRef.current = activePayment.id;
   }
     if (response.payment.fiuu_vt_review_required) {
      if (activePayment.integration === 'vt_app'
      && activePayment.providerOrderId) {
      const currentCartMatchesPayment = activeQrPaymentMatchesCurrentCart(activePayment);
      if (currentCartMatchesPayment) {
       latchCurrentFiuuVtCartRetirement(
        activePayment.id,
        activePayment.amountRm,
        activePayment.cartFingerprint,
       );
      }
      storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, activePayment.providerOrderId);
      const outcome = await drainAndReleaseDeferredFiuuVtNativeState(
       activePayment.providerOrderId,
       { retirement: currentCartMatchesPayment
        ? {
         amountRm: activePayment.amountRm,
         cartFingerprint: activePayment.cartFingerprint,
        }
        : undefined },
      );
      if (outcome === 'STILL_BLOCKED') {
        setQrPollError('Bukti transaksi sudah dikunci untuk semakan. RKJ One sedang mengarkib callback terminal sebelum melepaskan kaunter; tiada SALE baharu dihantar.');
       scheduleFiuuVtRecoveryRetry(500);
       return status;
      }
      if (outcome === 'CART_RETIRED_RELEASE_PENDING') {
       setQrPollError('Troli asal sudah ditutup. Terminal masih menyelesaikan pelepasan selamat; rekod bayaran dan resit kekal disimpan.');
       scheduleFiuuVtRecoveryRetry(500);
       return status;
      }
      removeStoredQrPayment();
      if (currentCartMatchesPayment && outcome === 'CLEAN_FOR_NEW_CART') {
       retireCurrentFiuuVtCart(
        'Transaksi dikunci untuk semakan Finance/HQ. Jangan caj semula pelanggan yang sama; kaunter sedia untuk pelanggan seterusnya.',
        activePayment.id,
       );
      } else if (!currentCartMatchesPayment && outcome === 'CLEAN_FOR_NEW_CART') {
       resetPaymentForm();
       dialogOpenRef.current = false;
       onOpenChange(false);
        toast.info('Transaksi lama dikunci untuk semakan dan terminal sudah sedia. Troli pelanggan semasa tidak diubah.');
      }
      return status;
     }
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
    if (!finalizationAllowed && status === 'REPORTED') {
     setQrStatus('PENDING');
     setQrPollError(vtReviewRequiredRef.current
      ? 'Bayaran ini dikunci untuk semakan HQ. Jangan caj pelanggan semula.'
      : 'Fiuu VT melaporkan bayaran berjaya. RKJ One sedang mengesahkan callback sebelum memuktamadkan jualan.');
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
     if (!finalizationAllowed) {
      const completed = completeServerPaidFiuuVtCheckout(activePayment, response.result);
      if (!completed) {
       setQrPollError('Bayaran dan resit telah disahkan, tetapi identiti pemulihan tablet tidak dapat disimpan. Jangan caj semula; hubungi HQ.');
      }
      return status;
     }
     const finalizationSeal = captureFiuuVtFinalizationSeal(activePayment.id);
     if (!finalizationSeal) {
      const completed = completeServerPaidFiuuVtCheckout(activePayment, response.result);
      if (!completed) {
       setQrPollError('Bayaran dan resit telah disahkan, tetapi identiti pemulihan tablet tidak dapat disimpan. Jangan caj semula; hubungi HQ.');
      }
      return status;
     }
     const nativeReleased = await releaseFiuuVtNativeState(activePayment.providerOrderId);
     if (!nativeReleased || !isFiuuVtFinalizationSealValid(finalizationSeal)) {
      const completed = completeServerPaidFiuuVtCheckout(activePayment, response.result);
      if (!completed) {
       setQrPollError(nativeReleased
        ? 'Bayaran dan resit telah disahkan, tetapi identiti pemulihan berubah. Jangan caj semula; hubungi HQ.'
        : 'Bayaran dan resit telah disahkan, tetapi identiti pemulihan tablet tidak dapat disimpan. Jangan caj semula; hubungi HQ.');
      }
      return status;
     }
    }
    removeStoredQrPayment();
    if (activeQrPaymentMatchesCurrentCart(activePayment)) {
     clearCart();
    }
    toast.success('Bayaran disahkan. Resit dikeluarkan dan stok dikemas kini.');
    resetPaymentForm();
    dialogOpenRef.current = false;
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
 }, [activeQrPaymentMatchesCurrentCart, captureFiuuVtFinalizationSeal, clearCart, completeServerPaidFiuuVtCheckout, drainAndReleaseDeferredFiuuVtNativeState, isFiuuVtFinalizationSealValid, latchCurrentFiuuVtCartRetirement, nativeCleanupKey, onOpenChange, onSuccess, readActiveFiuuVtResult, releaseFiuuVtNativeState, removeStoredQrPayment, resetPaymentForm, retireCurrentFiuuVtCart, scheduleFiuuVtRecoveryRetry]);

 const processFiuuVtResult = useCallback(async (result: FiuuVtNativeCallbackResult) => {
  const callbackPaymentId = paymentIdFromFiuuVtOrderId(result.orderId);
  if (!callbackPaymentId) {
   setQrPollError('Callback Fiuu VT tidak mempunyai nombor pesanan RKJ One yang sah.');
   return;
  }

  // Native callbacks can arrive before React commits setQrPayment(). The ref
  // is published synchronously before SALE opens, so the first callback is
  // matched to the correct payment instead of being treated as detached.
  const activePayment = activeQrPaymentRef.current;
  const isActivePayment = matchesFiuuVtPaymentIdentity(
   activePayment,
   callbackPaymentId,
   result.orderId,
  );
  const fingerprint = isFiuuVtErrorResult(result)
   ? [result.callbackAttemptId, result.callbackValidation, result.kind, result.opType, result.orderId, result.errorCode].join(':')
   : [result.callbackAttemptId, result.callbackValidation, result.opType, result.orderId, result.transactionId, result.status, result.amountRm].join(':');
  if (vtResultFingerprintRef.current === fingerprint) return;
  vtResultFingerprintRef.current = fingerprint;
  // A callback host is permanently bound to its original payment. Never fold
  // a late callback from customer A into customer B's active drain scope.
  const drainPaymentId = callbackPaymentId;
  const callbackDrainScope = beginFiuuVtCallbackDrain(drainPaymentId);
  callbackDrainScope.callbacksProcessing += 1;
  if (isActivePayment) {
   vtSaleWatchdogStartedAtRef.current ??= Date.now();
   setVtSaleOpened(true);
   setCheckingQrStatus(true);
  }
  let verifyDrainAfterCallback = false;

  const acknowledgeResult = async () => {
   const acknowledgeNative = async (registryRecoveryReviewed = false) => {
    const options = registryRecoveryReviewed
     ? {
      registryRecoveryReviewed: true as const,
      reviewReference: `server-result:${callbackPaymentId}:${result.callbackAttemptId}`,
     }
     : undefined;
    if (isFiuuVtErrorResult(result)) {
     await acknowledgeFiuuVtError(result, options);
    } else {
     await acknowledgeFiuuVtResult(result, options);
    }
   };

   // The server has already durably accepted this exact callback. If the
   // registry is corrupt, consume the queued result through the bridge-v11
   // atomic reviewed path so queue removal, raw-registry archive and callback
   // host tombstones land in one native commit.
   let status = await readFiuuVtStatus().catch(() => null);
   if (status?.callbackRegistryRecoveryRequired) {
    await acknowledgeNative(true);
    return;
   }
   try {
    await acknowledgeNative();
   } catch (error) {
    status = await readFiuuVtStatus().catch(() => null);
    if (!status?.callbackRegistryRecoveryRequired) throw error;
    await acknowledgeNative(true);
   }
  };
  const processNextQueuedResult = async (): Promise<FiuuVtQueueReadOutcome> => {
   let nextResult: FiuuVtNativeCallbackResult | null;
   try {
    nextResult = await readActiveFiuuVtResult(drainPaymentId);
   } catch {
    // The queue could not be proven empty, so keep the drain latch closed and
    // let normal polling retry instead of exposing a premature receipt.
    if (matchesFiuuVtPaymentIdentity(
     activeQrPaymentRef.current,
     callbackPaymentId,
     result.orderId,
    )) {
     setQrStatus('PENDING');
     setQrPollError('Antrean callback Fiuu VT belum dapat disahkan. RKJ One akan cuba semula secara automatik.');
    } else {
     if (vtRecoveryOrderRef.current === result.orderId) {
      vtRecoveryOrderRef.current = null;
     }
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

    const currentActivePayment = activeQrPaymentRef.current;
    const callbackStillOwnsCheckout = matchesFiuuVtPaymentIdentity(
     currentActivePayment,
     callbackPaymentId,
     result.orderId,
    );
    if (!callbackStillOwnsCheckout || !currentActivePayment) {
     const replacementCheckoutActive = Boolean(currentActivePayment);
     if (response.next_action === 'ACK_AND_QUARANTINE') {
      // A detached previous-customer callback must not freeze the current
      // checkout globally. Its exact order remains fail-closed in deferred
      // cleanup while the current cart stays untouched. Never replace a
      // different order already being cleaned: the server has durably
      // quarantined this callback and the native queue drain below owns it.
      const cleanupIdentityPreserved = preserveDeferredFiuuVtNativeCleanup(
       nativeCleanupKey,
       result.orderId,
      );
      if (!replacementCheckoutActive) {
       setQrPollError(cleanupIdentityPreserved
        ? response.warning
         ?? 'Callback lewat bercanggah telah dikuarantin. Terminal transaksi lama sedang dilepaskan tanpa mengubah troli semasa.'
        : 'Callback lewat telah dikuarantin pada pesanan asal. Pembersihan transaksi pelanggan semasa dikekalkan dan identitinya tidak ditimpa.');
      }
      scheduleFiuuVtRecoveryRetry(250);
     }
    vtResultFingerprintRef.current = null;
    const queueOutcome = await processNextQueuedResult();
    if (queueOutcome === 'empty') {
      if (vtRecoveryOrderRef.current === result.orderId) {
       vtRecoveryOrderRef.current = null;
      }
     const refreshedStatus = await readFiuuVtStatus().catch(() => null);
      if (refreshedStatus && !replacementCheckoutActive) setVtNativeStatus(refreshedStatus);
     if (vtCallbackDrainInProgressRef.current) scheduleFiuuVtRecoveryRetry(500);
    } else if (queueOutcome === 'read_failed') {
      if (vtRecoveryOrderRef.current === result.orderId) {
       vtRecoveryOrderRef.current = null;
      }
     scheduleFiuuVtRecoveryRetry();
    }
    return;
   }

   setQrPollError(response.warning ?? null);
   if (response.next_action !== 'PARK_AVAILABLE') setVtParkAvailable(false);
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
    const queueOutcome = await processNextQueuedResult();
    if (queueOutcome !== 'empty') return;
    vtResultFingerprintRef.current = null;
    let statusPayment = activeQrPaymentRef.current;
    if (!matchesFiuuVtPaymentIdentity(
     statusPayment,
     callbackPaymentId,
     result.orderId,
    ) || !statusPayment) {
     if (vtRecoveryOrderRef.current === result.orderId) {
      vtRecoveryOrderRef.current = null;
     }
     const refreshedStatus = await readFiuuVtStatus().catch(() => null);
     if (refreshedStatus) setVtNativeStatus(refreshedStatus);
     scheduleFiuuVtRecoveryRetry(250);
     return;
    }
    try {
     const attempt = await prepareFiuuVtCallbackAttempt(statusPayment.id, 'STATUS');
     statusPayment = activeQrPaymentRef.current;
     if (!matchesFiuuVtPaymentIdentity(
      statusPayment,
      callbackPaymentId,
      result.orderId,
     ) || !statusPayment) {
      scheduleFiuuVtRecoveryRetry(250);
      return;
     }
     const launchPayment = statusPayment;
     setQrStatus('PENDING');
     setVtStatusRetryPending(true);
     if (result.opType === 'VOID') {
      setVtCancelRequested(true);
      toast.info('Keputusan pembatalan diterima. Menjalankan semakan STATUS Fiuu VT.');
     } else if (result.opType === 'SALE') {
      toast.info('Laporan SALE diterima. Menjalankan semakan STATUS Fiuu VT.');
     }
      vtOperationRetryAtRef.current = 0;
      await launchTrackedFiuuVt(
       launchPayment.id,
       attempt,
       () => launchFiuuVtStatus(result.orderId, launchPayment.amountRm, attempt),
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
   if (response.next_action === 'PARK_AVAILABLE') {
    const queueOutcome = await processNextQueuedResult();
    if (queueOutcome !== 'empty') return;
    verifyDrainAfterCallback = true;
    setQrStatus('PENDING');
    setVtStatusRetryPending(false);
    setVtCancelConfirming(false);
    setVtCancelRequested(false);
    setVtParkAvailable(true);
    vtOperationRetryAtRef.current = 0;
    setQrPollError(response.warning
     ?? 'Fiuu VT mengulangi ralat selepas QR tamat. Kuarantin transaksi untuk semakan Finance/HQ dan teruskan jualan.');
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
   const callbackStillOwnsCheckout = matchesFiuuVtPaymentIdentity(
    activeQrPaymentRef.current,
    callbackPaymentId,
    result.orderId,
   );
   if (callbackStillOwnsCheckout
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
   if (callbackStillOwnsCheckout) {
    setQrPollError(error instanceof Error
     ? `Keputusan Fiuu VT tidak dapat disahkan: ${error.message}`
     : 'Keputusan Fiuu VT tidak dapat disahkan.');
   } else {
    if (vtRecoveryOrderRef.current === result.orderId) {
     vtRecoveryOrderRef.current = null;
    }
    scheduleFiuuVtRecoveryRetry(500);
   }
  } finally {
   callbackDrainScope.callbacksProcessing = Math.max(0, callbackDrainScope.callbacksProcessing - 1);
   const callbackStillOwnsCheckout = matchesFiuuVtPaymentIdentity(
    activeQrPaymentRef.current,
    callbackPaymentId,
    result.orderId,
   );
   if (callbackStillOwnsCheckout) setCheckingQrStatus(false);
   if (!callbackStillOwnsCheckout
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
        || !matchesFiuuVtPaymentIdentity(
         activeQrPaymentRef.current,
         callbackPaymentId,
         result.orderId,
        )
        || !activePayment) return;
      void (async () => {
       try {
        // processNextQueuedResult() has just observed one empty read. Wait for
        // the quiescence window before the second read so the callback-drain
        // latch can be released instead of leaving cashier actions disabled.
        await waitForFiuuVtQueueQuiescence();
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
 }, [beginFiuuVtCallbackDrain, nativeCleanupKey, readActiveFiuuVtResult, reconcileQrPayment, scheduleFiuuVtRecoveryRetry]);

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
     const deferredCleanupOrderId = readDeferredFiuuVtNativeCleanup(nativeCleanupKey);
     if (deferredCleanupOrderId === status.pendingOrderId) {
      await drainAndReleaseDeferredFiuuVtNativeState(deferredCleanupOrderId);
      return;
     }
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
  drainAndReleaseDeferredFiuuVtNativeState,
  nativeCleanupKey,
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

  const quarantineActiveFiuuVtCallbackRegistry = useCallback(async (
   activePayment: ActiveQrPayment,
   observedStatus?: FiuuVtNativeStatus,
  ): Promise<FiuuVtRecoveryOutcome> => {
   if (activePayment.integration !== 'vt_app' || !activePayment.providerOrderId) {
    return 'STILL_BLOCKED';
   }
   const status = observedStatus ?? await readFiuuVtStatus();
   setVtNativeStatus(status);
   if (!status.callbackRegistryRecoveryRequired) return 'STILL_BLOCKED';
   if (status.pendingOrderId && status.pendingOrderId !== activePayment.providerOrderId) {
    throw new Error('Daftar callback rosak merujuk transaksi terminal yang berbeza. Tiada SALE baharu dihantar.');
   }

   // This is the exact checkout already shown to the cashier. First make its
   // server state terminal/review-safe, then archive and release native state
   // through the shared audited path. The active qrPayment remains a durable
   // UI latch until that path retires the cart, even if WebView storage failed.
   latchCurrentFiuuVtCartRetirement(
    activePayment.id,
    activePayment.amountRm,
    activePayment.cartFingerprint,
   );
   const serverResponse = await fetchPosQrPayment(activePayment.id);
   const serverPayment = serverResponse.payment;
   if (serverPayment.provider !== 'fiuu_vt'
    || serverPayment.provider_order_id !== activePayment.providerOrderId
    || serverPayment.branch_id !== branchId) {
    throw new Error('Transaksi aktif bukan milik tablet cawangan ini. Tiada SALE baharu dihantar.');
   }
   let warning: string | null = null;
   let receipt = serverResponse.result;
   if (serverPayment.status === 'PENDING') {
    const parked = await parkFiuuVtProviderErrorPayment(
     activePayment.id,
     'NATIVE_CALLBACK_REGISTRY',
    );
    warning = parked.warning ?? null;
   } else if (serverPayment.status === 'REPORTED') {
    const confirmationSeal = captureFiuuVtFinalizationSeal(activePayment.id);
    if (!confirmationSeal) {
     scheduleFiuuVtRecoveryRetry(500);
     return 'STILL_BLOCKED';
    }
    const confirmation = await confirmFiuuVtPayment(activePayment.id);
    if (confirmation.payment.status !== 'PAID'
     || !confirmation.result
     || !isFiuuVtFinalizationSealValid(confirmationSeal)) {
     throw new Error('Bayaran dilaporkan tetapi resit atau callback akhir belum stabil. Tiada SALE baharu dihantar.');
    }
    receipt = confirmation.result;
   } else if (serverPayment.status === 'PAID' && !receipt) {
    setQrPollError('Bayaran telah diterima tetapi resit belum tersedia. Troli dan terminal kekal dikunci; jangan jana SALE baharu.');
    scheduleFiuuVtRecoveryRetry(500);
    return 'STILL_BLOCKED';
   }
   const cleanupOrderId = status.pendingOrderId ?? activePayment.providerOrderId;
   storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, cleanupOrderId);
   const outcome = await drainAndReleaseDeferredFiuuVtNativeState(
    cleanupOrderId,
    { retirement: {
     amountRm: activePayment.amountRm,
     cartFingerprint: activePayment.cartFingerprint,
    } },
   );
   if (outcome === 'STILL_BLOCKED') {
    setQrPollError(warning
     ?? 'Daftar callback terminal sedang diarkib dengan selamat. Troli dan SALE baharu kekal dikunci; RKJ One akan cuba semula.');
    scheduleFiuuVtRecoveryRetry(500);
    return outcome;
   }
   if (outcome === 'CART_RETIRED_RELEASE_PENDING') {
    if (receipt) {
     vtPendingReceiptAfterReleaseRef.current.set(activePayment.id, receipt);
    }
    setQrPollError(warning
     ?? 'Troli asal sudah ditutup untuk mengelakkan caj kedua. Terminal masih menyelesaikan pelepasan selamat; resit akan dipulihkan selepas semakan selesai.');
    scheduleFiuuVtRecoveryRetry(500);
    return outcome;
   }
   removeStoredQrPaymentFor(activePayment.id);
   vtPendingReceiptAfterReleaseRef.current.delete(activePayment.id);
   if (receipt) {
    toast.success('Bayaran disahkan. Resit dipulihkan tanpa menghantar SALE kedua.');
    onSuccess(receipt);
   }
   return outcome;
  }, [branchId, captureFiuuVtFinalizationSeal, drainAndReleaseDeferredFiuuVtNativeState, isFiuuVtFinalizationSealValid, latchCurrentFiuuVtCartRetirement, nativeCleanupKey, onSuccess, removeStoredQrPaymentFor, scheduleFiuuVtRecoveryRetry]);

  const runActiveQrStatusCheck = useCallback(async (forceProviderStatus = true) => {
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
    let pendingResult = await readActiveFiuuVtResult(qrPayment.id);
     if (!pendingResult) {
      // A single empty native read can race a callback that is resuming the
      // WebView. Perform the second, separated read required to close the
      // drain latch before launching STATUS or exposing cashier actions.
      await waitForFiuuVtQueueQuiescence();
      pendingResult = await readActiveFiuuVtResult(qrPayment.id);
     }
     if (pendingResult) {
      await processFiuuVtResult(pendingResult);
      // Result processing decides whether to retry STATUS, offer quarantine,
      // or finalise payment. Do not start a second provider operation here.
      return;
     }
      const nativeStatus = await readFiuuVtStatus();
      setVtNativeStatus(nativeStatus);
      if (nativeStatus.callbackRegistryRecoveryRequired) {
       await quarantineActiveFiuuVtCallbackRegistry(qrPayment, nativeStatus);
       return;
      }
      if (nativeStatus.pendingOperation === 'SALE') {
       const nativeStartedAt = nativeStatus.pendingOperationStartedAt;
       if (typeof nativeStartedAt === 'number' && Number.isFinite(nativeStartedAt) && nativeStartedAt > 0) {
        vtSaleWatchdogStartedAtRef.current = nativeStartedAt;
       } else {
        vtSaleWatchdogStartedAtRef.current ??= Date.now();
       }
       setVtSaleOpened(true);
      }
     // Always read RKJ's authoritative state before trusting a stale native
     // operation marker. A completed payment must recover its receipt instead
     // of waiting for the original SALE callback until QR expiry.
     const serverStatus = await reconcileQrPayment(qrPayment);
     if (!shouldLaunchFiuuVtStatusAfterReconcile(serverStatus)) return;
     if (vtCashierReleasedPaymentRef.current === qrPayment.id) {
      storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, qrPayment.providerOrderId);
      await completeFiuuVtCashierCleanup(qrPayment.providerOrderId);
      return;
     }
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
     if (nativeStatus.pendingOperation === 'SALE'
      && !qrDisplayExpired
      && !forceProviderStatus
      && !shouldProbeFiuuVtSaleStatus(
       nativeStatus,
       vtSaleWatchdogStartedAtRef.current,
      )) {
      setQrPollError('Menunggu callback SALE Fiuu VT untuk beberapa saat sebelum semakan STATUS automatik.');
      return;
     }
    if (qrDisplayExpired) {
     setQrPollError('Meminta status akhir daripada Fiuu VT untuk melepaskan kaunter dengan selamat...');
    } else if (nativeStatus.pendingOperation === 'SALE') {
     setQrPollError('Callback SALE belum tiba. Menyemak STATUS Fiuu VT tanpa menghantar SALE kedua...');
    }
    const attempt = await prepareFiuuVtCallbackAttempt(qrPayment.id, 'STATUS');
    setVtStatusRetryPending(true);
    await launchTrackedFiuuVt(
     qrPayment.id,
     attempt,
     () => launchFiuuVtStatus(qrPayment.providerOrderId!, qrPayment.amountRm, attempt),
    );
    } catch (error) {
     if (fiuuVtNativeErrorCode(error) === 'FIUU_STORAGE_RECOVERY_REQUIRED') {
      try {
       await quarantineActiveFiuuVtCallbackRegistry(qrPayment);
      } catch (recoveryError) {
       setQrPollError(recoveryError instanceof Error
        ? recoveryError.message
        : 'Daftar callback terminal belum dapat dikuarantin. Tiada SALE baharu dihantar.');
      }
      return;
     }
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
  }, [completeFiuuVtCashierCleanup, nativeCleanupKey, processFiuuVtResult, qrDisplayExpired, qrPayment, quarantineActiveFiuuVtCallbackRegistry, readActiveFiuuVtResult, reconcileQrPayment]);

 const checkActiveQrStatus = useCallback((forceProviderStatus = true): Promise<void> => {
  if (statusCheckInFlightRef.current) return statusCheckInFlightRef.current;
  const inFlight = runActiveQrStatusCheck(forceProviderStatus).finally(() => {
   if (statusCheckInFlightRef.current === inFlight) {
    statusCheckInFlightRef.current = null;
   }
  });
  statusCheckInFlightRef.current = inFlight;
  return inFlight;
 }, [runActiveQrStatusCheck]);

 const resumeDeferredFiuuVtCancellationRelease = useCallback((
  activePayment: FiuuVtCancellationPaymentIdentity,
  deferredRelease: DeferredFiuuVtCashierRelease,
  observedNativeStatus?: FiuuVtNativeStatus,
 ): Promise<boolean> => {
  const existing = vtCancellationReleaseInFlightRef.current.get(deferredRelease.paymentId);
  if (existing) return existing;

  const work = (async () => {
   if (activePayment.integration !== 'vt_app'
    || !activePayment.providerOrderId
    || deferredRelease.paymentId !== activePayment.id
    || deferredRelease.orderId !== activePayment.providerOrderId
    || Math.round(deferredRelease.amountRm * 100) !== Math.round(activePayment.amountRm * 100)
    || deferredRelease.cartFingerprint !== activePayment.cartFingerprint) {
    throw new Error('Identiti pemulihan pembatalan tidak sepadan. Transaksi asal kekal dikunci untuk semakan.');
   }

   const nativeStatus = observedNativeStatus ?? await readFiuuVtStatus();
   setVtNativeStatus(nativeStatus);
   const exactNativeVoidObserved = nativeStatus.pendingOrderId === deferredRelease.orderId
    && nativeStatus.pendingOperation === 'VOID'
    && nativeStatus.activeCallbackAttemptId === deferredRelease.attemptId;
   if (!deferredRelease.nativeLaunchObserved && !exactNativeVoidObserved) {
    setQrPollError('Percubaan VOID telah disediakan tetapi pelancaran native belum dapat dibuktikan. Tekan batal semula apabila Fiuu VT sedia; transaksi asal kekal aktif.');
    return false;
   }

   const launchedRelease = deferredRelease.nativeLaunchObserved
    ? deferredRelease
    : { ...deferredRelease, nativeLaunchObserved: true };
   if (!storeDeferredFiuuVtCashierRelease(cashierReleaseKey, launchedRelease)) {
    throw new Error('Bukti pemulihan pembatalan tidak dapat disimpan pada tablet. Transaksi asal kekal aktif.');
   }

   // Persist the cart-retirement intent before the first release request. If
   // the server commits and the WebView dies before cleanup, this durable
   // marker can reconstruct the latch and retire the same original cart.
   const currentCartLatched = latchCurrentFiuuVtCartRetirement(
    activePayment.id,
    activePayment.amountRm,
    activePayment.cartFingerprint,
   );
   if (!preserveDeferredFiuuVtNativeCleanup(nativeCleanupKey, activePayment.providerOrderId)) {
    throw new Error('Terminal sedang membersihkan transaksi lain. Identiti transaksi semasa tidak ditimpa; semak status sebelum meneruskan.');
   }

   // Replay the release RPC first when native launch was already observed.
   // This reaches the database idempotency result even if the first HTTP
   // response was lost and a later callback quarantined the VOID attempt.
   let release: Awaited<ReturnType<typeof releaseFiuuVtCashierAfterVoidLaunch>> | null = null;
   try {
    release = await releaseFiuuVtCashierAfterVoidLaunch(
     activePayment.id,
     launchedRelease.attemptId,
    );
   } catch (error) {
    if (!(error instanceof PosQrPaymentError
     && error.mode === 'FIUU_VT_VOID_NOT_DURABLY_LAUNCHED')) throw error;
   }
   if (!release) {
    // The first release attempt proved that the server has not yet recorded
    // launch. PATCH once, then retry the same release identity; no provider
    // operation is launched here.
    await markFiuuVtAttemptLaunched(activePayment.id, launchedRelease.attemptId);
    release = await releaseFiuuVtCashierAfterVoidLaunch(
     activePayment.id,
     launchedRelease.attemptId,
    );
   }
   setVtCancelRequested(true);
   if (release.outcome === 'TERMINAL') {
    const currentActivePayment = activeQrPaymentRef.current;
    if (currentActivePayment?.id === activePayment.id) {
     await reconcileQrPayment(currentActivePayment);
    }
    const terminalCleanup = await completeFiuuVtCashierCleanup(activePayment.providerOrderId);
    if (terminalCleanup !== 'STILL_BLOCKED') {
     removeDeferredFiuuVtCashierRelease(cashierReleaseKey, launchedRelease.attemptId);
    }
    return true;
   }

   vtCashierReleasedPaymentRef.current = activePayment.id;
   if (!detachFiuuVtCheckoutAfterCashierRelease(activePayment, currentCartLatched)) {
    setQrPollError('Kaunter server sudah dilepaskan, tetapi identiti pemulihan tablet tidak dapat disimpan. Troli dikekalkan; jangan mulakan bayaran baharu dan hubungi HQ.');
    return false;
   }
   removeDeferredFiuuVtCashierRelease(cashierReleaseKey, launchedRelease.attemptId);
   // Native cleanup is deliberately detached from the cashier lane. The
   // durable finalization marker keeps late callbacks tied to this payment,
   // while a new cart is protected by its own cart-session fingerprint.
   scheduleFiuuVtRecoveryRetry(250);
   queueMicrotask(() => void drainAndReleaseDeferredFiuuVtNativeState(
    activePayment.providerOrderId!,
   ));
   return true;
  })();

  const tracked = work.finally(() => {
   if (vtCancellationReleaseInFlightRef.current.get(deferredRelease.paymentId) === tracked) {
    vtCancellationReleaseInFlightRef.current.delete(deferredRelease.paymentId);
   }
  });
  vtCancellationReleaseInFlightRef.current.set(deferredRelease.paymentId, tracked);
  return tracked;
 }, [cashierReleaseKey, completeFiuuVtCashierCleanup, detachFiuuVtCheckoutAfterCashierRelease, drainAndReleaseDeferredFiuuVtNativeState, latchCurrentFiuuVtCartRetirement, nativeCleanupKey, reconcileQrPayment, scheduleFiuuVtRecoveryRetry]);

 useEffect(() => {
  let cancelled = false;
  const resumeRelease = async () => {
   const deferredRelease = readDeferredFiuuVtCashierRelease(cashierReleaseKey);
   if (!deferredRelease) return;
   const matchingActivePayment = qrPayment?.integration === 'vt_app'
    && qrPayment.providerOrderId === deferredRelease.orderId
    && qrPayment.id === deferredRelease.paymentId
    ? qrPayment
    : null;
   const releasePayment: FiuuVtCancellationPaymentIdentity = matchingActivePayment ?? {
    id: deferredRelease.paymentId,
    integration: 'vt_app',
    providerOrderId: deferredRelease.orderId,
    amountRm: deferredRelease.amountRm,
    cartFingerprint: deferredRelease.cartFingerprint,
   };
   setCheckingQrStatus(true);
   try {
    await resumeDeferredFiuuVtCancellationRelease(releasePayment, deferredRelease);
   } catch (error) {
    if (!cancelled) {
     setQrPollError(error instanceof Error
      ? `Pelepasan pembatalan akan dicuba semula: ${error.message}`
      : 'Pelepasan pembatalan belum selesai dan akan dicuba semula.');
    }
   } finally {
    if (!cancelled) setCheckingQrStatus(false);
   }
  };
  void resumeRelease();
  window.addEventListener('online', resumeRelease);
  window.addEventListener('pageshow', resumeRelease);
  return () => {
   cancelled = true;
   window.removeEventListener('online', resumeRelease);
   window.removeEventListener('pageshow', resumeRelease);
  };
 }, [cashierReleaseKey, qrPayment, resumeDeferredFiuuVtCancellationRelease]);

 const parkStalledFiuuVtPayment = useCallback(async () => {
  if (!qrPayment || qrPayment.integration !== 'vt_app' || !qrPayment.providerOrderId) return;
  if (vtCallbackDrainInProgressRef.current || vtCallbackDrainScopeRef.current) {
   setQrPollError('Callback Fiuu VT masih disemak. Tunggu beberapa saat sebelum mengkuarantin transaksi.');
   return;
  }

  setCheckingQrStatus(true);
  setQrPollError(null);
  try {
   const response = await parkFiuuVtProviderErrorPayment(qrPayment.id);
   storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, qrPayment.providerOrderId);
   removeStoredQrPayment();
   if (activeQrPaymentMatchesCurrentCart(qrPayment)) clearCart();
   const deferredOrderId = qrPayment.providerOrderId;
   const cleanupOutcome = await drainAndReleaseDeferredFiuuVtNativeState(deferredOrderId);
   resetPaymentForm();
   dialogOpenRef.current = false;
   onOpenChange(false);
   toast.warning(response.warning
    ?? (cleanupOutcome === 'CLEAN_FOR_NEW_CART'
     ? 'Transaksi lama dikuarantin dan kaunter sudah dilepaskan. Jangan caj semula pelanggan yang sama.'
     : 'Transaksi lama dikuarantin. Jangan caj semula pelanggan yang sama; terminal sedang dibersihkan secara automatik.'));
  } catch (error) {
   const message = error instanceof Error
    ? error.message
    : 'Transaksi belum dapat dikuarantin. Semak STATUS Fiuu VT sekali lagi.';
   setQrPollError(message);
   toast.error(message);
  } finally {
   setCheckingQrStatus(false);
  }
 }, [activeQrPaymentMatchesCurrentCart, clearCart, drainAndReleaseDeferredFiuuVtNativeState, nativeCleanupKey, onOpenChange, qrPayment, removeStoredQrPayment, resetPaymentForm]);

 const requestFiuuVtCancellation = useCallback(async () => {
  if (!qrPayment || qrPayment.integration !== 'vt_app' || !qrPayment.providerOrderId) return;
  if (vtCancellationRequestInFlightRef.current) return;
  vtCancellationRequestInFlightRef.current = true;
  setVtCancelRequesting(true);
  setVtCancelConfirming(false);
  setQrPollError(null);
  vtResultFingerprintRef.current = null;
  let preparedAttempt: FiuuVtCallbackAttempt | null = null;
  let deferredRelease: DeferredFiuuVtCashierRelease | null = null;
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

   preparedAttempt = await prepareFiuuVtCallbackAttempt(qrPayment.id, 'VOID');
   deferredRelease = {
    version: 1,
    paymentId: qrPayment.id,
    orderId: qrPayment.providerOrderId,
    attemptId: preparedAttempt.attemptId,
    amountRm: qrPayment.amountRm,
    cartFingerprint: qrPayment.cartFingerprint,
    nativeLaunchObserved: false,
    recordedAt: new Date().toISOString(),
   };
   // Store the exact attempt before Android leaves the WebView. The false flag
   // prevents a prepared-but-never-launched attempt from being treated as a
   // provider cancellation after an abrupt process death.
   if (!storeDeferredFiuuVtCashierRelease(cashierReleaseKey, deferredRelease)) {
    await abandonUnlaunchedFiuuVtAttempt(
     qrPayment.id,
     preparedAttempt.attemptId,
     'RECOVERY_STORAGE_UNAVAILABLE',
    ).catch(() => undefined);
    throw new Error('Tablet tidak dapat menyimpan bukti pemulihan pembatalan. Fiuu VT tidak dibuka dan transaksi asal kekal aktif.');
   }

   vtOperationRetryAtRef.current = 0;
   await launchTrackedFiuuVt(
    qrPayment.id,
    preparedAttempt,
    () => launchFiuuVtVoid(qrPayment.providerOrderId!, preparedAttempt!),
    () => {
     deferredRelease = { ...deferredRelease!, nativeLaunchObserved: true };
     // The PREPARED marker remains a safe fallback if storage becomes
     // unavailable at this exact point; native status can prove this VOID.
     storeDeferredFiuuVtCashierRelease(cashierReleaseKey, deferredRelease);
    },
   );
   setVtCancelRequested(true);
   setQrPollError('Permintaan batal sudah dihantar. RKJ One sedang mengasingkan transaksi asal dan memeriksa callback terakhir.');
   await resumeDeferredFiuuVtCancellationRelease(qrPayment, deferredRelease);
  } catch (error) {
   const nativeErrorCode = fiuuVtNativeErrorCode(error);
   if (preparedAttempt && nativeErrorCode && isFiuuVtSafePreLaunchError(error)) {
    removeDeferredFiuuVtCashierRelease(cashierReleaseKey, preparedAttempt.attemptId);
   }
   if (error instanceof PosQrPaymentError
    && error.mode === 'FIUU_VT_OPERATION_ACTIVE') {
    const activeOperation = error.activeOperation;
    const retryAfterMs = error.retryAfterMs ?? FIUU_VT_STATUS_RETRY_MS;
    vtOperationRetryAtRef.current = Date.now() + retryAfterMs;
    if (activeOperation?.opType !== 'VOID') {
     const operationLabel = activeOperation?.opType === 'STATUS'
      ? 'semakan STATUS'
      : activeOperation?.opType === 'SALE'
       ? 'percubaan SALE'
       : 'operasi Fiuu VT lain';
     setVtCancelRequested(false);
     setVtStatusRetryPending(false);
     setVtCancelConfirming(true);
     setQrPollError(
      `Pembatalan belum dihantar kerana ${operationLabel} masih aktif. Cuba “Minta batal” semula dalam kira-kira ${Math.max(1, Math.ceil(retryAfterMs / 1000))} saat; transaksi asal kekal aktif.`,
     );
     return;
    }

    if (activeOperation.opType === 'VOID') {
     const nativeStatus = await readFiuuVtStatus().catch(() => null);
     if (nativeStatus) setVtNativeStatus(nativeStatus);
     const nativeLaunchObserved = activeOperation.state === 'LAUNCHED'
      || activeOperation.state === 'CONSUMED'
      || Boolean(
       nativeStatus?.pendingOrderId === qrPayment.providerOrderId
       && nativeStatus.pendingOperation === 'VOID'
       && nativeStatus.activeCallbackAttemptId === activeOperation.id,
      );
     const existingRelease = readDeferredFiuuVtCashierRelease(cashierReleaseKey);
     const recoveredRelease: DeferredFiuuVtCashierRelease = existingRelease
      && existingRelease.paymentId === qrPayment.id
      && existingRelease.orderId === qrPayment.providerOrderId
      && existingRelease.attemptId === activeOperation.id.toLowerCase()
      ? { ...existingRelease, nativeLaunchObserved: existingRelease.nativeLaunchObserved || nativeLaunchObserved }
      : {
       version: 1,
       paymentId: qrPayment.id,
       orderId: qrPayment.providerOrderId,
       attemptId: activeOperation.id,
       amountRm: qrPayment.amountRm,
       cartFingerprint: qrPayment.cartFingerprint,
       nativeLaunchObserved,
       recordedAt: new Date().toISOString(),
      };
     if (storeDeferredFiuuVtCashierRelease(cashierReleaseKey, recoveredRelease)
      && nativeLaunchObserved) {
      await resumeDeferredFiuuVtCancellationRelease(
       qrPayment,
       recoveredRelease,
       nativeStatus ?? undefined,
      );
      return;
     }
     if (!nativeLaunchObserved) {
      setVtCancelRequested(false);
      setVtStatusRetryPending(false);
      setVtCancelConfirming(true);
      setQrPollError(
       `Permintaan VOID telah disediakan tetapi aplikasi Fiuu belum disahkan terbuka. Pembatalan belum dihantar; cuba semula dalam kira-kira ${Math.max(1, Math.ceil(retryAfterMs / 1000))} saat.`,
      );
      return;
     }
    }
    setVtCancelRequested(true);
    setQrPollError(
     `Permintaan batal sedang aktif. RKJ One akan menyemak semula dalam kira-kira ${Math.max(1, Math.ceil(retryAfterMs / 1000))} saat; VOID kedua tidak dihantar. Transaksi asal belum ditandakan batal.`,
    );
   } else {
    setQrPollError(error instanceof Error
     ? error.message
     : 'Pembatalan Fiuu VT tidak dapat dimulakan. Transaksi asal kekal aktif dan tidak ditandakan batal.');
   }
  } finally {
   vtCancellationRequestInFlightRef.current = false;
   setVtCancelRequesting(false);
  }
 }, [cashierReleaseKey, processFiuuVtResult, qrPayment, readActiveFiuuVtResult, reconcileQrPayment, resumeDeferredFiuuVtCancellationRelease]);

 const resumeFiuuVtCancellationRelease = useCallback(async () => {
  if (!qrPayment?.providerOrderId) return;
  setCheckingQrStatus(true);
  try {
   const deferredRelease = readDeferredFiuuVtCashierRelease(cashierReleaseKey);
   if (deferredRelease
    && deferredRelease.paymentId === qrPayment.id
    && deferredRelease.orderId === qrPayment.providerOrderId) {
    const resumed = await resumeDeferredFiuuVtCancellationRelease(
     qrPayment,
     deferredRelease,
    );
    if (resumed) return;
   }
   const outcome = await completeFiuuVtCashierCleanup(qrPayment.providerOrderId);
   if (outcome === 'STILL_BLOCKED') {
    await checkActiveQrStatus();
   }
  } finally {
   setCheckingQrStatus(false);
  }
 }, [cashierReleaseKey, checkActiveQrStatus, completeFiuuVtCashierCleanup, qrPayment, resumeDeferredFiuuVtCancellationRelease]);

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
   vtSaleWatchdogStartedAtRef.current = Date.now();
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
   dialogOpenRef.current = false;
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
   if (activeQrPaymentMatchesCurrentCart(qrPayment)) clearCart();
   toast.success('Bayaran disahkan. Resit dikeluarkan dan stok dikemas kini.');
   resetPaymentForm();
   dialogOpenRef.current = false;
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
 }, [activeQrPaymentMatchesCurrentCart, captureFiuuVtFinalizationSeal, clearCart, isFiuuVtFinalizationSealValid, onOpenChange, onSuccess, qrPayment, releaseFiuuVtNativeState, removeStoredQrPayment, resetPaymentForm]);

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
   || vtParkAvailable
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
      const nativeStatus = await readFiuuVtStatus().catch(() => null);
      if (nativeStatus) {
       setVtNativeStatus(nativeStatus);
       if (nativeStatus.pendingOperation === 'SALE') {
        const nativeStartedAt = nativeStatus.pendingOperationStartedAt;
        if (typeof nativeStartedAt === 'number' && Number.isFinite(nativeStartedAt) && nativeStartedAt > 0) {
         vtSaleWatchdogStartedAtRef.current = nativeStartedAt;
        } else {
         vtSaleWatchdogStartedAtRef.current ??= Date.now();
        }
        setVtSaleOpened(true);
        if (shouldProbeFiuuVtSaleStatus(
         nativeStatus,
         vtSaleWatchdogStartedAtRef.current,
        )) {
         await checkActiveQrStatus(false);
         return;
        }
       }
      }
      if (vtCancelRequested || vtStatusRetryPending || qrDisplayExpired) {
       if (vtCashierReleasedPaymentRef.current === qrPayment.id) {
        await completeFiuuVtCashierCleanup(qrPayment.providerOrderId!);
        return;
       }
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
 }, [checkActiveQrStatus, completeFiuuVtCashierCleanup, processFiuuVtResult, qrDisplayExpired, qrPayment, qrStatus, readActiveFiuuVtResult, reconcileQrPayment, vtCancelRequested, vtParkAvailable, vtReviewRequired, vtStatusRetryPending]);

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
 cart_session_id: cartSessionId,
 items,
 payment_method: methodOverride,
 cash_amount: methodOverride === 'QR' ? 0 : cashNum,
 qr_amount: methodOverride === 'CASH' ? 0 : qrNum,
 };
 }

 async function handleFiuuVtNativeCleanup(): Promise<FiuuVtRecoveryOutcome> {
  if (vtCleanupRunning) return 'STILL_BLOCKED';
  setVtCleanupRunning(true);
  try {
   let status = await readFiuuVtStatus();
   setVtNativeStatus(status);
   const deferredCleanupOrderId = readDeferredFiuuVtNativeCleanup(nativeCleanupKey);
   const cleanupOrderId = resolveFiuuVtCleanupOrderId(
    status.pendingOrderId,
    deferredCleanupOrderId,
   );
   if (status.pendingOrderId && status.pendingOrderId !== deferredCleanupOrderId) {
    storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, status.pendingOrderId);
   }

   if (cleanupOrderId) {
    // A cashier-initiated check is the only action allowed to restart an
    // expired 90-second release window. It still performs STATUS recovery,
    // two queue-empty reads and the finalization seal before clearing native
    // state; it never force-clears evidence or launches a new SALE.
    storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, cleanupOrderId);
    const outcome = await waitForFiuuVtCleanupUi(
     completeFiuuVtCashierCleanup(cleanupOrderId),
    );
    if (outcome === 'RETIRED_CURRENT_CART') return outcome;
    status = await readFiuuVtStatus();
    setVtNativeStatus(status);
    if (outcome === 'CLEAN_FOR_NEW_CART'
     && !status.pendingOrderId
     && !status.resultAvailable
     && !status.quarantineBlocksRelease
     && !status.callbackRegistryRecoveryRequired
     && !vtCallbackDrainInProgressRef.current) {
     setQrPollError(null);
     toast.success('Terminal Fiuu VT sudah bersih. Bayaran QR pelanggan semasa kini boleh dibuka.');
     return 'CLEAN_FOR_NEW_CART';
    }
    scheduleFiuuVtRecoveryRetry(500);
     toast.info('Semakan STATUS transaksi terdahulu diteruskan di belakang. Tiada SALE baharu dihantar.');
     return 'STILL_BLOCKED';
   }

   // A callback can outlive the native pending-order marker. Drain that queue
   // explicitly so a result-only or callback-only latch cannot strand the next
   // customer behind a permanently disabled payment button.
   const drainScope = vtCallbackDrainScopeRef.current;
   if (status.resultAvailable || drainScope) {
    const result = drainScope
     ? await readActiveFiuuVtResult(drainScope.paymentId)
     : await readPendingFiuuVtResult();
    if (result) {
     vtResultFingerprintRef.current = null;
     await processFiuuVtResultRef.current(result);
     scheduleFiuuVtRecoveryRetry(500);
     toast.info('Callback transaksi terdahulu sedang disahkan. Tiada SALE baharu dihantar.');
     return 'STILL_BLOCKED';
    }
    if (drainScope) {
     await waitForFiuuVtQueueQuiescence();
     const lateResult = await readActiveFiuuVtResult(drainScope.paymentId);
     if (lateResult) {
      vtResultFingerprintRef.current = null;
      await processFiuuVtResultRef.current(lateResult);
      scheduleFiuuVtRecoveryRetry(500);
      toast.info('Callback lewat sedang disahkan. Tiada SALE baharu dihantar.');
      return 'STILL_BLOCKED';
     }
    }
   }

   if (status.callbackRegistryRecoveryRequired
    && !status.pendingOrderId
    && !status.resultAvailable
    && !status.quarantineBlocksRelease
    && !vtCallbackDrainInProgressRef.current) {
    await recoverOrphanedFiuuVtCallbackRegistry(
     `cashier-orderless:${branchId}:${cartSessionId}`,
    );
   }

   status = await readFiuuVtStatus();
   setVtNativeStatus(status);
   if (!status.pendingOrderId
    && !status.resultAvailable
    && !status.quarantineBlocksRelease
    && !status.callbackRegistryRecoveryRequired
    && !vtCallbackDrainInProgressRef.current) {
    setQrPollError(null);
    toast.success('Terminal Fiuu VT sudah bersih. Bayaran QR pelanggan semasa kini boleh dibuka.');
    return 'CLEAN_FOR_NEW_CART';
   }
   scheduleFiuuVtRecoveryRetry(500);
   toast.info('Terminal masih menyelesaikan semakan terakhir. Cuba semula dalam beberapa saat.');
   return 'STILL_BLOCKED';
  } catch (error) {
   if (error instanceof FiuuVtCleanupUiTimeoutError) {
    setQrPollError(error.message);
    toast.info('Semakan STATUS diteruskan di belakang. Troli kekal selamat dan tiada SALE baharu dihantar.');
    scheduleFiuuVtRecoveryRetry(1_000);
    return 'STILL_BLOCKED';
   }
   const message = error instanceof Error
    ? error.message
    : 'Terminal Fiuu VT belum dapat dibersihkan.';
   setQrPollError(`Pembersihan terminal belum selesai: ${message}`);
   toast.error('Terminal belum dapat dilepaskan. Troli pelanggan kekal selamat.');
   scheduleFiuuVtRecoveryRetry(1_000);
   return 'STILL_BLOCKED';
  } finally {
   setVtCleanupRunning(false);
  }
 }

 async function handlePay() {
  const currentShift = shift;
  if (!currentShift && !trainingMode) {
   toast.error('Buka syif POS dahulu.');
   return;
 }
  if (fiuuVtNativeCleanupPending) {
   const cleanupOutcome = await handleFiuuVtNativeCleanup();
   if (cleanupOutcome !== 'CLEAN_FOR_NEW_CART') return;
  }
  if (paymentErrorWithoutNativeCleanup) {
   toast.error(paymentErrorWithoutNativeCleanup);
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
  const boundDevice = deviceContext?.device;
  if (method !== 'CASH') {
   throw new Error('Bayaran QR atau campuran tidak boleh direkod semasa luar talian. Gunakan tunai atau pulihkan internet.');
  }
  if (!profile?.id || !boundDevice || boundDevice.branchId !== branchId
   || boundDevice.enrollmentGeneration < 1) {
   throw new Error('Identiti staf dan tablet rasmi belum tersedia. Sambung internet untuk mengesahkan tablet sebelum jualan luar talian.');
  }
 const offlineId = generateOfflineId();
 enqueueOfflineSale({
 offlineId,
  actorId: profile.id,
  deviceId: boundDevice.id,
  enrollmentGeneration: boundDevice.enrollmentGeneration,
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
   // The checkout request uses cart_session_id, not cartSessionId. Use the
   // same conversion as the server's durable recovery path before any SALE.
   const checkoutFingerprint = posPaymentFingerprintFromSalePayload(payload);
   if (!checkoutFingerprint) throw new Error('Identiti troli tidak sah. QR belum dijana.');
    if (qrConfig?.mode === 'FIUU_VT_APP'
     && (!vtNativeStatus?.nativeAndroid || !vtNativeStatus.installed || !vtNativeStatus.trustedInstall)) {
     throw new Error('Aplikasi rasmi Fiuu VT daripada Managed Google Play belum tersedia. Gunakan QR cawangan manual.');
    }
   if (qrConfig?.mode === 'FIUU_VT_APP') {
    const deferredFinalization = readDeferredFiuuVtFinalization(deferredFinalizationKey);
    const storedCleanupOrderId = readDeferredFiuuVtNativeCleanup(nativeCleanupKey);
    if (storedCleanupOrderId && deferredFinalization
     && storedCleanupOrderId !== deferredFinalization.orderId) {
     throw new Error('Identiti pemulihan terminal bercanggah. Hubungi HQ; SALE baharu dikunci supaya transaksi tidak hilang.');
    }
    const deferredCleanupOrderId = storedCleanupOrderId ?? deferredFinalization?.orderId ?? null;
    if (deferredCleanupOrderId) {
     const cleanupOutcome = await drainAndReleaseDeferredFiuuVtNativeState(
       deferredCleanupOrderId,
       { restartExpiredWindow: true },
      );
     if (cleanupOutcome === 'RETIRED_CURRENT_CART') return;
     if (cleanupOutcome !== 'CLEAN_FOR_NEW_CART') {
      throw new Error('Terminal Fiuu VT sedang membersihkan transaksi terdahulu. Tunggu beberapa saat dan tekan Sahkan Bayaran semula.');
     }
     if (readDeferredFiuuVtFinalization(deferredFinalizationKey)) {
      scheduleFiuuVtRecoveryRetry(250);
      throw new Error('Terminal sudah bersih tetapi rekod akhir pelanggan terdahulu masih dipulihkan. Tunggu resit/keputusan semakan sebelum SALE baharu.');
     }
    }
   }
   if (storageKey) {
    const stored = readStoredQrPayment(storageKey);
    if (stored) {
    if (detachStoredFiuuVtPaymentFromCurrentCart(stored)) {
     toast.info('Transaksi QR pelanggan terdahulu sedang dibersihkan. Troli pelanggan ini kekal dan tiada SALE baharu dihantar.');
     return;
    }
     if (stored.payment.integration === 'vt_app') {
      beginFiuuVtCallbackDrain(stored.payment.id);
     }
     qrAttemptKeyRef.current = stored.idempotencyKey;
     activeQrPaymentIdRef.current = stored.payment.id;
     activeQrPaymentRef.current = stored.payment;
     vtSaleWatchdogStartedAtRef.current = 1;
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
     let freshNativeStatus = await readFiuuVtStatus();
     setVtNativeStatus(freshNativeStatus);
     if (!freshNativeStatus.nativeAndroid
      || !freshNativeStatus.installed
      || !freshNativeStatus.trustedInstall) {
      throw new Error('Terminal Fiuu VT rasmi tidak tersedia atau tidak dipercayai. SALE baharu tidak dihantar.');
     }
     if (freshNativeStatus.pendingOrderId) {
      const recoveryOutcome = await recoverFiuuVtPayment(freshNativeStatus);
      if (recoveryOutcome === 'RETIRED_CURRENT_CART') return;
      if (recoveryOutcome !== 'CLEAN_FOR_NEW_CART') {
       throw new Error('Transaksi Fiuu VT terdahulu sedang dipulihkan. Selesaikan atau batalkan transaksi itu dahulu.');
      }
      freshNativeStatus = await readFiuuVtStatus();
      setVtNativeStatus(freshNativeStatus);
     }
     if (freshNativeStatus.pendingOrderId
      || freshNativeStatus.resultAvailable
      || freshNativeStatus.quarantineBlocksRelease
      || freshNativeStatus.callbackRegistryRecoveryRequired
      || vtCallbackDrainInProgressRef.current) {
      scheduleFiuuVtRecoveryRetry(500);
      throw new Error('Antrean callback Fiuu VT masih disahkan. Tunggu sebentar; SALE baharu tidak dihantar.');
     }
    }
   const idempotencyKey = qrAttemptKeyRef.current ?? createPosPaymentIdempotencyKey();
   qrAttemptKeyRef.current = idempotencyKey;
   const { payment, reused_reason: reusedReason } = await createPosQrPayment(payload, idempotencyKey);
   if (payment.status === 'PAID' && payment.integration !== 'vt_app') {
    const existing = await fetchPosQrPayment(payment.id);
    if (!existing.result) throw new Error('Resit bayaran Fiuu belum tersedia. Cuba semula.');
    removeStoredQrPayment();
    toast.success('Bayaran DuitNow QR telah disahkan oleh Fiuu.');
    const current = usePosStore.getState();
    if (current.branchId === payload.branchId
     && current.shift?.id === payload.shiftId
     && current.cartSessionId === payload.cart_session_id
     && checkoutFingerprint === posPaymentFingerprintFromSalePayload({
      ...payload,
      items: current.cart.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
     })) {
     clearCart();
    }
    resetPaymentForm();
    dialogOpenRef.current = false;
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
     paymentMethod: payload.payment_method === 'MIXED' ? 'MIXED' : 'QR',
     cashAmountRm: payload.cash_amount,
     saleTotalRm: total,
    expiresAt: payment.expires_at,
    environment: payment.environment,
     integration: payment.integration,
     providerOrderId: payment.provider_order_id,
    cartFingerprint: checkoutFingerprint,
   };
   if (activePayment.integration === 'vt_app') {
    beginFiuuVtCallbackDrain(activePayment.id);
   }
   activeQrPaymentIdRef.current = activePayment.id;
   activeQrPaymentRef.current = activePayment;
   vtSaleWatchdogStartedAtRef.current = null;
   setQrPayment(activePayment);
   setQrStatus(activePayment.integration === 'vt_app'
    ? 'PENDING'
    : payment.status === 'REPORTED' ? 'REPORTED' : 'PENDING');
   setQrSecondsRemaining(1);
   setQrPollError(null);
   setQrImageError(false);
   storeActiveQrPayment(activePayment, idempotencyKey);
   if (activePayment.integration === 'vt_app'
    && payment.reused
    && reusedReason === 'FIUU_ACTIVE_ATTEMPT_EXISTS') {
    setVtSaleOpened(false);
    setQrPollError('Percubaan DuitNow QR aktif dipulihkan. SALE baharu tidak dihantar; semak status atau mulakan pembatalan transaksi asal.');
    toast.info('Transaksi Fiuu VT terdahulu dipulihkan tanpa membuka SALE kedua.');
    return;
   }
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
        ? (vtCancelRequested ? 'Batal diminta' : qrDisplayExpired ? 'Menyemak tamat tempoh' : 'Menunggu')
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
      {vtCancelRequested ? (
       <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Pembatalan telah diminta, tetapi belum disahkan oleh Fiuu. Transaksi asal kekal dipantau secara berasingan.
       </div>
      ) : (
       <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Clock3 className="h-4 w-4" aria-hidden="true" />
        <span>
         Tamat dalam <strong className="tabular-nums text-foreground">
          {String(Math.floor(qrSecondsRemaining / 60)).padStart(2, '0')}:{String(qrSecondsRemaining % 60).padStart(2, '0')}
         </strong>
        </span>
       </div>
      )}
      <div className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-amber-800" role="status">
       <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
         {vtCancelRequested
          ? 'Memeriksa callback terakhir dan melepaskan kaunter'
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
 <output
 className="flex h-14 w-full items-center justify-center rounded-md border bg-muted/20 text-center text-2xl font-bold tabular-nums"
 aria-label="Amaun DuitNow QR penuh"
 data-testid="full-qr-amount"
 >
 {qrAmount}
 </output>
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
        {fiuuVtNativeCleanupPending ? (
         <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-5 text-amber-950" role="status" aria-live="polite">
          <LoaderCircle className={cn('mx-auto h-8 w-8', vtCleanupRunning && 'animate-spin')} aria-hidden="true" />
          <p className="mt-3 text-sm font-bold">Semakan transaksi terdahulu diperlukan</p>
          <p className="mt-1 text-xs">
           Troli pelanggan ini selamat dan dikekalkan. Tekan “Semak &amp; bersihkan terminal” untuk menyambung semakan STATUS dengan selamat.
          </p>
          {qrPollError && <p className="mt-3 rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-xs">{qrPollError}</p>}
         </div>
        ) : (
         <>
          <FiuuVtStaffSteps stage="READY" />
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
           Satu klik sahaja. Selepas pelanggan bayar, tunggu RKJ One mengesahkan, mengemas kini stok dan membuka resit.
          </p>
         </>
        )}
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
 <div className={cn(
  'rounded-lg border px-3 py-2 text-center text-sm font-medium',
  fiuuVtNativeCleanupPending
   ? 'border-amber-300 bg-amber-50 text-amber-950'
   : 'border-destructive/30 bg-destructive/10 text-destructive',
 )}>
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
    ) : qrStatus === 'PENDING' && vtParkAvailable ? (
     <div className="flex w-full flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <div className="flex items-start gap-2 text-amber-950">
       <Clock3 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
       <p className="text-sm font-semibold">
        QR sudah tamat dan Fiuu VT mengulangi ralat STATUS. Kuarantin transaksi untuk semakan Finance/HQ; troli asal akan dikosongkan bagi mengelakkan caj berganda.
       </p>
      </div>
      <div className="flex gap-2">
       <Button
        type="button"
        variant="outline"
        className="h-11 flex-1 bg-white"
        disabled={checkingQrStatus || vtCallbackDrainInProgress}
        onClick={() => {
         setVtParkAvailable(false);
         void checkActiveQrStatus();
        }}
       >
        <RefreshCw className={cn('h-4 w-4', checkingQrStatus && 'animate-spin')} aria-hidden="true" />
        Semak lagi
       </Button>
       <Button
        type="button"
        className="h-11 flex-[1.7] bg-amber-500 font-bold text-amber-950 hover:bg-amber-600"
        disabled={checkingQrStatus || vtCallbackDrainInProgress}
        onClick={() => void parkStalledFiuuVtPayment()}
       >
        {checkingQrStatus ? 'Mengkuarantin & melepaskan...' : 'Kuarantin & lepaskan kaunter'}
       </Button>
      </div>
     </div>
     ) : qrStatus === 'PENDING'
      && !vtCancelRequested
      && (vtCancelConfirming || vtCancelRequesting) ? (
     <div className="flex w-full flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
       <p className="text-sm font-semibold text-red-950">
         {vtCancelRequesting
          ? 'Pembatalan belum direkodkan. RKJ One sedang menyemak bayaran terkini dan membuka Fiuu VT untuk menghantar VOID sebenar.'
          : 'Menutup paparan QR tidak membatalkan transaksi. “Minta batal” akan membuka Fiuu VT, merekodkan permintaan VOID, kemudian mengasingkan transaksi asal supaya pelanggan seterusnya boleh dilayan tanpa menunggu tempoh sah QR.'}
       </p>
      <div className="flex gap-2">
       <Button
        type="button"
        variant="outline"
        className="h-11 flex-1 bg-white"
         disabled={vtCancelRequesting}
        onClick={() => setVtCancelConfirming(false)}
       >
        Terus tunggu
       </Button>
       <Button
        type="button"
        variant="destructive"
        className="h-11 flex-[1.5] font-bold"
         disabled={vtCancelRequesting}
        onClick={() => void requestFiuuVtCancellation()}
       >
         {vtCancelRequesting ? 'Membuka Fiuu VT...' : 'Minta batal & pelanggan seterusnya'}
       </Button>
      </div>
     </div>
    ) : qrStatus === 'PENDING' && vtCancelRequested ? (
     <div className="flex w-full gap-2">
      <Button className="h-12 flex-1 gap-2 rounded-xl" disabled aria-live="polite">
       <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
       Permintaan batal direkodkan
      </Button>
      <Button
       type="button"
       variant="outline"
       className="h-12 gap-2"
       disabled={checkingQrStatus}
       onClick={() => void resumeFiuuVtCancellationRelease()}
      >
       <RefreshCw className={cn('h-5 w-5', checkingQrStatus && 'animate-spin')} aria-hidden="true" />
       Semak & lepaskan
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
        {qrPayment.integration === 'vt_app' && fiuuVtCashierReleaseEnabled && (
         <Button
          type="button"
          variant="outline"
          className="h-11 w-full border-red-300 bg-red-50 font-semibold text-red-800 hover:bg-red-100 hover:text-red-900"
          disabled={vtCancelRequesting}
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
        {qrStatus === 'PENDING'
         && qrPayment.integration === 'vt_app'
         && fiuuVtCashierReleaseEnabled ? (
         <Button
          type="button"
          variant="outline"
          className="h-12 border-red-300 bg-red-50 font-bold text-red-800 hover:bg-red-100 hover:text-red-900"
           disabled={vtCancelRequesting}
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
        activeQrPaymentIdRef.current = null;
        activeQrPaymentRef.current = null;
        vtSaleWatchdogStartedAtRef.current = null;
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
 disabled={loading || vtCleanupRunning || (!canPay && !fiuuVtNativeCleanupPending)}
 onClick={handlePay}
 >
 {method === 'QR' ? <QrCode className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}
  {vtCleanupRunning
   ? 'Menyemak & membersihkan...'
   : loading
   ? isFiuuVtCheckout ? 'Membuka Fiuu VT...' : 'Memproses...'
   : trainingMode
   ? 'Sahkan Simulasi'
   : fiuuVtNativeCleanupPending
   ? 'Semak & bersihkan terminal'
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
