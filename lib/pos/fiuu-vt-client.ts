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
 nativeAndroid: boolean;
 installed: boolean;
 trustedInstall: boolean;
 packageName: string;
 versionName: string;
 pendingOrderId: string | null;
 pendingAmount?: string | null;
 pendingOperation: 'SALE' | 'STATUS' | null;
 resultAvailable: boolean;
 resultReceivedAt?: number | null;
};

type FiuuVtPlugin = {
 getStatus(): Promise<FiuuVtNativeStatus>;
 startSale(options: { orderId: string; amount: string }): Promise<{ launched: true }>;
 acknowledgeResult(options: {
  orderId: string;
  opType: FiuuVtResult['opType'];
  transactionId: string;
  status: FiuuVtResult['status'];
 }): Promise<void>;
 acknowledgeError(options: {
  orderId: string;
  opType: FiuuVtErrorResult['opType'];
  errorCode: string;
 }): Promise<void>;
 checkStatus(options: { orderId: string }): Promise<{ launched: true }>;
 getPendingResult(): Promise<{ result: unknown | null; receivedAt?: number }>;
 clearPendingResult(options: { orderId: string }): Promise<void>;
 addListener(
  eventName: 'fiuuVtResult',
  listener: (result: unknown) => void,
 ): Promise<PluginListenerHandle>;
};

const NativeFiuuVt = registerPlugin<FiuuVtPlugin>('RkjFiuuVt');

export function supportsFiuuVtApp(): boolean {
 return Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === 'android'
  && Capacitor.isPluginAvailable('RkjFiuuVt');
}

export async function readFiuuVtStatus(): Promise<FiuuVtNativeStatus> {
 if (!supportsFiuuVtApp()) {
  return {
   nativeAndroid: false,
   installed: false,
   trustedInstall: false,
   packageName: 'com.rms.mobile.razervt',
   versionName: '',
   pendingOrderId: null,
    pendingAmount: null,
   pendingOperation: null,
   resultAvailable: false,
    resultReceivedAt: null,
  };
 }
 return NativeFiuuVt.getStatus();
}

export async function launchFiuuVtSale(orderId: string, amountRm: number) {
 return NativeFiuuVt.startSale({ orderId, amount: amountRm.toFixed(2) });
}

export async function launchFiuuVtStatus(orderId: string) {
 return NativeFiuuVt.checkStatus({ orderId });
}

export async function acknowledgeFiuuVtResult(result: FiuuVtResult) {
 if (!supportsFiuuVtApp()) return;
 await NativeFiuuVt.acknowledgeResult({
  orderId: result.orderId,
  opType: result.opType,
  transactionId: result.transactionId,
  status: result.status,
 });
}

export async function acknowledgeFiuuVtError(result: FiuuVtErrorResult) {
 if (!supportsFiuuVtApp()) return;
 await NativeFiuuVt.acknowledgeError({
  orderId: result.orderId,
  opType: result.opType,
  errorCode: result.errorCode,
 });
}

export async function readPendingFiuuVtResult(): Promise<FiuuVtCallbackResult | null> {
 if (!supportsFiuuVtApp()) return null;
 const { result } = await NativeFiuuVt.getPendingResult();
 return result ? parseFiuuVtCallbackResult(result) : null;
}

export async function clearPendingFiuuVtResult(orderId: string) {
 if (supportsFiuuVtApp()) await NativeFiuuVt.clearPendingResult({ orderId });
}

export async function listenForFiuuVtResult(
 listener: (result: FiuuVtCallbackResult) => void,
): Promise<PluginListenerHandle | null> {
 if (!supportsFiuuVtApp()) return null;
 return NativeFiuuVt.addListener('fiuuVtResult', (result) => {
  try {
   listener(parseFiuuVtCallbackResult(result));
  } catch {
   // Native validation already rejected malformed callbacks. Ignore stale data.
  }
 });
}
