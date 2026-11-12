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
 });

 it('keeps the cart when an attempt fails, expires or is cancelled', () => {
  const reconciliationStart = paymentDialog.indexOf('const reconcileQrPayment');
  const terminalStart = paymentDialog.indexOf("if (status === 'EXPIRED'", reconciliationStart);
  const terminalEnd = paymentDialog.indexOf('return status;', terminalStart);
  const terminalFlow = paymentDialog.slice(terminalStart, terminalEnd);
  expect(terminalFlow).toContain('clearPendingFiuuVtResult');
  expect(terminalFlow).toContain('removeStoredQrPayment()');
  expect(terminalFlow).not.toContain('clearCart()');
  expect(paymentDialog).toContain('Cuba bayaran QR semula');
  expect(paymentDialog).toContain('Semak status & lepaskan kaunter');
  expect(paymentDialog).toContain('Selepas Fiuu mengesahkan tamat, troli kekal');
  expect(paymentDialog).toContain('supaya tiada caj berganda.');
 });

 it('polls the native callback queue after app switching', () => {
  const start = paymentDialog.indexOf('const poll = async () => {');
  const end = paymentDialog.indexOf('const appendNumpad', start);
  const polling = paymentDialog.slice(start, end);
  expect(polling).toContain('readPendingFiuuVtResult()');
  expect(polling).toContain('processFiuuVtResult(pendingResult)');
  expect(polling).toContain("window.addEventListener('focus', resumePolling)");
  expect(polling).toContain("window.addEventListener('pageshow', resumePolling)");
  expect(polling).toContain('schedulePoll()');
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
  expect(vtResultRoute).toContain("state: 'CONSUMED'");
  expect(vtResultRoute).toContain("state: 'QUARANTINED'");
 });

 it('uses bridge v5, exact callback acknowledgement and a bounded queue', () => {
  expect(nativePlugin).toContain('private static final int BRIDGE_API_VERSION = 5');
  expect(nativePlugin).toContain('private static final int RESULT_QUEUE_LIMIT = 128');
  expect(nativePlugin).toContain('private static final String CALLBACK_ATTEMPT_REGISTRY');
  expect(nativePlugin).toContain('result.put("callbackAttemptId", callbackAttemptId)');
  expect(nativePlugin).toContain('result.put("callbackHost", registeredCallbackHost)');
  expect(nativePlugin).toContain('public synchronized void acknowledgeResult(PluginCall call)');
  expect(nativePlugin).toContain('public synchronized void acknowledgeError(PluginCall call)');
  expect(nativeClient).toContain('RESULT_ACKNOWLEDGEMENT_API_VERSION = 5');
  expect(nativeClient).toContain('FIUU_VT_CALLBACK_ATTEMPT_API_VERSION = 5');
  expect(nativeClient).toContain('callbackAttemptId: result.callbackAttemptId');
 });

 it('keeps STATUS=00 ahead of ambiguous queue entries and never trusts VOID=00', () => {
  expect(nativePlugin).toContain('findNormalResultIndex(queue, "STATUS", "00")');
  expect(nativePlugin).toContain('enqueueResult(preferences, result)');
  expect(nativePlugin).toContain('enqueueResult(preferences, errorResult)');
  expect(paymentDialog).toContain("queuedResult.opType === 'STATUS' && queuedResult.status === '00'");
  expect(paymentDialog).not.toContain("queuedResult.opType === 'VOID' && queuedResult.status === '00'");
 });
});
