import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
 process.cwd(),
 'supabase/migrations/20261123190000_quarantine_fiuu_vt_status_retry_limit.sql',
), 'utf8').replace(/\r\n/g, '\n');

const parkStart = migration.indexOf(
 'CREATE OR REPLACE FUNCTION public.park_pos_fiuu_vt_status_retry_limit(',
);
const parkEnd = migration.indexOf(
 'REVOKE ALL ON FUNCTION public.park_pos_fiuu_vt_status_retry_limit(',
 parkStart,
);
const park = migration.slice(parkStart, parkEnd);

const reviewStart = migration.indexOf(
 'CREATE OR REPLACE FUNCTION public.mark_pos_fiuu_vt_review_status_aware(',
);
const reviewEnd = migration.indexOf(
 'REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_review_status_aware(',
 reviewStart,
);
const review = migration.slice(reviewStart, reviewEnd);

describe('Fiuu VT STATUS retry-limit quarantine migration', () => {
 it('serializes shift, payment and immutable callback evidence in that order', () => {
  const shiftLock = park.indexOf('FROM public.pos_shifts');
  const paymentLock = park.indexOf('FROM public.pos_online_payments', shiftLock);
  const attemptLock = park.indexOf('FROM public.pos_fiuu_vt_attempts AS attempt', paymentLock);

  expect(parkStart).toBeGreaterThan(-1);
  expect(parkEnd).toBeGreaterThan(parkStart);
  expect(shiftLock).toBeGreaterThan(-1);
  expect(park.indexOf('FOR UPDATE;', shiftLock)).toBeGreaterThan(shiftLock);
  expect(paymentLock).toBeGreaterThan(shiftLock);
  expect(park.indexOf('FOR UPDATE;', paymentLock)).toBeGreaterThan(paymentLock);
  expect(attemptLock).toBeGreaterThan(paymentLock);
  expect(park.indexOf('ORDER BY attempt.id\n  FOR UPDATE;', attemptLock))
   .toBeGreaterThan(attemptLock);
 });

 it('requires the exact active cashier and verified official tablet enrollment', () => {
  expect(park).toContain('v_payment.created_by IS DISTINCT FROM p_actor_id');
  expect(park).toContain("v_payment.sale_payload->>'fiuu_device_id'");
  expect(park).toContain("v_payment.sale_payload->>'fiuu_enrollment_generation'");
  expect(park).toContain("v_shift.status <> 'OPEN'");
  expect(park).toContain("device.status = 'ACTIVE'");
  expect(park).toContain('device.asset_verified_at IS NOT NULL');
  expect(park).toContain("device.metadata->>'official_hardware_profile' IN");
  expect(park).toContain("branch.status::TEXT = 'ACTIVE'");
  expect(park).toContain("tenant.status::TEXT = 'ACTIVE'");
 });

 it('fails closed unless the QR expired and all success evidence is absent', () => {
  expect(park).toContain("v_payment.status <> 'PENDING'");
  expect(park).toContain('v_payment.expires_at > v_now');
  expect(park).toContain('v_payment.transaction_id IS NOT NULL');
  expect(park).toContain('v_payment.provider_transaction_id IS NOT NULL');
  expect(park).toContain('v_payment.provider_sale_reported_at IS NOT NULL');
  expect(park).toContain("v_payment.provider_result->>'status' = '00'");
  expect(park).toContain("attempt.result_json->>'status' = '00'");
  expect(park).toContain('v_status_attempt_count < v_status_retry_budget');
  expect(park).toContain('v_status_retry_budget CONSTANT INTEGER := 3');
 });

 it('does not race an active native launch or callback processing lease', () => {
  expect(park).toContain("attempt.state = 'RECEIVED'");
  expect(park).toContain("attempt.state IN ('PREPARED', 'LAUNCHED')");
  expect(park).toContain(
   'COALESCE(attempt.launch_lease_expires_at, attempt.expires_at) > v_now',
  );
  expect(park).toContain('attempt.processing_lease_expires_at > v_now');
  expect(park).toContain("'outcome', 'CALLBACK_ACTIVE'");
 });

 it('quarantines rather than cancelling and preserves exact late-callback identity', () => {
  expect(park).toContain("SET state = 'QUARANTINED'");
  expect(park).toContain("SET status = 'QUARANTINED'");
  expect(park).toContain('fiuu_vt_review_required = true');
  expect(park).toContain("fiuu_vt_reconciliation_state = 'PROVIDER_ERROR_REVIEW'");
  expect(park).toContain("'lateCallbackAttributionPreserved', true");
  expect(park).not.toMatch(/DELETE\s+FROM\s+public\.pos_fiuu_vt_attempts/i);
  expect(park).not.toMatch(/SET\s+status\s*=\s*'CANCELLED'/i);
  expect(park).not.toContain('provider_order_id = NULL');
  expect(park).not.toContain('result_fingerprint = NULL');
  expect(park).not.toContain('result_json = NULL');
 });

 it('keeps a late callback on the original payment without touching a replacement checkout', () => {
  expect(reviewStart).toBeGreaterThan(-1);
  expect(reviewEnd).toBeGreaterThan(reviewStart);
  expect(review).toContain("'releaseReason', 'STATUS_RETRY_LIMIT_EXHAUSTED'");
  expect(review).toContain("'relatedActiveCheckoutChanged', false");
  expect(review).toContain("'related_payments', 0");
  expect(review).not.toContain('related.id');
  expect(review).not.toContain('candidate.id');
  expect(review).toContain('RETURN public.mark_pos_fiuu_vt_review(');
 });

 it('exposes both primitives only to service_role', () => {
  expect(migration).toContain(
   'REVOKE ALL ON FUNCTION public.park_pos_fiuu_vt_status_retry_limit(',
  );
  expect(migration).toContain(
   'REVOKE ALL ON FUNCTION public.mark_pos_fiuu_vt_review_status_aware(',
  );
  expect(migration.match(/FROM PUBLIC, anon, authenticated;/g)).toHaveLength(2);
  expect(migration.match(/TO service_role;/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
 });
});
