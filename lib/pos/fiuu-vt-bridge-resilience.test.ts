import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const nativePlugin = readFileSync(join(
 process.cwd(),
 'android/app/src/main/java/com/rkjone/staff/RkjFiuuVtPlugin.java',
), 'utf8');
const nativeClient = readFileSync(join(
 process.cwd(),
 'lib/pos/fiuu-vt-client.ts',
), 'utf8');
const androidManifest = readFileSync(join(
 process.cwd(),
 'android/app/src/main/AndroidManifest.xml',
), 'utf8');

describe('Fiuu VT Android bridge resilience', () => {
 it('advertises bridge v5 and exposes the active one-time callback identity', () => {
  expect(nativePlugin).toContain('private static final int BRIDGE_API_VERSION = 5;');
  expect(nativePlugin).toContain('result.put("bridgeApiVersion", BRIDGE_API_VERSION);');
  expect(nativePlugin).toContain('"pendingOperationStartedAt"');
  expect(nativePlugin).toContain('"activeCallbackAttemptId"');
  expect(nativePlugin).toContain('"activeCallbackHost"');
  expect(nativePlugin).toContain('preferences.getLong(LAST_LAUNCH_AT, 0L)');
  expect(nativeClient).toContain('pendingOperationStartedAt?: number | null;');
  expect(nativeClient).toContain('FIUU_VT_BRIDGE_RESILIENCE_API_VERSION = 5');
  expect(nativeClient).toContain('FIUU_VT_CALLBACK_ATTEMPT_API_VERSION = 5');
  expect(nativeClient).toContain('pendingOperationStartedAt: null');
 });

 it('requires a server-issued attempt and launches Fiuu with its dynamic host', () => {
  expect(nativePlugin.match(/call\.getString\("attemptId", ""\)/g)).toHaveLength(3);
  expect(nativePlugin.match(/call\.getString\("callbackHost", ""\)/g)).toHaveLength(3);
  expect(nativePlugin.match(/appendQueryParameter\("merchantHost", callbackHost\)/g)).toHaveLength(3);
  expect(nativePlugin).toContain('isMatchingCallbackAttempt(attemptId, callbackHost)');
  expect(nativeClient).toContain('attempt: FiuuVtCallbackAttempt');
  expect(nativeClient).toContain('normalizedCallbackAttempt(attempt)');
  expect(nativeClient).toContain('requireCallbackAttemptBridge()');
  expect(androidManifest).toContain('<data android:scheme="${applicationId}" />');
  expect(androidManifest).not.toContain('android:host="fiuu-vt.rkj.one"');
 });

 it('resolves callbacks through the durable historical host registry', () => {
  const callbackStart = nativePlugin.indexOf('public synchronized boolean handleDeepLink');
  const callbackEnd = nativePlugin.indexOf('private synchronized boolean enqueueResult', callbackStart);
  const callbackFlow = nativePlugin.slice(callbackStart, callbackEnd);

  expect(callbackFlow).toContain('findCallbackAttemptByHost(loadCallbackAttemptRegistry(preferences), callbackHost)');
  expect(callbackFlow).toContain('callbackAttempt.optBoolean("callbackReceived", false)');
  expect(callbackFlow).toContain('callbackHost.equals(registeredCallbackHost)');
  expect(callbackFlow).toContain('result.put("callbackAttemptId", callbackAttemptId)');
  expect(callbackFlow).toContain('result.put("callbackHost", registeredCallbackHost)');
  expect(callbackFlow).toContain('errorResult.put("callbackAttemptId", callbackAttemptId)');
  expect(callbackFlow).toContain('errorResult.put("callbackHost", registeredCallbackHost)');
  expect(callbackFlow).toContain('markCallbackAttemptReceived(preferences, callbackAttemptId)');
  expect(nativeClient).toContain('parseNativeCallbackResult');
  expect(nativeClient).toContain('callbackAttemptId,');
  expect(nativeClient).toContain('callbackHost,');
 });

 it('makes mismatched transaction evidence quarantinable and exactly acknowledgeable', () => {
  expect(nativePlugin).toContain('callbackMatchesRegisteredAttempt ? "MATCHED" : "MISMATCH"');
  expect(nativePlugin).toContain('call.getString("callbackAttemptId", "")');
  expect(nativePlugin).toContain('!callbackAttemptId.equals(value.optString("callbackAttemptId"))');
  expect(nativePlugin).toContain('removeCallbackAttempt(preferences, callbackAttemptId)');
  expect(nativeClient).toContain('callbackAttemptId: result.callbackAttemptId');
  expect(nativeClient).toContain("callbackValidation: 'MATCHED' | 'MISMATCH'");
 });

 it('bounds low-value entries without evicting authoritative payment evidence', () => {
  const enqueueStart = nativePlugin.indexOf('private synchronized boolean enqueueResult');
  const enqueueEnd = nativePlugin.indexOf('private JSONArray loadResultQueue', enqueueStart);
  const queueFlow = nativePlugin.slice(enqueueStart, enqueueEnd);
  const evictionStart = nativePlugin.indexOf('private int findSafestResultToDrop');
  const evictionEnd = nativePlugin.indexOf('private String recoverStaleVoidIfNeeded', evictionStart);
  const evictionFlow = nativePlugin.slice(evictionStart, evictionEnd);

  expect(nativePlugin).toContain('private static final int RESULT_QUEUE_LIMIT = 128;');
  expect(queueFlow).toContain('if (removableIndex < 0) break;');
  expect(queueFlow).toContain('queue.remove(removableIndex);');
  expect(queueFlow).not.toContain('removableIndex < 0 ? 0 : removableIndex');
  expect(evictionFlow).toContain('if (!isAuthoritativeResult(value)) return index;');
  expect(evictionFlow).toContain('"MATCHED".equals(value.optString("callbackValidation"))');
  expect(evictionFlow).toContain('normalizedAttemptId(value.optString("callbackAttemptId"))');
  expect(evictionFlow).toContain('return isFiuuOperation(value.optString("opType"));');
 });

 it('returns stale VOID operations to STATUS while keeping fresh VOID launches isolated', () => {
  expect(nativePlugin).toContain('private static final long STALE_VOID_RECOVERY_MS = 30000L;');
  expect(nativePlugin).toContain('recoverStaleVoidIfNeeded(preferences, System.currentTimeMillis())');
  expect(nativePlugin).toContain('.putString(PENDING_OPERATION, "STATUS")');
  expect(nativePlugin).toContain('.putBoolean(VOID_LAUNCHED, false)');
  expect(nativePlugin).toContain('"FIUU_VOID_IN_PROGRESS"');
 });

 it('retains the legacy callback slot, VOID recovery and explicit Fiuu package', () => {
  expect(nativePlugin).toContain('String legacyResult = preferences.getString(LAST_RESULT, "")');
  expect(nativePlugin).toContain('preferences.getLong(LAST_RESULT_AT, System.currentTimeMillis())');
  expect(nativePlugin).toContain('private static final String LEGACY_FIUU_PACKAGE = "com.rms.mobile.razervt"');
  expect(nativePlugin).toContain('intent.setPackage(LEGACY_FIUU_PACKAGE)');
  expect(nativeClient).toContain('RESULT_ACKNOWLEDGEMENT_API_VERSION = 5');
  expect(nativeClient).toContain('VOID_API_VERSION = 3');
  expect(nativeClient).toContain('bridgeApiVersion?: number;');
 });
});
