import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
 process.cwd(),
 'supabase/migrations/20261123150000_release_fiuu_vt_cashier_after_void_launch.sql',
), 'utf8').replace(/\r\n/g, '\n');
const paymentDialog = readFileSync(join(
 process.cwd(),
 'components/pos/payment-dialog.tsx',
), 'utf8').replace(/\r\n/g, '\n');
const createRoute = readFileSync(join(
 process.cwd(),
 'app/api/pos/qr-payments/route.ts',
), 'utf8').replace(/\r\n/g, '\n');
const paymentRoute = readFileSync(join(
 process.cwd(),
 'app/api/pos/qr-payments/[paymentId]/route.ts',
), 'utf8').replace(/\r\n/g, '\n');
const attemptRoute = readFileSync(join(
 process.cwd(),
 'app/api/pos/qr-payments/[paymentId]/vt-attempt/route.ts',
), 'utf8').replace(/\r\n/g, '\n');
const recoveryMigration = readFileSync(join(
 process.cwd(),
 'supabase/migrations/20261122160000_recover_detached_fiuu_vt_status.sql',
), 'utf8').replace(/\r\n/g, '\n');

describe('Fiuu VT cancellation request cashier release contract', () => {
 it('stores request, provider confirmation and cashier release as distinct facts', () => {
  expect(migration).toContain('fiuu_vt_cancel_requested_at TIMESTAMPTZ');
  expect(migration).toContain('fiuu_vt_cancel_attempt_id UUID');
  expect(migration).toContain('fiuu_vt_cashier_released_at TIMESTAMPTZ');
  expect(migration).toContain('providerCancellationConfirmed\', false');
  expect(paymentRoute).toContain("? 'CANCELLED_CONFIRMED'");
  expect(paymentRoute).toContain("? 'CANCEL_REQUESTED'");
  expect(paymentDialog).toContain('Menutup paparan QR tidak membatalkan transaksi.');
  expect(paymentDialog).toContain('Pembatalan telah diminta, tetapi belum disahkan oleh Fiuu.');
 });

 it('releases only a durably launched exact VOID attempt and keeps the payment pending', () => {
  const rpcStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.release_pos_fiuu_vt_cashier_lane');
  const rpcEnd = migration.indexOf('REVOKE ALL ON FUNCTION public.release_pos_fiuu_vt_cashier_lane', rpcStart);
  const rpc = migration.slice(rpcStart, rpcEnd);
  expect(rpc).toContain("AND op_type = 'VOID'");
  expect(rpc).toContain("v_attempt.state NOT IN ('LAUNCHED', 'CONSUMED')");
  expect(rpc).toContain('v_attempt.launched_at IS NULL');
  expect(rpc).toContain("AND status = 'PENDING'");
  expect(rpc).not.toMatch(/SET\s+status\s*=\s*'CANCELLED'/);
  expect(rpc).toContain("'payment_status', 'PENDING'");
 });

 it('gives exact success evidence precedence over cancellation release', () => {
  expect(migration).toContain("v_payment.status IN ('REPORTED', 'PAID')");
  expect(migration).toContain("v_payment.provider_result->>'opType' IN ('SALE', 'STATUS')");
  expect(migration).toContain("v_payment.provider_result->>'status' = '00'");
  expect(migration).toContain("success_attempt.op_type IN ('SALE', 'STATUS')");
  expect(migration).toContain("success_attempt.result_json->>'status' = '00'");
  expect(migration).toContain("'PAYMENT_SUCCESS_OR_REVIEW_REQUIRED'");
 });

 it('replays the exact committed release before evaluating a later status change', () => {
  const rpcStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.release_pos_fiuu_vt_cashier_lane');
  const rpcEnd = migration.indexOf('REVOKE ALL ON FUNCTION public.release_pos_fiuu_vt_cashier_lane', rpcStart);
  const rpc = migration.slice(rpcStart, rpcEnd);
  const replayGate = rpc.indexOf('IF v_payment.fiuu_vt_cashier_released_at IS NOT NULL THEN');
  const successGate = rpc.indexOf("IF v_payment.status IN ('REPORTED', 'PAID')");
  expect(replayGate).toBeGreaterThan(-1);
  expect(successGate).toBeGreaterThan(replayGate);
  expect(rpc).toContain("v_payment.fiuu_vt_cancel_attempt_id = p_attempt_id THEN 'RELEASED'");
  expect(rpc).toContain("ELSE 'ATTEMPT_CONFLICT'");
 });

 it('removes only released Fiuu VT rows from active cashier/device uniqueness gates', () => {
  expect(migration.match(/provider <> 'fiuu_vt' OR fiuu_vt_cashier_released_at IS NULL/g))
   .toHaveLength(2);
  expect(createRoute.match(/\.is\('fiuu_vt_cashier_released_at', null\)/g))
   .toHaveLength(3);
  expect(createRoute).toContain("mode: 'FIUU_ATTEMPT_CASHIER_RELEASED'");
  expect(attemptRoute).toContain("mode: 'FIUU_ATTEMPT_CASHIER_RELEASED'");
 });

 it('persists old-cart recovery before the server releases the cashier lane', () => {
  const start = paymentDialog.indexOf('const requestFiuuVtCancellation');
  const end = paymentDialog.indexOf('const resumeFiuuVtCancellationRelease', start);
  const flow = paymentDialog.slice(start, end);
  const resumeStart = paymentDialog.indexOf('const resumeDeferredFiuuVtCancellationRelease');
  const resumeEnd = paymentDialog.indexOf('const parkStalledFiuuVtPayment', resumeStart);
  const resumeFlow = paymentDialog.slice(resumeStart, resumeEnd);
  const preparedRecovery = flow.indexOf('storeDeferredFiuuVtCashierRelease');
  const nativeLaunch = flow.indexOf('launchFiuuVtVoid');
  const durableLaunch = resumeFlow.indexOf('markFiuuVtAttemptLaunched');
  const serverRelease = resumeFlow.indexOf('releaseFiuuVtCashierAfterVoidLaunch');
  const cartLatch = resumeFlow.indexOf('latchCurrentFiuuVtCartRetirement');
  const nativeCleanup = resumeFlow.indexOf('completeFiuuVtCashierCleanup');
  expect(preparedRecovery).toBeGreaterThan(-1);
  expect(nativeLaunch).toBeGreaterThan(-1);
  expect(preparedRecovery).toBeLessThan(nativeLaunch);
  expect(flow).toContain('nativeLaunchObserved: false');
  expect(flow).toContain('nativeLaunchObserved: true');
  expect(durableLaunch).toBeGreaterThan(-1);
  expect(cartLatch).toBeGreaterThan(-1);
  expect(serverRelease).toBeGreaterThan(cartLatch);
  expect(durableLaunch).toBeGreaterThan(serverRelease);
  expect(resumeFlow.match(/releaseFiuuVtCashierAfterVoidLaunch\(/g)).toHaveLength(2);
  expect(nativeCleanup).toBeGreaterThan(serverRelease);
  expect(resumeFlow.indexOf('removeDeferredFiuuVtCashierRelease('))
   .toBeGreaterThan(nativeCleanup);
  expect(flow.indexOf('clearCart()')).toBe(-1);
 });

 it('never treats a cashier-released pending payment as Finance-reviewed native evidence', () => {
  expect(paymentDialog).toContain("cashierReleasedPending = payment.status === 'PENDING'");
  expect(paymentDialog).toContain('!cashierReleasedPending');
  expect(paymentDialog).toContain('allowReviewedRecovery');
  expect(paymentDialog).toContain(': undefined,');
  expect(migration).toContain('ON DELETE RESTRICT');
 });

 it('stops provider STATUS launches after the server releases the cashier lane', () => {
  expect(paymentDialog).toContain('vtCashierReleasedPaymentRef.current = activePayment.id');
  expect(paymentDialog).toContain('response.payment.fiuu_vt_cashier_released_at');
  expect(paymentDialog).toContain('vtCashierReleasedPaymentRef.current === qrPayment.id');
  expect(paymentDialog).toContain('await completeFiuuVtCashierCleanup(qrPayment.providerOrderId)');
 });

 it('fails closed on network loss before durable release and preserves retry recovery', () => {
  const start = paymentDialog.indexOf('const requestFiuuVtCancellation');
  const end = paymentDialog.indexOf('const resumeFiuuVtCancellationRelease', start);
  const flow = paymentDialog.slice(start, end);
  const resumeStart = paymentDialog.indexOf('const resumeDeferredFiuuVtCancellationRelease');
  const resumeEnd = paymentDialog.indexOf('const parkStalledFiuuVtPayment', resumeStart);
  const resumeFlow = paymentDialog.slice(resumeStart, resumeEnd);
  expect(flow).toContain('storeDeferredFiuuVtCashierRelease(cashierReleaseKey, deferredRelease)');
  expect(flow).toContain("activeOperation?.opType === 'VOID'");
  expect(flow).toContain('nativeStatus.activeCallbackAttemptId === activeOperation.id');
  expect(resumeFlow).toContain('await markFiuuVtAttemptLaunched');
  expect(resumeFlow).toContain('await releaseFiuuVtCashierAfterVoidLaunch');
  expect(resumeFlow).toContain("window.addEventListener('online', resumeRelease)");
  expect(flow).toContain('Transaksi asal kekal aktif dan tidak ditandakan batal.');
  expect(paymentDialog).toContain('Tekan “Semak & lepaskan” apabila sambungan stabil.');
 });

 it('does not overwrite a current cleanup identity with a detached late callback', () => {
  const detachedStart = paymentDialog.indexOf("if (!isActivePayment || !activePayment)");
  const detachedEnd = paymentDialog.indexOf("if (response.next_action === 'ACK_ONLY')", detachedStart);
  const detachedFlow = paymentDialog.slice(detachedStart, detachedEnd);
  expect(detachedFlow).toContain('preserveDeferredFiuuVtNativeCleanup(');
  expect(detachedFlow).not.toContain('storeDeferredFiuuVtNativeCleanup(nativeCleanupKey, result.orderId)');
  expect(detachedFlow).toContain('identitinya tidak ditimpa');
 });

 it('retains exact late-success recovery against the original payment', () => {
  expect(recoveryMigration).toContain('CREATE OR REPLACE FUNCTION public.recover_pos_fiuu_vt_reported_payment');
  expect(recoveryMigration).toContain("v_payment.status NOT IN ('PENDING', 'REPORTED')");
  expect(recoveryMigration).toContain("v_payment.provider_result->>'status' IS DISTINCT FROM '00'");
  expect(recoveryMigration).toContain('public.fulfill_pos_fiuu_vt_payment(');
  expect(recoveryMigration).toContain("'outcome', 'FULFILLED'");
 });

 it('serializes review scope with cashier release and terminalizes claimed success evidence', () => {
  const wrapperStart = migration.indexOf(
   'CREATE OR REPLACE FUNCTION public.mark_pos_fiuu_vt_review_status_aware',
  );
  const wrapperEnd = migration.indexOf(
   'REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_review_status_aware',
   wrapperStart,
  );
  const wrapper = migration.slice(wrapperStart, wrapperEnd);
  expect(wrapperStart).toBeGreaterThan(-1);
  expect(wrapper).toContain('FROM public.pos_shifts');
  expect(wrapper).toContain('FOR UPDATE');
  expect(wrapper).toContain('v_payment.fiuu_vt_cashier_released_at IS NOT NULL');
  expect(wrapper).toContain('public.mark_pos_fiuu_vt_released_review(');
  expect(wrapper).toContain('public.mark_pos_fiuu_vt_review(');

  const atomicStart = migration.indexOf(
   'CREATE OR REPLACE FUNCTION public.quarantine_pos_fiuu_vt_callback_review',
  );
  const atomicEnd = migration.indexOf(
   'REVOKE ALL ON FUNCTION public.quarantine_pos_fiuu_vt_callback_review',
   atomicStart,
  );
  const atomicReview = migration.slice(atomicStart, atomicEnd);
  expect(atomicStart).toBeGreaterThan(-1);
  expect(atomicReview).toContain("SET state = 'QUARANTINED'");
  expect(atomicReview).toContain("IF v_attempt.state = 'QUARANTINED'");
  expect(atomicReview).toContain('result_fingerprint = COALESCE(result_fingerprint, p_result_fingerprint)');
  expect(atomicReview).toContain('result_json = COALESCE(result_json, p_result_json)');
  expect(atomicReview).toContain("'fingerprint_conflict'");
  expect(atomicReview).toContain('public.mark_pos_fiuu_vt_review_status_aware(');
  expect(atomicReview).toContain('provider_result = p_provider_result');
  expect(atomicReview).toContain("'outcome', 'QUARANTINED_FOR_REVIEW'");

  const timeoutStart = migration.indexOf(
   'CREATE OR REPLACE FUNCTION public.quarantine_pos_fiuu_vt_released_timeout',
  );
  const timeout = migration.slice(timeoutStart);
  expect(timeout).not.toContain("'outcome', 'SUCCESS_EVIDENCE'");
  expect(timeout).toContain("v_review_state := 'LATE_SUCCESS_REVIEW'");
  expect(timeout).toContain("provider_transaction_id = CASE");
  expect(timeout).toContain('providerSuccessEvidencePreserved');
  expect(timeout).toContain("WHEN COALESCE(v_payment.provider_result->>'amountRm', '') ~");
  expect(timeout).toContain("WHEN COALESCE(attempt.result_json->>'amountRm', '') ~");
  expect(timeout).toContain('attempt.processing_lease_token IS NOT NULL');
  expect(timeout).not.toContain("COALESCE(attempt.processing_lease_expires_at, 'infinity'::TIMESTAMPTZ)");
  expect(migration).toContain('ON public.pos_online_payments(expires_at, id)');
 });

 it('returns the row-locked cashier-release snapshot with every callback claim', () => {
  const claimStart = migration.indexOf(
   'CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_vt_callback_processing',
  );
  const claimEnd = migration.indexOf(
   'REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_callback_processing',
   claimStart,
  );
  const claim = migration.slice(claimStart, claimEnd);
  expect(claimStart).toBeGreaterThan(-1);
  expect(claim).toContain("'cashier_released_at', v_payment.fiuu_vt_cashier_released_at");
  expect(claim).toContain("v_attempt.state IN ('CONSUMED', 'QUARANTINED')");
  expect(claim).toContain("SET state = 'RECEIVED'");
 });
});
