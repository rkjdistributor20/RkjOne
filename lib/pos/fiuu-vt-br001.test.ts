import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
 return readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
}

const migration = source('supabase/migrations/20261104130000_expand_fiuu_vt_registered_branches.sql');
const cloudEcrMigration = source('supabase/migrations/20261024120000_add_fiuu_cloudecr_br001_pilot.sql');
const hardeningMigration = source('supabase/migrations/20261112120000_harden_fiuu_vt_server_recovery.sql');
const serializationMigration = source('supabase/migrations/20261113120000_serialize_fiuu_vt_review_and_fulfillment.sql');
const detachedRecoveryMigration = source(
 'supabase/migrations/20261122160000_recover_detached_fiuu_vt_status.sql',
);
const paymentDialog = source('components/pos/payment-dialog.tsx');
const vtResultRoute = source('app/api/pos/qr-payments/[paymentId]/vt-result/route.ts');
const vtAttemptRoute = source('app/api/pos/qr-payments/[paymentId]/vt-attempt/route.ts');
const posApi = source('lib/pos/api.ts');
const nativePlugin = source('android/app/src/main/java/com/rkjone/staff/RkjFiuuVtPlugin.java');
const nativeClient = source('lib/pos/fiuu-vt-client.ts');

describe('Fiuu VT registered-branch database boundary', () => {
 it('checks both the payment payload and authoritative branch row', () => {
  expect(migration).toContain('^BR(00[1-9]|0[12][0-9]|03[0-6])$');
  expect(migration).toContain('upper(btrim(branch.branch_code))');
  expect(migration).toContain("NEW.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM v_branch_code");
  expect(migration).toContain("NEW.sale_payload->>'branchId' IS DISTINCT FROM NEW.branch_id::TEXT");
  expect(migration).toContain("NEW.sale_payload->>'shiftId' IS DISTINCT FROM NEW.shift_id::TEXT");
 });

 it('enforces the guard on inserts and every later state transition', () => {
  expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.pos_online_payments');
  expect(migration).toContain('guard_pos_fiuu_vt_branch_payment');
  expect(migration).toContain('guard_fiuu_vt_payment_active_device');
  expect(migration).toContain("sale_payload->>'fiuu_device_id'");
  expect(migration).toContain("sale_payload->>'fiuu_enrollment_generation'");
 });

 it('blocks replacement while a payment or review is unresolved', () => {
  expect(hardeningMigration).toContain('fiuu_vt_review_required');
  expect(hardeningMigration).toContain('pos_fiuu_vt_attempts');
  expect(hardeningMigration).toContain("WHERE provider IN ('fiuu', 'fiuu_vt', 'fiuu_cloudecr')");
  expect(hardeningMigration).toContain("status IN ('PENDING', 'REPORTED')");
 });
});

