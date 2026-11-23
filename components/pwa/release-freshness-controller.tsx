'use client';

import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { useEffect } from 'react';
import {
 compareReleaseMetadata,
 isReleaseReloadSafe,
 isKnownPosActivityMarkerKey,
 parseOfflineQueueEntryCount,
 parseReleaseMetadata,
 POS_OFFLINE_QUEUE_STORAGE_KEY,
 type ReleaseMetadata,
 type ReleaseReloadSafety,
} from '@/lib/pwa/release-freshness';
import { usePosStore } from '@/stores/pos-store';

const STARTUP_JITTER_MIN_MS = 1_000;
const STARTUP_JITTER_MAX_MS = 4_000;
const EVENT_JITTER_MIN_MS = 250;
const EVENT_JITTER_MAX_MS = 1_500;
const POLL_JITTER_MIN_MS = 45_000;
const POLL_JITTER_MAX_MS = 75_000;
const SAFE_CONFIRM_MIN_MS = 750;
const SAFE_CONFIRM_MAX_MS = 1_500;
const PENDING_RETRY_MIN_MS = 4_000;
const PENDING_RETRY_MAX_MS = 8_000;

function jitter(minimum: number, maximum: number): number {
 return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
}

function countActiveMarkers(storage: Storage): number {
 let count = 0;
 for (let index = 0; index < storage.length; index += 1) {
  const key = storage.key(index);
  if (key && isKnownPosActivityMarkerKey(key)) count += 1;
 }
 return count;
}

function readOfflineQueueEntryCount(storage: Storage): number | null {
 return parseOfflineQueueEntryCount(storage.getItem(POS_OFFLINE_QUEUE_STORAGE_KEY));
}

function readReleaseReloadSafety(): ReleaseReloadSafety {
 let activeMarkerCount = 0;
 let offlineQueueEntryCount: number | null = null;
 let storageReadable = true;
 try {
  activeMarkerCount = countActiveMarkers(window.localStorage)
   + countActiveMarkers(window.sessionStorage);
  offlineQueueEntryCount = readOfflineQueueEntryCount(window.localStorage);
 } catch {
  storageReadable = false;
 }
 return {
  cartItemCount: usePosStore.getState().cart.length,
  activeMarkerCount,
  offlineQueueEntryCount,
  storageReadable,
  documentVisible: document.visibilityState === 'visible' && !document.hidden,
  online: navigator.onLine,
 };
}

async function fetchReleaseMetadata(): Promise<ReleaseMetadata | null> {
 try {
  const response = await fetch('/api/release', {
   cache: 'no-store',
   credentials: 'same-origin',
   headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  return parseReleaseMetadata(await response.json());
 } catch {
  return null;
 }
}

export function ReleaseFreshnessController({
 currentRelease,
}: {
 currentRelease: ReleaseMetadata;
}) {
 useEffect(() => {
  if (process.env.NODE_ENV !== 'production') return;

  let stopped = false;
  let reloadStarted = false;
  let pendingRelease: ReleaseMetadata | null = null;
  let checkInFlight: Promise<void> | null = null;
  let startupTimer: number | null = null;
  let eventTimer: number | null = null;
  let pollTimer: number | null = null;
  let safeConfirmTimer: number | null = null;
  let pendingRetryTimer: number | null = null;
  let appStateListener: PluginListenerHandle | null = null;

  function clearTimer(timer: number | null) {
   if (timer !== null) window.clearTimeout(timer);
  }

  function schedulePendingRetry() {
   if (stopped || reloadStarted || !pendingRelease || pendingRetryTimer !== null) return;
   if (document.visibilityState !== 'visible' || document.hidden || !navigator.onLine) return;
   pendingRetryTimer = window.setTimeout(() => {
    pendingRetryTimer = null;
    requestSafeReload();
   }, jitter(PENDING_RETRY_MIN_MS, PENDING_RETRY_MAX_MS));
  }

  function requestSafeReload() {
   if (stopped || reloadStarted || !pendingRelease || safeConfirmTimer !== null) return;
   if (!isReleaseReloadSafe(readReleaseReloadSafety())) {
    schedulePendingRetry();
    return;
   }
   const expectedRelease = pendingRelease;
   safeConfirmTimer = window.setTimeout(() => {
    safeConfirmTimer = null;
    if (stopped || reloadStarted
     || pendingRelease?.releaseId !== expectedRelease.releaseId
     || pendingRelease.commitSha !== expectedRelease.commitSha) return;
    if (!isReleaseReloadSafe(readReleaseReloadSafety())) {
     schedulePendingRetry();
     return;
    }
    reloadStarted = true;
    window.location.reload();
   }, jitter(SAFE_CONFIRM_MIN_MS, SAFE_CONFIRM_MAX_MS));
  }

  function checkForRelease(): Promise<void> {
   if (stopped || reloadStarted) return Promise.resolve();
   if (document.visibilityState !== 'visible' || document.hidden || !navigator.onLine) {
    return Promise.resolve();
   }
   if (checkInFlight) return checkInFlight;
   const work = (async () => {
    const candidate = await fetchReleaseMetadata();
    if (!candidate || stopped) return;
    const comparison = compareReleaseMetadata(currentRelease, candidate);
    if (comparison === 'different') {
     pendingRelease = candidate;
     requestSafeReload();
    } else if (comparison === 'same') {
     pendingRelease = null;
    }
   })();
   checkInFlight = work;
   void work.finally(() => {
    if (checkInFlight === work) checkInFlight = null;
   });
   return work;
  }

  function scheduleEventCheck() {
   if (stopped || reloadStarted) return;
   clearTimer(eventTimer);
   eventTimer = window.setTimeout(() => {
    eventTimer = null;
    void checkForRelease();
    requestSafeReload();
   }, jitter(EVENT_JITTER_MIN_MS, EVENT_JITTER_MAX_MS));
  }

  function scheduleNextPoll() {
   if (stopped || reloadStarted) return;
   pollTimer = window.setTimeout(() => {
    pollTimer = null;
    void checkForRelease().finally(scheduleNextPoll);
   }, jitter(POLL_JITTER_MIN_MS, POLL_JITTER_MAX_MS));
  }

  const handleVisibilityChange = () => {
   if (document.visibilityState === 'visible' && !document.hidden) scheduleEventCheck();
  };
  const handlePageShow = () => scheduleEventCheck();
  const handleOnline = () => scheduleEventCheck();

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('online', handleOnline);

  if (Capacitor.isNativePlatform()) {
   void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) scheduleEventCheck();
   }).then((listener) => {
    if (stopped) void listener.remove();
    else appStateListener = listener;
   }).catch(() => {
    // Browser lifecycle events remain available if the native listener fails.
   });
  }

  startupTimer = window.setTimeout(() => {
   startupTimer = null;
   void checkForRelease();
  }, jitter(STARTUP_JITTER_MIN_MS, STARTUP_JITTER_MAX_MS));
  scheduleNextPoll();

  return () => {
   stopped = true;
   clearTimer(startupTimer);
   clearTimer(eventTimer);
   clearTimer(pollTimer);
   clearTimer(safeConfirmTimer);
   clearTimer(pendingRetryTimer);
   document.removeEventListener('visibilitychange', handleVisibilityChange);
   window.removeEventListener('pageshow', handlePageShow);
   window.removeEventListener('online', handleOnline);
   if (appStateListener) void appStateListener.remove();
  };
 }, [currentRelease]);

 return null;
}
