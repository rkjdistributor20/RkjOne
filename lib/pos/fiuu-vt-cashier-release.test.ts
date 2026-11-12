import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
 process.cwd(),
 'supabase/migrations/20261112130000_cancel_unlaunched_fiuu_vt_payment.sql',
), 'utf8');
const atomicCancelMigration = readFileSync(join(
 process.cwd(),
 'supabase/migrations/20261112170000_make_fiuu_vt_prelaunch_cancel_atomic.sql',
), 'utf8');
const route = readFileSync(join(
 process.cwd(),
 'app/api/pos/qr-payments/[paymentId]/vt-prelaunch-cancel/route.ts',
), 'utf8');
const paymentDialog = readFileSync(join(
 process.cwd(),
 'components/pos/payment-dialog.tsx',
), 'utf8');

describe('Fiuu VT cashier release safety contract', () => {
 it('releases only an exact abandoned SALE with no provider evidence', () => {
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.cancel_pos_fiuu_vt_prelaunch');
  expect(migration.match(/FOR UPDATE;/g)).toHaveLength(2);
  expect(migration).toContain("v_attempt.state <> 'ABANDONED'");
  expect(migration).toContain('v_attempt.launched_at IS NOT NULL');
  expect(migration).toContain('v_attempt.received_at IS NOT NULL');
  expect(migration).toContain('v_attempt.result_fingerprint IS NOT NULL');
  expect(migration).toContain('v_payment.provider_transaction_id IS NOT NULL');
  expect(migration).toContain('v_payment.provider_sale_reported_at IS NOT NULL');
  expect(migration).toContain('other_attempt.state <> \'ABANDONED\'');
  expect(migration).toContain("'resolution', 'PRELAUNCH_CANCELLED'");
 });

 it('atomically abandons a clean PREPARED attempt before releasing the cashier', () => {
  expect(atomicCancelMigration.match(/FOR UPDATE;/g)).toHaveLength(2);
  expect(atomicCancelMigration).toContain("v_attempt.state NOT IN ('PREPARED', 'ABANDONED')");
  expect(atomicCancelMigration).toContain("IF v_attempt.state = 'PREPARED' THEN");
  expect(atomicCancelMigration).toContain("SET state = 'ABANDONED'");
  expect(atomicCancelMigration).toContain('abandoned_at = v_now');
  expect(atomicCancelMigration).toContain('launch_error_code = p_error_code');
  expect(atomicCancelMigration).toContain('other_attempt.id <> v_attempt.id');
  expect(atomicCancelMigration).toContain("'resolution', 'PRELAUNCH_CANCELLED'");
 });

 it('exposes the release RPC only through the authenticated server route', () => {
  expect(migration).toContain('FROM PUBLIC, anon, authenticated');
  expect(migration).toContain('TO service_role');
  expect(route).toContain('assertOfficialPosDevice');
  expect(route).toContain('assertActivePosShiftMember');
  expect(route).toContain('payment.created_by !== profile.id');
  expect(route).toContain("service.rpc(\n  'cancel_pos_fiuu_vt_prelaunch'");
  expect(route).toContain("mode: 'FIUU_VT_RECONCILIATION_REQUIRED'");
 });

 it('keeps the cart and gives the cashier an immediate safe path', () => {
  expect(paymentDialog).toContain('cancelPrelaunchFiuuVtPayment');
  expect(paymentDialog).toContain('retryFiuuVtSaleLaunch');
  expect(paymentDialog).toContain('Batal & kembali ke troli');
  expect(paymentDialog).toContain('Cuba buka semula');
  expect(paymentDialog).toContain('Pelanggan tidak bayar — batal & lepaskan kaunter');
  expect(paymentDialog).toContain('Batal pelanggan & lepaskan kaunter');
 });

 it('honours the server retry lease and resumes STATUS without another SALE', () => {
  expect(paymentDialog).toContain('const FIUU_VT_STATUS_RETRY_MS = 25_000');
  expect(paymentDialog).toContain('vtOperationRetryAtRef.current = Date.now() + retryAfterMs');
  expect(paymentDialog).toContain('vtStatusRetryPending || qrDisplayExpired');
  expect(paymentDialog).toContain('tanpa membuka SALE kedua');
 });

 it('keeps native state authoritative until release succeeds and drains callbacks globally', () => {
  expect(paymentDialog).not.toContain(
   'clearPendingFiuuVtResult(activePayment.providerOrderId).catch(() => undefined)',
  );
  expect(paymentDialog).not.toContain(
   'clearPendingFiuuVtResult(result.orderId).catch(() => undefined)',
  );
  expect(paymentDialog).not.toContain(
   'clearPendingFiuuVtResult(qrPayment.providerOrderId).catch(() => undefined)',
  );
  expect(paymentDialog).toContain('processFiuuVtResultRef.current(result)');
  expect(paymentDialog).toContain('const pollDelaysMs = [1_500, 2_500, 4_000, 6_000]');
  expect(paymentDialog).toContain('pollAttempt = 0');
 });

 it('persists a safe prelaunch failure across a reload so the cashier can still escape', () => {
  expect(paymentDialog).toContain('vtPrelaunchFailure: prelaunchFailure');
  expect(paymentDialog).toContain('setVtPrelaunchFailure(stored.vtPrelaunchFailure)');
  expect(paymentDialog).toContain('storeActiveQrPayment(qrPayment, qrAttemptKeyRef.current, failure)');
  expect(paymentDialog).toContain('storeActiveQrPayment(activePayment, idempotencyKey, failure)');
  expect(paymentDialog).toContain('storeActiveQrPayment(qrPayment, qrAttemptKeyRef.current);');
  expect(paymentDialog).toContain('Fiuu VT tidak sempat dibuka sebelum aplikasi dimuat semula');
 });

 it('drains a persisted callback before trusting a recovered server snapshot', () => {
  const recoveryStart = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const recoveryEnd = paymentDialog.indexOf('const handleDialogOpenChange', recoveryStart);
  const recovery = paymentDialog.slice(recoveryStart, recoveryEnd);
  const pendingResultRead = recovery.indexOf('readActiveFiuuVtResult(paymentId)');
  const callbackProcessing = recovery.indexOf('processFiuuVtResultRef.current(pendingResult)');
  const serverRead = recovery.indexOf('fetchPosQrPayment(paymentId)');

  expect(recoveryStart).toBeGreaterThan(-1);
  expect(recoveryEnd).toBeGreaterThan(recoveryStart);
  expect(pendingResultRead).toBeGreaterThan(-1);
  expect(callbackProcessing).toBeGreaterThan(pendingResultRead);
  expect(serverRead).toBeGreaterThan(callbackProcessing);
  expect(recovery).toContain('getRecoveredFiuuVtLocalStatus(payment.status)');
 });

 it('releases stale native state after the server is authoritatively terminal', () => {
  const recoveryStart = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const recoveryEnd = paymentDialog.indexOf('const handleDialogOpenChange', recoveryStart);
  const recovery = paymentDialog.slice(recoveryStart, recoveryEnd);
  const releaseStart = paymentDialog.indexOf('const releaseFiuuVtNativeState');
  const releaseEnd = paymentDialog.indexOf('useEffect(() => {', releaseStart);
  const release = paymentDialog.slice(releaseStart, releaseEnd);

  expect(recovery).toContain("['EXPIRED', 'FAILED', 'CANCELLED'].includes(payment.status)");
  expect(recovery).toContain('await releaseFiuuVtNativeState(orderId)');
  expect(release).toContain('await clearPendingFiuuVtResult(orderId)');
  expect(release).toContain('pendingOrderId: null');
  expect(release).toContain('pendingOperation: null');
  expect(release).toContain('storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId)');
  expect(recovery).toContain('Kaunter telah dilepaskan dan troli boleh digunakan semula.');
 });

 it('unlatches a transient recovery failure so focus or reconnect can retry', () => {
  const recoveryStart = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const recoveryEnd = paymentDialog.indexOf('const handleDialogOpenChange', recoveryStart);
  const recovery = paymentDialog.slice(recoveryStart, recoveryEnd);
  const catchIndex = recovery.indexOf('} catch (error) {');

  expect(catchIndex).toBeGreaterThan(-1);
  expect(recovery.slice(catchIndex)).toContain('vtRecoveryOrderRef.current = null');
 });

 it('keeps old safe-cancel proof until a replacement callback identity is prepared', () => {
  const retryStart = paymentDialog.indexOf('const retryFiuuVtSaleLaunch');
  const retryEnd = paymentDialog.indexOf('const cancelPrelaunchFiuuVtPayment', retryStart);
  const retry = paymentDialog.slice(retryStart, retryEnd);
  const prepareIndex = retry.indexOf("prepareFiuuVtCallbackAttempt(qrPayment.id, 'SALE')");
  const clearIndex = retry.indexOf('setVtPrelaunchFailure(null)');

  expect(retryStart).toBeGreaterThan(-1);
  expect(retryEnd).toBeGreaterThan(retryStart);
  expect(prepareIndex).toBeGreaterThan(-1);
  expect(clearIndex).toBeGreaterThan(prepareIndex);
  expect(retry).toContain('storeActiveQrPayment(qrPayment, qrAttemptKeyRef.current, failure)');
 });
});
