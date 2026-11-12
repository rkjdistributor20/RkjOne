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

const RESULT_ACKNOWLEDGEMENT_API_VERSION = 2;
let detectedBridgeApiVersion: number | null = null;

function rememberBridgeApiVersion(status: FiuuVtNativeStatus): FiuuVtNativeStatus {
 detectedBridgeApiVersion = Number.isInteger(status.bridgeApiVersion)
  ? Math.max(status.bridgeApiVersion ?? 1, 1)
  : 1;
 return status;
}

async function supportsResultAcknowledgement(): Promise<boolean> {
 if (!supportsFiuuVtApp()) return false;
 if (detectedBridgeApiVersion === null) {
  rememberBridgeApiVersion(await NativeFiuuVt.getStatus());
 }
 return (detectedBridgeApiVersion ?? 1) >= RESULT_ACKNOWLEDGEMENT_API_VERSION;
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
   resultAvailable: false,
    resultReceivedAt: null,
  };
 }
 return rememberBridgeApiVersion(await NativeFiuuVt.getStatus());
}

export async function launchFiuuVtSale(orderId: string, amountRm: number) {
 return NativeFiuuVt.startSale({ orderId, amount: amountRm.toFixed(2) });
}

export async function launchFiuuVtStatus(orderId: string) {
 return NativeFiuuVt.checkStatus({ orderId });
}

export async function acknowledgeFiuuVtResult(result: FiuuVtResult) {
 if (!supportsFiuuVtApp()) return;
 if (!await supportsResultAcknowledgement()) return;
 await NativeFiuuVt.acknowledgeResult({
  orderId: result.orderId,
  opType: result.opType,
  transactionId: result.transactionId,
  status: result.status,
 });
}

export async function acknowledgeFiuuVtError(result: FiuuVtErrorResult) {
 if (!supportsFiuuVtApp()) return;
 if (!await supportsResultAcknowledgement()) return;
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
