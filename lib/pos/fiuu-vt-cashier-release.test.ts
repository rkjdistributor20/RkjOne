import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
 canReleaseQuarantinedFiuuVtNativeState,
 decideFiuuVtCleanupAction,
} from './fiuu-vt';

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
), 'utf8').replace(/\r\n/g, '\n');
const providerErrorMigration = readFileSync(join(
 process.cwd(),
 'supabase/migrations/20261121210000_harden_fiuu_vt_provider_error_quarantine.sql',
), 'utf8');
const terminalReviewMigration = readFileSync(join(
 process.cwd(),
 'supabase/migrations/20261123100000_terminalize_fiuu_vt_review.sql',
), 'utf8');
const providerErrorRoute = readFileSync(join(
 process.cwd(),
 'app/api/pos/qr-payments/[paymentId]/vt-park/route.ts',
), 'utf8');
const vtResultRoute = readFileSync(join(
 process.cwd(),
 'app/api/pos/qr-payments/[paymentId]/vt-result/route.ts',
), 'utf8').replace(/\r\n/g, '\n');
const paymentDialog = readFileSync(join(
 process.cwd(),
 'components/pos/payment-dialog.tsx',
), 'utf8').replace(/\r\n/g, '\n');
const posApi = readFileSync(join(
 process.cwd(),
 'lib/pos/api.ts',
), 'utf8').replace(/\r\n/g, '\n');
const releasableQuarantinedNativeState = {
 serverStatus: 'QUARANTINED',
 reviewRequired: true,
 nativeQuarantineBlocksRelease: false,
 nativeResultAvailable: false,
 callbackDrainInProgress: false,
} satisfies Parameters<typeof canReleaseQuarantinedFiuuVtNativeState>[0];
const detachedPendingCleanupState = {
 serverStatus: 'PENDING',
 reviewRequired: false,
 cashierReleased: false,
 currentCartMatchesPayment: false,
 nativeQuarantineBlocksRelease: false,
 nativeResultAvailable: false,
 callbackDrainInProgress: false,
} satisfies Parameters<typeof decideFiuuVtCleanupAction>[0];

