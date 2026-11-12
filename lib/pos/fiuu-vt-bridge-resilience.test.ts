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
 it('advertises bridge v8 and exposes the active one-time callback identity', () => {
  expect(nativePlugin).toContain('private static final int BRIDGE_API_VERSION = 8;');
  expect(nativePlugin).toContain('result.put("bridgeApiVersion", BRIDGE_API_VERSION);');
  expect(nativePlugin).toContain('"pendingOperationStartedAt"');
  expect(nativePlugin).toContain('"activeCallbackAttemptId"');
  expect(nativePlugin).toContain('"activeCallbackHost"');
  expect(nativePlugin).toContain('preferences.getLong(LAST_LAUNCH_AT, 0L)');
  expect(nativeClient).toContain('pendingOperationStartedAt?: number | null;');
  expect(nativeClient).toContain('FIUU_VT_BRIDGE_RESILIENCE_API_VERSION = 8');
  expect(nativeClient).toContain('FIUU_VT_CALLBACK_ATTEMPT_API_VERSION = 8');
  expect(nativeClient).toContain('pendingOperationStartedAt: null');
 });

 it('quarantines malformed state and blocks release when it belongs to a launched sale', () => {
  expect(nativePlugin).toContain('private static final String QUARANTINED_RESULT_QUEUE');
  expect(nativePlugin).toContain('private static final int QUARANTINED_RESULT_QUEUE_LIMIT = 32;');
  expect(nativePlugin).toContain('quarantineInvalidPendingStateIfNeeded(preferences)');
  expect(nativePlugin).toContain('isProcessableQueuedResult(entry)');
  expect(nativePlugin).toContain('"RESULT_QUEUE_INVALID",');
  expect(nativePlugin).toContain('"INVALID_PENDING_ORDER",');
  expect(nativePlugin).toContain('result.put("quarantinedResultCount"');
  expect(nativePlugin).toContain('"quarantineBlocksRelease"');
  expect(nativePlugin).toContain('hasBlockingQuarantinedResultForOrder(');
  expect(nativePlugin).toContain('"FIUU_RECONCILIATION_REQUIRED"');
  expect(nativePlugin).toContain('Pattern.compile("^RKJ_[A-F0-9]{32}$")');
  expect(nativePlugin).toContain('safe(value).toUpperCase(Locale.ROOT)');
  expect(nativeClient).toContain('quarantinedResultCount?: number;');
  expect(nativeClient).toContain('quarantineBlocksRelease?: boolean;');
  expect(nativeClient).toContain('quarantinedResultCount: 0');
  expect(nativeClient).toContain('quarantineBlocksRelease: false');
 });

 it('fails closed for corrupt result or quarantine persistence without fabricating a callback', () => {
  const saleStart = nativePlugin.indexOf('public synchronized void startSale');
  const saleEnd = nativePlugin.indexOf('public synchronized void acknowledgeResult', saleStart);
  const saleFlow = nativePlugin.slice(saleStart, saleEnd);
  const clearStart = nativePlugin.indexOf('public synchronized void clearPendingResult');
  const clearEnd = nativePlugin.indexOf('public synchronized boolean handleDeepLink', clearStart);
  const clearFlow = nativePlugin.slice(clearStart, clearEnd);
  const resultLoadStart = nativePlugin.indexOf('private QueueLoadState loadResultQueueState');
  const resultLoadEnd = nativePlugin.indexOf('private boolean isProcessableQueuedResult', resultLoadStart);
  const resultLoad = nativePlugin.slice(resultLoadStart, resultLoadEnd);
  const quarantineLoadStart = nativePlugin.indexOf('private QueueLoadState loadQuarantinedResultQueueState');
  const quarantineLoadEnd = nativePlugin.indexOf('private SharedPreferences.Editor writeQuarantinedResultQueue', quarantineLoadStart);
  const quarantineLoad = nativePlugin.slice(quarantineLoadStart, quarantineLoadEnd);

  expect(saleFlow).toContain('QueueLoadState storedResults = loadResultQueueState(preferences);');
  expect(saleFlow).toContain('if (!storedResults.safeForMutation)');
  expect(clearFlow).toContain('if (!storedResults.safeForMutation)');
  expect(nativePlugin.match(/"FIUU_STORAGE_RECOVERY_REQUIRED"/g)).toHaveLength(2);
  expect(resultLoad).toContain('if (!writeQuarantinedResultQueue(editor, quarantine).commit())');
  expect(resultLoad).toContain('safeForMutation = false;');
  expect(quarantineLoad).toContain('"QUARANTINE_QUEUE_MALFORMED"');
  expect(quarantineLoad).toContain('if (!writeQuarantinedResultQueue(preferences.edit(), quarantine).commit())');
  expect(quarantineLoad).not.toContain('enqueueResult(');
  expect(resultLoad).not.toContain('markCallbackAttemptReceived(');
 });

 it('validates provider payDate and preserves legacy callback identity for reconciliation', () => {
  expect(nativePlugin).toContain('private static final Pattern PAY_DATE_PATTERN');
  expect(nativePlugin).toContain('(payDate.isEmpty() || PAY_DATE_PATTERN.matcher(payDate).matches())');
  expect(nativePlugin).toContain('normalizedLegacyOrderId(callbackAttempt.optString("orderId"))');
  expect(nativePlugin).toContain('"LEGACY_CALLBACK_REQUIRES_REVIEW"');
  expect(nativePlugin).toContain('markCallbackAttemptReceived(preferences, callbackAttemptId)');
  expect(nativeClient).toContain("console.error('[fiuu-vt] rejected_native_callback', error)");
 });

 it('releases only aged legacy launches that have no callback or queued payment evidence', () => {
  const migrationStart = nativePlugin.indexOf('private void quarantineInvalidPendingStateIfNeeded');
  const migrationEnd = nativePlugin.indexOf('private boolean saveResultQueue', migrationStart);
  const migrationFlow = nativePlugin.slice(migrationStart, migrationEnd);

  expect(nativePlugin).toContain('private static final long LEGACY_PENDING_RECOVERY_GRACE_MS');
  expect(migrationFlow).toContain('latestLegacyRecoveryEvidenceAt(');
  expect(migrationFlow).toContain('now - latestEvidenceAt < LEGACY_PENDING_RECOVERY_GRACE_MS');
  expect(migrationFlow).toContain('resultState.values.length() > 0');
  expect(migrationFlow).toContain('hasLegacyProviderEvidence(quarantine, registry, pendingOrder)');
  expect(migrationFlow).toContain('entry.optBoolean("callbackReceived", false)');
  expect(migrationFlow).toContain('"LEGACY_PENDING_RELEASED_AFTER_GRACE"');
  expect(migrationFlow).toContain('markCallbackAttemptsReleased(preferences, pendingOrder, recoveryEditor)');
  expect(migrationFlow).toContain('.remove(PENDING_ORDER)');
 });

 it('requires explicit reviewed recovery for aged legacy evidence and preserves its audit trail', () => {
  const recoveryStart = nativePlugin.indexOf('public synchronized void recoverLegacyPendingState');
  const recoveryEnd = nativePlugin.indexOf('public synchronized boolean handleDeepLink', recoveryStart);
  const recoveryFlow = nativePlugin.slice(recoveryStart, recoveryEnd);
  const reviewStart = nativePlugin.indexOf('private boolean markLegacyPendingQuarantineReviewed');
  const reviewEnd = nativePlugin.indexOf('private SharedPreferences.Editor legacyPendingReleaseEditor', reviewStart);
  const reviewFlow = nativePlugin.slice(reviewStart, reviewEnd);

  expect(recoveryFlow).toContain('Boolean.TRUE.equals(call.getBoolean("reviewed"))');
  expect(recoveryFlow).toContain('reviewReference.length() < 8');
  expect(recoveryFlow).toContain('"FIUU_LEGACY_REVIEW_REQUIRED"');
  expect(recoveryFlow).toContain('now - latestEvidenceAt < LEGACY_PENDING_RECOVERY_GRACE_MS');
  expect(recoveryFlow).toContain('resultState.values.length() > 0');
  expect(recoveryFlow).toContain('markLegacyPendingQuarantineReviewed(');
  expect(recoveryFlow).toContain('markCallbackAttemptsReleased(preferences, pendingOrder, recoveryEditor)');
  expect(nativePlugin).toContain('latest = Math.max(latest, entry.optLong("quarantinedAt", 0L));');
  expect(nativePlugin).toContain('latest = Math.max(latest, entry.optLong("receivedAt", 0L));');
  expect(reviewFlow).toContain('entry.put("originalReason", entry.optString("reason", "UNKNOWN"))');
  expect(reviewFlow).toContain('"LEGACY_PENDING_RELEASED_AFTER_REVIEW"');
  expect(reviewFlow).toContain('entry.put("reviewReference", reviewReference)');
  expect(reviewFlow).toContain('entry.remove("blockingOrderId")');
 });

 it('requires a server-issued attempt and launches Fiuu with its dynamic host', () => {
  expect(nativePlugin.match(/call\.getString\("attemptId", ""\)/g)).toHaveLength(3);
  expect(nativePlugin.match(/call\.getString\("callbackHost", ""\)/g)).toHaveLength(3);
  expect(nativePlugin.match(/call\.getInt\("generation"\)/g)).toHaveLength(3);
  expect(nativePlugin.match(/call\.getString\("amount", ""\)/g)).toHaveLength(2);
  expect(nativePlugin.match(/appendQueryParameter\("merchantHost", callbackHost\)/g)).toHaveLength(3);
  expect(nativePlugin).toContain('isMatchingCallbackAttempt(attemptId, callbackHost)');
  expect(nativeClient).toContain('attempt: FiuuVtCallbackAttempt');
  expect(nativeClient).toContain('normalizedCallbackAttempt(attempt)');
  expect(nativeClient).toContain('Number.isSafeInteger(attempt.generation)');
  expect(nativeClient).toContain('requireCallbackAttemptBridge()');
  expect(androidManifest).toContain('<data android:scheme="${applicationId}" />');
  expect(androidManifest).not.toContain('android:host="fiuu-vt.rkj.one"');
 });

 it('rehydrates a lost native STATUS context without opening a second SALE', () => {
  const statusStart = nativePlugin.indexOf('public synchronized void checkStatus');
  const statusEnd = nativePlugin.indexOf('public synchronized void cancelSale', statusStart);
  const statusFlow = nativePlugin.slice(statusStart, statusEnd);

  expect(statusFlow).toContain('recoveringWithoutPendingNativeState');
  expect(statusFlow).toContain('.putString(PENDING_ORDER, orderId)');
  expect(statusFlow).toContain('.putString(PENDING_AMOUNT, statusAmount.toPlainString())');
  expect(statusFlow).toContain('.appendQueryParameter("opType", "STATUS")');
  expect(statusFlow).not.toContain('.appendQueryParameter("opType", "SALE")');
  expect(nativeClient).toContain('amount: amountRm.toFixed(2)');
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
  expect(nativePlugin).toContain(
   'removeCallbackAttempt(preferences, callbackAttemptId, acknowledgementEditor)',
  );
  expect(nativePlugin).toContain('FIUU_RESULT_ACK_PERSIST_FAILED');
  expect(nativeClient).toContain('callbackAttemptId: result.callbackAttemptId');
  expect(nativeClient).toContain("callbackValidation: 'MATCHED' | 'MISMATCH'");
 });

 it('persists result acknowledgement and terminal cleanup atomically', () => {
  const acknowledgeResultStart = nativePlugin.indexOf('public synchronized void acknowledgeResult');
  const acknowledgeResultEnd = nativePlugin.indexOf('public synchronized void acknowledgeError', acknowledgeResultStart);
  const acknowledgeResult = nativePlugin.slice(acknowledgeResultStart, acknowledgeResultEnd);
  const clearStart = nativePlugin.indexOf('public synchronized void clearPendingResult');
  const clearEnd = nativePlugin.indexOf('public synchronized boolean handleDeepLink', clearStart);
  const clearPendingResult = nativePlugin.slice(clearStart, clearEnd);

  expect(acknowledgeResult).toContain('writeResultQueue(preferences.edit(), queue)');
  expect(acknowledgeResult).toContain(
   'removeCallbackAttempt(preferences, callbackAttemptId, acknowledgementEditor)',
  );
  expect(clearPendingResult).toContain('SharedPreferences.Editor clearEditor = preferences.edit()');
  expect(clearPendingResult).toContain('boolean cleared = markCallbackAttemptsReleased(');
  expect(clearPendingResult).toContain('clearEditor');
  expect(nativePlugin).toContain('return saveCallbackAttemptRegistry(preferences, registry, editor);');
  expect(clearPendingResult).toContain('FIUU_CLEAR_PERSIST_FAILED');
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

 it('retains released callback hosts long enough for late callbacks and never evicts unresolved hosts', () => {
  expect(nativePlugin).toContain('private static final int CALLBACK_ATTEMPT_REGISTRY_LIMIT = 256;');
  expect(nativePlugin).toContain('private static final long RELEASED_CALLBACK_RETENTION_MS');
  expect(nativePlugin).toContain('entry.put("releasedAt", releasedAt)');
  expect(nativePlugin).toContain('if (removableIndex < 0) {');
  expect(nativePlugin).toContain('throw new IllegalStateException("Fiuu callback registry is full")');
  expect(nativePlugin).toContain('normalizedLegacyOrderId(preferences.getString(PENDING_ORDER, ""))');
 });

 it('compacts released registry entries at high water without evicting unresolved or current attempts', () => {
  const compactionStart = nativePlugin.indexOf('private int findSafestCallbackAttemptToDrop');
  const compactionEnd = nativePlugin.indexOf('private boolean hasQueuedResultForAttempt', compactionStart);
  const compactionFlow = nativePlugin.slice(compactionStart, compactionEnd);

  expect(nativePlugin).toContain('String currentPendingOrder = preferences.getString(PENDING_ORDER, "");');
  expect(nativePlugin).toContain('findSafestCallbackAttemptToDrop(\n                registry,\n                queuedResults,\n                currentPendingOrder');
  expect(compactionFlow).toContain('isProtectedCallbackAttempt(entry, currentPendingOrder)');
  expect(compactionFlow).toContain('long oldestReleasedAt = Long.MAX_VALUE;');
  expect(compactionFlow).toContain('releasedAt > 0L && releasedAt < oldestReleasedAt');
  expect(compactionFlow).toContain('entry.optLong("releasedAt", 0L) <= 0L');
  expect(compactionFlow).toContain('safe(currentPendingOrder).equals(entry.optString("orderId"))');
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
