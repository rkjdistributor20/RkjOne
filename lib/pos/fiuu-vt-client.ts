'use client';

import {
 Capacitor,
 registerPlugin,
 type PluginListenerHandle,
} from '@capacitor/core';
import {
 parseFiuuVtCallbackResult,
 type FiuuVtCallbackResult,
 type FiuuVtErrorResult,
 type FiuuVtResult,
} from '@/lib/pos/fiuu-vt';

export type FiuuVtNativeStatus = {
 bridgeApiVersion?: number;
 nativeAndroid: boolean;
 installed: boolean;
 trustedInstall: boolean;
 packageName: string;
 versionName: string;
 pendingOrderId: string | null;
 pendingAmount?: string | null;
 pendingOperation: 'SALE' | 'STATUS' | 'VOID' | null;
 pendingOperationStartedAt?: number | null;
 activeCallbackAttemptId?: string | null;
 activeCallbackHost?: string | null;
 resultAvailable: boolean;
 resultReceivedAt?: number | null;
};

export type FiuuVtCallbackAttempt = {
 attemptId: string;
 callbackHost: string;
 generation: number;
};

export type FiuuVtNativeCallbackIdentity = {
 callbackAttemptId: string;
 callbackHost: string;
 callbackValidation: 'MATCHED' | 'MISMATCH';
};

export type FiuuVtNativeCallbackResult = FiuuVtCallbackResult
 & FiuuVtNativeCallbackIdentity;

type FiuuVtPlugin = {
 getStatus(): Promise<FiuuVtNativeStatus>;
 startSale(options: {
  orderId: string;
  amount: string;
  attemptId: string;
  callbackHost: string;
  generation: number;
 }): Promise<{ launched: true }>;
 acknowledgeResult(options: {
  callbackAttemptId: string;
  orderId: string;
  opType: FiuuVtResult['opType'];
  transactionId: string;
  status: FiuuVtResult['status'];
 }): Promise<void>;
 acknowledgeError(options: {
  callbackAttemptId: string;
  orderId: string;
  opType: FiuuVtErrorResult['opType'];
  errorCode: string;
 }): Promise<void>;
 checkStatus(options: {
  orderId: string;
  amount: string;
  attemptId: string;
  callbackHost: string;
  generation: number;
 }): Promise<{ launched: true }>;
 cancelSale(options: {
  orderId: string;
  attemptId: string;
  callbackHost: string;
  generation: number;
 }): Promise<{ launched: true }>;
 getPendingResult(): Promise<{ result: unknown | null; receivedAt?: number }>;
 clearPendingResult(options: { orderId: string }): Promise<void>;
 addListener(
  eventName: 'fiuuVtResult',
  listener: (result: unknown) => void,
 ): Promise<PluginListenerHandle>;
};

const NativeFiuuVt = registerPlugin<FiuuVtPlugin>('RkjFiuuVt');

const RESULT_ACKNOWLEDGEMENT_API_VERSION = 5;
const VOID_API_VERSION = 3;
export const FIUU_VT_BRIDGE_RESILIENCE_API_VERSION = 6;
export const FIUU_VT_CALLBACK_ATTEMPT_API_VERSION = 6;
export const FIUU_VT_BRIDGE_TIMEOUT_CODE = 'FIUU_VT_BRIDGE_TIMEOUT';
const NATIVE_READ_TIMEOUT_MS = 8_000;
const NATIVE_LAUNCH_TIMEOUT_MS = 12_000;
const SAFE_PRE_LAUNCH_ERROR_CODES = new Set([
 'INVALID_FIUU_REQUEST',
 'FIUU_ACTIVE_ATTEMPT_EXISTS',
 'FIUU_VT_BRIDGE_UNAVAILABLE',
 'FIUU_VT_BRIDGE_OUTDATED',
 'FIUU_VT_NOT_INSTALLED',
 'FIUU_VT_UNTRUSTED_INSTALL',
 'FIUU_VT_LAUNCH_IN_PROGRESS',
 'FIUU_VT_LAUNCH_FAILED',
 'FIUU_ATTEMPT_MISMATCH',
 'FIUU_RESULT_PENDING',
 'FIUU_VOID_IN_PROGRESS',
]);
const ATTEMPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CALLBACK_HOST_PATTERN = /^a-[0-9a-f]{32}\.fiuu-vt\.rkj\.one$/;
let detectedBridgeApiVersion: number | null = null;

function codedNativeError(message: string, code: string): Error & { code: string } {
 return Object.assign(new Error(message), { code });
}