describe('Fiuu VT cashier release safety contract', () => {
 it('releases a durably quarantined native order after the callback queue is drained', () => {
  expect(canReleaseQuarantinedFiuuVtNativeState(
   releasableQuarantinedNativeState,
  )).toBe(true);
 });

 it.each([
  { ...releasableQuarantinedNativeState, serverStatus: 'PENDING' as const },
  { ...releasableQuarantinedNativeState, serverStatus: 'REPORTED' as const },
  { ...releasableQuarantinedNativeState, serverStatus: 'PAID' as const },
  { ...releasableQuarantinedNativeState, serverStatus: 'FAILED' as const },
  { ...releasableQuarantinedNativeState, serverStatus: 'EXPIRED' as const },
  { ...releasableQuarantinedNativeState, serverStatus: 'CANCELLED' as const },
 ])('releases reviewed native state while preserving server business status $serverStatus', (input) => {
  expect(canReleaseQuarantinedFiuuVtNativeState(input)).toBe(true);
 });

 it.each([
  { ...releasableQuarantinedNativeState, reviewRequired: false },
  { ...releasableQuarantinedNativeState, nativeResultAvailable: true },
  { ...releasableQuarantinedNativeState, callbackDrainInProgress: true },
 ])('keeps unsafe native state fail-closed for $serverStatus', (input) => {
  expect(canReleaseQuarantinedFiuuVtNativeState(input)).toBe(false);
 });

 it.each([
  [detachedPendingCleanupState, 'CHECK_STATUS'],
  [{ ...detachedPendingCleanupState, serverStatus: 'REPORTED' as const }, 'CONFIRM_REPORTED'],
  [{ ...detachedPendingCleanupState, serverStatus: 'PAID' as const }, 'RELEASE_NATIVE'],
  [{ ...detachedPendingCleanupState, serverStatus: 'EXPIRED' as const }, 'RELEASE_NATIVE'],
  [{ ...detachedPendingCleanupState, currentCartMatchesPayment: true }, 'RECOVER_CURRENT_CART'],
  [{ ...detachedPendingCleanupState, currentCartMatchesPayment: true, cashierReleased: true }, 'RELEASE_NATIVE'],
  [{ ...detachedPendingCleanupState, cashierReleased: true, nativeQuarantineBlocksRelease: true }, 'REVIEW_REQUIRED'],
  [{ ...detachedPendingCleanupState, nativeResultAvailable: true }, 'DRAIN_CALLBACKS'],
  [{ ...detachedPendingCleanupState, callbackDrainInProgress: true }, 'DRAIN_CALLBACKS'],
  [{ ...detachedPendingCleanupState, reviewRequired: true }, 'RELEASE_NATIVE'],
  [{
   ...detachedPendingCleanupState,
   serverStatus: 'QUARANTINED' as const,
   reviewRequired: true,
   nativeQuarantineBlocksRelease: true,
  }, 'RELEASE_NATIVE'],
  [{
   ...detachedPendingCleanupState,
   serverStatus: 'QUARANTINED' as const,
   reviewRequired: true,
  }, 'RELEASE_NATIVE'],
 ] as const)('selects detached cleanup action %s -> %s', (input, expected) => {
  expect(decideFiuuVtCleanupAction(input)).toBe(expected);
 });

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

 it('gives the cashier immediate safe cancellation and quarantine paths', () => {
  expect(paymentDialog).toContain('cancelPrelaunchFiuuVtPayment');
  expect(paymentDialog).toContain('retryFiuuVtSaleLaunch');
  expect(paymentDialog).toContain('Batal & kembali ke troli');
  expect(paymentDialog).toContain('Cuba buka semula');
  expect(paymentDialog).toContain('Pelanggan tidak bayar — mula batal');
  expect(paymentDialog).toContain('Batalkan pembayaran');
  expect(paymentDialog).toContain('Minta batal & pelanggan seterusnya');
  expect(paymentDialog).toContain('Kuarantin & lepaskan kaunter');
  expect(paymentDialog).toContain('if (activeQrPaymentMatchesCurrentCart(qrPayment)) clearCart();');
 });

 it('quarantines only repeated expired STATUS errors and retains Finance evidence', () => {
  expect(providerErrorMigration).toContain('CREATE OR REPLACE FUNCTION public.record_pos_fiuu_vt_provider_error');
  expect(providerErrorMigration).toContain('v_error_count >= 3');
  expect(providerErrorMigration).toContain('AND v_expired_at <= v_observed_at');
  expect(providerErrorMigration).toContain("v_payment.provider_result->>'callbackAttemptId'");
  expect(providerErrorMigration).toContain('CREATE FUNCTION public.park_pos_fiuu_vt_provider_error');
  expect(providerErrorMigration).toContain("v_payment.fiuu_vt_provider_error_count < 3");
  expect(providerErrorMigration).toContain("v_expired_at > v_now");
  expect(providerErrorMigration).toContain("attempt.result_json->>'status' = '00'");
  expect(providerErrorMigration).toContain("fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW'");
  expect(providerErrorMigration).toContain("SET status = 'QUARANTINED'");
  expect(providerErrorMigration).toContain('CREATE OR REPLACE FUNCTION public.resolve_pos_fiuu_vt_provider_error');
  expect(providerErrorMigration).toContain('FROM PUBLIC, anon, authenticated');
  expect(providerErrorMigration).toContain('TO service_role');
 });

 it('atomically terminalizes unresolved review locks while preserving paid outcomes', () => {
  expect(terminalReviewMigration).toContain(
   "WHEN status IN ('PENDING', 'REPORTED') THEN 'QUARANTINED'",
  );
  expect(terminalReviewMigration).toContain('ELSE status');
  expect(terminalReviewMigration).toContain('RETURNING status INTO v_payment_status');
  expect(terminalReviewMigration).toContain("'payment_status', v_payment_status");
  expect(terminalReviewMigration).toContain("AND status IN ('PENDING', 'REPORTED')");
  expect(terminalReviewMigration).toContain(
   'REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_review(UUID, TEXT, JSONB)',
  );
  expect(terminalReviewMigration).toContain('TO service_role');
 });

 it('exposes quarantine only through the authenticated official-tablet route', () => {
  expect(providerErrorRoute).toContain('assertOfficialPosDevice');
  expect(providerErrorRoute).toContain('assertActivePosShiftMember');
  expect(providerErrorRoute).toContain('payment.created_by !== profile.id');
  expect(providerErrorRoute).toContain("'park_pos_fiuu_vt_provider_error'");
  expect(providerErrorRoute).toContain('p_device_id: officialDeviceId');
  expect(providerErrorRoute).toContain('p_enrollment_generation: officialEnrollmentGeneration');
  expect(providerErrorRoute).toContain("'FIUU_VT_PARK_NOT_READY'");
  expect(providerErrorRoute).toContain("'FIUU_VT_NATIVE_RECOVERY_NOT_READY'");
 });

 it('stops automatic STATUS retries once safe parking is offered', () => {
  expect(vtResultRoute).toContain("? 'PARK_AVAILABLE'");
  expect(vtResultRoute).toContain('park_available === true');
  expect(paymentDialog).toContain("response.next_action === 'PARK_AVAILABLE'");
  expect(paymentDialog).toContain('setVtStatusRetryPending(false)');
  expect(paymentDialog).toContain('setVtParkAvailable(true)');
  expect(paymentDialog).toContain('parkFiuuVtProviderErrorPayment(qrPayment.id)');
  expect(paymentDialog).toContain('storeDeferredFiuuVtNativeCleanup');
 });

 it('closes the native callback drain before another manual STATUS check', () => {
  const statusCheckStart = paymentDialog.indexOf('const runActiveQrStatusCheck');
  const statusCheckEnd = paymentDialog.indexOf('const checkActiveQrStatus', statusCheckStart);
  const statusCheck = paymentDialog.slice(statusCheckStart, statusCheckEnd);

  expect(statusCheckStart).toBeGreaterThan(-1);
  expect(statusCheckEnd).toBeGreaterThan(statusCheckStart);
  expect(statusCheck).toContain('await waitForFiuuVtQueueQuiescence();');
  expect(statusCheck.match(/await readActiveFiuuVtResult\(qrPayment\.id\)/g)).toHaveLength(2);
  expect(statusCheck).toContain('await processFiuuVtResult(pendingResult);\n      // Result processing');
  expect(statusCheck).toContain('// or finalise payment. Do not start a second provider operation here.\n      return;');
 });

 it('recovers an already-paid sale before trusting a stale native SALE marker', () => {
  const statusCheckStart = paymentDialog.indexOf('const runActiveQrStatusCheck');
  const statusCheckEnd = paymentDialog.indexOf('const checkActiveQrStatus', statusCheckStart);
  const statusCheck = paymentDialog.slice(statusCheckStart, statusCheckEnd);
  const serverRead = statusCheck.indexOf('const serverStatus = await reconcileQrPayment(qrPayment);');
  const pendingSaleGuard = statusCheck.indexOf("nativeStatus.pendingOperation === 'SALE'\n      && !qrDisplayExpired");

  expect(serverRead).toBeGreaterThan(-1);
  expect(pendingSaleGuard).toBeGreaterThan(serverRead);
  expect(statusCheck).toContain('shouldProbeFiuuVtSaleStatus(');
  expect(statusCheck).toContain('tanpa menghantar SALE kedua');
 });

 it('runs the lost-SALE watchdog from automatic polling', () => {
  const pollingStart = paymentDialog.indexOf('const poll = async () =>');
  const pollingEnd = paymentDialog.indexOf('const appendNumpad', pollingStart);
  const polling = paymentDialog.slice(pollingStart, pollingEnd);

  expect(polling).toContain('shouldProbeFiuuVtSaleStatus(');
  expect(polling).toContain('await checkActiveQrStatus(false);');
 });

 it('publishes the active payment identity before React can receive a fast callback', () => {
  const paymentInstallations = [...paymentDialog.matchAll(/activeQrPaymentIdRef\.current = ([^;]+);[\s\S]{0,80}?activeQrPaymentRef\.current = ([^;]+);[\s\S]{0,180}?setQrPayment\(([^)]+)\);/g)]
   .filter((installation) => installation[2].trim() !== 'null');

  expect(paymentInstallations.length).toBeGreaterThanOrEqual(4);
  for (const installation of paymentInstallations) {
   expect(installation[2].trim()).toBe(installation[3].trim());
   expect(installation[1].trim()).toBe(installation[3].trim() === 'activePayment'
    ? 'activePayment.id'
    : `${installation[3].trim()}.id`);
  }
  const processStart = paymentDialog.indexOf('const processFiuuVtResult = useCallback');
  const processEnd = paymentDialog.indexOf('processFiuuVtResultRef.current = processFiuuVtResult', processStart);
  const process = paymentDialog.slice(processStart, processEnd);
  expect(process).toContain('const activePayment = activeQrPaymentRef.current;');
  expect(process).not.toContain('const activePayment = qrPayment;');
 });

 it('completes a durable PAID receipt before native cleanup can block the cashier', () => {
  const helperStart = paymentDialog.indexOf('const completeServerPaidFiuuVtCheckout');
  const reconcileStart = paymentDialog.indexOf('const reconcileQrPayment =', helperStart);
  const helper = paymentDialog.slice(helperStart, reconcileStart);
  const reconcileEnd = paymentDialog.indexOf('const processFiuuVtResult =', reconcileStart);
  const reconcile = paymentDialog.slice(reconcileStart, reconcileEnd);
  const paidStart = reconcile.indexOf("if (status === 'PAID')");
  const paidEnd = reconcile.indexOf("if (status === 'EXPIRED'", paidStart);
  const paid = reconcile.slice(paidStart, paidEnd);

  expect(helperStart).toBeGreaterThan(-1);
  expect(reconcileStart).toBeGreaterThan(helperStart);
  expect(helper).toContain('vtServerPaidCompletionRef.current.has(activePayment.id)');
  expect(helper).toContain('storeDeferredFiuuVtFinalization(deferredFinalizationKey');
  expect(helper).toContain('retireCurrentFiuuVtCartForPendingRelease(activePayment.id, orderId)');
  expect(helper).toContain('removeStoredQrPaymentFor(activePayment.id)');
  expect(helper).toContain('onSuccess(receipt)');
  expect(helper.indexOf('onSuccess(receipt)'))
   .toBeLessThan(helper.indexOf('removeDeferredFiuuVtFinalization(deferredFinalizationKey)'));
  expect(helper).toContain('queueMicrotask(() => void drainAndReleaseDeferredFiuuVtNativeState(orderId))');
  expect(reconcile).toContain("if (!finalizationAllowed && status === 'REPORTED')");
  expect(reconcile).not.toContain("!finalizationAllowed && (status === 'REPORTED' || status === 'PAID')");
  expect(paid).toContain('completeServerPaidFiuuVtCheckout(activePayment, response.result)');
  expect(paid).not.toContain("setQrStatus('PENDING')");
 });

 it('waits for callback quiescence before the final empty drain read', () => {
  const verificationStart = paymentDialog.indexOf('if (verifyDrainAfterCallback');
  const verificationEnd = paymentDialog.indexOf('}, [beginFiuuVtCallbackDrain', verificationStart);
  const verification = paymentDialog.slice(verificationStart, verificationEnd);

  expect(verificationStart).toBeGreaterThan(-1);
  expect(verificationEnd).toBeGreaterThan(verificationStart);
  expect(verification).toContain('await waitForFiuuVtQueueQuiescence();');
  expect(verification).toContain('const lateResult = await readActiveFiuuVtResult(callbackPaymentId);');
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
  expect(recovery.indexOf("['PAID', 'EXPIRED', 'FAILED', 'CANCELLED'].includes(payment.status)"))
   .toBeLessThan(recovery.indexOf('readActiveFiuuVtResult(paymentId)'));
  expect(recovery).toContain('getRecoveredFiuuVtLocalStatus(payment.status)');
 });

 it('always bypasses browser caches when reading payment reconciliation state', () => {
  const fetchStart = posApi.indexOf('export async function fetchPosQrPayment');
  const fetchEnd = posApi.indexOf('export async function fetchPosStockSop', fetchStart);
  const fetchPayment = posApi.slice(fetchStart, fetchEnd);

  expect(fetchStart).toBeGreaterThan(-1);
  expect(fetchEnd).toBeGreaterThan(fetchStart);
  expect(fetchPayment).toContain("cache: 'no-store'");
 });

 it('releases stale native state after the server is authoritatively terminal', () => {
  const recoveryStart = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const recoveryEnd = paymentDialog.indexOf('const handleDialogOpenChange', recoveryStart);
  const recovery = paymentDialog.slice(recoveryStart, recoveryEnd);
  const releaseStart = paymentDialog.indexOf('const releaseFiuuVtNativeState');
  const releaseEnd = paymentDialog.indexOf('useEffect(() => {', releaseStart);
  const release = paymentDialog.slice(releaseStart, releaseEnd);

  expect(recovery).toContain("['PAID', 'EXPIRED', 'FAILED', 'CANCELLED'].includes(payment.status)");
  expect(recovery).toContain('readActiveFiuuVtResult(paymentId)');
  expect(recovery).toContain('vtCallbackDrainInProgressRef.current');
  expect(recovery).toContain('captureFiuuVtFinalizationSeal(paymentId, true)');
  expect(recovery).toContain('isFiuuVtFinalizationSealValid(finalizationSeal)');
  expect(recovery).toContain('await releaseFiuuVtNativeState(orderId)');
  expect(recovery).toContain('nativeReleased && !finalizationStillValid && currentCartMatchesPayment');
  expect(recovery).toContain('Troli asal ditutup; rekod bayaran kekal disimpan');
  expect(recovery).toContain("return 'CLEAN_FOR_NEW_CART';");
  expect(recovery).toContain("payment.status === 'PAID' && currentCartMatchesPayment && !response.result");
  expect(recovery).toContain('onSuccess(response.result)');
  expect(recovery).toContain("return 'RETIRED_CURRENT_CART';");
  expect(release).toContain('await clearPendingFiuuVtResult(\n    orderId,');
  expect(release).toContain('allowReviewedRecovery');
  expect(release).toContain('reviewReference: paymentId ? `server-payment:${paymentId}` : undefined');
  expect(release).toContain('verifiedStatus.pendingOrderId !== null');
  expect(release).toContain('verifiedStatus.resultAvailable');
  expect(release).toContain('verifiedStatus.quarantineBlocksRelease');
  expect(release).toContain('resolveFiuuVtCleanupOrderId(status?.pendingOrderId ?? null, orderId)');
  expect(release).toContain('resolveFiuuVtCleanupOrderId(\n    verifiedStatus?.pendingOrderId ?? null');
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
  expect(cleanup.match(/await readActiveFiuuVtResult\(paymentId\)/g)).toHaveLength(2);
  expect(cleanup).toContain('await waitForFiuuVtQueueQuiescence();');
  expect(cleanup).toContain('vtNativeCleanupInFlightRef.current.get(orderId)');
  expect(cleanup).toContain('await processFiuuVtResultRef.current(queuedResult)');
  expect(cleanup).toContain('vtCallbackDrainInProgressRef.current || vtCallbackDrainScopeRef.current');
  expect(cleanup).toContain('resolveFiuuVtCleanupOrderId(\n    nativeStatus?.pendingOrderId ?? null');
  expect(cleanup).toContain('storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, authoritativeOrderId)');
  expect(cleanup).toContain('const response = await fetchPosQrPayment(paymentId)');
  expect(cleanup).toContain('const currentCartMatchesPayment = currentCartMatchesFiuuVtRetirementLatch(paymentId)');
  expect(cleanup).toContain('|| Boolean(');
  expect(cleanup).toContain('const cleanupAction = decideFiuuVtCleanupAction({');
  expect(cleanup).toContain('nativeQuarantineBlocksRelease: nativeStatus.quarantineBlocksRelease');
  expect(cleanup).toContain('nativeResultAvailable: nativeStatus.resultAvailable');
  expect(cleanup).toContain('Terminal sedang dilepaskan tanpa semakan STATUS tambahan.');
  expect(paymentDialog).toContain('vtNativeStatus.callbackRegistryRecoveryRequired');
  expect(paymentDialog).toContain('freshNativeStatus.callbackRegistryRecoveryRequired');
  expect(cleanup).toContain('Callback Fiuu VT baharu dikesan semasa pelepasan.');
  expect(cleanup).toContain("cleanupAction === 'RECOVER_CURRENT_CART'");
  expect(cleanup).toContain("cleanupAction === 'CHECK_STATUS'");
  expect(cleanup).toContain("cleanupAction === 'CONFIRM_REPORTED'");
  expect(cleanup).toContain('await confirmFiuuVtPayment(paymentId)');
  expect(cleanup).toContain('removeStoredQrPaymentFor(paymentId)');
  expect(cleanup).toContain("prepareFiuuVtCallbackAttempt(paymentId, 'STATUS')");
  expect(cleanup).toContain('launchFiuuVtStatus(orderId, payment.amount_rm, attempt)');
  expect(cleanup).toContain("error.mode === 'FIUU_VT_OPERATION_ACTIVE'");
  expect(cleanup).toContain("error.mode === 'FIUU_VT_RELEASE_RETRY_LIMIT'");
  expect(cleanup).toContain("error.mode === 'FIUU_VT_NATIVE_RECOVERY_NOT_READY'");
  expect(cleanup).toContain('error.retryAfterMs ?? 5_000');
  expect(cleanup).toContain('scheduleFiuuVtRecoveryRetry(Math.min(retryAfterMs, 2_000))');
  expect(cleanup).toContain("if (!dialogOpenRef.current) return 'STILL_BLOCKED';");
  expect(cleanup).toContain('FIUU_VT_NATIVE_RELEASE_WINDOW_MS');
  expect(cleanup).toContain('retirement?: { amountRm: number; cartFingerprint?: string | null };');
  expect(cleanup).toContain('const mustRetireCurrentCart = vtCurrentCartRetirementRef.current.has(paymentId)');
  expect(cleanup).toContain('currentCartMatchesPayment: mustRetireCurrentCart ? false : currentCartMatchesPayment');
  expect(cleanup).toContain('const nativeReleaseSeal = captureFiuuVtNativeReleaseSeal(paymentId, true)');
  expect(cleanup).toContain('isFiuuVtNativeReleaseSealValid(nativeReleaseSeal)');
  expect(cleanup).toContain("return retired ? 'CART_RETIRED_RELEASE_PENDING' : 'STILL_BLOCKED'");
  expect(cleanup.indexOf('if (options.retirement)'))
   .toBeLessThan(cleanup.indexOf('vtNativeCleanupInFlightRef.current.get(orderId)'));
  expect(cleanup).toContain('retireCurrentCart = retireCurrentCart\n    || currentCartMatchesFiuuVtRetirementLatch(paymentId)');
  expect(cleanup).toContain('if (currentCartMatchesFiuuVtRetirementLatch(paymentId)');
  expect(cleanup).toContain('options.restartExpiredWindow');
  expect(cleanup).toContain('if (retryable) scheduleFiuuVtRecoveryRetry(2_000);');
  expect(cleanup).toContain('Math.max(1_000, error.retryAfterMs');
  expect(cleanup).toContain('Fiuu VT sedang mengesahkan status akhir transaksi terdahulu');
  expect(cleanup).toContain('captureFiuuVtFinalizationSeal(paymentId, true)');
  expect(cleanup).toContain('isFiuuVtFinalizationSealValid(confirmationSeal)');
  expect(cleanup).not.toContain('launchFiuuVtSale');
  expect(cleanup).not.toContain('createPosQrPayment(');
  expect(cleanup.indexOf("cleanupAction === 'DRAIN_CALLBACKS'"))
   .toBeLessThan(cleanup.indexOf("cleanupAction === 'CHECK_STATUS'"));
  expect(cleanup.indexOf("cleanupAction === 'RECOVER_CURRENT_CART'"))
   .toBeLessThan(cleanup.indexOf("cleanupAction === 'CHECK_STATUS'"));
  expect(cleanup.indexOf("cleanupAction === 'CHECK_STATUS'"))
   .toBeLessThan(cleanup.indexOf("prepareFiuuVtCallbackAttempt(paymentId, 'STATUS')"));
  expect(cleanup.indexOf('await readActiveFiuuVtResult(paymentId)'))
   .toBeLessThan(cleanup.indexOf('await releaseFiuuVtNativeState('));
  expect(preSale).toContain('drainAndReleaseDeferredFiuuVtNativeState(');
  expect(preSale).toContain('deferredCleanupOrderId,');
  expect(preSale).toContain('{ restartExpiredWindow: true }');
  expect(preSale).not.toContain('releaseFiuuVtNativeState(deferredCleanupOrderId)');
 });

 it('detaches a stored payment from a different cart before restoring checkout state', () => {
  const detachStart = paymentDialog.indexOf('const detachStoredFiuuVtPaymentFromCurrentCart');
  const detachEnd = paymentDialog.indexOf('useEffect(() => {', detachStart);
  const detach = paymentDialog.slice(detachStart, detachEnd);
  const restoreStart = paymentDialog.indexOf('const stored = readStoredQrPayment(storageKey)');
  const restoreEnd = paymentDialog.indexOf("if (!open || method === 'CASH'", restoreStart);
  const restore = paymentDialog.slice(restoreStart, restoreEnd);
  const mismatchGuard = detach.indexOf('activeQrPaymentMatchesCurrentCart(stored.payment)');
  const installStoredPayment = restore.indexOf('setQrPayment(stored.payment)');
  const submitStart = paymentDialog.indexOf('async function handlePay()');
  const submitEnd = paymentDialog.indexOf('const idempotencyKey =', submitStart);
  const submit = paymentDialog.slice(submitStart, submitEnd);

  expect(detachStart).toBeGreaterThan(-1);
  expect(detachEnd).toBeGreaterThan(detachStart);
  expect(restoreStart).toBeGreaterThan(-1);
  expect(restoreEnd).toBeGreaterThan(restoreStart);
  expect(mismatchGuard).toBeGreaterThan(-1);
  expect(installStoredPayment).toBeGreaterThan(-1);
  expect(restore.indexOf('detachStoredFiuuVtPaymentFromCurrentCart(stored)'))
   .toBeLessThan(installStoredPayment);
  expect(detach).toContain('removeStoredQrPayment()');
  expect(detach).toContain('storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, staleOrderId)');
  expect(detach).toContain('drainAndReleaseDeferredFiuuVtNativeState(staleOrderId)');
  expect(detach).toContain('Transaksi QR terdahulu diasingkan daripada troli pelanggan ini.');
  expect(submit).toContain('detachStoredFiuuVtPaymentFromCurrentCart(stored)');
  expect(submit.indexOf('detachStoredFiuuVtPaymentFromCurrentCart(stored)'))
   .toBeLessThan(submit.indexOf('setQrPayment(stored.payment)'));
  expect(submit).toContain('{ restartExpiredWindow: true }');

  const dialogChangeStart = paymentDialog.indexOf('const handleDialogOpenChange');
  const dialogChangeEnd = paymentDialog.indexOf('const reconcileQrPayment', dialogChangeStart);
  const dialogChange = paymentDialog.slice(dialogChangeStart, dialogChangeEnd);
  expect(dialogChange.indexOf('return;'))
   .toBeLessThan(dialogChange.indexOf('dialogOpenRef.current = nextOpen;'));
 });

 it('preserves a different customer cart while releasing a quarantined native order', () => {
  const recoveryStart = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const recoveryEnd = paymentDialog.indexOf('const handleDialogOpenChange', recoveryStart);
  const recovery = paymentDialog.slice(recoveryStart, recoveryEnd);
  const quarantinedStart = recovery.indexOf("payment.status === 'QUARANTINED'");
  const terminalStatusStart = recovery.indexOf("['PAID', 'EXPIRED', 'FAILED', 'CANCELLED']", quarantinedStart);
  const quarantined = recovery.slice(quarantinedStart, terminalStatusStart);

  expect(recovery).toContain('const currentCartMatchesPayment = currentCartMatchesFiuuVtRetirementLatch(payment.id)');
  expect(recovery).toContain('|| (!paymentFromPriorShift');
  expect(recovery).toContain('currentFiuuVtPaymentFingerprint(payment.amount_rm)');
  expect(quarantined).toContain('retirement: currentCartMatchesPayment');
  expect(quarantined).toContain('cartFingerprint: fingerprint');
  expect(quarantined).toContain('Troli pelanggan semasa dikekalkan sementara terminal dibersihkan.');
  expect(quarantined).toContain("return 'RETIRED_CURRENT_CART';");
 });

 it('routes a mismatched active payment into detached cleanup instead of a recovery loop', () => {
  const recoveryStart = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const recoveryEnd = paymentDialog.indexOf('const handleDialogOpenChange', recoveryStart);
  const recovery = paymentDialog.slice(recoveryStart, recoveryEnd);
  const mismatchStart = recovery.indexOf('if (!fingerprint');
  const mismatchEnd = recovery.indexOf('const recoveredMethod', mismatchStart);
  const mismatch = recovery.slice(mismatchStart, mismatchEnd);

  expect(mismatchStart).toBeGreaterThan(-1);
  expect(mismatchEnd).toBeGreaterThan(mismatchStart);
  expect(mismatch).toContain('storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId)');
  expect(mismatch).toContain('removeStoredQrPaymentFor(paymentId)');
  expect(mismatch).toContain('scheduleFiuuVtRecoveryRetry(250)');
  expect(mismatch).toContain('tiada SALE baharu dihantar');
  expect(mismatch).not.toContain('clearCart()');
  expect(mismatch).not.toContain('throw new Error');
  expect(recovery).not.toContain('tidak sepadan dengan troli semasa');
 });

 it('cleans a deferred native order before generic recovery can close the next checkout', () => {
  const effectStart = paymentDialog.indexOf('const deferredCleanupOrderId = readDeferredFiuuVtNativeCleanup', paymentDialog.indexOf('useEffect(() => {', paymentDialog.indexOf('processFiuuVtResultRef.current = processFiuuVtResult')));
  const recoveryCall = paymentDialog.indexOf('await recoverFiuuVtPayment(status)', effectStart);

  expect(effectStart).toBeGreaterThan(-1);
  expect(paymentDialog.slice(effectStart, recoveryCall)).toContain(
   'await drainAndReleaseDeferredFiuuVtNativeState(deferredCleanupOrderId)',
  );
  expect(recoveryCall).toBeGreaterThan(effectStart);
  expect(paymentDialog).toContain('Semak & bersihkan terminal');
  expect(paymentDialog).toContain('Troli pelanggan ini selamat dan dikekalkan.');
 });

 it('keeps a cashier-initiated cleanup action available before generic payment validation', () => {
  const cleanupStart = paymentDialog.indexOf('async function handleFiuuVtNativeCleanup()');
  const cleanupEnd = paymentDialog.indexOf('async function handlePay()', cleanupStart);
  const cleanup = paymentDialog.slice(cleanupStart, cleanupEnd);
  const submitStart = cleanupEnd;
  const cleanupGuard = paymentDialog.indexOf('if (fiuuVtNativeCleanupPending)', submitStart);
  const paymentGuard = paymentDialog.indexOf('if (paymentErrorWithoutNativeCleanup)', submitStart);
  const footerStart = paymentDialog.indexOf('disabled={loading || vtCleanupRunning');
  const footerEnd = paymentDialog.indexOf('</Button>', footerStart);
  const footer = paymentDialog.slice(footerStart, footerEnd);
  const completionStart = paymentDialog.indexOf('const completeFiuuVtCashierCleanup');
  const completionEnd = paymentDialog.indexOf('const detachStoredFiuuVtPaymentFromCurrentCart', completionStart);
  const completion = paymentDialog.slice(completionStart, completionEnd);

  expect(cleanupStart).toBeGreaterThan(-1);
  expect(completionStart).toBeGreaterThan(-1);
  expect(completionEnd).toBeGreaterThan(completionStart);
  expect(completion).toContain('while (dialogOpenRef.current && Date.now() < deadline)');
  expect(completion).toContain('{ restartExpiredWindow: firstAttempt }');
  expect(completion).toContain('FIUU_VT_CASHIER_CLEANUP_RETRY_MS');
  expect(completion).not.toContain('launchFiuuVtSale');
  expect(cleanup).toContain('resolveFiuuVtCleanupOrderId(\n    status.pendingOrderId');
  expect(cleanup).toContain('waitForFiuuVtCleanupUi(');
  expect(cleanup).toContain('completeFiuuVtCashierCleanup(cleanupOrderId)');
  expect(cleanup).toContain('error instanceof FiuuVtCleanupUiTimeoutError');
  expect(cleanup).toContain('await readActiveFiuuVtResult(drainScope.paymentId)');
  expect(cleanup).toContain('await waitForFiuuVtQueueQuiescence()');
  expect(cleanup).toContain('processFiuuVtResultRef.current(result)');
  expect(cleanup).not.toContain('launchFiuuVtSale');
  expect(paymentDialog).toContain('vtNativeReleaseWindowRef.current = null;');
  expect(cleanupGuard).toBeGreaterThan(submitStart);
  expect(cleanupGuard).toBeLessThan(paymentGuard);
  expect(paymentDialog.slice(submitStart, paymentGuard)).toContain(
   'const cleanupOutcome = await handleFiuuVtNativeCleanup()',
  );
  expect(paymentDialog.slice(submitStart, paymentGuard)).toContain(
   "if (cleanupOutcome !== 'CLEAN_FOR_NEW_CART') return;",
  );
  expect(footer).toContain('(!canPay && !fiuuVtNativeCleanupPending)');
  expect(footer).toContain('Semak & bersihkan terminal');
  expect(paymentDialog).toContain('Tiada SALE baharu dihantar.');
  expect(paymentDialog).toContain("method !== 'CASH'\n  && !qrPayment");
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

 it('never restores or recharges a cart while callback-registry recovery is required', () => {
  const restoreStart = paymentDialog.indexOf('const stored = readStoredQrPayment(storageKey)');
  const restoreEnd = paymentDialog.indexOf('}, [beginFiuuVtCallbackDrain', restoreStart);
  const restore = paymentDialog.slice(restoreStart, restoreEnd);
  const recoveryStart = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const recoveryEnd = paymentDialog.indexOf('const handleDialogOpenChange', recoveryStart);
  const recovery = paymentDialog.slice(recoveryStart, recoveryEnd);
  const activeRegistryStart = paymentDialog.indexOf('const quarantineActiveFiuuVtCallbackRegistry');
  const activeStatusEnd = paymentDialog.indexOf('const checkActiveQrStatus', activeRegistryStart);
  const activeStatus = paymentDialog.slice(activeRegistryStart, activeStatusEnd);
  const submitStart = paymentDialog.indexOf('async function handlePay()');
  const submit = paymentDialog.slice(submitStart);

  expect(paymentDialog).toContain("| 'CART_RETIRED_RELEASE_PENDING';");
  expect(restore).toContain('if (vtNativeStatus.callbackRegistryRecoveryRequired)');
  expect(restore.indexOf('if (vtNativeStatus.callbackRegistryRecoveryRequired)'))
   .toBeLessThan(restore.indexOf('setQrPayment(stored.payment)'));
  expect(restore).toContain('stored.payment.providerOrderId === vtNativeStatus.pendingOrderId');
  expect(restore).toContain('latchCurrentFiuuVtCartRetirement(');
  expect(restore).toContain('stored.payment.cartFingerprint');
  expect(restore).toContain('drainAndReleaseDeferredFiuuVtNativeState(');
  expect(recovery).toContain("payment.status === 'PENDING'");
  expect(recovery).toContain("parkFiuuVtProviderErrorPayment(payment.id, 'NATIVE_CALLBACK_REGISTRY')");
  expect(recovery).toContain('currentCartMatchesFiuuVtRetirementLatch(payment.id)');
  expect(activeStatus).toContain('parkFiuuVtProviderErrorPayment(');
  expect(activeStatus).toContain('activePayment.id,');
  expect(activeStatus).toContain("'NATIVE_CALLBACK_REGISTRY',");
  expect(activeStatus).toContain('if (nativeStatus.callbackRegistryRecoveryRequired)');
  expect(activeStatus).toContain("fiuuVtNativeErrorCode(error) === 'FIUU_STORAGE_RECOVERY_REQUIRED'");
  expect(activeStatus).toContain("serverPayment.status === 'REPORTED'");
  expect(activeStatus).toContain('confirmFiuuVtPayment(activePayment.id)');
  expect(activeStatus).toContain('let receipt = serverResponse.result');
  expect(activeStatus).toContain('!confirmation.result');
  expect(activeStatus).toContain('onSuccess(receipt)');
  expect(activeStatus).not.toContain('vtReviewRequiredRef.current = true');
  expect(activeStatus).toContain('cartFingerprint: activePayment.cartFingerprint');
  expect(activeStatus).toContain("if (outcome === 'CART_RETIRED_RELEASE_PENDING')");
  expect(activeStatus).toContain('vtPendingReceiptAfterReleaseRef.current.set(activePayment.id, receipt)');
  expect(submit).toContain("if (recoveryOutcome === 'RETIRED_CURRENT_CART') return;");
  expect(submit.indexOf("if (recoveryOutcome === 'RETIRED_CURRENT_CART') return;"))
   .toBeLessThan(submit.indexOf('createPosQrPayment(payload, idempotencyKey)'));
 });

 it('archives an orderless native registry only from the cashier cleanup action', () => {
  const cleanupStart = paymentDialog.indexOf('async function handleFiuuVtNativeCleanup');
  const cleanupEnd = paymentDialog.indexOf('async function handlePay()', cleanupStart);
  const cleanup = paymentDialog.slice(cleanupStart, cleanupEnd);

  expect(cleanup).toContain('status.callbackRegistryRecoveryRequired');
  expect(cleanup).toContain('!status.pendingOrderId');
  expect(cleanup).toContain('recoverOrphanedFiuuVtCallbackRegistry(');
  expect(cleanup).toContain('cashier-orderless:${branchId}:${cartSessionId}');
  expect(cleanup).toContain("return 'CLEAN_FOR_NEW_CART';");
 });

 it('pins full QR to the cart total while keeping mixed QR editable', () => {
  const fullQrStart = paymentDialog.indexOf("{method === 'QR' && (");
  const mixedQrStart = paymentDialog.indexOf("{method === 'MIXED' && (", fullQrStart);
  const fullQr = paymentDialog.slice(fullQrStart, mixedQrStart);
  const mixedQrEnd = paymentDialog.indexOf("{(method === 'QR' || method === 'MIXED')", mixedQrStart);
  const mixedQr = paymentDialog.slice(mixedQrStart, mixedQrEnd);

  expect(paymentDialog).toContain("const qrAmount = method === 'QR'\n  ? defaultAmount");
  expect(fullQr).toContain('value={qrAmount}');
  expect(fullQr).toContain('readOnly');
  expect(fullQr).not.toContain('setQrAmountOverride(e.target.value)');
  expect(mixedQr).toContain('setQrAmountOverride(e.target.value)');
  expect(paymentDialog).toContain("setQrAmountOverride(stored.payment.paymentMethod === 'MIXED'");
  expect(paymentDialog).toContain("setQrAmountOverride(recoveredMethod === 'MIXED'");
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

 it('binds irreversible cart retirement to the original live cart identity', () => {
  const latchStart = paymentDialog.indexOf('const latchCurrentFiuuVtCartRetirement');
  const retireEnd = paymentDialog.indexOf('const releaseFiuuVtNativeState', latchStart);
  const retirement = paymentDialog.slice(latchStart, retireEnd);
  const deferredStart = paymentDialog.indexOf('const retryDeferredCleanup');
  const deferredEnd = paymentDialog.indexOf('useEffect(() => {', deferredStart);
  const deferred = paymentDialog.slice(deferredStart, deferredEnd);

  expect(retirement).toContain('const current = usePosStore.getState()');
  expect(retirement).toContain('cartSessionId: current.cartSessionId');
  expect(retirement).toContain('cartFingerprint');
  expect(retirement).toContain('current.cartSessionId === latch.cartSessionId');
  expect(retirement.indexOf('if (!currentCartMatchesFiuuVtRetirementLatch(paymentId))'))
   .toBeLessThan(retirement.indexOf('clearCart();'));
  expect(retirement).toContain('vtCartRetiredPendingReleaseRef.current.add(paymentId)');
  expect(deferred).toContain('vtPendingReceiptAfterReleaseRef.current.get(paymentId)');
  expect(deferred).toContain('onSuccess(receipt)');
 });

 it('persists deferred finalization before clearing the cart and restores it after reload', () => {
  const retirementStart = paymentDialog.indexOf('const retireCurrentFiuuVtCartForPendingRelease');
  const retirementEnd = paymentDialog.indexOf('const releaseFiuuVtNativeState', retirementStart);
  const retirement = paymentDialog.slice(retirementStart, retirementEnd);
  const persistIndex = retirement.indexOf('storeDeferredFiuuVtFinalization(deferredFinalizationKey');
  const clearIndex = retirement.indexOf('clearCart();');
  const deferredStart = paymentDialog.indexOf('const retryDeferredCleanup');
  const deferredEnd = paymentDialog.indexOf('useEffect(() => {', deferredStart);
  const deferred = paymentDialog.slice(deferredStart, deferredEnd);
  const successIndex = deferred.indexOf('onSuccess(receipt)');
  const markerRemovalIndex = deferred.indexOf(
   'removeDeferredFiuuVtFinalization(deferredFinalizationKey)',
  );
  const preSaleStart = paymentDialog.indexOf(
   "if (qrConfig?.mode === 'FIUU_VT_APP') {",
   paymentDialog.indexOf('async function handlePay'),
  );
  const preSaleEnd = paymentDialog.indexOf('if (storageKey)', preSaleStart);
  const preSale = paymentDialog.slice(preSaleStart, preSaleEnd);

  expect(retirementStart).toBeGreaterThan(-1);
  expect(persistIndex).toBeGreaterThan(-1);
  expect(clearIndex).toBeGreaterThan(persistIndex);
  expect(retirement).toContain('paymentId,\n   orderId,\n   amountRm: latch.amountRm');
  expect(retirement).toContain('cartFingerprint: latch.cartFingerprint');
  expect(retirement).toContain('storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId)');
  expect(deferred).toContain('readDeferredFiuuVtFinalization(deferredFinalizationKey)');
  expect(deferred).toContain('const paymentId = paymentIdFromFiuuVtOrderId(orderId)');
  expect(deferred).toContain('response = await fetchPosQrPayment(paymentId)');
  expect(deferred).toContain("payment.provider !== 'fiuu_vt'");
  expect(deferred).toContain('payment.provider_order_id !== orderId');
  expect(deferred).toContain("payment.status === 'PAID' && !response.result");
  expect(successIndex).toBeGreaterThan(-1);
  expect(markerRemovalIndex).toBeGreaterThan(successIndex);
  expect(preSale).toContain('readDeferredFiuuVtFinalization(deferredFinalizationKey)');
  expect(preSale).toContain('storedCleanupOrderId !== deferredFinalization.orderId');
  expect(preSale).toContain('deferredFinalization?.orderId ?? null');
  expect(preSale).toContain('rekod akhir pelanggan terdahulu masih dipulihkan');
 });

 it('uses reviewed atomic acknowledgement only after the server accepts the callback', () => {
  const processStart = paymentDialog.indexOf('const processFiuuVtResult = useCallback');
  const processEnd = paymentDialog.indexOf('processFiuuVtResultRef.current = processFiuuVtResult', processStart);
  const process = paymentDialog.slice(processStart, processEnd);
  const submitIndex = process.indexOf('submitFiuuVtResult(callbackPaymentId, result)');
  const ackIndex = process.indexOf('await acknowledgeResult();');

  expect(submitIndex).toBeGreaterThan(-1);
  expect(ackIndex).toBeGreaterThan(submitIndex);
  expect(process).toContain('status?.callbackRegistryRecoveryRequired');
  expect(process).toContain('registryRecoveryReviewed: true as const');
  expect(process).toContain('server-result:${callbackPaymentId}:${result.callbackAttemptId}');
  expect(process).toContain('if (!status?.callbackRegistryRecoveryRequired) throw error');
 });
});
