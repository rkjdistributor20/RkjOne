import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
 process.cwd(),
 'supabase/migrations/20261027120000_harden_fiuu_vt_br001_pilot.sql',
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
