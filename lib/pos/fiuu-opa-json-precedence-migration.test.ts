import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MIGRATION_URL = new URL(
 '../../supabase/migrations/20261104120000_fix_fiuu_opa_json_precedence.sql',
 import.meta.url,
);
const migration = readFileSync(fileURLToPath(MIGRATION_URL), 'utf8').replace(/\r\n/g, '\n');

function stripSqlComments(sql: string) {
 return sql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '');
}

describe('Fiuu OPA JSON precedence repair migration', () => {
 it('repairs every runtime function that hashes a stored OPA mapping', () => {
  for (const signature of [
   'guard_pos_fiuu_opa_payment_identity()',
   'claim_pos_fiuu_opa_inquiry(uuid,uuid,integer)',
   'complete_pos_fiuu_opa_inquiry(uuid,uuid,text,text,jsonb,text)',
   'report_pos_fiuu_payment(uuid,text,numeric,text,text,text,jsonb)',
   'fulfill_pos_fiuu_payment(uuid,text,numeric,text,text)',
   'report_pos_fiuu_opa_inquiry_success(uuid,uuid,text,numeric,text,text,text,jsonb,jsonb)',
  ]) {
   expect(migration).toContain(`'public.${signature}'::REGPROCEDURE`);
  }
 });

 it('rewrites catalog definitions and rejects incomplete or no-op repairs', () => {
  expect(migration).toMatch(/pg_catalog\.pg_get_functiondef\s*\(/i);
  expect(migration).toMatch(/pg_catalog\.regexp_replace\s*\(/i);
  expect(migration).toMatch(/EXECUTE\s+v_fixed_definition/i);
  expect(migration).toMatch(/found no JSON extraction/i);
  expect(migration).toMatch(/left an unparenthesized concatenation/i);
  expect(migration).toMatch(/\$replacement\$\(\x5c1\)\$replacement\$/);
 });

 it('is forward-only schema repair and never mutates rollout or payment data', () => {
  const executableSql = stripSqlComments(migration);

  expect(executableSql.trimStart()).toMatch(/^BEGIN\s*;/i);
  expect(executableSql.trimEnd()).toMatch(/COMMIT\s*;$/i);
  expect(executableSql).not.toMatch(
   /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+public\./i,
  );
  expect(executableSql).not.toMatch(/(?:SECRET|VERIFY)_KEY/i);
  expect(executableSql).not.toMatch(/POS_FIUU_APPLICATIONS_JSON/i);
 });
});
