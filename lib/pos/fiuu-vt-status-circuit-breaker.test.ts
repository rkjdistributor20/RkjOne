import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
 process.cwd(),
 'supabase/migrations/20261123170000_bound_fiuu_vt_status_attempts.sql',
), 'utf8').replace(/\r\n/g, '\n');

const wrapperStart = migration.indexOf(
 'CREATE OR REPLACE FUNCTION public.claim_pos_fiuu_vt_launch_lease(',
);
const wrapperEnd = migration.indexOf(
 'REVOKE ALL ON FUNCTION public.claim_pos_fiuu_vt_launch_lease_with_rotation(',
 wrapperStart,
);
const wrapper = migration.slice(wrapperStart, wrapperEnd);
const attemptCountQuery = wrapper.match(
 /SELECT count\(\*\)::INTEGER INTO v_status_attempt_count[\s\S]*?;/,
)?.[0] ?? '';

describe('Fiuu VT payment-scoped STATUS circuit breaker migration', () => {
 it('wraps rather than replaces the existing callback-rotation implementation', () => {
  expect(migration).toContain(
   ') RENAME TO claim_pos_fiuu_vt_launch_lease_with_rotation;',
  );
  expect(wrapper).toContain(
   'RETURN public.claim_pos_fiuu_vt_launch_lease_with_rotation(',
  );
  expect(wrapper).not.toContain('claim_pos_fiuu_vt_launch_lease_reused_identity(');
 });

 it('serializes the payment-scoped budget before delegating a STATUS launch', () => {
  const paymentLock = wrapper.indexOf('FROM public.pos_online_payments');
  const lockClause = wrapper.indexOf('FOR UPDATE;', paymentLock);
  const attemptCount = wrapper.indexOf('SELECT count(*)::INTEGER', lockClause);
  const delegate = wrapper.indexOf(
   'RETURN public.claim_pos_fiuu_vt_launch_lease_with_rotation(',
  );

  expect(wrapperStart).toBeGreaterThan(-1);
  expect(wrapperEnd).toBeGreaterThan(wrapperStart);
  expect(paymentLock).toBeGreaterThan(-1);
  expect(lockClause).toBeGreaterThan(paymentLock);
  expect(attemptCount).toBeGreaterThan(lockClause);
  expect(delegate).toBeGreaterThan(attemptCount);
 });

 it('counts every STATUS identity, including ABANDONED and EXPIRED rows', () => {
  expect(attemptCountQuery).toContain('FROM public.pos_fiuu_vt_attempts');
  expect(attemptCountQuery).toContain('WHERE payment_id = v_payment.id');
  expect(attemptCountQuery).toContain("AND op_type = 'STATUS'");
  expect(attemptCountQuery).not.toMatch(/\bstate\b/i);
  expect(wrapper).toContain('v_status_retry_budget CONSTANT INTEGER := 3;');
  expect(wrapper).toContain('v_status_attempt_count >= v_status_retry_budget');
 });

 it('fails closed on payment expiry or exhausted budget without mutating attempts', () => {
  expect(wrapper).toContain('v_payment.expires_at <= v_now');
  expect(wrapper).toContain("'reason', 'PAYMENT_EXPIRED'");
  expect(wrapper).toContain("'reason', 'STATUS_ATTEMPT_BUDGET_EXHAUSTED'");
  expect(wrapper.match(/'outcome', 'RETRY_LIMIT'/g)).toHaveLength(2);
  expect(wrapper).not.toMatch(/UPDATE\s+public\.pos_fiuu_vt_attempts/i);
  expect(wrapper).not.toMatch(/DELETE\s+FROM\s+public\.pos_fiuu_vt_attempts/i);
 });

 it('keeps the inner rotation implementation private and exposes only the guard', () => {
  expect(migration).toContain(
   ') FROM PUBLIC, anon, authenticated, service_role;',
  );
  expect(migration).toContain(
   'GRANT EXECUTE ON FUNCTION public.claim_pos_fiuu_vt_launch_lease(',
  );
  expect(migration).toContain(') TO service_role;');
 });
});
