import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MIGRATION_URL = new URL(
 '../../supabase/migrations/20261103120000_fiuu_opa_branch_rollout.sql',
 import.meta.url,
);
const migration = readFileSync(fileURLToPath(MIGRATION_URL), 'utf8').replace(/\r\n/g, '\n');
const executableSql = stripSqlComments(migration);
const CANONICAL_BRANCH_SQL_REGEX = '^BR(00[1-9]|0[12][0-9]|03[0-6])$';

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
 if (start < 0) throw new Error(`Function public.${name} is missing from the rollout migration`);

 const tail = migration.slice(start);
 const endMatch = /\n\$\$;\s*/.exec(tail);
 if (!endMatch) throw new Error(`Function public.${name} has no complete body`);
 return tail.slice(0, endMatch.index + endMatch[0].length);
}

function triggerSection(name: string) {
 const pattern = new RegExp(
  `CREATE\\s+TRIGGER\\s+${escapeRegex(name)}[\\s\\S]*?;`,
  'i',
 );
 const match = pattern.exec(executableSql);
 if (!match) throw new Error(`Trigger ${name} is missing from the rollout migration`);
 return match[0];
}

function providerPredicateSection(sql: string, provider: string) {
 const startPattern = new RegExp(
  `payment\\.provider\\s*=\\s*'${escapeRegex(provider)}'`,
  'i',
 );
 const startMatch = startPattern.exec(sql);
 if (!startMatch) throw new Error(`No payment.provider = '${provider}' predicate found`);

 const tail = sql.slice(startMatch.index);
 const nextProvider = /payment\.provider\s*(?:=|<>|IN\s*\()/i.exec(
  tail.slice(startMatch[0].length),
 );
 const end = nextProvider
  ? startMatch[0].length + nextProvider.index
  : tail.length;
 return tail.slice(0, end);
}

function expectRecoverableFiuuPaymentsBlocked(sql: string, context: string) {
 const fiuuPredicate = providerPredicateSection(stripSqlComments(sql), 'fiuu');
 expect(fiuuPredicate, `${context} must block unresolved PENDING payments`).toMatch(/\bPENDING\b/i);
 expect(fiuuPredicate, `${context} must block unresolved REPORTED payments`).toMatch(/\bREPORTED\b/i);
 expect(fiuuPredicate, `${context} must block recoverable EXPIRED payments`).toMatch(/\bEXPIRED\b/i);
 expect(fiuuPredicate, `${context} must preserve the bounded EXPIRED recovery window`).toMatch(
  /expires_at\s*\+\s*INTERVAL\s*'20 minutes'\s*>\s*now\(\)/i,
 );
}

function indexOfOrFail(sql: string, pattern: RegExp, label: string) {
 const index = pattern.exec(sql)?.index ?? -1;
 expect(index, `${label} is missing`).toBeGreaterThanOrEqual(0);
 return index;
}

describe('Fiuu OPA branch rollout migration contract', () => {
 it('is fail-closed and does not seed or activate any rollout row', () => {
  expect(executableSql).toMatch(
   /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'DRAFT'/i,
  );
  expect(executableSql).toMatch(
   /TG_OP\s*=\s*'INSERT'[\s\S]*?NEW\.status\s+IS\s+DISTINCT\s+FROM\s+'DRAFT'/i,
  );
  expect(executableSql).not.toMatch(
   /INSERT\s+INTO\s+public\.pos_fiuu_opa_branch_rollouts\b/i,
  );
  expect(executableSql).not.toMatch(
   /UPDATE\s+public\.pos_fiuu_opa_branch_rollouts[\s\S]{0,300}?SET[\s\S]{0,200}?status\s*=\s*'ACTIVE'/i,
  );
  expect(executableSql).not.toMatch(
   /OPA rollout migration must not seed branch authorization/i,
  );
 });

 it('generalizes only OPA to canonical BR001-BR036 branches', () => {
  const rolloutGuard = functionSection('guard_pos_fiuu_opa_branch_rollout');
  const activeGuard = functionSection('is_pos_fiuu_opa_branch_active');
  for (const section of [
   rolloutGuard,
   activeGuard,
   functionSection('claim_pos_fiuu_opa_inquiry'),
   functionSection('complete_pos_fiuu_opa_inquiry'),
   functionSection('report_pos_fiuu_payment'),
   functionSection('fulfill_pos_fiuu_payment'),
   functionSection('report_pos_fiuu_opa_inquiry_success'),
  ]) {
   expect(section).toContain(CANONICAL_BRANCH_SQL_REGEX);
  }

  expect(activeGuard).toMatch(/rollout\.organization_id\s*=\s*p_organization_id/i);
  expect(activeGuard).toMatch(/rollout\.branch_id\s*=\s*p_branch_id/i);
  expect(activeGuard).toMatch(/rollout\.status\s*=\s*'ACTIVE'/i);
  expect(activeGuard).toMatch(/branch\.branch_code\)\)\s*=\s*p_branch_code/i);
 });

 it('does not redefine VT App-to-App or cloudECR authorization boundaries', () => {
  const definedFunctions = Array.from(
   executableSql.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.([a-z0-9_]+)/gi),
   (match) => match[1],
  );
  expect(definedFunctions.filter((name) => /fiuu_(?:vt|cloudecr)/i.test(name))).toEqual([]);

  const shiftGuard = functionSection('guard_pos_shift_close_pending_payments');
  expect(shiftGuard).toMatch(
   /payment\.provider\s+IN\s*\(\s*'fiuu_vt'\s*,\s*'fiuu_cloudecr'\s*\)/i,
  );
  expect(shiftGuard).toMatch(/INTERVAL\s*'20 minutes'/i);
 });

 it('binds organization, branch, branch code and application code with SHA-256 at intent creation', () => {
  const functionDefinitions = Array.from(
   executableSql.matchAll(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.[a-z0-9_]+\s*\([\s\S]*?\n\$\$;/gi,
   ),
   (match) => match[0],
  );
  const creationGuard = functionDefinitions.find((section) => (
   /NEW\.provider\s*=\s*'fiuu'/i.test(section)
   && /NEW\.organization_id/i.test(section)
   && /NEW\.branch_id/i.test(section)
   && /NEW\.sale_payload\s*->>\s*'fiuu_branch_code'/i.test(section)
   && /NEW\.sale_payload\s*->>\s*'fiuu_application_code'/i.test(section)
   && /digest\s*\(/i.test(section)
  ));

  expect(
   creationGuard,
   'A database trigger function must bind every new Fiuu OPA intent before provider pre-create',
  ).toBeDefined();
  if (!creationGuard) return;

  const digestInput = /digest\s*\(([\s\S]*?),\s*'sha256'\s*\)/i.exec(creationGuard)?.[1];
  expect(digestInput, 'The intent scope binding must explicitly use SHA-256').toBeDefined();
  if (!digestInput) return;
  expect(digestInput).toMatch(/NEW\.organization_id/i);
  expect(digestInput).toMatch(/NEW\.branch_id/i);
  expect(digestInput).toMatch(/NEW\.sale_payload\s*->>\s*'fiuu_branch_code'/i);
  expect(digestInput).toMatch(/NEW\.sale_payload\s*->>\s*'fiuu_application_code'/i);
  expect(creationGuard).toMatch(/extensions\.digest\s*\(/i);

  const storesDatabaseBinding = (
   /NEW\.sale_payload\s*:=\s*jsonb_set\([\s\S]*?encode\s*\(\s*extensions\.digest\s*\(/i.test(creationGuard)
   || /NEW\.[a-z0-9_]*(?:binding|sha256)[a-z0-9_]*\s*:=\s*encode\s*\(\s*extensions\.digest\s*\(/i.test(creationGuard)
  );
  expect(
   storesDatabaseBinding,
   'The database must persist the creation-time SHA-256 binding, not merely calculate it',
  ).toBe(true);

  const creationTrigger = Array.from(
   executableSql.matchAll(/CREATE\s+TRIGGER\s+[a-z0-9_]+[\s\S]*?;/gi),
   (match) => match[0],
  ).find((section) => (
   /BEFORE\s+INSERT/i.test(section)
   && /ON\s+public\.pos_online_payments/i.test(section)
   && /EXECUTE\s+FUNCTION/i.test(section)
  ));
  expect(
   creationTrigger,
   'The OPA scope-binding trigger must execute before payment-intent insertion',
  ).toBeDefined();
 });

 it('rejects unresolved OPA payments before any schema mutation', () => {
  const firstSchemaMutation = indexOfOrFail(
   executableSql,
   /CREATE\s+(?:UNIQUE\s+)?INDEX|CREATE\s+TABLE|ALTER\s+TABLE/i,
   'First schema mutation',
  );
  expectRecoverableFiuuPaymentsBlocked(
   executableSql.slice(0, firstSchemaMutation),
   'Migration preflight',
  );
 });

 it('rejects unresolved OPA payments before revocation and shift closure', () => {
  expectRecoverableFiuuPaymentsBlocked(
   functionSection('guard_pos_fiuu_opa_branch_rollout'),
   'Rollout revocation',
  );
  expectRecoverableFiuuPaymentsBlocked(
   functionSection('guard_pos_shift_close_pending_payments'),
   'Shift closure',
  );
 });

 it('permits validated PAID and REPORTED replay after revocation but gates new transitions on ACTIVE', () => {
  const report = stripSqlComments(functionSection('report_pos_fiuu_payment'));
  const reportEvidence = indexOfOrFail(
   report,
   /Fiuu signed payment evidence is invalid/i,
   'Signed evidence validation',
  );
  const paidReplay = indexOfOrFail(
   report,
   /IF\s+v_payment\.status\s*=\s*'PAID'/i,
   'PAID report replay',
  );
  const reportedReplay = indexOfOrFail(
   report,
   /IF\s+v_payment\.status\s*=\s*'REPORTED'/i,
   'REPORTED report replay',
  );
  const reportActiveGate = indexOfOrFail(
   report,
   /public\.is_pos_fiuu_opa_branch_active\s*\(/i,
   'Report ACTIVE gate',
  );
  const reportTransition = indexOfOrFail(
   report,
   /UPDATE\s+public\.pos_online_payments\s+SET\s+status\s*=\s*'REPORTED'/i,
   'PENDING or EXPIRED to REPORTED transition',
  );
  expect(reportEvidence).toBeLessThan(paidReplay);
  expect(paidReplay).toBeLessThan(reportActiveGate);
  expect(reportedReplay).toBeLessThan(reportActiveGate);
  expect(reportActiveGate).toBeLessThan(reportTransition);

  const fulfill = stripSqlComments(functionSection('fulfill_pos_fiuu_payment'));
  const fulfillReplay = indexOfOrFail(
   fulfill,
   /IF\s+v_payment\.status\s*=\s*'PAID'/i,
   'PAID fulfilment replay',
  );
  const fulfillActiveGate = indexOfOrFail(
   fulfill,
   /public\.is_pos_fiuu_opa_branch_active\s*\(/i,
   'Fulfilment ACTIVE gate',
  );
  const saleTransition = indexOfOrFail(
   fulfill,
   /public\.process_pos_sale_internal\s*\(/i,
   'REPORTED to PAID sale transition',
  );
  expect(fulfillReplay).toBeLessThan(fulfillActiveGate);
  expect(fulfillActiveGate).toBeLessThan(saleTransition);

  const claim = stripSqlComments(functionSection('claim_pos_fiuu_opa_inquiry'));
  expect(indexOfOrFail(claim, /is_pos_fiuu_opa_branch_active\s*\(/i, 'Claim ACTIVE gate'))
   .toBeLessThan(indexOfOrFail(
    claim,
    /INSERT\s+INTO\s+public\.pos_fiuu_opa_reconciliation_attempts/i,
    'New reconciliation claim',
   ));
 });

 it('returns organization scope in every inquiry claim', () => {
  const claim = functionSection('claim_pos_fiuu_opa_inquiry');
  expect(claim).toMatch(
   /RETURN\s+jsonb_build_object\([\s\S]*?'organization_id'\s*,\s*v_payment\.organization_id/i,
  );
  expect(claim).toMatch(/'branch_id'\s*,\s*v_payment\.branch_id/i);
 });

 it('protects receipt uniqueness with a precondition before a partial unique index', () => {
  const duplicateAudit = indexOfOrFail(
   executableSql,
   /FROM\s+public\.pos_receipts[\s\S]*?WHERE\s+receipt\.transaction_id\s+IS\s+NOT\s+NULL[\s\S]*?GROUP\s+BY\s+receipt\.transaction_id[\s\S]*?HAVING\s+count\(\*\)\s*>\s*1/i,
   'Duplicate receipt precondition',
  );
  const uniqueIndex = indexOfOrFail(
   executableSql,
   /CREATE\s+UNIQUE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+uq_pos_receipts_one_per_transaction\s+ON\s+public\.pos_receipts\s*\(\s*transaction_id\s*\)\s+WHERE\s+transaction_id\s+IS\s+NOT\s+NULL/i,
   'Receipt transaction unique index',
  );
  expect(duplicateAudit).toBeLessThan(uniqueIndex);
 });

 it('restricts every explicit grant to service_role', () => {
  const grants = Array.from(executableSql.matchAll(/\bGRANT\b[\s\S]*?;/gi), (match) => match[0]);
  expect(grants.length).toBeGreaterThan(0);
  for (const grant of grants) {
   expect(grant).toMatch(/\bTO\s+service_role\s*;/i);
   expect(grant).not.toMatch(/\bTO\s+(?:PUBLIC|anon|authenticated)\b/i);
  }
  expect(executableSql).toMatch(
   /ALTER\s+TABLE\s+public\.pos_fiuu_opa_branch_rollouts\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
  );
 });

 it('is replay-safe and detects table, index and trigger drift', () => {
  const replaySafeTable = (
   /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.pos_fiuu_opa_branch_rollouts/i.test(executableSql)
   || /to_regclass\s*\(\s*'public\.pos_fiuu_opa_branch_rollouts'/i.test(executableSql)
  );
  expect(replaySafeTable, 'Rollout table creation must be replay-aware').toBe(true);
  expect(executableSql).toMatch(
   /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_pos_receipts_one_per_transaction/i,
  );
  expect(executableSql).toMatch(/pg_catalog\.pg_index/i);
  expect(executableSql).toMatch(/\bindisunique\b/i);
  expect(executableSql).toMatch(/\bindisvalid\b/i);
  expect(executableSql).toMatch(
   /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_pos_fiuu_opa_branch_rollouts_current[\s\S]*?WHERE\s+status\s*<>\s*'REVOKED'/i,
  );
  expect(executableSql).not.toMatch(
   /IF\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.pos_fiuu_opa_branch_rollouts\s*\)\s*THEN/i,
  );

  const rolloutTriggerReplay = (
   /DROP\s+TRIGGER\s+IF\s+EXISTS\s+guard_pos_fiuu_opa_branch_rollout/i.test(executableSql)
   || /pg_catalog\.pg_trigger[\s\S]*?guard_pos_fiuu_opa_branch_rollout/i.test(executableSql)
  );
  expect(rolloutTriggerReplay, 'Rollout trigger creation must be replay-aware').toBe(true);

  const shiftTriggerDriftCheck = migration.slice(
   migration.lastIndexOf('-- Do not silently repair'),
  );
  expect(shiftTriggerDriftCheck).toMatch(/pg_catalog\.pg_trigger/i);
  expect(shiftTriggerDriftCheck).toMatch(
   /trigger_row\.tgenabled\s+IN\s*\(\s*'O'\s*,\s*'A'\s*\)/i,
  );
 });

 it('casts pg_attribute names before comparing catalog column arrays', () => {
  const catalogColumnArrays = Array.from(
   executableSql.matchAll(
    /array_agg\s*\(\s*column_row\.attname(::TEXT)?\s+ORDER\s+BY/gi,
   ),
  );
  expect(catalogColumnArrays.length).toBeGreaterThan(0);
  for (const match of catalogColumnArrays) {
   expect(match[1]?.toUpperCase()).toBe('::TEXT');
  }
 });

 it('preserves revoked generations and permits only DRAFT fingerprint correction', () => {
  expect(executableSql).toMatch(
   /PRIMARY\s+KEY\s*\(\s*organization_id\s*,\s*branch_id\s*,\s*application_code_sha256\s*\)/i,
  );
  expect(executableSql).toMatch(
   /NEW\.application_code_sha256\s+IS\s+DISTINCT\s+FROM\s+OLD\.application_code_sha256[\s\S]*?OLD\.status\s*=\s*'DRAFT'[\s\S]*?NEW\.status\s*=\s*'DRAFT'/i,
  );
  expect(executableSql).toMatch(/IF\s+OLD\.status\s*=\s*'REVOKED'[\s\S]*?immutable/i);
  expect(executableSql).not.toMatch(/GRANT[\s\S]*?DELETE[\s\S]*?pos_fiuu_opa_branch_rollouts/i);
 });

 it('keeps the rollout and shift guard triggers attached to the expected tables', () => {
  expect(triggerSection('guard_pos_fiuu_opa_branch_rollout')).toMatch(
   /BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+public\.pos_fiuu_opa_branch_rollouts/i,
  );
  expect(executableSql).toMatch(
   /relation\.relname\s*=\s*'pos_shifts'[\s\S]*?trigger_function\.proname\s*=\s*'guard_pos_shift_close_pending_payments'/i,
  );
 });
});
