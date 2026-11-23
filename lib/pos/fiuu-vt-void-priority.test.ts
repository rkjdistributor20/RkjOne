import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
 process.cwd(),
 'supabase/migrations/20261123203000_prioritize_fiuu_vt_void_over_status.sql',
), 'utf8').replace(/\r\n/g, '\n');
const integrationTest = readFileSync(resolve(
 process.cwd(),
 'supabase/tests/fiuu_vt_void_priority.sql',
), 'utf8').replace(/\r\n/g, '\n');
const concurrencyTest = readFileSync(resolve(
 process.cwd(),
 'scripts/test-fiuu-vt-void-priority-concurrency.mjs',
), 'utf8').replace(/\r\n/g, '\n');

const wrapperStart = migration.indexOf(
 'CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_vt_launch_lease(',
);
const wrapperEnd = migration.indexOf(
 'REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_launch_lease_with_rotation(',
 wrapperStart,
);
const wrapper = migration.slice(wrapperStart, wrapperEnd);
const supersedeStart = wrapper.indexOf('UPDATE public.pos_fiuu_vt_attempts');
const supersedeEnd = wrapper.indexOf('GET DIAGNOSTICS v_superseded_status_count', supersedeStart);
const supersede = wrapper.slice(supersedeStart, supersedeEnd);