function nativeCallWithDeadline<T>(
 call: () => Promise<T>,
 timeoutMs = NATIVE_READ_TIMEOUT_MS,
): Promise<T> {
 return new Promise<T>((resolve, reject) => {
  let settled = false;
  const timer = window.setTimeout(() => {
   if (settled) return;
   settled = true;
   reject(codedNativeError(
    'Sambungan RKJ One ke aplikasi Fiuu VT mengambil masa terlalu lama. Semak status sebelum mencuba lagi.',
    FIUU_VT_BRIDGE_TIMEOUT_CODE,
   ));
  }, timeoutMs);

  void Promise.resolve()
   .then(call)
   .then((value) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    resolve(value);
   }, (error: unknown) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    reject(error);
   });
 });
}

export function fiuuVtNativeErrorCode(error: unknown): string | null {
 if (!error || typeof error !== 'object') return null;
 const code = 'code' in error ? (error as { code?: unknown }).code : null;
 return typeof code === 'string' && /^[A-Z0-9_]{3,64}$/.test(code)
  ? code
  : null;
}

export function isFiuuVtSafePreLaunchError(error: unknown): boolean {
 const code = fiuuVtNativeErrorCode(error);
 return code !== null && SAFE_PRE_LAUNCH_ERROR_CODES.has(code);
}

function rememberBridgeApiVersion(status: FiuuVtNativeStatus): FiuuVtNativeStatus {
 detectedBridgeApiVersion = Number.isInteger(status.bridgeApiVersion)
  ? Math.max(status.bridgeApiVersion ?? 1, 1)
  : 1;
 return status;
}

async function supportsResultAcknowledgement(): Promise<boolean> {
 if (!supportsFiuuVtApp()) return false;
 if (detectedBridgeApiVersion === null) {
  rememberBridgeApiVersion(await nativeCallWithDeadline(() => NativeFiuuVt.getStatus()));
 }
 return (detectedBridgeApiVersion ?? 1) >= RESULT_ACKNOWLEDGEMENT_API_VERSION;
}

function normalizedCallbackIdentity(attemptIdValue: string, callbackHostValue: string) {
 const attemptId = attemptIdValue.trim().toLowerCase();
 const callbackHost = callbackHostValue.trim().toLowerCase();
 const expectedHost = `a-${attemptId.replaceAll('-', '')}.fiuu-vt.rkj.one`;
 if (!ATTEMPT_ID_PATTERN.test(attemptId)
  || !CALLBACK_HOST_PATTERN.test(callbackHost)
  || callbackHost !== expectedHost) {
  throw codedNativeError(
   'Cubaan callback Fiuu VT daripada pelayan tidak sah.',
   'INVALID_FIUU_REQUEST',
  );
 }
 return { attemptId, callbackHost };
}

function normalizedCallbackAttempt(attempt: FiuuVtCallbackAttempt): FiuuVtCallbackAttempt {
 const identity = normalizedCallbackIdentity(attempt.attemptId, attempt.callbackHost);
 if (!Number.isSafeInteger(attempt.generation)
  || attempt.generation < 1
  || attempt.generation > 2_147_483_647) {
  throw codedNativeError(
   'Generasi cubaan callback Fiuu VT daripada pelayan tidak sah.',
   'INVALID_FIUU_REQUEST',
  );
 }
 return { ...identity, generation: attempt.generation };
}

async function requireCallbackAttemptBridge(): Promise<void> {
 if (!supportsFiuuVtApp()) {
  throw codedNativeError(
   'Fiuu VT hanya boleh digunakan daripada aplikasi tablet rasmi.',
   'FIUU_VT_BRIDGE_UNAVAILABLE',
  );
 }
 if (detectedBridgeApiVersion === null) {
  rememberBridgeApiVersion(await nativeCallWithDeadline(() => NativeFiuuVt.getStatus()));
 }
 if ((detectedBridgeApiVersion ?? 1) < FIUU_VT_CALLBACK_ATTEMPT_API_VERSION) {
  throw codedNativeError(
   'Kemas kini RKJ One Staff diperlukan untuk callback Fiuu VT yang selamat.',
   'FIUU_VT_BRIDGE_OUTDATED',
  );
 }
}

function parseNativeCallbackResult(input: unknown): FiuuVtNativeCallbackResult {
 if (!input || typeof input !== 'object' || Array.isArray(input)) {
  throw new Error('Keputusan callback Fiuu VT tidak sah.');
 }
 const raw = input as Record<string, unknown>;
 const callbackAttemptId = typeof raw.callbackAttemptId === 'string'
  ? raw.callbackAttemptId.trim().toLowerCase()
  : '';
 const callbackHost = typeof raw.callbackHost === 'string'
  ? raw.callbackHost.trim().toLowerCase()
  : '';
 if (raw.callbackValidation !== 'MATCHED' && raw.callbackValidation !== 'MISMATCH') {
  throw new Error('Status pengesahan callback Fiuu VT tidak sah.');
 }
 const callbackValidation = raw.callbackValidation;
 normalizedCallbackIdentity(callbackAttemptId, callbackHost);
 return {
  ...parseFiuuVtCallbackResult(input),
  callbackAttemptId,
  callbackHost,
  callbackValidation,
 };
}

