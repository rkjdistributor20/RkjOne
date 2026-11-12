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
};

const statusB = {
 attemptId: '22222222-2222-4222-8222-222222222222',
 callbackHost: 'a-22222222222242228222222222222222.fiuu-vt.rkj.one',
 operation: 'STATUS' as const,
 orderId: 'ORDER_A',
 amount: '2.50',
};

const voidB = { ...statusB, operation: 'VOID' as const };

describe('Fiuu VT Android historical callback registry', () => {
 it('persists a bounded registry synchronously and keeps the legacy mirror', () => {
  expect(plugin).toContain(
   'private static final String CALLBACK_ATTEMPT_REGISTRY = "callback_attempt_registry";',
  );
  expect(plugin).toContain(
   'private static final int CALLBACK_ATTEMPT_REGISTRY_LIMIT = 128;',
  );

  const saveRegistry = methodBody(
   'private boolean saveCallbackAttemptRegistry(',
   'private boolean legacyMirrorMatchesRegistry(',
  );
  expect(saveRegistry).toContain(
   'editor.putString(CALLBACK_ATTEMPT_REGISTRY, registry.toString())',
  );
  expect(saveRegistry).toContain('.putString(ACTIVE_ATTEMPT_ID');
  expect(saveRegistry).toContain('return editor.commit();');

  const loadRegistry = methodBody(
   'private JSONArray loadCallbackAttemptRegistry(',
   'private boolean registerCallbackAttempt(',
  );
  expect(loadRegistry).toContain('new JSONArray(rawRegistry)');
  expect(loadRegistry).toContain('preferences.getString(ACTIVE_ATTEMPT_ID');
  expect(loadRegistry).toContain('newCallbackAttempt(');

  const clearPending = methodBody(
   'public synchronized void clearPendingResult(PluginCall call)',
   'public synchronized boolean handleDeepLink(Intent intent)',
  );
  expect(clearPending).toContain('loadCallbackAttemptRegistry(preferences)');
  expect(clearPending).not.toContain('.remove(CALLBACK_ATTEMPT_REGISTRY)');
  expect(clearPending).not.toContain('.remove(ACTIVE_ATTEMPT_ID)');
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
   'removeCallbackAttempt(preferences, callbackAttemptId)',
  );
 });
});
