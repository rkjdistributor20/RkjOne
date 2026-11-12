import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
 process.cwd(),
 'supabase/migrations/20261104130000_expand_fiuu_vt_registered_branches.sql',
), 'utf8');
const paymentDialog = readFileSync(join(
 process.cwd(),
 'components/pos/payment-dialog.tsx',
), 'utf8');
const vtResultRoute = readFileSync(join(
 process.cwd(),
 'app/api/pos/qr-payments/[paymentId]/vt-result/route.ts',
), 'utf8');
const createPaymentRoute = readFileSync(join(
 process.cwd(),
 'app/api/pos/qr-payments/route.ts',
), 'utf8');
const getPaymentRoute = readFileSync(join(
 process.cwd(),
 'app/api/pos/qr-payments/[paymentId]/route.ts',
), 'utf8');
const posApi = readFileSync(join(
 process.cwd(),
 'lib/pos/api.ts',
), 'utf8');
const nativePlugin = readFileSync(join(
 process.cwd(),
 'android/app/src/main/java/com/rkjone/staff/RkjFiuuVtPlugin.java',
), 'utf8');
const nativeClient = readFileSync(join(
 process.cwd(),
 'lib/pos/fiuu-vt-client.ts',
), 'utf8');

describe('Fiuu VT registered-branch database boundary', () => {
 it('checks both the payment payload and authoritative branch row', () => {
  expect(migration).toContain('^BR(00[1-9]|0[12][0-9]|03[0-6])$');
  expect(migration).toContain("upper(btrim(branch.branch_code))");
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
});

describe('Fiuu VT BR001 cashier warning', () => {
 it('never labels a live VT terminal payment as a no-money sandbox transaction', () => {
  expect(paymentDialog).toContain("qrPayment.integration === 'vt_app'");
  expect(paymentDialog).toContain('Terminal Fiuu VT aktif — bayaran ini menggunakan transaksi sebenar');
  expect(paymentDialog).toContain("qrPayment.environment === 'sandbox'");
 });

 it('recovers the native order without creating a second payment or SALE', () => {
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

 it('consumes a stored provider result before any STATUS launch', () => {
  const start = paymentDialog.indexOf('const checkActiveQrStatus');
  const end = paymentDialog.indexOf('const confirmReportedFiuuVt', start);
  const statusFlow = paymentDialog.slice(start, end);
  expect(statusFlow.indexOf('readPendingFiuuVtResult()')).toBeGreaterThan(-1);
  expect(statusFlow.indexOf('readPendingFiuuVtResult()'))
   .toBeLessThan(statusFlow.indexOf('launchFiuuVtStatus'));
  expect(statusFlow).toContain("nativeStatus.pendingOperation === 'SALE' && !qrDisplayExpired");
  expect(statusFlow).toContain("if (qrDisplayExpired)");
 });

 it('releases an expired provider attempt while preserving the cart for retry', () => {
  const reconciliationStart = paymentDialog.indexOf('const reconcileQrPayment');
  const terminalStart = paymentDialog.indexOf("if (status === 'EXPIRED'", reconciliationStart);
  const terminalEnd = paymentDialog.indexOf('return status;', terminalStart);
  const terminalReconciliation = paymentDialog.slice(terminalStart, terminalEnd);
  expect(reconciliationStart).toBeGreaterThan(-1);
  expect(terminalStart).toBeGreaterThan(reconciliationStart);
  expect(terminalEnd).toBeGreaterThan(terminalStart);
  expect(terminalReconciliation).toContain('clearPendingFiuuVtResult');
  expect(terminalReconciliation).toContain('removeStoredQrPayment()');
  expect(terminalReconciliation).not.toContain('clearCart()');
  expect(paymentDialog).toContain('Cuba bayaran QR semula');
 });

 it('polls the native callback store so app-switch callbacks cannot be missed', () => {
  const start = paymentDialog.indexOf('const poll = async () => {');
  const end = paymentDialog.indexOf('const appendNumpad', start);
  const polling = paymentDialog.slice(start, end);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  expect(polling).toContain('readPendingFiuuVtResult()');
  expect(polling).toContain('processFiuuVtResult(pendingResult)');
 });

 it('recovers a stale native callback after the server has already closed the attempt', () => {
  const submitStart = posApi.indexOf('export async function submitFiuuVtResult');
  const submitEnd = posApi.indexOf('export async function confirmFiuuVtPayment', submitStart);
  const submitFlow = posApi.slice(submitStart, submitEnd);
  const resultStart = paymentDialog.indexOf('const processFiuuVtResult =');
  const resultEnd = paymentDialog.indexOf('useEffect(() => {', resultStart);
  const resultFlow = paymentDialog.slice(resultStart, resultEnd);
  expect(submitStart).toBeGreaterThan(-1);
  expect(submitEnd).toBeGreaterThan(submitStart);
  expect(submitFlow).toContain('error instanceof ClientJsonError');
  expect(submitFlow).toContain('new PosQrPaymentError');
  expect(resultStart).toBeGreaterThan(-1);
  expect(resultEnd).toBeGreaterThan(resultStart);
  expect(resultFlow).toContain('error.status === 409');
  expect(resultFlow).toContain('reconcileQrPayment(activePayment)');
 });

 it('gives staff a single, ordered checkout flow without a second manual confirmation', () => {
  expect(paymentDialog).toContain('Buka Fiuu VT & Papar QR');
  expect(paymentDialog).toContain('Pelanggan imbas & bayar');
  expect(paymentDialog).toContain('Resit dan stok siap automatik');
  expect(paymentDialog).toContain('Menunggu bayaran pelanggan');
  expect(paymentDialog).toContain('Semak sekarang');
  expect(paymentDialog).toContain('Bayaran disahkan. Resit dikeluarkan dan stok dikemas kini.');
  expect(paymentDialog).toContain('&& qrCents > 0');
  expect(paymentDialog).toContain('const [vtSaleOpened, setVtSaleOpened] = useState(false);');
  expect(paymentDialog).toContain("aria-current={active ? 'step' : undefined}");
 });
});

describe('Fiuu VT BR001 bounded Preview recovery', () => {
 it('maps only a fresh provider STATUS=55 result to an expired terminal attempt', () => {
  const saleStart = vtResultRoute.indexOf("if (result.opType === 'SALE')");
  const saleEnd = vtResultRoute.indexOf("if (!payment.provider_sale_reported_at", saleStart);
  const saleFlow = vtResultRoute.slice(saleStart, saleEnd);
  expect(saleStart).toBeGreaterThan(-1);
  expect(saleEnd).toBeGreaterThan(saleStart);
  expect(saleFlow).toContain("next_action: 'CHECK_STATUS'");
  expect(saleFlow).not.toContain("status: 'EXPIRED'");
  expect(saleFlow).not.toContain('status: terminalStatus');
  expect(vtResultRoute).toContain("disposition === 'EXPIRED'");
  expect(vtResultRoute).toContain("payment: { id: payment.id, status: 'EXPIRED' }");
  expect(vtResultRoute).toContain("next_action: 'COMPLETE'");
  expect(vtResultRoute).toContain('status: terminalStatus');
 });

 it('accepts only a successful late SALE and keeps Production fail-closed', () => {
  expect(vtResultRoute).toContain('getFiuuVtLateRecoveryMs');
  expect(vtResultRoute).toContain("result.opType === 'SALE'");
  expect(vtResultRoute).toContain("result.status === '00'");
  expect(vtResultRoute).toContain('!previewLateSaleRecovery && !previewLateStatusRecovery');
 });

 it('acknowledges the exact accepted result before STATUS and preserves any replacement callback', () => {
  const resultStart = paymentDialog.indexOf('const processFiuuVtResult =');
  const resultEnd = paymentDialog.indexOf('useEffect(() => {', resultStart);
  const resultFlow = paymentDialog.slice(resultStart, resultEnd);
  expect(resultFlow.indexOf('acknowledgeFiuuVtResult(result)')).toBeGreaterThan(-1);
  expect(resultFlow.indexOf('acknowledgeFiuuVtResult(result)'))
   .toBeLessThan(resultFlow.indexOf('launchFiuuVtStatus(result.orderId)'));
  expect(nativePlugin).toContain('public synchronized void acknowledgeResult(PluginCall call)');
  expect(nativePlugin).toContain('transactionId.equals(value.optString("tranID"))');
  expect(nativePlugin).toContain('putBoolean(SALE_ACKNOWLEDGED, true)');
  expect(nativePlugin).toContain('FIUU_RESULT_PENDING');
  expect(nativePlugin).not.toContain('consumeAcceptedSaleResult');
  expect(nativePlugin).toContain('previousOperation');
  expect(nativePlugin).toContain('rollback.run()');
  expect(nativePlugin).toContain('FIUU_ACTIVE_ATTEMPT_EXISTS');
  expect(resultFlow).toContain("response.next_action === 'CHECK_STATUS_LATER'");
  expect(resultFlow).toContain('Bayaran masih diproses oleh Fiuu. Tekan butang semakan sebentar lagi.');
 });

 it('keeps the new web checkout compatible with the installed 1.7.0 bridge during rollout', () => {
  expect(nativePlugin).toContain('result.put("bridgeApiVersion", 2)');
  expect(nativeClient).toContain('RESULT_ACKNOWLEDGEMENT_API_VERSION = 2');
  expect(nativeClient).toContain('rememberBridgeApiVersion(await NativeFiuuVt.getStatus())');
  expect(nativeClient).toContain('if (!await supportsResultAcknowledgement()) return;');
 });

 it('preserves successful evidence when a later non-success STATUS contradicts it', () => {
  const statusGuardComment = vtResultRoute.indexOf('// Once STATUS=00 is stored');
  const reportedStart = vtResultRoute.indexOf("if (payment.status === 'REPORTED')", statusGuardComment);
  const recoveryComment = vtResultRoute.indexOf('// A STATUS=55/11/44 response', reportedStart);
  const reportedGuard = vtResultRoute.slice(reportedStart, recoveryComment);
  expect(statusGuardComment).toBeGreaterThan(-1);
  expect(reportedStart).toBeGreaterThan(-1);
  expect(recoveryComment).toBeGreaterThan(reportedStart);
  expect(reportedGuard).toContain("result.status !== '00'");
  expect(reportedGuard).toContain('FIUU_VT_RECONCILIATION_REQUIRED');
  expect(reportedGuard).not.toContain('provider_result: safeResult');
 });

 it('settles terminal callbacks briefly so a concurrent STATUS=00 wins safely', () => {
  expect(vtResultRoute).toContain('FIUU_VT_TERMINAL_SETTLE_MS');
  expect(vtResultRoute).toContain('canRecoverConcurrentSuccess');
  expect(vtResultRoute).toContain('waitForTerminalSettle(checkedAtMs)');
  expect(vtResultRoute).toContain("status: 'REPORTED'");
  expect(vtResultRoute).toContain('failed_at: null');
  expect(createPaymentRoute).toContain('FIUU_FINAL_STATUS_SETTLING');
  expect(createPaymentRoute).toContain(".in('status', ['FAILED', 'EXPIRED', 'CANCELLED'])");
  expect(createPaymentRoute).toContain(".gte('provider_status_checked_at', settleCutoff)");
 });

 it('consumes only exact STATUS errors so the cashier can retry without dropping an ambiguous SALE', () => {
  expect(nativePlugin).toContain('public synchronized void acknowledgeError(PluginCall call)');
  expect(nativePlugin).toContain('Only a STATUS error is safe to consume');
  expect(nativePlugin).toContain('"STATUS".equals(opType)');
  expect(nativePlugin).toContain('errorCode.equals(value.optString("errorCode"))');
  expect(paymentDialog).toContain('acknowledgeFiuuVtError(result)');
  expect(paymentDialog).toContain('Tekan butang semakan untuk cuba semula dengan selamat.');
  expect(paymentDialog).toContain('if (!isFiuuVtErrorResult(pendingResult)) return;');
  expect(paymentDialog).toContain("if (pendingResult.opType === 'SALE' && !qrDisplayExpired) return;");
  expect(paymentDialog).toContain("isFiuuVtErrorResult(nextResult) && nextResult.opType === 'SALE'");
 });

 it('queues concurrent native callbacks and never overwrites STATUS=00 evidence', () => {
  expect(nativePlugin).toContain('private static final String RESULT_QUEUE = "result_queue";');
  expect(nativePlugin).toContain('enqueueResult(preferences, result)');
  expect(nativePlugin).toContain('enqueueResult(preferences, errorResult)');
  expect(nativePlugin).toContain('findEquivalentResultIndex(queue, value)');
  expect(nativePlugin).toContain('findNormalResultIndex(queue, "STATUS", "00")');
  expect(nativePlugin).toContain('preferences.getBoolean(SALE_LAUNCHED, false)');
  expect(nativePlugin).toContain('preferences.getBoolean(STATUS_LAUNCHED, false)');
  expect(nativePlugin).not.toContain('.putString(LAST_RESULT, result.toString())');
  expect(paymentDialog).toContain('Callback Fiuu VT tambahan sedang disahkan sebelum kaunter dilepaskan.');
 });

 it('serializes queue mutations and hides terminal state during the late-success window', () => {
  expect(nativePlugin).toContain('public synchronized void acknowledgeResult(PluginCall call)');
  expect(nativePlugin).toContain('public synchronized void acknowledgeError(PluginCall call)');
  expect(nativePlugin).toContain('public synchronized void clearPendingResult(PluginCall call)');
  expect(nativePlugin).toContain('public synchronized boolean handleDeepLink(Intent intent)');
  expect(getPaymentRoute).toContain('vtTerminalSettling');
  expect(getPaymentRoute).toContain("? { ...data, status: 'PENDING' }");
 });

 it('drains a callback and restores the receipt when the server is already paid', () => {
  const paidBranch = paymentDialog.slice(
   paymentDialog.indexOf("if (response.payment.status === 'PAID')"),
   paymentDialog.indexOf("await acknowledgeFiuuVtResult(result);", paymentDialog.indexOf("if (response.payment.status === 'PAID')")),
  );
  expect(paidBranch).toContain('acknowledgeFiuuVtResult(result).catch');
  expect(paidBranch).toContain('reconcileQrPayment(activePayment, true)');
 });

 it('gives staff one prominent safe recovery action after the QR display timer expires', () => {
  expect(paymentDialog).toContain('Semak status & lepaskan kaunter');
  expect(paymentDialog).toContain('Selepas Fiuu mengesahkan tamat, troli kekal dan staf boleh terus cuba bayaran baharu.');
  expect(paymentDialog).toContain('supaya tiada caj berganda.');
  expect(paymentDialog).toContain("qrStatus === 'PENDING' && qrDisplayExpired");
 });
});
