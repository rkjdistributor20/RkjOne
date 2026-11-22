import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const plugin = readFileSync(join(
 process.cwd(),
 'android/app/src/main/java/com/rkjone/staff/RkjFiuuVtPlugin.java',
), 'utf8').replace(/\r\n/g, '\n');

const ORDER = 'RKJ_49932916A2994F66A19991D13DF38332';

type QuarantineEntry = {
 reason: string;
 blockingOrderId?: string;
 originalReason?: string;
 releasedAt?: number;
 acknowledgedErrorCode?: string;
 evidence?: {
  result?: {
   kind?: string;
   opType?: string;
   orderId?: string;
   errorCode?: string;
   callbackAttemptId?: string;
   status?: string;
  };
 };
};

type UpgradeState = {
 pendingOperation: 'SALE' | 'STATUS' | 'VOID';
 statusLaunched: boolean;
 queueLength: number;
 queueSafe: boolean;
 unresolvedAttempts: number;
 quarantineSafe: boolean;
 quarantine: QuarantineEntry[];
};

function releaseLegacyStatus5000(state: UpgradeState): QuarantineEntry[] {
 if (state.pendingOperation !== 'STATUS'
  || !state.statusLaunched
  || !state.queueSafe
  || state.queueLength > 0
  || state.unresolvedAttempts > 0
  || !state.quarantineSafe) {
  return state.quarantine;
 }

 return state.quarantine.map((entry) => {
  const result = entry.evidence?.result;
  const eligibleReason = entry.reason === 'RESULT_QUEUE_INVALID'
   || entry.reason === 'LEGACY_RESULT_INVALID';
  const eligible = entry.blockingOrderId === ORDER
   && eligibleReason
   && result?.kind === 'ERROR'
   && result.opType === 'STATUS'
   && result.orderId === ORDER
   && result.errorCode === '5000';
  if (!eligible) return entry;
  const { blockingOrderId: _blockingOrderId, ...auditEvidence } = entry;
  return {
   ...auditEvidence,
   originalReason: entry.originalReason ?? entry.reason,
   reason: 'STATUS_ERROR_5000_RELEASED_AFTER_1_8_2_UPGRADE',
   acknowledgedErrorCode: '5000',
   releasedAt: 1,
  };
 });
}

function legacyStatus5000Entry(): QuarantineEntry {
 return {
  reason: 'RESULT_QUEUE_INVALID',
  blockingOrderId: ORDER,
  evidence: {
   result: {
    kind: 'ERROR',
    opType: 'STATUS',
    orderId: ORDER,
    errorCode: '5000',
   },
  },
 };
}

function upgradeState(overrides: Partial<UpgradeState> = {}): UpgradeState {
 return {
  pendingOperation: 'STATUS',
  statusLaunched: true,
  queueLength: 0,
  queueSafe: true,
  unresolvedAttempts: 0,
  quarantineSafe: true,
  quarantine: [legacyStatus5000Entry()],
  ...overrides,
 };
}

function methodBody(startMarker: string, endMarker: string) {
 const start = plugin.indexOf(startMarker);
 const end = plugin.indexOf(endMarker, start);
 expect(start).toBeGreaterThanOrEqual(0);
 expect(end).toBeGreaterThan(start);
 return plugin.slice(start, end);
}

