import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
 process.cwd(),
 'supabase/migrations/20261112130000_cancel_unlaunched_fiuu_vt_payment.sql',
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
  expect(paymentDialog).toContain('Pelanggan batal — lepaskan kaunter dengan selamat');
 });

 it('honours the server retry lease and resumes STATUS without another SALE', () => {
  expect(paymentDialog).toContain('const FIUU_VT_STATUS_RETRY_MS = 25_000');
  expect(paymentDialog).toContain('vtOperationRetryAtRef.current = Date.now() + retryAfterMs');
  expect(paymentDialog).toContain('vtStatusRetryPending || qrDisplayExpired');
  expect(paymentDialog).toContain('tanpa membuka SALE kedua');
 });
});
