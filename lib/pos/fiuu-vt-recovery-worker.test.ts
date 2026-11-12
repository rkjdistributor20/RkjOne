import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFiuuVtRecoveryBackoffMs } from './fiuu-vt-recovery-worker';

const MIGRATION = readFileSync(
 resolve(process.cwd(), 'supabase/migrations/20261112120000_harden_fiuu_vt_server_recovery.sql'),
 'utf8',
);

describe('Fiuu VT recovery persistence', () => {
 it.each([
  [1, 30_000],
  [2, 60_000],
  [3, 120_000],
  [5, 480_000],
  [6, 900_000],
  [20, 900_000],
 ])('backs off attempt %i by %i ms', (attempt, expected) => {
  expect(getFiuuVtRecoveryBackoffMs(attempt)).toBe(expected);
 });

 it('stores one-time callback attempts behind service-role-only access', () => {
  expect(MIGRATION).toContain('CREATE TABLE IF NOT EXISTS public.pos_fiuu_vt_attempts');
  expect(MIGRATION).toContain("state IN ('PREPARED', 'RECEIVED', 'CONSUMED', 'QUARANTINED', 'EXPIRED')");
  expect(MIGRATION).toContain('result_fingerprint TEXT');
  expect(MIGRATION).toContain('result_json JSONB');
  expect(MIGRATION).toContain('UNIQUE (callback_host)');
  expect(MIGRATION).toContain('idx_pos_fiuu_vt_attempts_one_active_operation');
  expect(MIGRATION).toContain("callback_host ~ '^a-[a-f0-9]{32}\\.fiuu-vt\\.rkj\\.one$'");
  expect(MIGRATION).toContain('ALTER TABLE public.pos_fiuu_vt_attempts ENABLE ROW LEVEL SECURITY');
  expect(MIGRATION).toContain('ALTER TABLE public.pos_fiuu_vt_attempts FORCE ROW LEVEL SECURITY');
  expect(MIGRATION).toContain('FROM PUBLIC, anon, authenticated');
  expect(MIGRATION).toContain('TO service_role');
  expect(MIGRATION).not.toMatch(/CREATE\s+POLICY[^;]*pos_fiuu_vt_attempts/i);
 });

 it('keeps review-required payments inside both active-payment uniqueness gates', () => {
  const actorIndex = MIGRATION.match(
   /CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_actor_shift[\s\S]*?;/,
  )?.[0];
  const deviceIndex = MIGRATION.match(
   /CREATE UNIQUE INDEX idx_pos_online_payments_one_pending_fiuu_device[\s\S]*?;/,
  )?.[0];

  expect(actorIndex).toContain('OR fiuu_vt_review_required');
  expect(deviceIndex).toContain('OR fiuu_vt_review_required');
 });

 it('stores review evidence separately and clears it only after successful fulfillment', () => {
  expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS fiuu_vt_review_evidence JSONB');
  expect(MIGRATION).toContain('fiuu_vt_review_evidence IS NULL');
  expect(MIGRATION).toContain("jsonb_typeof(fiuu_vt_review_evidence) = 'object'");

  const fulfillmentUpdate = MIGRATION.match(
   /UPDATE public\.pos_online_payments\s+SET status = 'PAID'[\s\S]*?RETURN v_result;/,
  )?.[0];
  expect(fulfillmentUpdate).toContain('provider_result = p_provider_result');
  expect(fulfillmentUpdate).toContain('fiuu_vt_review_evidence = NULL');
 });
});
