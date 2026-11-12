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
), 'utf8').replace(/\r\n/g, '\n');

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
  expect(paymentDialog).toContain('Pelanggan tidak bayar — mula batal');
  expect(paymentDialog).toContain('Batalkan pembayaran');
  expect(paymentDialog).toContain('Buka Fiuu VT untuk batal');
 });

 it('offers cancellation before provider expiry and turns the close action into a safe confirmation', () => {
  const closeStart = paymentDialog.indexOf('const handleDialogOpenChange');
  const closeEnd = paymentDialog.indexOf('const reconcileQrPayment', closeStart);
  const closeHandler = paymentDialog.slice(closeStart, closeEnd);
  const livePendingStart = paymentDialog.indexOf(
   ") : qrStatus === 'PENDING' || qrStatus === 'PAID' ? (",
  );
  const livePendingEnd = paymentDialog.indexOf('Cuba bayaran QR semula', livePendingStart);
  const livePendingActions = paymentDialog.slice(livePendingStart, livePendingEnd);

  expect(closeStart).toBeGreaterThan(-1);
  expect(closeEnd).toBeGreaterThan(closeStart);
  expect(closeHandler).toContain("qrStatus === 'PENDING' && qrPayment.integration === 'vt_app'");
  expect(closeHandler).toContain('setVtCancelConfirming(true)');
  expect(closeHandler).not.toContain('qrDisplayExpired &&');
  expect(livePendingStart).toBeGreaterThan(-1);
  expect(livePendingEnd).toBeGreaterThan(livePendingStart);
  expect(livePendingActions).toContain('Batalkan pembayaran');
  expect(livePendingActions).toContain('onClick={() => setVtCancelConfirming(true)}');
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
  expect(paymentDialog).toContain('const pollDelaysMs = [750, 1_500, 2_500, 4_000]');
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

 it('restores an active payment and only drains callbacks early for terminal recovery', () => {
  const recoveryStart = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const recoveryEnd = paymentDialog.indexOf('const handleDialogOpenChange', recoveryStart);
  const recovery = paymentDialog.slice(recoveryStart, recoveryEnd);
  const drainStart = recovery.indexOf('beginFiuuVtCallbackDrain(paymentId)');
  const serverRead = recovery.indexOf('fetchPosQrPayment(paymentId)');
  const install = recovery.indexOf('setQrPayment(activePayment)');

  expect(recoveryStart).toBeGreaterThan(-1);
  expect(recoveryEnd).toBeGreaterThan(recoveryStart);
  expect(drainStart).toBeGreaterThan(-1);
  expect(serverRead).toBeGreaterThan(drainStart);
  expect(install).toBeGreaterThan(serverRead);
  expect(recovery).toContain('readActiveFiuuVtResult(paymentId)');
  expect(recovery).toContain('processFiuuVtResultRef.current(queuedResult)');
  expect(recovery.indexOf("['EXPIRED', 'FAILED', 'CANCELLED'].includes(payment.status)"))
   .toBeLessThan(recovery.indexOf('readActiveFiuuVtResult(paymentId)'));
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
  expect(recovery).toContain('readActiveFiuuVtResult(paymentId)');
  expect(recovery).toContain('vtCallbackDrainInProgressRef.current');
  expect(recovery).toContain('captureFiuuVtFinalizationSeal(paymentId, true)');
  expect(recovery).toContain('isFiuuVtFinalizationSealValid(finalizationSeal)');
  expect(recovery).toContain('await releaseFiuuVtNativeState(orderId)');
  expect(release).toContain('await clearPendingFiuuVtResult(orderId)');
  expect(release).toContain('pendingOrderId: null');
  expect(release).toContain('pendingOperation: null');
  expect(release).toContain('storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId)');
  expect(recovery).toContain('Kaunter telah dilepaskan dan troli boleh digunakan semula.');
 });

 it('quiesces deferred native cleanup before allowing another SALE', () => {
  const cleanupStart = paymentDialog.indexOf('const drainAndReleaseDeferredFiuuVtNativeState');
  const cleanupEnd = paymentDialog.indexOf('useEffect(() => {', cleanupStart);
  const cleanup = paymentDialog.slice(cleanupStart, cleanupEnd);
  const preSaleStart = paymentDialog.indexOf("if (qrConfig?.mode === 'FIUU_VT_APP') {", paymentDialog.indexOf('async function handlePay'));
  const preSaleEnd = paymentDialog.indexOf('if (storageKey)', preSaleStart);
  const preSale = paymentDialog.slice(preSaleStart, preSaleEnd);

  expect(cleanup).toContain('await readActiveFiuuVtResult(paymentId)');
  expect(cleanup).toContain('await processFiuuVtResultRef.current(queuedResult)');
  expect(cleanup).toContain('vtCallbackDrainInProgressRef.current || vtCallbackDrainScopeRef.current');
  expect(cleanup).toContain('captureFiuuVtFinalizationSeal(paymentId, true)');
  expect(cleanup).toContain('isFiuuVtFinalizationSealValid(finalizationSeal)');
  expect(cleanup.indexOf('await readActiveFiuuVtResult(paymentId)'))
   .toBeLessThan(cleanup.indexOf('await releaseFiuuVtNativeState(orderId)'));
  expect(preSale).toContain('drainAndReleaseDeferredFiuuVtNativeState(deferredCleanupOrderId)');
  expect(preSale).not.toContain('releaseFiuuVtNativeState(deferredCleanupOrderId)');
 });

 it('retries orphan callbacks even when native pending order is already clear', () => {
  expect(paymentDialog).toContain('!vtNativeStatus.resultAvailable');
  expect(paymentDialog).toContain('const drainScope = vtCallbackDrainScopeRef.current');
  expect(paymentDialog).toContain('await processFiuuVtResultRef.current(result)');
  expect(paymentDialog).toContain('scheduleFiuuVtRecoveryRetry(500)');
  expect(paymentDialog).toContain("} else {\n    vtRecoveryOrderRef.current = null;\n    scheduleFiuuVtRecoveryRetry(500);");
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
