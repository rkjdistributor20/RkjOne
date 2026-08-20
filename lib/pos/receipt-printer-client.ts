'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { build58mmReceipt } from '@/lib/pos/receipt-format';
import type { SaleResult } from '@/lib/pos/types';

export interface PairedReceiptPrinter {
 name: string;
 address: string;
}

export interface ReceiptPrinterStatus {
 nativeAndroid: boolean;
 directSupported: boolean;
 bluetoothAvailable: boolean;
 bluetoothEnabled: boolean;
 permissionGranted: boolean;
 testPrintPassed: boolean;
 autoPrintEnabled: boolean;
 selectedPrinter?: PairedReceiptPrinter;
 pairedPrinters: PairedReceiptPrinter[];
}

type ReceiptPrinterPlugin = {
 getStatus(): Promise<ReceiptPrinterStatus>;
 requestBluetoothPermission(): Promise<ReceiptPrinterStatus>;
 selectPrinter(options: { address: string }): Promise<ReceiptPrinterStatus>;
 clearPrinter(): Promise<ReceiptPrinterStatus>;
 setAutoPrintEnabled(options: { enabled: boolean }): Promise<ReceiptPrinterStatus>;
 openBluetoothSettings(): Promise<void>;
 print(options: {
  text: string;
  testPage?: boolean;
  automatic?: boolean;
  receiptKey?: string;
 }): Promise<{ printed: boolean; skipped: boolean; printerName: string }>;
};

const NativeReceiptPrinter = registerPlugin<ReceiptPrinterPlugin>('RkjReceiptPrinter');

function browserStatus(): ReceiptPrinterStatus {
 return {
  nativeAndroid: false,
  directSupported: false,
  bluetoothAvailable: false,
  bluetoothEnabled: false,
  permissionGranted: false,
  testPrintPassed: false,
  autoPrintEnabled: false,
  pairedPrinters: [],
 };
}

export function supportsDirectAndroidPrinting() {
 return Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === 'android'
  && Capacitor.isPluginAvailable('RkjReceiptPrinter');
}

export async function readReceiptPrinterStatus() {
 if (!supportsDirectAndroidPrinting()) return browserStatus();
 return NativeReceiptPrinter.getStatus();
}

export async function requestReceiptPrinterPermission() {
 if (!supportsDirectAndroidPrinting()) return browserStatus();
 return NativeReceiptPrinter.requestBluetoothPermission();
}

export async function selectReceiptPrinter(address: string) {
 return NativeReceiptPrinter.selectPrinter({ address });
}

export async function clearReceiptPrinter() {
 return NativeReceiptPrinter.clearPrinter();
}

export async function setReceiptPrinterAutoPrint(enabled: boolean) {
 if (!supportsDirectAndroidPrinting()) return browserStatus();
 return NativeReceiptPrinter.setAutoPrintEnabled({ enabled });
}

export async function openAndroidBluetoothSettings() {
 if (supportsDirectAndroidPrinting()) await NativeReceiptPrinter.openBluetoothSettings();
}

export async function printReceiptDirect(
 receipt: SaleResult,
 branchName?: string,
 options?: { automatic?: boolean },
) {
 return NativeReceiptPrinter.print({
  text: build58mmReceipt(receipt, branchName),
  automatic: options?.automatic,
  receiptKey: options?.automatic
   ? `${receipt.transaction_number}:${receipt.receipt_number}`
   : undefined,
 });
}

export async function printReceiptTestPage() {
 const line = '-'.repeat(32);
 return NativeReceiptPrinter.print({
  text: ['       ROTI KAYA JUNUS', line, 'UJIAN PRINTER 58MM', 'Sambungan Bluetooth berjaya.', line, '          SIAP', ''].join('\n'),
  testPage: true,
 });
}
