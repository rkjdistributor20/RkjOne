'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PosDeviceManagementStatus } from '@/lib/pos/types';

type RkjDevicePolicyPlugin = {
 getStatus(): Promise<PosDeviceManagementStatus>;
 enableKiosk(): Promise<PosDeviceManagementStatus>;
};

const DevicePolicy = registerPlugin<RkjDevicePolicyPlugin>('RkjDevicePolicy');

function browserStatus(): PosDeviceManagementStatus {
 return {
  nativeApp: false,
  packageName: null,
  manufacturer: null,
  model: null,
  androidVersion: null,
  sdkLevel: null,
  deviceOwner: false,
  lockTaskPermitted: false,
  lockTaskActive: false,
  screenLockSecure: false,
  kioskRequested: false,
  reportedAt: null,
 };
}

export async function readDeviceManagementStatus() {
 if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
  return browserStatus();
 }
 try {
  return await DevicePolicy.getStatus();
 } catch {
  return browserStatus();
 }
}

export async function enableOfficialPosKiosk() {
 if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
  return browserStatus();
 }
 try {
  return await DevicePolicy.enableKiosk();
 } catch {
  return readDeviceManagementStatus();
 }
}
