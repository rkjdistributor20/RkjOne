import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const plugin = readFileSync(
 join(
  process.cwd(),
  'android/app/src/main/java/com/rkjone/staff/RkjFiuuVtPlugin.java',
 ),
 'utf8',
);

function methodBody(startMarker: string, endMarker: string) {
 const start = plugin.indexOf(startMarker);
 const end = plugin.indexOf(endMarker, start);
 expect(start).toBeGreaterThanOrEqual(0);
 expect(end).toBeGreaterThan(start);
 return plugin.slice(start, end);
}

type Operation = 'SALE' | 'STATUS' | 'VOID';

type Attempt = {
 attemptId: string;
 callbackHost: string;
 operation: Operation;
 orderId: string;
 amount: string;
 generation: number;
 callbackReceived: boolean;
};

class DurableRegistryModel {
 private readonly attempts: Attempt[];
 readonly queued: Array<Pick<Attempt, 'attemptId' | 'callbackHost' | 'operation'>> = [];

 constructor(serialized = '[]') {
  this.attempts = JSON.parse(serialized) as Attempt[];
 }

 launch(attempt: Omit<Attempt, 'callbackReceived'>) {
  this.attempts.push({ ...attempt, callbackReceived: false });
 }

 callback(callbackHost: string) {
  const attempt = this.attempts.find(
   (candidate) => candidate.callbackHost === callbackHost,
  );
  if (!attempt || attempt.callbackReceived) return;
  this.queued.push({
   attemptId: attempt.attemptId,
   callbackHost: attempt.callbackHost,
   operation: attempt.operation,
  });
  attempt.callbackReceived = true;
 }

 acknowledge(attemptId: string) {
  const index = this.attempts.findIndex(
   (attempt) => attempt.attemptId === attemptId,
  );
  if (index >= 0) this.attempts.splice(index, 1);
 }

 serialize() {
  return JSON.stringify(this.attempts);
 }

 retainedAttemptIds() {
  return this.attempts.map((attempt) => attempt.attemptId);
 }
}

const saleA = {
 attemptId: '11111111-1111-4111-8111-111111111111',
 callbackHost: 'a-11111111111141118111111111111111.fiuu-vt.rkj.one',
 operation: 'SALE' as const,
 orderId: 'ORDER_A',
 amount: '2.50',
 generation: 1,
};

const statusB = {
 attemptId: '22222222-2222-4222-8222-222222222222',
 callbackHost: 'a-22222222222242228222222222222222.fiuu-vt.rkj.one',
 operation: 'STATUS' as const,
 orderId: 'ORDER_A',
 amount: '2.50',
 generation: 1,
};

const voidB = { ...statusB, operation: 'VOID' as const };

