import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(
 process.cwd(),
 'supabase/migrations/20261124130000_add_fiuu_vt_recovery_heartbeat.sql',
), 'utf8');

describe('Fiuu VT recovery heartbeat migration security contract', () => {
 it('forces RLS and grants the store only to service_role', () => {
  expect(sql).toContain(
   'ALTER TABLE public.pos_fiuu_vt_recovery_heartbeat FORCE ROW LEVEL SECURITY',
  );
  expect(sql).toContain(
   'REVOKE ALL ON TABLE public.pos_fiuu_vt_recovery_heartbeat FROM PUBLIC',
  );
  expect(sql).toContain(
   'REVOKE ALL ON TABLE public.pos_fiuu_vt_recovery_heartbeat FROM anon',
  );
  expect(sql).toContain(
   'REVOKE ALL ON TABLE public.pos_fiuu_vt_recovery_heartbeat FROM authenticated',
  );
  expect(sql).toContain(
   'GRANT SELECT, INSERT, UPDATE ON TABLE public.pos_fiuu_vt_recovery_heartbeat TO service_role',
  );
 });

 it('exposes only service-role RPC execution and bounds the freshness window', () => {
  for (const role of ['PUBLIC', 'anon', 'authenticated']) {
   expect(sql).toContain(
    `REVOKE ALL ON FUNCTION public.record_pos_fiuu_vt_recovery_success() FROM ${role}`,
   );
   expect(sql).toContain(
    `REVOKE ALL ON FUNCTION public.has_recent_pos_fiuu_vt_recovery_success(INTEGER) FROM ${role}`,
   );
  }
  expect(sql).toContain(
   'GRANT EXECUTE ON FUNCTION public.record_pos_fiuu_vt_recovery_success() TO service_role',
  );
  expect(sql).toContain(
   'GRANT EXECUTE ON FUNCTION public.has_recent_pos_fiuu_vt_recovery_success(INTEGER) TO service_role',
  );
  expect(sql).toContain('p_max_age_seconds < 30');
  expect(sql).toContain('p_max_age_seconds > 600');
 });

 it('stores only operational timestamps and no secret material', () => {
  const tableDefinition = sql.match(
   /CREATE TABLE IF NOT EXISTS public\.pos_fiuu_vt_recovery_heartbeat \([\s\S]*?\n\);/,
  )?.[0] ?? '';

  expect(tableDefinition).toContain('last_success_at TIMESTAMPTZ NOT NULL');
  expect(tableDefinition).not.toMatch(/secret|token|authorization|credential/i);
 });
});
