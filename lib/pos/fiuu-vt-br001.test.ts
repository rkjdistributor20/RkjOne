import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
 return readFileSync(join(process.cwd(), path), 'utf8');
}

const migration = source('supabase/migrations/20261104130000_expand_fiuu_vt_registered_branches.sql');
const hardeningMigration = source('supabase/migrations/20261112120000_harden_fiuu_vt_server_recovery.sql');
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
  expect(recovery).toContain('readActiveFiuuVtResult(paymentId)');
  expect(recovery).toContain("['EXPIRED', 'FAILED', 'CANCELLED'].includes(payment.status)");
  expect(recovery).toContain('await releaseFiuuVtNativeState(orderId)');
  expect(recovery).toContain('const fingerprint = payment.cart_fingerprint');
  expect(recovery).not.toContain('cart.map(');
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
  expect(paymentDialog).toContain('tanpa risiko caj berganda.');
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
  expect(confirmation).toContain('if (await processNextQueuedResult())');
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
  expect(reconcile).toContain('canFinalizeFiuuVtPayment(');
  expect(confirm).toContain('vtCallbackDrainInProgressRef.current');
  expect(confirm).toContain('canFinalizeFiuuVtPayment(');
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
  const begin = recovery.indexOf('const recoveryDrainScope = beginFiuuVtCallbackDrain(paymentId)');
  const increment = recovery.indexOf('recoveryDrainScope.callbacksProcessing += 1');
  const install = recovery.indexOf('setQrPayment(activePayment)');
  const decrement = recovery.indexOf('recoveryDrainScope.callbacksProcessing = Math.max');
  expect(begin).toBeGreaterThan(-1);
  expect(increment).toBeGreaterThan(begin);
  expect(install).toBeGreaterThan(increment);
  expect(decrement).toBeGreaterThan(install);
  expect(paymentDialog).toContain('if (currentScope !== scope');
  expect(paymentDialog).toContain('scope.queueReadsInProgress = Math.max');
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
  expect(vtResultRoute).toContain("attempt.state === 'CONSUMED' && attempt.result_fingerprint === fingerprint");
  expect(vtResultRoute).toContain("'ACK_ONLY'");
  expect(vtResultRoute).toContain("'complete_pos_fiuu_vt_callback_processing'");
  expect(vtResultRoute).toContain("(input as Record<string, unknown>).outcome === 'COMPLETED'");
  expect(vtResultRoute).toContain("state: 'QUARANTINED'");
 });

 it('uses bridge v6, exact callback acknowledgement and a bounded queue', () => {
  expect(nativePlugin).toContain('private static final int BRIDGE_API_VERSION = 6');
  expect(nativePlugin).toContain('private static final int RESULT_QUEUE_LIMIT = 128');
  expect(nativePlugin).toContain('private static final String CALLBACK_ATTEMPT_REGISTRY');
  expect(nativePlugin).toContain('result.put("callbackAttemptId", callbackAttemptId)');
  expect(nativePlugin).toContain('result.put("callbackHost", registeredCallbackHost)');
  expect(nativePlugin).toContain('public synchronized void acknowledgeResult(PluginCall call)');
  expect(nativePlugin).toContain('public synchronized void acknowledgeError(PluginCall call)');
  expect(nativeClient).toContain('RESULT_ACKNOWLEDGEMENT_API_VERSION = 5');
  expect(nativeClient).toContain('FIUU_VT_CALLBACK_ATTEMPT_API_VERSION = 6');
  expect(nativeClient).toContain('callbackAttemptId: result.callbackAttemptId');
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