describe('Fiuu VT Android historical callback registry', () => {
 it('persists a bounded registry synchronously and keeps the legacy mirror', () => {
  expect(plugin).toContain(
   'private static final String CALLBACK_ATTEMPT_REGISTRY = "callback_attempt_registry";',
  );
  expect(plugin).toContain(
   'private static final int CALLBACK_ATTEMPT_REGISTRY_LIMIT = 256;',
  );

  const saveRegistry = methodBody(
   'private boolean saveCallbackAttemptRegistry(',
   'private boolean legacyMirrorMatchesRegistry(',
  );
  expect(saveRegistry).toContain(
   'editor.putString(CALLBACK_ATTEMPT_REGISTRY, registry.toString())',
  );
  expect(saveRegistry).toContain('newestUnreleasedCallbackAttempt(registry)');
  expect(saveRegistry).toContain('.putString(ACTIVE_ATTEMPT_ID');
  expect(saveRegistry).toContain('return editor.commit();');

  const loadRegistry = methodBody(
   'private RegistryLoadState loadCallbackAttemptRegistryState(',
   'private boolean registerCallbackAttempt(',
  );
  expect(loadRegistry).toContain('new JSONArray(rawRegistry)');
  expect(loadRegistry).toContain('preferences.getString(ACTIVE_ATTEMPT_ID');
  expect(loadRegistry).toContain('newCallbackAttempt(');
  expect(loadRegistry).toContain('return new RegistryLoadState(registry, false);');
  expect(loadRegistry).toContain('CALLBACK_REGISTRY_RECOVERY_REQUIRED');
  expect(loadRegistry).toContain('findCallbackAttemptById(registry, attemptId) != null');
  expect(loadRegistry).toContain('findCallbackAttemptByHost(registry, callbackHost) != null');
  expect(loadRegistry).toContain('boolean hasLegacyMirror = preferences.contains(ACTIVE_ATTEMPT_ID)');
  expect(loadRegistry).toContain('if (hasLegacyMirror && !validLegacyMirror)');
  expect(loadRegistry).toContain('boolean releasedMirrorOnly = hasCompleteLegacyMirror');
  expect(loadRegistry).toContain('releasedById.optLong("releasedAt", 0L) > 0L');
  expect(loadRegistry).toContain('preferences.getString(PENDING_ORDER, "").isEmpty()');
  expect(loadRegistry).toContain('boolean everyRegistryEntryReleased = true');
  expect(loadRegistry).toContain('resultState.values.length() == 0');
  expect(loadRegistry).toContain('!hasAnyBlockingQuarantine');
  expect(loadRegistry).toContain('.remove(CALLBACK_REGISTRY_RECOVERY_REQUIRED)');
  expect(loadRegistry).toContain('unsafe = true;');

  const mirrorMatch = methodBody(
   'private boolean legacyMirrorMatchesRegistry(',
   'private JSONObject newestUnreleasedCallbackAttempt(',
  );
  expect(mirrorMatch).toContain('newestUnreleasedCallbackAttempt(registry)');

  const newestUnreleased = methodBody(
   'private JSONObject newestUnreleasedCallbackAttempt(',
   'private JSONObject newCallbackAttempt(',
  );
  expect(newestUnreleased).toContain('entry.optLong("releasedAt", 0L) <= 0L');
  expect(newestUnreleased).toContain('return null;');

  const clearPending = methodBody(
   'public synchronized void clearPendingResult(PluginCall call)',
   'public synchronized boolean handleDeepLink(Intent intent)',
  );
  expect(clearPending).toContain('loadCallbackAttemptRegistryState(preferences)');
  expect(clearPending).toContain('if (!registryState.safeForMutation');
  expect(clearPending).toContain('registryRecoveryReviewed');
  expect(clearPending).toContain('archiveUnsafeCallbackRegistryForReviewedRecovery(');
  expect(clearPending).not.toContain('.remove(CALLBACK_ATTEMPT_REGISTRY)');
  expect(clearPending).not.toContain('.remove(ACTIVE_ATTEMPT_ID)');

  const reviewedRecovery = methodBody(
   'private boolean archiveUnsafeCallbackRegistryForReviewedRecovery(',
   'private JSONArray markBlockingQuarantinedResultsReviewed(',
  );
  expect(reviewedRecovery).toContain('"CALLBACK_REGISTRY_RECOVERY_REVIEWED"');
  expect(reviewedRecovery).toContain('evidence.put("rawRegistry"');
  expect(reviewedRecovery).toContain('.putString(REVIEWED_CALLBACK_REGISTRY_ARCHIVE, archive.toString())');
  expect(reviewedRecovery).toContain('.putString(REVIEWED_CALLBACK_HOST_TOMBSTONES, tombstones.toString())');
  expect(reviewedRecovery).toContain('reviewedCallbackHosts(');
  expect(reviewedRecovery).not.toContain('rawRegistry.substring(0, 16384)');
  expect(reviewedRecovery).toContain('.remove(CALLBACK_ATTEMPT_REGISTRY)');
  expect(reviewedRecovery).toContain('.remove(CALLBACK_REGISTRY_RECOVERY_REQUIRED)');
  expect(reviewedRecovery).not.toContain('blockingOrderId');

  const reviewedHosts = methodBody(
   'private Set<String> reviewedCallbackHosts(',
   'private boolean hasReviewedCallbackHostTombstone(',
  );
  expect(reviewedHosts).toContain('RAW_CALLBACK_HOST_PATTERN.matcher(rawRegistry)');
  expect(reviewedHosts).toContain('RAW_ATTEMPT_ID_PATTERN.matcher(rawRegistry)');
  expect(reviewedHosts).toContain('attemptId.replace("-", "")');

  const reviewedQuarantine = methodBody(
   'private JSONArray markBlockingQuarantinedResultsReviewed(',
   'private boolean markCallbackAttemptsReleased(',
  );
  expect(reviewedQuarantine).toContain('new JSONArray(quarantine.toString())');
  expect(reviewedQuarantine).toContain('entry.put("originalBlockingOrderId", expectedOrder)');
  expect(reviewedQuarantine).toContain('"SERVER_PAYMENT_TERMINAL_REVIEWED"');
  expect(reviewedQuarantine).toContain('entry.put("reviewReference", reviewReference)');
  expect(reviewedQuarantine).toContain('entry.remove("blockingOrderId")');

  expect(clearPending).toContain('public synchronized void recoverOrphanedCallbackRegistry');
  expect(clearPending).toContain('FIUU_ORPHAN_RECOVERY_HAS_ORDER');
  expect(clearPending).toContain('FIUU_ORPHAN_RECOVERY_PERSIST_FAILED');
  const orphanedRecovery = methodBody(
   'public synchronized void recoverOrphanedCallbackRegistry(PluginCall call)',
   'public synchronized boolean handleDeepLink(Intent intent)',
  );
  expect(orphanedRecovery).not.toContain('entry.optString("blockingOrderId")');
  expect(orphanedRecovery).toContain('Historical order-specific quarantine evidence remains untouched');
  expect(plugin).toContain('isReviewedCallbackHostTombstone(preferences, callbackHost)');
  expect(plugin).toContain('archiveLateCallbackForReviewedTombstone(preferences, callbackHost, uri)');
  expect(plugin).toContain('REVIEWED_LATE_CALLBACK_ARCHIVE');
 });

 it('never evicts blocking transaction evidence when the quarantine queue exceeds its soft cap', () => {
  const safestDrop = methodBody(
   'private int findSafestQuarantinedResultToDrop(',
   'private SharedPreferences.Editor writeQuarantinedResultQueue(',
  );
  expect(safestDrop).toContain('entry.optString("blockingOrderId").isEmpty()');
  expect(safestDrop).toContain('allow the queue to exceed the soft cap');
  expect(safestDrop).not.toContain('!currentOrder.equals');
  expect(safestDrop).not.toContain('!pendingOrder.equals');
 });

 it('registers SALE, STATUS and VOID independently without overwriting history', () => {
  const startSale = methodBody(
   'public synchronized void startSale(PluginCall call)',
   'public synchronized void acknowledgeResult(PluginCall call)',
  );
  const checkStatus = methodBody(
   'public synchronized void checkStatus(PluginCall call)',
   'public synchronized void cancelSale(PluginCall call)',
  );
  const cancelSale = methodBody(
   'public synchronized void cancelSale(PluginCall call)',
   'public synchronized void getPendingResult(PluginCall call)',
  );

  for (const body of [startSale, checkStatus, cancelSale]) {
   expect(body).toContain('registerCallbackAttempt(');
   expect(body).not.toContain('.putString(ACTIVE_ATTEMPT_ID');
  }
  expect(checkStatus).toContain('"STATUS"');
  expect(cancelSale).toContain('"VOID"');
 });

 it('rejects callback identity reuse so every provider retry has a fresh host', () => {
  const register = methodBody(
   'private boolean registerCallbackAttempt(',
   'private boolean removeCallbackAttempt(',
  );
  expect(register).toContain('Fiuu callback attempt collision');
  expect(register).not.toContain('existingAttempt.put("generation", generation)');
  expect(register).not.toContain('Unable to renew Fiuu callback attempt');

  const model = new DurableRegistryModel();
  model.launch(statusB);
  const statusRetry = {
   ...statusB,
   attemptId: '33333333-3333-4333-8333-333333333333',
   callbackHost: 'a-33333333333343338333333333333333.fiuu-vt.rkj.one',
  };
  model.launch(statusRetry);
  model.callback(statusB.callbackHost);
  model.callback(statusRetry.callbackHost);
  expect(model.retainedAttemptIds()).toEqual([statusB.attemptId, statusRetry.attemptId]);
  expect(model.queued.map((result) => result.attemptId)).toEqual([
   statusB.attemptId,
   statusRetry.attemptId,
  ]);
 });

 it('resolves historical hosts and queues their own registered identity', () => {
  const handleDeepLink = methodBody(
   'public synchronized boolean handleDeepLink(Intent intent)',
   'private synchronized boolean enqueueResult(',
  );

  expect(handleDeepLink).toContain('findCallbackAttemptByHost(');
  expect(handleDeepLink).toContain('callbackAttempt.optString("attemptId")');
  expect(handleDeepLink).toContain('callbackAttempt.optString("operation")');
  expect(handleDeepLink).toContain('callbackAttempt.optString("orderId")');
  expect(handleDeepLink).toContain('callbackAttempt.optString("amount")');
  expect(handleDeepLink).toContain('enqueueResult(preferences, result)');
  expect(handleDeepLink).toContain('markCallbackAttemptReceived(');
  expect(handleDeepLink).not.toContain(
   'preferences.getString(ACTIVE_ATTEMPT_ID',
  );
 });

 it('fails closed at the registry cap and only cleans identities backed by queued evidence', () => {
  const register = methodBody(
   'private boolean registerCallbackAttempt(',
   'private boolean removeCallbackAttempt(',
  );
  expect(register).toContain(
   'while (registry.length() >= CALLBACK_ATTEMPT_REGISTRY_LIMIT)',
  );
  expect(register).toContain(
   'throw new IllegalStateException("Fiuu callback registry is full")',
  );

  const cleanup = methodBody(
   'private int findSafestCallbackAttemptToDrop(',
   'private boolean hasQueuedResultForAttempt(',
  );
  expect(cleanup).toContain('entry.optBoolean("callbackReceived", false)');
  expect(cleanup).toContain('hasQueuedResultForAttempt(');
 });

 it('keeps SALE A and STATUS B when callbacks arrive A then B', () => {
  const model = new DurableRegistryModel();
  model.launch(saleA);
  model.launch(statusB);
  model.callback(saleA.callbackHost);
  model.callback(statusB.callbackHost);

  expect(model.queued).toEqual([
   {
    attemptId: saleA.attemptId,
    callbackHost: saleA.callbackHost,
    operation: 'SALE',
   },
   {
    attemptId: statusB.attemptId,
    callbackHost: statusB.callbackHost,
    operation: 'STATUS',
   },
  ]);
 });

 it('keeps SALE A and VOID B when callbacks arrive B then A', () => {
  const model = new DurableRegistryModel();
  model.launch(saleA);
  model.launch(voidB);
  model.callback(voidB.callbackHost);
  model.callback(saleA.callbackHost);

  expect(model.queued.map((result) => result.operation)).toEqual([
   'VOID',
   'SALE',
  ]);
  expect(model.queued.map((result) => result.attemptId)).toEqual([
   voidB.attemptId,
   saleA.attemptId,
  ]);
 });

 it('survives restart and exact acknowledgement removes only that attempt', () => {
  const beforeRestart = new DurableRegistryModel();
  beforeRestart.launch(saleA);
  beforeRestart.launch(statusB);

  const afterRestart = new DurableRegistryModel(beforeRestart.serialize());
  afterRestart.callback(saleA.callbackHost);
  afterRestart.callback(statusB.callbackHost);
  afterRestart.acknowledge(saleA.attemptId);

  expect(afterRestart.queued).toHaveLength(2);
  expect(afterRestart.retainedAttemptIds()).toEqual([statusB.attemptId]);

  const acknowledgeResult = methodBody(
   'public synchronized void acknowledgeResult(PluginCall call)',
   'public synchronized void acknowledgeError(PluginCall call)',
  );
  expect(acknowledgeResult).toContain(
   'SharedPreferences.Editor acknowledgementEditor = writeResultQueue(preferences.edit(), queue)',
  );
  expect(acknowledgeResult).toContain(
   'removeCallbackAttempt(preferences, callbackAttemptId, acknowledgementEditor)',
  );
  expect(acknowledgeResult).toContain('FIUU_RESULT_ACK_PERSIST_FAILED');
 });
});
