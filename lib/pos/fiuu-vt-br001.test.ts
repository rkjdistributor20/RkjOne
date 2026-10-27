import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
 process.cwd(),
 'supabase/migrations/20261027120000_harden_fiuu_vt_br001_pilot.sql',
), 'utf8');
const paymentDialog = readFileSync(join(
 process.cwd(),
 'components/pos/payment-dialog.tsx',
), 'utf8');
const vtResultRoute = readFileSync(join(
 process.cwd(),
 'app/api/pos/qr-payments/[paymentId]/vt-result/route.ts',
), 'utf8');
const nativePlugin = readFileSync(join(
 process.cwd(),
 'android/app/src/main/java/com/rkjone/staff/RkjFiuuVtPlugin.java',
), 'utf8');

describe('Fiuu VT BR001 database boundary', () => {
 it('checks both the payment payload and authoritative branch row', () => {
  expect(migration).toContain("sale_payload->>'fiuu_branch_code' = 'BR001'");
  expect(migration).toContain("upper(btrim(branch.branch_code))");
  expect(migration).toContain("v_branch_code IS DISTINCT FROM 'BR001'");
  expect(migration).toContain("NEW.sale_payload->>'fiuu_branch_code' IS DISTINCT FROM 'BR001'");
 });

 it('enforces the guard on inserts and every later state transition', () => {
  expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.pos_online_payments');
  expect(migration).toContain('Fiuu VT pilot payment is restricted to BR001');
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
  expect(statusFlow).toContain("nativeStatus.pendingOperation === 'SALE'");
 });
});

describe('Fiuu VT BR001 bounded Preview recovery', () => {
 it('accepts only a successful late SALE and keeps Production fail-closed', () => {
  expect(vtResultRoute).toContain('getFiuuVtLateRecoveryMs');
  expect(vtResultRoute).toContain("result.opType === 'SALE'");
  expect(vtResultRoute).toContain("result.status === '00'");
  expect(vtResultRoute).toContain('!previewLateSaleRecovery && !previewLateStatusRecovery');
 });

 it('does not overwrite or discard an unconsumed native result', () => {
  expect(nativePlugin).toContain('FIUU_RESULT_PENDING');
  expect(nativePlugin).toContain('consumeAcceptedSaleResult');
  expect(nativePlugin).toContain('previousOperation');
  expect(nativePlugin).toContain('rollback.run()');
  expect(nativePlugin).toContain('FIUU_ACTIVE_ATTEMPT_EXISTS');
 });
});