describe('Fiuu VT durable STATUS recovery boundary', () => {
 it('keeps STATUS callback identities reusable and re-arbitrates stale RECEIVED rows', () => {
  expect(detachedRecoveryMigration).toContain("AND op_type = 'VOID'");
  expect(detachedRecoveryMigration).toContain(
   "AND state IN ('PREPARED', 'LAUNCHED', 'EXPIRED')",
  );
  expect(detachedRecoveryMigration).toContain(
   "'reason', 'STATUS_CALLBACK_IDENTITY_RENEWED'",
  );
  expect(detachedRecoveryMigration).toContain("'reused', true");
  expect(detachedRecoveryMigration).toContain(
   "'reason', 'STALE_CALLBACK_REARBITRATION'",
  );
  const staleReturn = detachedRecoveryMigration.indexOf(
   "'reason', 'STALE_CALLBACK_REARBITRATION'",
  );
  const insert = detachedRecoveryMigration.indexOf(
   'INSERT INTO public.pos_fiuu_vt_attempts',
   staleReturn,
  );
  expect(staleReturn).toBeGreaterThan(-1);
  expect(insert).toBeGreaterThan(staleReturn);
 });

 it('serializes shift before payment and atomically crosses REPORTED into fulfilment', () => {
  const start = detachedRecoveryMigration.indexOf(
   'CREATE OR REPLACE FUNCTION public.recover_pos_fiuu_vt_reported_payment',
  );
  const end = detachedRecoveryMigration.indexOf('REVOKE ALL ON FUNCTION', start);
  const recovery = detachedRecoveryMigration.slice(start, end);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  expect(recovery.indexOf('FROM public.pos_shifts'))
   .toBeLessThan(recovery.indexOf('SELECT * INTO v_payment'));
  expect(recovery).toContain("v_payment.status NOT IN ('PENDING', 'REPORTED')");
  expect(recovery).toContain("SET status = 'REPORTED'");
  expect(recovery.indexOf("SET status = 'REPORTED'"))
   .toBeLessThan(recovery.indexOf('public.fulfill_pos_fiuu_vt_payment('));
 });

 it('requires exact durable SALE and STATUS evidence and guards malformed amount casts', () => {
  expect(detachedRecoveryMigration).toContain('v_payment.provider_sale_reported_at IS NULL');
  expect(detachedRecoveryMigration).toContain('v_payment.provider_status_checked_at IS NULL');
  expect(detachedRecoveryMigration).toContain("v_payment.provider_result->>'opType' IS DISTINCT FROM 'STATUS'");
  expect(detachedRecoveryMigration).toContain("v_payment.provider_result->>'status' IS DISTINCT FROM '00'");
  expect(detachedRecoveryMigration).toMatch(/OR \(\s+CASE/);
  expect(detachedRecoveryMigration).toContain("WHEN COALESCE(v_payment.provider_result->>'amountRm', '')");
  expect(detachedRecoveryMigration).toContain('ELSE true');
 });

 it('quarantines a late success from a closed shift and keeps the RPC service-only', () => {
  expect(detachedRecoveryMigration).toContain("IF v_shift_status <> 'OPEN' THEN");
  expect(detachedRecoveryMigration).toContain("SET status = 'QUARANTINED'");
  expect(detachedRecoveryMigration).toContain("fiuu_vt_reconciliation_state = 'LATE_SUCCESS_REVIEW'");
  expect(detachedRecoveryMigration).toContain('SUCCESS_ON_CLOSED_SHIFT_QUARANTINED');
  expect(detachedRecoveryMigration).toContain(
   'REVOKE ALL ON FUNCTION public.recover_pos_fiuu_vt_reported_payment(UUID, UUID)',
  );
  expect(detachedRecoveryMigration).toContain('FROM PUBLIC, anon, authenticated');
  expect(detachedRecoveryMigration).toContain('TO service_role');
 });

 it('parks only an expired no-success payment when native callback storage is unrecoverable', () => {
  expect(detachedRecoveryMigration).toContain(
   'CREATE OR REPLACE FUNCTION public.park_pos_fiuu_vt_native_storage_recovery',
  );
  expect(detachedRecoveryMigration).toContain("v_expired_at + INTERVAL '15 seconds' > v_now");
  expect(detachedRecoveryMigration).toContain('v_payment.provider_transaction_id IS NOT NULL');
  expect(detachedRecoveryMigration).toContain('v_payment.provider_sale_reported_at IS NOT NULL');
  expect(detachedRecoveryMigration).toContain("attempt.state = 'RECEIVED'");
  expect(detachedRecoveryMigration).toContain("attempt.result_json->>'status' = '00'");
  expect(detachedRecoveryMigration).toContain(
   "'eventType', 'NATIVE_CALLBACK_REGISTRY_RECOVERY_QUARANTINED'",
  );
  expect(detachedRecoveryMigration).toContain(
   "'FIUU_VT_NATIVE_STORAGE_QUARANTINED'",
  );
  expect(detachedRecoveryMigration).toContain(
   'REVOKE ALL ON FUNCTION public.park_pos_fiuu_vt_native_storage_recovery',
  );
  expect(detachedRecoveryMigration).toContain('TO service_role');
 });

 it('escalates repeated durable STATUS success failures into reviewed quarantine', () => {
  expect(detachedRecoveryMigration).toContain(
   'CREATE OR REPLACE FUNCTION public.quarantine_pos_fiuu_vt_recovery_failure',
  );
  expect(detachedRecoveryMigration).toContain(
   'v_payment.updated_at IS DISTINCT FROM p_expected_updated_at',
  );
  expect(detachedRecoveryMigration).toContain(
   "COALESCE(v_payment.fiuu_vt_recovery_attempts, 0) < 4",
  );
  expect(detachedRecoveryMigration).toContain(
   "'eventType', 'DURABLE_SUCCESS_FULFILMENT_QUARANTINED'",
  );
  expect(detachedRecoveryMigration).toContain(
   "fiuu_vt_reconciliation_state = 'LATE_SUCCESS_REVIEW'",
  );
  expect(detachedRecoveryMigration).toContain(
   "'FIUU_VT_RECOVERY_FAILURE_QUARANTINED'",
  );
  expect(detachedRecoveryMigration).toContain(
   'REVOKE ALL ON FUNCTION public.quarantine_pos_fiuu_vt_recovery_failure',
  );
 });
});

describe('Fiuu VT cashier flow', () => {
 it('labels the VT path as a real transaction and gives staff three clear steps', () => {
  expect(paymentDialog).toContain("qrPayment.integration === 'vt_app'");
  expect(paymentDialog).toContain('Terminal Fiuu VT aktif — bayaran ini menggunakan transaksi sebenar');
  expect(paymentDialog).toContain('Buka Fiuu VT & Papar QR');
  expect(paymentDialog).toContain('Pelanggan imbas & bayar');
  expect(paymentDialog).toContain('Resit dan stok siap automatik');
  expect(paymentDialog).toContain('Menunggu bayaran pelanggan');
  expect(paymentDialog).toContain('Semak sekarang');
 });

 it('recovers the existing order without creating a second payment or SALE', () => {
  const start = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const end = paymentDialog.indexOf('const handleDialogOpenChange', start);
  const recovery = paymentDialog.slice(start, end);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  expect(recovery).toContain('paymentIdFromFiuuVtOrderId');
  expect(recovery).toContain('fetchPosQrPayment');
  expect(recovery).not.toContain('createPosQrPayment');
  expect(recovery).not.toContain('launchFiuuVtSale');
  expect(recovery).toContain('beginFiuuVtCallbackDrain(paymentId)');
  expect(recovery).toContain('setQrPayment(activePayment)');
  expect(recovery).toContain('readActiveFiuuVtResult(paymentId)');
  expect(recovery).toContain('processFiuuVtResultRef.current(queuedResult)');
  expect(recovery).toContain('scheduleFiuuVtRecoveryRetry()');
  expect(recovery).toContain("['PAID', 'EXPIRED', 'FAILED', 'CANCELLED'].includes(payment.status)");
  expect(recovery).toContain('const paymentFromPriorShift = payment.shift_id !== currentShift.id');
  expect(recovery).toContain('if (paymentFromPriorShift)');
  expect(recovery).toContain('Transaksi syif terdahulu sedang disahkan secara berasingan.');
  expect(recovery).toContain('await releaseFiuuVtNativeState(orderId)');
  expect(recovery.indexOf('readActiveFiuuVtResult(paymentId)'))
   .toBeLessThan(recovery.indexOf('await releaseFiuuVtNativeState(orderId)'));
  expect(recovery).toContain('const fingerprint = payment.cart_fingerprint');
  expect(recovery).not.toContain('cart.map(');
 });

 it('separates a previous customer fingerprint from the current RM3.50 cart', () => {
  const recoveryStart = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const recoveryEnd = paymentDialog.indexOf('const handleDialogOpenChange', recoveryStart);
  const recovery = paymentDialog.slice(recoveryStart, recoveryEnd);
  const cleanupStart = paymentDialog.indexOf('const drainAndReleaseDeferredFiuuVtNativeState');
  const cleanupEnd = paymentDialog.indexOf('const detachStoredFiuuVtPaymentFromCurrentCart', cleanupStart);
  const cleanup = paymentDialog.slice(cleanupStart, cleanupEnd);

  expect(recovery).toContain('currentFiuuVtPaymentFingerprint(payment.amount_rm) !== fingerprint');
  expect(recovery).toContain('storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, orderId)');
  expect(recovery).toContain('removeStoredQrPaymentFor(paymentId)');
  expect(recovery).toContain('Troli pelanggan semasa dikekalkan dan tiada SALE baharu dihantar.');
  expect(recovery).not.toContain('tidak sepadan dengan troli semasa');
  expect(cleanup).toContain("cleanupAction === 'CHECK_STATUS'");
  expect(cleanup).toContain("cleanupAction === 'CONFIRM_REPORTED'");
  expect(cleanup).toContain('await confirmFiuuVtPayment(paymentId)');
  expect(cleanup).toContain('completeFiuuVtCashierCleanup');
  expect(cleanup).not.toContain('createPosQrPayment');
  expect(cleanup).not.toContain('launchFiuuVtSale');
 });

 it('keeps the cart when an attempt fails, expires or is cancelled', () => {
  const reconciliationStart = paymentDialog.indexOf('const reconcileQrPayment');
  const terminalStart = paymentDialog.indexOf("if (status === 'EXPIRED'", reconciliationStart);
  const terminalEnd = paymentDialog.indexOf('return status;', terminalStart);
  const terminalFlow = paymentDialog.slice(terminalStart, terminalEnd);
  expect(terminalFlow).toContain('releaseFiuuVtNativeState');
  expect(terminalFlow).toContain('removeStoredQrPayment()');
  expect(terminalFlow).not.toContain('clearCart()');
  expect(paymentDialog).toContain('Cuba bayaran QR semula');
  expect(paymentDialog).toContain('Semak status & lepaskan kaunter');
  expect(paymentDialog).toContain('Selepas Fiuu mengesahkan tamat, troli kekal');
  expect(paymentDialog).toContain('Pelepasan selamat boleh mengambil kira-kira 30 saat');
 });

 it('polls the native callback queue after app switching', () => {
  const start = paymentDialog.indexOf('const poll = async () => {');
  const end = paymentDialog.indexOf('const appendNumpad', start);
  const polling = paymentDialog.slice(start, end);
  expect(polling).toContain('readActiveFiuuVtResult(qrPayment.id)');
  expect(polling).toContain('processFiuuVtResult(pendingResult)');
  expect(polling).toContain("window.addEventListener('focus', resumePolling)");
  expect(polling).toContain("window.addEventListener('pageshow', resumePolling)");
  expect(polling).toContain('schedulePoll()');
 });

 it('drains callbacks queued behind STATUS=00 and requires a fresh empty read before release', () => {
  const start = paymentDialog.indexOf("if (response.next_action === 'AUTO_CONFIRMATION')");
  const end = paymentDialog.indexOf("if (response.payment.status === 'PAID')", start);
  const confirmation = paymentDialog.slice(start, end);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  expect(confirmation).toContain('const queueOutcome = await processNextQueuedResult()');
  expect(confirmation).toContain("if (queueOutcome === 'queued')");
  expect(confirmation).toContain("if (queueOutcome === 'read_failed') return");
  expect(confirmation).toContain('callback tambahan sebelum terminal dilepaskan');
  expect(confirmation).toContain("setQrStatus('PENDING')");
  expect(confirmation).toContain('fresh, successful empty read');
  expect(confirmation).not.toContain("setQrStatus('REPORTED')");
  expect(confirmation).not.toContain('await reconcileQrPayment(activePayment, true)');
 });

 it('latches HQ review before exposing a quarantined callback status', () => {
  const start = paymentDialog.indexOf("if (response.next_action === 'ACK_AND_QUARANTINE')");
  const end = paymentDialog.indexOf("if (response.next_action === 'CHECK_STATUS')", start);
  const quarantine = paymentDialog.slice(start, end);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  expect(quarantine).toContain('setVtReviewRequired(true)');
  expect(quarantine).toContain('vtReviewRequiredRef.current = true');
  expect(quarantine.indexOf('setVtReviewRequired(true)'))
   .toBeLessThan(quarantine.indexOf('setQrStatus(response.payment.status as QrPaymentStatus)'));
 });

 it('gates polling and automatic confirmation behind the shared callback-drain latch', () => {
  const reconcileStart = paymentDialog.indexOf('const reconcileQrPayment =');
  const reconcileEnd = paymentDialog.indexOf('const processFiuuVtResult =', reconcileStart);
  const reconcile = paymentDialog.slice(reconcileStart, reconcileEnd);
  const confirmStart = paymentDialog.indexOf('const confirmReportedFiuuVt =');
  const confirmEnd = paymentDialog.indexOf('useEffect(() => {', confirmStart);
  const confirm = paymentDialog.slice(confirmStart, confirmEnd);
  expect(reconcile).toContain('vtCallbackDrainInProgressRef.current');
  expect(reconcile).toContain('captureFiuuVtFinalizationSeal(');
  expect(reconcile).toContain('isFiuuVtFinalizationSealValid(');
  expect(confirm).toContain('captureFiuuVtFinalizationSeal(');
  expect(confirm).toContain('isFiuuVtFinalizationSealValid(');
  expect(paymentDialog).toContain('canFinalizeFiuuVtPayment(');
  expect(paymentDialog).toContain('vtCallbackDrainInProgress || qrStatus');
  expect(paymentDialog).toContain('const readActiveFiuuVtResult');
  expect(paymentDialog).toContain('beginFiuuVtCallbackDrain(paymentId)');
  expect(paymentDialog).toContain('scope.queueReadsInProgress');
  expect(paymentDialog).toContain('scope.callbacksProcessing');
  expect(paymentDialog).toContain('canReleaseFiuuVtCallbackDrain(');
  expect(paymentDialog).toContain('queueReadProvedEmpty = result === null');
  expect(paymentDialog).toContain('Antrean callback Fiuu VT belum dapat dibaca');
  expect(paymentDialog).not.toContain('vtCallbackQueueReadCountRef');
  expect(paymentDialog).not.toContain('vtCallbackProcessingCountRef');
  expect(paymentDialog).not.toContain('pendingQueueReadSucceeded');
 });

 it('keeps recovery latched through server restore and isolates stale generations', () => {
  const start = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const end = paymentDialog.indexOf('const handleDialogOpenChange', start);
  const recovery = paymentDialog.slice(start, end);
  const begin = recovery.indexOf('beginFiuuVtCallbackDrain(paymentId)');
  const serverRead = recovery.indexOf('fetchPosQrPayment(paymentId)');
  const install = recovery.indexOf('setQrPayment(activePayment)');
  expect(begin).toBeGreaterThan(-1);
  expect(serverRead).toBeGreaterThan(begin);
  expect(install).toBeGreaterThan(serverRead);
  expect(recovery).not.toContain('callbacksProcessing += 1');
  expect(paymentDialog).toContain('if (currentScope !== scope');
  expect(paymentDialog).toContain('scope.queueReadsInProgress = Math.max');
  expect(paymentDialog).toContain('scope.consecutiveEmptyReads');
  expect(paymentDialog).toContain('FIUU_VT_QUEUE_QUIESCENCE_MS');
 });

 it('retries transient recovery and callback leases without opening another SALE', () => {
  const recoveryStart = paymentDialog.indexOf('const recoverFiuuVtPayment');
  const recoveryEnd = paymentDialog.indexOf('const handleDialogOpenChange', recoveryStart);
  const recovery = paymentDialog.slice(recoveryStart, recoveryEnd);
  const checkoutStart = paymentDialog.indexOf('async function handlePay()');
  const checkoutEnd = paymentDialog.indexOf('const { result, manual_payment_review_error', checkoutStart);
  const checkout = paymentDialog.slice(checkoutStart, checkoutEnd);

  expect(recovery).toContain('scheduleFiuuVtRecoveryRetry()');
  expect(paymentDialog).toContain('vtRecoveryRetry');
  expect(paymentDialog).toContain("error.mode === 'FIUU_VT_CALLBACK_ACTIVE'");
  expect(paymentDialog).toContain('vtCallbackRetryTimerRef');
  expect(paymentDialog).toContain('vtOperationRetryAtRef.current = Date.now() + 2_000');
  expect(paymentDialog).toContain('!vtNativeStatus.resultAvailable');
  expect(paymentDialog).toContain('await processFiuuVtResultRef.current(result)');
  expect(paymentDialog).toContain('scheduleFiuuVtRecoveryRetry(500)');
  expect(vtResultRoute).toContain("mode: 'FIUU_VT_CALLBACK_ACTIVE'");
  const submitResultStart = posApi.indexOf('export async function submitFiuuVtResult');
  const submitResultEnd = posApi.indexOf('export async function createFiuuVtAttempt', submitResultStart);
  const submitResult = posApi.slice(submitResultStart, submitResultEnd);
  expect(submitResult).toContain('retry_after_ms');
  expect(submitResult).toContain('new PosQrPaymentError(error.message, error.status, mode, retryAfterMs)');
  expect(checkout).toContain('let freshNativeStatus = await readFiuuVtStatus()');
  expect(checkout).toContain('freshNativeStatus.pendingOrderId');
  expect(checkout).toContain('freshNativeStatus.resultAvailable');
  expect(checkout).toContain('freshNativeStatus.quarantineBlocksRelease');
  expect(checkout).toContain('vtCallbackDrainInProgressRef.current');
  expect(checkout.indexOf('let freshNativeStatus = await readFiuuVtStatus()'))
   .toBeLessThan(checkout.indexOf('createPosQrPayment(payload, idempotencyKey)'));
 });

 it('holds reused VT payments pending until the native callback queue is proven empty', () => {
  const start = paymentDialog.indexOf('async function handlePay()');
  const end = paymentDialog.indexOf('const { result, manual_payment_review_error', start);
  const checkout = paymentDialog.slice(start, end);
  const begin = checkout.indexOf('beginFiuuVtCallbackDrain(activePayment.id)');
  const install = checkout.indexOf('setQrPayment(activePayment)', begin);
  expect(begin).toBeGreaterThan(-1);
  expect(install).toBeGreaterThan(begin);
  expect(checkout).toContain("payment.status === 'PAID' && payment.integration !== 'vt_app'");
  expect(checkout).toContain("activePayment.integration === 'vt_app'");
  expect(checkout).toContain("? 'PENDING'");
  expect(checkout).toContain("payment.status === 'REPORTED' || payment.status === 'PAID'");
  expect(checkout).toContain('menyemak antrean callback tablet');
 });
});

describe('Fiuu VT one-time callback security and deterministic recovery', () => {
 it('creates a server-owned callback identity for SALE, STATUS and VOID', () => {
  expect(vtAttemptRoute).toContain('pos_fiuu_vt_attempts');
  expect(vtAttemptRoute).toContain('buildFiuuVtCallbackHost');
  expect(vtAttemptRoute).toContain("op_type: opType");
  expect(posApi).toContain('export async function createFiuuVtAttempt');
  expect(paymentDialog).toContain("prepareFiuuVtCallbackAttempt(activePayment.id, 'SALE')");
  expect(paymentDialog).toContain("prepareFiuuVtCallbackAttempt(activePayment.id, 'STATUS')");
  expect(paymentDialog).toContain("prepareFiuuVtCallbackAttempt(qrPayment.id, 'VOID')");
 });

 it('binds every callback to the attempt ID, host, order and operation', () => {
  expect(vtResultRoute).toContain('result.callbackAttemptId');
  expect(vtResultRoute).toContain('attempt.provider_order_id !== result.orderId');
  expect(vtResultRoute).toContain('attempt.op_type !== result.opType');
  expect(vtResultRoute).toContain('attempt.callback_host !== result.callbackHost');
  expect(vtResultRoute).toContain("nativeValidation === 'MISMATCH'");
  expect(vtResultRoute).toContain("'ACK_AND_QUARANTINE'");
 });

 it('durably submits the callback before removing it from the Android queue', () => {
  const start = paymentDialog.indexOf('const processFiuuVtResult =');
  const end = paymentDialog.indexOf('useEffect(() => {', start);
  const flow = paymentDialog.slice(start, end);
  expect(flow.indexOf('submitFiuuVtResult(callbackPaymentId, result)')).toBeGreaterThan(-1);
  expect(flow.indexOf('submitFiuuVtResult(callbackPaymentId, result)'))
   .toBeLessThan(flow.indexOf('await acknowledgeResult()'));
  expect(flow).toContain('result.callbackAttemptId');
  expect(flow).toContain("response.next_action === 'ACK_AND_QUARANTINE'");
 });

 it('never finalizes a payment from SALE or VOID evidence alone', () => {
  const saleStart = vtResultRoute.indexOf("if (result.opType === 'SALE')");
  const voidStart = vtResultRoute.indexOf("} else if (result.opType === 'VOID')", saleStart);
  const statusStart = vtResultRoute.indexOf("} else if (result.status === '00')", voidStart);
  const saleFlow = vtResultRoute.slice(saleStart, voidStart);
  const voidFlow = vtResultRoute.slice(voidStart, statusStart);
  expect(saleFlow).not.toContain("status: 'REPORTED'");
  expect(saleFlow).not.toContain("status: 'PAID'");
  expect(voidFlow).not.toContain("status: 'REPORTED'");
  expect(voidFlow).not.toContain("status: 'PAID'");
  expect(vtResultRoute).toContain("let nextAction: NextAction = 'CHECK_STATUS'");
 });

 it('releases the cashier on authoritative terminal STATUS in one callback', () => {
  expect(vtResultRoute).toContain('const closedStatus = terminalStatus(result)');
  expect(vtResultRoute).toContain('nextStatus = closedStatus');
  expect(vtResultRoute).toContain("nextAction = 'COMPLETE'");
  expect(vtResultRoute).toContain('warning = terminalWarning(closedStatus)');
  expect(vtResultRoute).not.toContain('terminal_confirmation_token');
  expect(posApi).not.toContain('terminalConfirmationToken');
 });

 it('preserves paid evidence and flags late success, reversal and foreign callbacks', () => {
  expect(vtResultRoute).toContain("'LATE_SUCCESS_REVIEW'");
  expect(vtResultRoute).toContain("'REVERSAL_REVIEW'");
  expect(vtResultRoute).toContain("'FOREIGN_CALLBACK_REVIEW'");
  expect(vtResultRoute).toContain('CALLBACK_ATTEMPT_REPLAY_CONFLICT');
  expect(vtResultRoute).toContain('CALLBACK_CONTRADICTS_SUCCESS');
  expect(vtResultRoute).toContain('SUCCESS_AFTER_PAYMENT_CLOSED');
  expect(vtResultRoute).toContain('fiuu_vt_review_evidence');
 });

 it('acknowledges exact retries idempotently and consumes accepted attempts', () => {
  expect(vtResultRoute).toContain("attempt.state === 'CONSUMED' || attempt.state === 'QUARANTINED'");
  expect(vtResultRoute).toContain('attempt.result_fingerprint === fingerprint');
  expect(vtResultRoute).toContain("'ACK_ONLY'");
  expect(vtResultRoute).toContain("'complete_pos_fiuu_vt_callback_processing'");
  expect(vtResultRoute).toContain("(input as Record<string, unknown>).outcome === 'COMPLETED'");
  expect(vtResultRoute).toContain("state: 'QUARANTINED'");
 });

 it('uses bridge v11, exact callback acknowledgement and bounded active/quarantine queues', () => {
  expect(nativePlugin).toContain('private static final int BRIDGE_API_VERSION = 11');
  expect(nativePlugin).toContain('private static final int RESULT_QUEUE_LIMIT = 128');
  expect(nativePlugin).toContain('private static final int QUARANTINED_RESULT_QUEUE_LIMIT = 32');
  expect(nativePlugin).toContain('private static final String CALLBACK_ATTEMPT_REGISTRY');
  expect(nativePlugin).toContain('result.put("callbackAttemptId", callbackAttemptId)');
  expect(nativePlugin).toContain('result.put("callbackHost", registeredCallbackHost)');
  expect(nativePlugin).toContain('public synchronized void acknowledgeResult(PluginCall call)');
  expect(nativePlugin).toContain('public synchronized void acknowledgeError(PluginCall call)');
  expect(nativeClient).toContain('RESULT_ACKNOWLEDGEMENT_API_VERSION = 5');
  expect(nativeClient).toContain('FIUU_VT_CALLBACK_ATTEMPT_API_VERSION = 9');
  expect(nativeClient).toContain('callbackAttemptId: result.callbackAttemptId');
 });

 it('serializes late-callback review and marks only the nearest causally matching paid replacement', () => {
  const reviewStart = serializationMigration.indexOf('CREATE OR REPLACE FUNCTION public.mark_pos_fiuu_vt_review');
  const fulfilStart = serializationMigration.indexOf('CREATE OR REPLACE FUNCTION public.fulfill_pos_fiuu_vt_payment');
  const reviewFlow = serializationMigration.slice(reviewStart, fulfilStart);
  const fulfilFlow = serializationMigration.slice(fulfilStart);

  expect(reviewStart).toBeGreaterThan(-1);
  expect(fulfilStart).toBeGreaterThan(reviewStart);
  expect(reviewFlow.indexOf('FROM public.pos_shifts'))
   .toBeLessThan(reviewFlow.indexOf('SELECT * INTO v_payment'));
  expect(fulfilFlow.indexOf('FROM public.pos_shifts'))
   .toBeLessThan(fulfilFlow.indexOf('SELECT * INTO v_payment'));
  expect(reviewFlow).toContain("candidate.status IN ('PENDING', 'REPORTED')");
  expect(reviewFlow).not.toContain("candidate.status IN ('PENDING', 'REPORTED', 'PAID')");
  expect(reviewFlow).toContain("candidate.status = 'PAID'");
  expect(reviewFlow).toContain('candidate.created_at > v_payment.created_at');
  expect(reviewFlow).toContain("v_payment.expires_at + INTERVAL '20 minutes'");
  expect(reviewFlow).toContain('round(candidate.amount_rm, 2) = round(v_payment.amount_rm, 2)');
  expect(reviewFlow).toContain("candidate.sale_payload->'items'");
  expect(reviewFlow).toContain("candidate.sale_payload->'pricing_snapshot'");
  expect(reviewFlow).toContain('ORDER BY candidate.created_at ASC, candidate.id ASC');
  expect(reviewFlow).toContain('LIMIT 1');
  expect(reviewFlow).toContain('WHERE candidate.id = v_paid_replacement_id');
  expect(reviewFlow).toContain('RELATED_PAID_PAYMENT_AT_REVIEW');
  expect(fulfilFlow).toContain('v_related_review_count > 0');
  expect(fulfilFlow).toContain("related.status IN ('PENDING', 'REPORTED')");
  expect(fulfilFlow.indexOf("v_payment.status = 'PAID' AND v_payment.transaction_id IS NOT NULL"))
   .toBeLessThan(fulfilFlow.indexOf('v_payment.fiuu_vt_review_required'));
  expect(fulfilFlow.indexOf('v_related_review_count > 0'))
   .toBeLessThan(fulfilFlow.indexOf('process_pos_sale_internal'));
  expect(fulfilFlow).toContain("!~ '^RKJ_[A-F0-9]{32}$'");
  expect(serializationMigration).toContain('FROM PUBLIC, anon, authenticated');
  expect(serializationMigration).toContain('TO service_role');
 });

 it('prevents cloudECR double-sale fulfilment while the serialized review lock is active', () => {
  const cloudFulfilStart = cloudEcrMigration.indexOf(
   'CREATE OR REPLACE FUNCTION public.fulfill_pos_fiuu_cloudecr_payment',
  );
  const cloudFulfilFlow = cloudEcrMigration.slice(cloudFulfilStart);
  const guardStart = serializationMigration.indexOf(
   'CREATE OR REPLACE FUNCTION public.guard_pos_fiuu_cloudecr_review_fulfillment',
  );
  const triggerStart = serializationMigration.indexOf(
   'CREATE TRIGGER guard_pos_fiuu_cloudecr_review_fulfillment',
  );
  const guardFlow = serializationMigration.slice(guardStart, triggerStart);

  expect(guardStart).toBeGreaterThan(-1);
  expect(triggerStart).toBeGreaterThan(guardStart);
  expect(cloudFulfilStart).toBeGreaterThan(-1);
  expect(cloudFulfilFlow.indexOf('FROM public.pos_shifts'))
   .toBeLessThan(cloudFulfilFlow.indexOf('SELECT * INTO v_payment'));
  expect(cloudFulfilFlow.indexOf('process_pos_sale_internal'))
   .toBeLessThan(cloudFulfilFlow.indexOf("SET status = 'PAID'"));
  expect(guardFlow).toContain("OLD.provider = 'fiuu_cloudecr'");
  expect(guardFlow).toContain("NEW.status = 'PAID'");
  expect(guardFlow).toContain("OLD.status IS DISTINCT FROM 'PAID'");
  expect(guardFlow).toContain('COALESCE(OLD.fiuu_vt_review_required, false)');
  expect(guardFlow).toContain('COALESCE(NEW.fiuu_vt_review_required, false)');
  expect(serializationMigration).toContain(
   'BEFORE UPDATE OF status, fiuu_vt_review_required',
  );
  expect(serializationMigration).toContain(
   "RAISE EXCEPTION 'Fiuu cloudECR payment requires reconciliation review'",
  );
 });

 it('does not mark an unrelated paid transaction from the same shift', () => {
  const reviewStart = serializationMigration.indexOf(
   'CREATE OR REPLACE FUNCTION public.mark_pos_fiuu_vt_review',
  );
  const fulfilStart = serializationMigration.indexOf(
   'CREATE OR REPLACE FUNCTION public.fulfill_pos_fiuu_vt_payment',
  );
  const reviewFlow = serializationMigration.slice(reviewStart, fulfilStart);
  const paidUpdateStart = reviewFlow.indexOf('IF v_paid_replacement_id IS NOT NULL THEN');
  const paidUpdateEnd = reviewFlow.indexOf('RETURN jsonb_build_object', paidUpdateStart);
  const paidUpdate = reviewFlow.slice(paidUpdateStart, paidUpdateEnd);

  expect(reviewFlow).not.toContain("candidate.status IN ('PENDING', 'REPORTED', 'PAID')");
  expect(reviewFlow).toContain('candidate.created_at > v_payment.created_at');
  expect(reviewFlow).toContain("v_payment.expires_at + INTERVAL '20 minutes'");
  expect(reviewFlow).toContain('round(candidate.amount_rm, 2) = round(v_payment.amount_rm, 2)');
  expect(reviewFlow).toContain("candidate.sale_payload->'items'");
  expect(reviewFlow).toContain("candidate.sale_payload->'pricing_snapshot'");
  expect(reviewFlow).toContain("candidate.sale_payload->'payment_method'");
  expect(reviewFlow).toContain('ORDER BY candidate.created_at ASC, candidate.id ASC');
  expect(paidUpdate).toContain('WHERE candidate.id = v_paid_replacement_id');
  expect(paidUpdate).not.toContain("candidate.status = 'PAID'");
 });

 it('consumes durable SALE errors into STATUS and releases only server-acknowledged STATUS blockers', () => {
  const errorAckStart = nativePlugin.indexOf('public synchronized void acknowledgeError');
  const errorAckEnd = nativePlugin.indexOf('@PluginMethod', errorAckStart + 1);
  const errorAck = nativePlugin.slice(errorAckStart, errorAckEnd);
  const clearStart = nativePlugin.indexOf('public synchronized void clearPendingResult');
  const clearEnd = nativePlugin.indexOf('public synchronized boolean handleDeepLink', clearStart);
  const clear = nativePlugin.slice(clearStart, clearEnd);

  expect(errorAck).toContain('"SALE".equals(opType)');
  expect(errorAck).toContain('.putBoolean(SALE_ACKNOWLEDGED, true)');
  expect(errorAck).toContain('.putString(PENDING_OPERATION, "STATUS")');
  expect(errorAck).toContain('if ("STATUS".equals(opType))');
  expect(errorAck).toContain('removeBlockingQuarantinedResultsForOrder(');
  expect(errorAck).toContain('writeQuarantinedResultQueue(acknowledgementEditor, quarantine)');
  expect(errorAck.indexOf('if (resultIndex < 0)'))
   .toBeLessThan(errorAck.indexOf('removeBlockingQuarantinedResultsForOrder('));
  expect(errorAck.indexOf('queue.remove(resultIndex)'))
   .toBeLessThan(errorAck.indexOf('removeBlockingQuarantinedResultsForOrder('));
  expect(errorAck).toContain(
   'removeCallbackAttempt(preferences, callbackAttemptId, acknowledgementEditor)',
  );
  expect(clear).toContain('QueueLoadState storedResults = loadResultQueueState(preferences)');
  expect(clear).toContain('!storedResults.safeForMutation');
  expect(clear).toContain('storedResults.values.length() > 0');
  expect(clear).not.toContain('hasBlockingResultBeforeStatus(loadResultQueue(preferences))');
 });

 it('blocks a new native SALE while any old callback remains queued', () => {
  const startSaleStart = nativePlugin.indexOf('public synchronized void startSale');
  const startSaleEnd = nativePlugin.indexOf('@PluginMethod', startSaleStart + 1);
  const startSale = nativePlugin.slice(startSaleStart, startSaleEnd);

  expect(startSale).toContain('QueueLoadState storedResults = loadResultQueueState(preferences)');
  expect(startSale).toContain('!storedResults.safeForMutation');
  expect(startSale).toContain('storedResults.values.length() > 0');
  expect(startSale).toContain('FIUU_RESULT_PENDING');
  expect(startSale.indexOf('storedResults.values.length() > 0'))
   .toBeLessThan(startSale.indexOf('Uri uri = new Uri.Builder()'));
 });

 it('keeps STATUS=00 ahead of ambiguous queue entries and never releases on unread callbacks', () => {
  expect(nativePlugin).toContain('findNormalResultIndex(queue, "STATUS", "00")');
  expect(nativePlugin).toContain('enqueueResult(preferences, result)');
  expect(nativePlugin).toContain('enqueueResult(preferences, errorResult)');
  expect(paymentDialog).toContain('if (queuedResult)');
  expect(paymentDialog).toContain('readActiveFiuuVtResult(activePayment.id)');
  expect(paymentDialog).not.toContain("queuedResult.opType === 'STATUS' && queuedResult.status === '00'");
  expect(paymentDialog).not.toContain("queuedResult.opType === 'VOID' && queuedResult.status === '00'");
 });
});
