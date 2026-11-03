import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MIGRATION_URL = new URL(
 '../../supabase/migrations/20261103123000_harden_fiuu_opa_rollout_organization_gate.sql',
 import.meta.url,
);
const migration = readFileSync(fileURLToPath(MIGRATION_URL), 'utf8').replace(/\r\n/g, '\n');

function stripSqlComments(sql: string) {
 return sql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '');
}

function escapeRegex(value: string) {
 return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function functionSection(name: string) {
 const startPattern = new RegExp(
  `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${escapeRegex(name)}\\s*\\(`,
  'i',
 );
 const start = startPattern.exec(migration)?.index ?? -1;
 if (start < 0) throw new Error(`Function public.${name} is missing from the hardening migration`);

 const tail = migration.slice(start);
 const endMatch = /\n\$\$;\s*/.exec(tail);
 if (!endMatch) throw new Error(`Function public.${name} has no complete body`);
 return stripSqlComments(tail.slice(0, endMatch.index + endMatch[0].length));
}

describe('Fiuu OPA organization-gate hardening migration', () => {
 it('is fail-closed and never seeds or transitions rollout data', () => {
  const executableSql = stripSqlComments(migration);

  expect(executableSql).toMatch(/Fiuu OPA organization-gate prerequisites are missing/i);
  expect(executableSql).not.toMatch(
   /INSERT\s+INTO\s+public\.pos_fiuu_opa_branch_rollouts\b/i,
  );
  expect(executableSql).not.toMatch(
   /UPDATE\s+public\.pos_fiuu_opa_branch_rollouts\b/i,
  );
  expect(executableSql).not.toMatch(
   /DELETE\s+FROM\s+public\.pos_fiuu_opa_branch_rollouts\b/i,
  );
  expect(executableSql).not.toMatch(
   /An ACTIVE Fiuu OPA rollout belongs to an inactive branch or organization/i,
  );
  expect(executableSql).not.toMatch(/\b(SECRET|VERIFY)_KEY\b/i);
 });

 it('locks and requires an active organization before activation', () => {
  const guard = functionSection('guard_pos_fiuu_opa_branch_rollout');

  expect(guard).toMatch(
   /JOIN\s+public\.organizations\s+AS\s+organization[\s\S]*?organization\.id\s*=\s*branch\.organization_id/i,
  );
  expect(guard).toMatch(/FOR\s+SHARE\s+OF\s+branch\s*,\s*organization/i);
  expect(guard).toMatch(
   /NEW\.status\s*=\s*'ACTIVE'[\s\S]*?v_organization_status\s+IS\s+DISTINCT\s+FROM\s+'ACTIVE'/i,
  );
  expect(guard).toMatch(/Fiuu OPA rollout requires an active RKJ organization/i);
  expect(guard).toMatch(/Fiuu OPA rollout requires an active RKJ branch/i);
 });

 it('requires the rollout, branch and organization to all remain active at runtime', () => {
  const activeGate = functionSection('is_pos_fiuu_opa_branch_active');

  expect(activeGate).toMatch(
   /JOIN\s+public\.organizations\s+AS\s+organization[\s\S]*?organization\.id\s*=\s*rollout\.organization_id/i,
  );
  expect(activeGate).toMatch(/rollout\.status\s*=\s*'ACTIVE'/i);
  expect(activeGate).toMatch(/organization\.status::TEXT\s*=\s*'ACTIVE'/i);
  expect(activeGate).toMatch(/branch\.status::TEXT\s*=\s*'ACTIVE'/i);
  expect(activeGate).toMatch(
   /FOR\s+SHARE\s+OF\s+rollout\s*,\s*branch\s*,\s*organization/i,
  );
 });

 it('preserves the issued-intent generation matcher for draining and recovery', () => {
  expect(migration).not.toMatch(
   /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.is_pos_fiuu_opa_branch_rollout_match\s*\(/i,
  );
 });
});