describe('Fiuu VT Android 1.8.2 to 1.8.3 persisted-state recovery', () => {
 it('releases only the orphaned STATUS 5000 blocker while retaining its audit evidence', () => {
  const migrated = releaseLegacyStatus5000(upgradeState());

  expect(migrated[0]).toMatchObject({
   originalReason: 'RESULT_QUEUE_INVALID',
   reason: 'STATUS_ERROR_5000_RELEASED_AFTER_1_8_2_UPGRADE',
   acknowledgedErrorCode: '5000',
   releasedAt: 1,
  });
  expect(migrated[0]).not.toHaveProperty('blockingOrderId');
  expect(migrated[0].evidence?.result).toMatchObject({
   kind: 'ERROR',
   opType: 'STATUS',
   orderId: ORDER,
   errorCode: '5000',
  });
 });

 it.each([
  ['queued callback remains', { queueLength: 1 }],
  ['queue repair is not durable', { queueSafe: false }],
  ['callback attempt is unresolved', { unresolvedAttempts: 1 }],
  ['provider STATUS was never launched', { statusLaunched: false }],
  ['pending operation is still SALE', { pendingOperation: 'SALE' as const }],
  ['quarantine storage is not durable', { quarantineSafe: false }],
 ])('fails closed when %s', (_label, overrides) => {
  const state = upgradeState(overrides);
  expect(releaseLegacyStatus5000(state)).toBe(state.quarantine);
  expect(state.quarantine[0]).toHaveProperty('blockingOrderId', ORDER);
 });

 it('does not release paid, SALE, unknown-error or malformed evidence for the same order', () => {
  const status5000 = legacyStatus5000Entry();
  const paidStatus: QuarantineEntry = {
   reason: 'RESULT_QUEUE_INVALID',
   blockingOrderId: ORDER,
   evidence: { result: { opType: 'STATUS', orderId: ORDER, status: '00' } },
  };
  const saleError: QuarantineEntry = {
   reason: 'RESULT_QUEUE_INVALID',
   blockingOrderId: ORDER,
   evidence: { result: { kind: 'ERROR', opType: 'SALE', orderId: ORDER, errorCode: '5000' } },
  };
  const otherStatusError: QuarantineEntry = {
   reason: 'LEGACY_RESULT_INVALID',
   blockingOrderId: ORDER,
   evidence: { result: { kind: 'ERROR', opType: 'STATUS', orderId: ORDER, errorCode: '9999' } },
  };
  const malformed: QuarantineEntry = {
   reason: 'QUARANTINE_QUEUE_MALFORMED',
   blockingOrderId: ORDER,
  };

  const migrated = releaseLegacyStatus5000(upgradeState({
   quarantine: [status5000, paidStatus, saleError, otherStatusError, malformed],
  }));

  expect(migrated[0]).not.toHaveProperty('blockingOrderId');
  for (const entry of migrated.slice(1)) {
   expect(entry).toHaveProperty('blockingOrderId', ORDER);
  }
 });

 it('runs recovery after queue migration and before reporting native quarantine state', () => {
  const getStatus = methodBody(
   'public synchronized void getStatus(PluginCall call)',
   'public void getVtPlusStatus(PluginCall call)',
  );
  const queueRead = getStatus.indexOf('JSONObject queuedResult = peekQueuedResult(preferences);');
  const upgradeRecovery = getStatus.indexOf(
   'releaseLegacyAcknowledgedStatusErrorAfterUpgradeIfSafe(preferences);',
  );
  const quarantineRead = getStatus.indexOf('JSONArray quarantine = loadQuarantinedResultQueue(preferences);');

  expect(queueRead).toBeGreaterThan(-1);
  expect(upgradeRecovery).toBeGreaterThan(queueRead);
  expect(quarantineRead).toBeGreaterThan(upgradeRecovery);
 });

 it('keeps upgrade recovery read-only with respect to the pending order and provider app', () => {
  const recovery = methodBody(
   'private void releaseLegacyAcknowledgedStatusErrorAfterUpgradeIfSafe(',
   'private JSONArray removeBlockingQuarantinedResultsForOrder(\n        JSONArray quarantine,\n        String orderId,\n        String errorCode,',
  );

  expect(recovery).toContain('resultState.values.length() > 0');
  expect(recovery).toContain('hasUnresolvedCallbackAttemptForOrder(registry, pendingOrder)');
  expect(recovery).toContain('LEGACY_STATUS_ERROR_CODE');
  expect(recovery).toContain('STATUS_ERROR_5000_RELEASED_AFTER_1_8_2_UPGRADE');
  expect(recovery).not.toContain('.remove(PENDING_ORDER)');
  expect(recovery).not.toContain('launchFiuu(');
  expect(recovery).not.toContain('startSale(');
 });

 it('preserves a tombstone for future exact STATUS acknowledgements and never clears all blockers', () => {
  const acknowledgeError = methodBody(
   'public synchronized void acknowledgeError(PluginCall call)',
   'public synchronized void checkStatus(PluginCall call)',
  );
  const tombstone = methodBody(
   'private boolean markStatusErrorAttemptAcknowledged(',
   'private boolean markCallbackAttemptReceived(',
  );

  expect(acknowledgeError).toContain('removeBlockingQuarantinedResultsForOrder(');
  expect(acknowledgeError).toContain('errorCode,\n                callbackAttemptId,');
  expect(acknowledgeError).toContain('markStatusErrorAttemptAcknowledged(');
  expect(tombstone).toContain('entry.put("errorAcknowledgedAt", acknowledgedAt)');
  expect(tombstone).toContain('entry.put("acknowledgedErrorCode", errorCode)');
  expect(tombstone).toContain('entry.put("releasedAt", acknowledgedAt)');
 });

 it('leaves clearPendingResult fail-closed for every remaining callback or quarantine blocker', () => {
  const clearPending = methodBody(
   'public synchronized void clearPendingResult(PluginCall call)',
   'public synchronized void recoverLegacyPendingState(PluginCall call)',
  );

  expect(clearPending).toContain('storedResults.values.length() > 0');
  expect(clearPending).toContain('hasBlockingQuarantinedResultForOrder(');
  expect(clearPending).toContain('FIUU_RECONCILIATION_REQUIRED');
  expect(clearPending.indexOf('storedResults.values.length() > 0'))
   .toBeLessThan(clearPending.indexOf('.remove(PENDING_ORDER)'));
  expect(clearPending.indexOf('hasBlockingQuarantinedResultForOrder('))
   .toBeLessThan(clearPending.indexOf('.remove(PENDING_ORDER)'));
 });
});
