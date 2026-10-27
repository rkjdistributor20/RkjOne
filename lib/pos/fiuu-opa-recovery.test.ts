import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
 process.cwd(),
 'supabase/migrations/20261026133000_add_fiuu_opa_inquiry_recovery.sql',
), 'utf8');
const statusRoute = readFileSync(resolve(
 process.cwd(),
 'app/api/pos/qr-payments/[paymentId]/route.ts',
), 'utf8');
const createRoute = readFileSync(resolve(
 process.cwd(),
 'app/api/pos/qr-payments/route.ts',
), 'utf8');
const workerRoute = readFileSync(resolve(
 process.cwd(),
 'app/api/internal/pos/fiuu-opa/reconcile/route.ts',
), 'utf8');

describe('Fiuu OPA inquiry recovery migration', () => {
 it('serializes claims with shift-first locking and a fenced lease token', () => {
  const claimStart = migration.indexOf(
   'CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_opa_inquiry',
  );
  const claimEnd = migration.indexOf(
   'REVOKE ALL ON FUNCTION public.claim_pos_fiuu_opa_inquiry',
   claimStart,
  );
  const claim = migration.slice(claimStart, claimEnd);

  expect(claim.indexOf('FROM public.pos_shifts')).toBeGreaterThan(-1);
  expect(claim.indexOf('FROM public.pos_online_payments\n  WHERE id = p_payment_id\n  FOR UPDATE'))
   .toBeGreaterThan(claim.indexOf('FROM public.pos_shifts'));
  expect(claim).toContain("v_branch_code IS DISTINCT FROM 'BR001'");
  expect(claim).toContain('fiuu_opa_reconcile_claim_token = p_claim_token');
  expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_fiuu_opa_live_claim');
  expect(migration).toContain("WHERE state = 'CLAIMED'");
 });

 it('waits for QR expiry, runs exactly six spaced inquiries, then stops', () => {
  expect(migration).toContain('fiuu_opa_reconcile_attempt_count = 0');
  expect(migration).toContain("v_payment.expires_at + INTERVAL '10 seconds'");
  expect(migration).toContain('fiuu_opa_reconcile_attempt_count >= 6');
  expect(migration).toContain("fiuu_opa_reconcile_state = 'WAITING_FOR_EXPIRY'");
  expect(migration).toContain("fiuu_opa_reconcile_state = 'AWAITING_REVERSAL'");
  expect(migration).not.toContain('fiuu_opa_reconcile_attempt_count >= 7');
  expect(migration).toContain("v_next_at := v_now + INTERVAL '10 seconds'");
  expect(migration).toContain("'signedResponseRaw'");
  expect(migration).toContain("jsonb_typeof(p_provider_result->'signedResponseRaw')");
  expect(migration).not.toContain("OR NULLIF(v_payment.gateway_ref, '') IS NULL");
  expect(migration).toContain('report_pos_fiuu_opa_inquiry_success');
  expect(migration).toContain("v_expiry_grace CONSTANT INTERVAL := INTERVAL '65 minutes'");
  expect(migration.indexOf("failure_code = COALESCE(failure_code, 'LEASE_EXPIRED')"))
   .toBeLessThan(migration.indexOf('fiuu_opa_reconcile_attempt_count >= 6'));
  expect(createRoute).toContain("fiuu_opa_reconcile_state: 'WAITING_FOR_EXPIRY'");
 });

 it('keeps customer status GET free of provider polling', () => {
  expect(statusRoute).not.toContain('claim_pos_fiuu_opa_inquiry');
  expect(statusRoute).not.toContain('inquireFiuuOpaPayment');
  expect(workerRoute).toContain('reconcileFiuuOpaPayment');
  expect(workerRoute).toContain('FIUU_RECONCILIATION_SECRET');
  expect(workerRoute).toContain('FIUU_RECONCILIATION_ENABLED');
  expect(workerRoute).not.toContain('process.env.CRON_SECRET');
  expect(workerRoute).toContain(".eq('sale_payload->>fiuu_branch_code', 'BR001')");
  expect(workerRoute).toContain('fiuu_opa_reconcile_lease_expires_at.lte.');
  expect(workerRoute).toContain(".eq('status', 'REPORTED')");
  expect(workerRoute).toContain("service.rpc('fulfill_pos_fiuu_payment'");
 });

 it('keeps reconciliation RPCs private to service role', () => {
  for (const name of [
   'claim_pos_fiuu_opa_inquiry(UUID, UUID, INTEGER)',
   'complete_pos_fiuu_opa_inquiry(\n  UUID, UUID, TEXT, TEXT, JSONB, TEXT\n)',
   'report_pos_fiuu_opa_inquiry_success(\n  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB, JSONB\n)',
  ]) {
   expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
  }
  expect(migration).toContain('REVOKE ALL ON TABLE public.pos_fiuu_opa_reconciliation_attempts');
  expect(migration).toContain('REVOKE ALL ON TABLE public.pos_fiuu_opa_signed_evidence');
  expect(migration).toContain('report_pos_fiuu_payment_with_evidence');
  expect(migration).toContain("SET fiuu_opa_reconcile_state = 'MANUAL_REVIEW'");
  expect(migration).toContain('TO service_role');
 });

	it('recovers a missing gateway reference and permits an idempotent signed-success retry', () => {
		expect(migration).toContain("NULLIF(v_payment.gateway_ref, '') IS NULL");
		expect(migration).toContain("v_payment.status IN ('PENDING', 'EXPIRED')");
		expect(migration).toContain("IF v_attempt.state = 'SUCCEEDED' THEN");
		expect(migration).toContain('RETURN public.report_pos_fiuu_payment(');
	});

 it('does not auto-reverse and does not silently expire an unresolved OPA payment', () => {
  expect(statusRoute).not.toContain('reverseFiuuOpaPayment');
  expect(statusRoute).toContain("data.provider !== 'fiuu'");
  expect(createRoute).toContain(".in('provider', ['fiuu_vt', 'fiuu_cloudecr'])");
  expect(migration).toContain("payment.provider = 'fiuu'");
  expect(migration).toContain("payment.status = 'PENDING'");
 });
});
