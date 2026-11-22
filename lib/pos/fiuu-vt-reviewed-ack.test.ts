import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const java = readFileSync(join(
 process.cwd(),
 'android/app/src/main/java/com/rkjone/staff/RkjFiuuVtPlugin.java',
), 'utf8').replace(/\r\n/g, '\n');

const client = readFileSync(
 join(process.cwd(), 'lib/pos/fiuu-vt-client.ts'),
 'utf8',
).replace(/\r\n/g, '\n');

function section(source: string, startMarker: string, endMarker: string) {
 const start = source.indexOf(startMarker);
 const end = source.indexOf(endMarker, start + startMarker.length);
 expect(start).toBeGreaterThanOrEqual(0);
 expect(end).toBeGreaterThan(start);
 return source.slice(start, end);
}

describe('Fiuu VT reviewed callback acknowledgement', () => {
 it('selects the reviewed path only after exact queued-result validation', () => {
  const resultAck = section(
   java,
   'public synchronized void acknowledgeResult(PluginCall call)',
   'public synchronized void acknowledgeError(PluginCall call)',
  );
  const errorAck = section(
   java,
   'public synchronized void acknowledgeError(PluginCall call)',
   'public synchronized void checkStatus(PluginCall call)',
  );

  for (const acknowledgement of [resultAck, errorAck]) {
   expect(acknowledgement).toContain('call.getBoolean("registryRecoveryReviewed")');
   expect(acknowledgement).toContain('call.getString("reviewReference", "")');
   expect(acknowledgement).toContain(
    'callbackRegistryRequiresReviewedRecoveryWithoutMutation(preferences)',
   );
   expect(acknowledgement).toContain(
    'QueueLoadState queueState = loadResultQueueForReviewedAcknowledgement(preferences)',
   );
   expect(acknowledgement.indexOf('int resultIndex = findQueuedResultIndex('))
    .toBeLessThan(acknowledgement.indexOf(
     'acknowledgeQueuedResultAfterReviewedRegistryRecovery(',
    ));
   expect(acknowledgement).toContain('if (resultIndex < 0)');
  }
 });

 it('removes only the accepted callback and stages all reviewed state in one commit', () => {
  const atomicAck = section(
   java,
   'private boolean acknowledgeQueuedResultAfterReviewedRegistryRecovery(',
   'private boolean hasMatchingStatusErrorQuarantine(',
  );
  const strictResultLoad = section(
   java,
   'private QueueLoadState loadResultQueueForReviewedAcknowledgement(',
   'private QueueLoadState loadResultQueueState(',
  );
  const strictQuarantineLoad = section(
   java,
   'private QueueLoadState loadQuarantinedResultQueueForReviewedAcknowledgement(',
   'private QueueLoadState loadQuarantinedResultQueueState(',
  );

  expect(atomicAck).toContain('queue.remove(resultIndex);');
  expect(atomicAck).toContain(
   'isMatchingCallbackAttempt(callbackAttemptId, acceptedCallbackHost)',
  );
  expect(atomicAck).toContain('writeResultQueue(\n            preferences.edit(),\n            queue');
  expect(atomicAck).not.toContain('.remove(RESULT_QUEUE)');
  expect(atomicAck).toContain('removeBlockingQuarantinedResultsForOrder(');
  expect(atomicAck).toContain('hasMatchingStatusErrorQuarantine(');
  expect(atomicAck).toContain('stageUnsafeCallbackRegistryForReviewedRecovery(');
  expect(atomicAck.match(/\.commit\(\)/g)).toHaveLength(1);
  expect(strictResultLoad).not.toContain('.commit()');
  expect(strictResultLoad).toContain('if (!isProcessableQueuedResult(entry))');
  expect(strictQuarantineLoad).not.toContain('.commit()');
  expect(strictQuarantineLoad).toContain(
   'if (entry == null) return new QueueLoadState(quarantine, false)',
  );

  const queue = [
   { callbackAttemptId: 'server-accepted' },
   { callbackAttemptId: 'unrelated' },
  ];
  const exactIndex = queue.findIndex(
   ({ callbackAttemptId }) => callbackAttemptId === 'server-accepted',
  );
  queue.splice(exactIndex, 1);
  expect(queue).toEqual([{ callbackAttemptId: 'unrelated' }]);
 });

 it('stages registry archive and host tombstones without an internal commit', () => {
  const archiveWrapper = section(
   java,
   'private boolean archiveUnsafeCallbackRegistryForReviewedRecovery(',
   'private boolean stageUnsafeCallbackRegistryForReviewedRecovery(',
  );
  const archiveStage = section(
   java,
   'private boolean stageUnsafeCallbackRegistryForReviewedRecovery(',
   'private JSONArray loadDurableEvidenceArray(',
  );

  expect(archiveWrapper).toContain('stageUnsafeCallbackRegistryForReviewedRecovery(');
  expect(archiveWrapper.match(/\.commit\(\)/g)).toHaveLength(1);
  expect(archiveStage).not.toContain('.commit()');
  expect(archiveStage).toContain('evidence.put("rawRegistry", rawRegistry)');
  expect(archiveStage).toContain(
   'evidence.put("acknowledgedCallbackHost", acknowledgedCallbackHost)',
  );
  expect(archiveStage).toContain('reviewedCallbackHosts(');
  expect(archiveStage).toContain('callbackHosts.add(acknowledgedCallbackHost)');
  expect(archiveStage).toContain(
   '.putString(REVIEWED_CALLBACK_REGISTRY_ARCHIVE, archive.toString())',
  );
  expect(archiveStage).toContain(
   '.putString(REVIEWED_CALLBACK_HOST_TOMBSTONES, tombstones.toString())',
  );
  expect(archiveStage).toContain('.remove(CALLBACK_ATTEMPT_REGISTRY)');
  expect(archiveStage).toContain('.remove(CALLBACK_REGISTRY_RECOVERY_REQUIRED)');
 });

 it('leaves the normal acknowledgement path and older bridge compatibility intact', () => {
  const resultAck = section(
   java,
   'public synchronized void acknowledgeResult(PluginCall call)',
   'public synchronized void acknowledgeError(PluginCall call)',
  );
  const errorAck = section(
   java,
   'public synchronized void acknowledgeError(PluginCall call)',
   'public synchronized void checkStatus(PluginCall call)',
  );
  const reviewedClient = section(
   client,
   'async function reviewedAcknowledgementPayload(',
   'function parseNativeCallbackResult(',
  );
  const clientResultAck = section(
   client,
   'export async function acknowledgeFiuuVtResult(',
   'export async function acknowledgeFiuuVtError(',
  );
  const clientErrorAck = section(
   client,
   'export async function acknowledgeFiuuVtError(',
   'export async function readPendingFiuuVtResult(',
  );

  expect(resultAck).toContain('queue = loadResultQueue(preferences);');
  expect(resultAck).toContain(
   'removeCallbackAttempt(preferences, callbackAttemptId, acknowledgementEditor)',
  );
  expect(errorAck).toContain('markStatusErrorAttemptAcknowledged(');
  expect(errorAck).toContain(
   ': removeCallbackAttempt(preferences, callbackAttemptId, acknowledgementEditor)',
  );

  expect(client).toContain('export type FiuuVtAcknowledgementOptions');
  expect(reviewedClient).toContain(
   'detectedBridgeApiVersion ?? 1) < FIUU_VT_BRIDGE_RESILIENCE_API_VERSION',
  );
  expect(reviewedClient).toContain("'FIUU_VT_BRIDGE_OUTDATED'");
  for (const acknowledgement of [clientResultAck, clientErrorAck]) {
   expect(acknowledgement).toContain(
    'options: FiuuVtAcknowledgementOptions = {}',
   );
   expect(acknowledgement).toContain('...reviewedPayload');
   expect(acknowledgement).toContain('supportsResultAcknowledgement()');
   expect(acknowledgement).toContain('!reviewedPayload.registryRecoveryReviewed');
  }
 });
});