export function supportsFiuuVtApp(): boolean {
 return Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === 'android'
  && Capacitor.isPluginAvailable('RkjFiuuVt');
}

export async function readFiuuVtStatus(): Promise<FiuuVtNativeStatus> {
 if (!supportsFiuuVtApp()) {
  return {
   bridgeApiVersion: 0,
   nativeAndroid: false,
   installed: false,
   trustedInstall: false,
   packageName: 'com.rms.mobile.razervt',
   versionName: '',
   pendingOrderId: null,
    pendingAmount: null,
   pendingOperation: null,
   pendingOperationStartedAt: null,
   activeCallbackAttemptId: null,
   activeCallbackHost: null,
   resultAvailable: false,
    resultReceivedAt: null,
  };
 }
 return rememberBridgeApiVersion(await nativeCallWithDeadline(() => NativeFiuuVt.getStatus()));
}

export async function launchFiuuVtSale(
 orderId: string,
 amountRm: number,
 attempt: FiuuVtCallbackAttempt,
) {
 await requireCallbackAttemptBridge();
 const callbackAttempt = normalizedCallbackAttempt(attempt);
 return nativeCallWithDeadline(() => NativeFiuuVt.startSale({
  orderId,
  amount: amountRm.toFixed(2),
  ...callbackAttempt,
 }), NATIVE_LAUNCH_TIMEOUT_MS);
}

export async function launchFiuuVtStatus(
 orderId: string,
 amountRm: number,
 attempt: FiuuVtCallbackAttempt,
) {
 await requireCallbackAttemptBridge();
 return nativeCallWithDeadline(
  () => NativeFiuuVt.checkStatus({
   orderId,
   amount: amountRm.toFixed(2),
   ...normalizedCallbackAttempt(attempt),
  }),
  NATIVE_LAUNCH_TIMEOUT_MS,
 );
}

export async function launchFiuuVtVoid(
 orderId: string,
 attempt: FiuuVtCallbackAttempt,
) {
 await requireCallbackAttemptBridge();
 if ((detectedBridgeApiVersion ?? 1) < VOID_API_VERSION) {
  throw codedNativeError(
   'Kemas kini RKJ One Staff diperlukan sebelum bayaran boleh dibatalkan dengan selamat.',
   'FIUU_VT_BRIDGE_OUTDATED',
  );
 }
 return nativeCallWithDeadline(
  () => NativeFiuuVt.cancelSale({ orderId, ...normalizedCallbackAttempt(attempt) }),
  NATIVE_LAUNCH_TIMEOUT_MS,
 );
}

export async function acknowledgeFiuuVtResult(
 result: FiuuVtResult & FiuuVtNativeCallbackIdentity,
) {
 if (!supportsFiuuVtApp()) return;
 if (!await supportsResultAcknowledgement()) return;
 await nativeCallWithDeadline(() => NativeFiuuVt.acknowledgeResult({
  callbackAttemptId: result.callbackAttemptId,
  orderId: result.orderId,
  opType: result.opType,
  transactionId: result.transactionId,
  status: result.status,
 }));
}

export async function acknowledgeFiuuVtError(
 result: FiuuVtErrorResult & FiuuVtNativeCallbackIdentity,
) {
 if (!supportsFiuuVtApp()) return;
 if (!await supportsResultAcknowledgement()) return;
 await nativeCallWithDeadline(() => NativeFiuuVt.acknowledgeError({
  callbackAttemptId: result.callbackAttemptId,
  orderId: result.orderId,
  opType: result.opType,
  errorCode: result.errorCode,
 }));
}

export async function readPendingFiuuVtResult(): Promise<FiuuVtNativeCallbackResult | null> {
 if (!supportsFiuuVtApp()) return null;
 const { result } = await nativeCallWithDeadline(() => NativeFiuuVt.getPendingResult());
 return result ? parseNativeCallbackResult(result) : null;
}

export async function clearPendingFiuuVtResult(orderId: string) {
 if (supportsFiuuVtApp()) {
  await nativeCallWithDeadline(() => NativeFiuuVt.clearPendingResult({ orderId }));
 }
}

export async function listenForFiuuVtResult(
 listener: (result: FiuuVtNativeCallbackResult) => void,
): Promise<PluginListenerHandle | null> {
 if (!supportsFiuuVtApp()) return null;
 return NativeFiuuVt.addListener('fiuuVtResult', (result) => {
  try {
   listener(parseNativeCallbackResult(result));
  } catch {
   // Native validation already rejected malformed callbacks. Ignore stale data.
  }
 });
}