describe('Fiuu VT explicit VOID priority migration', () => {
 it('relaxes uniqueness only for an explicitly superseded STATUS identity', () => {
  expect(migration).toContain('superseded_at TIMESTAMPTZ');
  expect(migration).toContain('superseded_by_attempt_id UUID');
  expect(migration).toContain("supersession_reason = 'VOID_REQUESTED'");
  expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
  expect(migration).toContain(
   'CREATE UNIQUE INDEX idx_pos_fiuu_vt_attempts_one_active_operation',
  );
  expect(migration).toContain(
   'CREATE UNIQUE INDEX idx_pos_fiuu_vt_attempts_one_active_reconciliation',
  );
  expect(migration.match(/AND superseded_at IS NULL;/g)?.length ?? 0)
   .toBeGreaterThanOrEqual(2);
 });

 it('keeps every index exemption terminal, non-self-referential and bound to a matching VOID', () => {
  expect(migration).toContain('AND superseded_by_attempt_id <> id');
  expect(migration).toContain(
   "AND state IN ('EXPIRED', 'RECEIVED', 'CONSUMED', 'QUARANTINED')",
  );
  expect(migration).toContain(
   'CREATE OR REPLACE FUNCTION public.enforce_pos_fiuu_vt_attempt_supersession()',
  );
  expect(migration).toContain(
   "v_target_payment_id IS DISTINCT FROM NEW.payment_id",
  );
  expect(migration).toContain("v_target_op_type IS DISTINCT FROM 'VOID'");
  expect(migration).toContain(
   'CREATE CONSTRAINT TRIGGER enforce_pos_fiuu_vt_attempt_supersession',
  );
  expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
 });

 it('executes deferred invariants and malformed-target cases with triggers enabled', () => {
  const origin = integrationTest.indexOf(
   'SET LOCAL session_replication_role = origin;',
  );
  const supersession = integrationTest.indexOf(
   'v_result := public.claim_pos_fiuu_vt_launch_lease(',
  );
  expect(origin).toBeGreaterThan(-1);
  expect(supersession).toBeGreaterThan(origin);
  expect(integrationTest).toContain(
   'enforce_pos_fiuu_vt_attempt_supersession IMMEDIATE;',
  );
  expect(integrationTest).toContain(
   'Missing supersession target unexpectedly passed',
  );
  expect(integrationTest).toContain(
   'Cross-payment supersession target unexpectedly passed',
  );
  expect(integrationTest).toContain(
   'Non-VOID supersession target unexpectedly passed',
  );
  expect(integrationTest).toContain(
   "v_constraint_name IS DISTINCT FROM 'pos_fiuu_vt_attempts_pkey'",
  );
 });

 it('covers the decisive two-connection race orderings', () => {
  expect(concurrencyTest).toContain('Promise.all([');
  expect(concurrencyTest).toContain(
   'two simultaneous VOID claims: passed',
  );
  expect(concurrencyTest).toContain(
   'callback claim winning before VOID: passed',
  );
  expect(concurrencyTest).toContain(
   'VOID winning before late STATUS=00: passed',
  );
  expect(concurrencyTest).toContain(
   'late success winning release race: passed',
  );
  expect(concurrencyTest).toContain(
   'cashier release winning late-success race: passed',
  );
 });

 it('serializes the payment before superseding callback-free STATUS work', () => {
  const paymentLock = wrapper.indexOf('FROM public.pos_online_payments');
  const lockClause = wrapper.indexOf('FOR UPDATE;', paymentLock);
  expect(wrapperStart).toBeGreaterThan(-1);
  expect(lockClause).toBeGreaterThan(paymentLock);
  expect(supersedeStart).toBeGreaterThan(lockClause);
  expect(wrapper).toContain("p_op_type IN ('STATUS', 'VOID')");
  expect(wrapper).toContain("v_payment.status = 'PENDING'");
  expect(wrapper).toContain('v_payment.fiuu_vt_cashier_released_at IS NULL');
 });

 it('expires only PREPARED or LAUNCHED STATUS attempts and preserves callback anchors', () => {
  expect(supersede).toContain("AND op_type = 'STATUS'");
  expect(supersede).toContain("AND state IN ('PREPARED', 'LAUNCHED')");
  expect(supersede).toContain('AND provider_order_id = v_payment.provider_order_id');
  expect(supersede).toContain('AND received_at IS NULL');
  expect(supersede).toContain('AND result_fingerprint IS NULL');
  expect(supersede).toContain('AND result_json IS NULL');
  expect(supersede).toContain('AND processing_lease_token IS NULL');
  expect(supersede).toContain('AND processing_lease_expires_at IS NULL');
  expect(supersede).not.toContain('RECEIVED');
  expect(wrapper).not.toMatch(/DELETE\s+FROM\s+public\.pos_fiuu_vt_attempts/i);
  expect(supersede).toContain("SET state = 'EXPIRED'");
  expect(supersede).toContain('superseded_by_attempt_id = p_attempt_id');
 });

 it('refuses to supersede callback-owned or evidence-bearing STATUS work', () => {
  expect(wrapper).toContain('v_blocking_status public.pos_fiuu_vt_attempts%ROWTYPE');
  expect(wrapper).toContain("AND state IN ('PREPARED', 'LAUNCHED', 'RECEIVED')");
  expect(wrapper).toContain("'outcome', 'ACTIVE'");
  expect(wrapper).toContain("'reason', 'STATUS_CALLBACK_EVIDENCE_ACTIVE'");
  expect(wrapper.indexOf("'reason', 'STATUS_CALLBACK_EVIDENCE_ACTIVE'"))
   .toBeLessThan(wrapper.indexOf(
    'v_result := public.claim_pos_fiuu_vt_launch_lease_with_rotation(',
   ));
 });

 it('delegates to the established rotation function and records why VOID won', () => {
  const delegate = wrapper.indexOf(
   'v_result := public.claim_pos_fiuu_vt_launch_lease_with_rotation(',
  );
  expect(delegate).toBeGreaterThan(supersedeEnd);
  expect(wrapper).toContain("v_result->>'outcome' IS DISTINCT FROM 'LAUNCH'");
  expect(wrapper).toContain("'reason', 'STATUS_SUPERSEDED_BY_VOID'");
  expect(wrapper).toContain("'superseded_status_count', v_superseded_status_count");
 });

 it('rolls back supersession unless the exact replacement VOID is created', () => {
  expect(wrapper).toContain("v_result->>'outcome' IS DISTINCT FROM 'LAUNCH'");
  expect(wrapper).toContain(
   "v_result->'attempt'->>'id' IS DISTINCT FROM lower(p_attempt_id::TEXT)",
  );
  expect(wrapper).toContain("v_result->'attempt'->>'op_type' IS DISTINCT FROM 'VOID'");
  expect(wrapper).toContain(
   "RAISE EXCEPTION 'Fiuu VT VOID supersession did not create the exact replacement attempt'",
  );
 });

 it('retains the payment-scoped STATUS retry budget', () => {
  expect(wrapper).toContain('v_status_retry_budget CONSTANT INTEGER := 3;');
  expect(wrapper).toContain("AND op_type = 'STATUS'");
  expect(wrapper).toContain('v_status_attempt_count >= v_status_retry_budget');
  expect(wrapper).toContain("'reason', 'PAYMENT_EXPIRED'");
  expect(wrapper).toContain("'reason', 'STATUS_ATTEMPT_BUDGET_EXHAUSTED'");
 });

 it('keeps the rotation implementation private and exposes only the guarded RPC', () => {
  expect(migration).toContain(
   ') FROM PUBLIC, anon, authenticated, service_role;',
  );
  expect(migration).toContain(
   'GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_launch_lease(',
  );
  expect(migration).toContain(') TO service_role;');
 });
});
