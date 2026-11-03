import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FiuuOpaConfig, FiuuOpaScope } from './fiuu';
import {
 FIUU_OPA_PILOT_BRANCH,
 getFiuuOpaConfiguredBranches,
 getFiuuOpaPilotBranches,
 isFiuuOpaConfiguredForBranch,
 isFiuuOpaEnabledForBranch,
 isFiuuOpaRolloutActive,
} from './fiuu-opa-server';

const ORIGINAL_ENV = { ...process.env };
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_IDS: Record<string, string> = {
 BR001: '22222222-2222-4222-8222-222222222221',
 BR002: '22222222-2222-4222-8222-222222222222',
 BR036: '22222222-2222-4222-8222-222222222236',
};
const SCOPE: FiuuOpaScope = {
 organizationId: ORGANIZATION_ID,
 branchId: BRANCH_IDS.BR001,
 branchCode: 'br001',
};
const CONFIG: FiuuOpaConfig = {
 applicationCode: 'APP-BR001',
 secretKey: 'secret-BR001',
 storeId: 'STORE-BR001',
 terminalId: 'TERM-BR001',
 credentialVersion: 'cred-BR001',
 channelId: '24',
 environment: 'sandbox',
 precreateUrl: 'https://sandbox-payment.fiuu.com/RMS/API/MOLOPA/precreate.php',
 inquiryUrl: 'https://sandbox-api.fiuu.com/RMS/API/MOLOPA/inquiry.php',
 reversalUrl: 'https://sandbox-api.fiuu.com/RMS/API/MOLOPA/reversal.php',
 validitySeconds: 180,
};

afterEach(() => {
 process.env = { ...ORIGINAL_ENV };
 vi.restoreAllMocks();
});

function configureApplications(...branchCodes: string[]) {
 process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify(Object.fromEntries(
  branchCodes.map((branchCode) => {
   const normalized = branchCode.trim().toUpperCase();
   return [branchCode, {
    organizationId: ORGANIZATION_ID,
    branchId: BRANCH_IDS[normalized] ?? BRANCH_IDS.BR001,
    applicationCode: `APP-${normalized}`,
    secretKey: `secret-${normalized}`,
    storeId: `STORE-${normalized}`,
    terminalId: `TERM-${normalized}`,
    credentialVersion: `cred-${normalized}`,
   }];
  }),
 ));
}

function scope(branchCode: string): FiuuOpaScope {
 const normalized = branchCode.trim().toUpperCase();
 return {
  organizationId: ORGANIZATION_ID,
  branchId: BRANCH_IDS[normalized] ?? BRANCH_IDS.BR001,
  branchCode,
 };
}

function configureRollout() {
 process.env.POS_QR_PAYMENT_MODE = 'fiuu';
 process.env.POS_FIUU_ENVIRONMENT = 'sandbox';
 process.env.POS_FIUU_OPA_BRANCHES = 'BR001';
 configureApplications('BR001');
}

function serviceWithRpc(result: { data: unknown; error: unknown }) {
 const rpc = vi.fn().mockResolvedValue(result);
 return {
  rpc,
  service: { rpc } as unknown as SupabaseClient,
 };
}

describe('Fiuu OPA explicit branch guard', () => {
 it('fails closed when the OPA allowlist is not configured', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  delete process.env.POS_FIUU_OPA_BRANCHES;

  expect([...getFiuuOpaPilotBranches()]).toEqual([]);
  expect(isFiuuOpaEnabledForBranch(scope(FIUU_OPA_PILOT_BRANCH))).toBe(false);
 });

 it('normalizes, de-duplicates and enables configured BR001 and BR036', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_OPA_BRANCHES = ' br001, BR036,br001 ';
  configureApplications('br001', 'BR036');

  expect([...getFiuuOpaPilotBranches()]).toEqual(['BR001', 'BR036']);
  expect(getFiuuOpaConfiguredBranches()).toEqual(['BR001', 'BR036']);
  expect(isFiuuOpaEnabledForBranch(scope('br001'))).toBe(true);
  expect(isFiuuOpaEnabledForBranch(scope(' BR036 '))).toBe(true);
  expect(isFiuuOpaEnabledForBranch(scope('BR002'))).toBe(false);
  expect(isFiuuOpaEnabledForBranch(scope('not-a-branch'))).toBe(false);
 });

 it('keeps configured callbacks available while another payment mode is active', () => {
  process.env.POS_QR_PAYMENT_MODE = 'manual';
  process.env.POS_FIUU_OPA_BRANCHES = 'BR001';
  configureApplications('BR001');

  expect(isFiuuOpaEnabledForBranch(scope('BR001'))).toBe(false);
  expect(isFiuuOpaConfiguredForBranch(scope('BR001'))).toBe(true);
 });

 it('fails every allowlisted branch closed when any per-branch mapping is missing', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_OPA_BRANCHES = 'BR001,BR036';
  configureApplications('BR001');

  expect(() => getFiuuOpaConfiguredBranches()).toThrow('Pemetaan Fiuu OPA BR036 tiada');
  expect(() => isFiuuOpaEnabledForBranch(scope('BR001'))).toThrow('Pemetaan Fiuu OPA BR036 tiada');
  expect(() => isFiuuOpaConfiguredForBranch(scope('BR001'))).toThrow('Pemetaan Fiuu OPA BR036 tiada');
  expect(() => isFiuuOpaEnabledForBranch(scope('BR036'))).toThrow('Pemetaan Fiuu OPA BR036 tiada');
  expect(() => isFiuuOpaConfiguredForBranch(scope('BR036'))).toThrow('Pemetaan Fiuu OPA BR036 tiada');
 });

 it.each(['*', 'ALL', 'BR01', 'BR0001', 'BR001,', ',BR001', 'BR001,,BR001', 'BR000', 'BR037'])(
  'rejects wildcard or malformed allowlist value %s',
  (allowlist) => {
   process.env.POS_FIUU_OPA_BRANCHES = allowlist;
   expect(() => getFiuuOpaPilotBranches()).toThrow('Kod cawangan pilot Fiuu OPA tidak sah');
  },
 );

 it('fails closed when the per-branch mapping JSON is malformed', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_OPA_BRANCHES = 'BR001';
  process.env.POS_FIUU_APPLICATIONS_JSON = '{not-json';

  expect(() => isFiuuOpaEnabledForBranch(scope('BR001'))).toThrow(
   'POS_FIUU_APPLICATIONS_JSON bukan JSON yang sah',
  );
 });

 it('rejects a mapping key whose whitespace would bypass the real config lookup', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_OPA_BRANCHES = 'BR001';
  configureApplications(' BR001 ');

  expect(() => isFiuuOpaEnabledForBranch(scope('BR001'))).toThrow(
   'Kod pemetaan cawangan Fiuu OPA tidak sah',
  );
 });

 it('rejects a tenant or branch UUID that does not match the mapped target', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_OPA_BRANCHES = 'BR001';
  configureApplications('BR001');

  expect(isFiuuOpaEnabledForBranch({
   ...scope('BR001'),
   organizationId: '99999999-9999-4999-8999-999999999999',
  })).toBe(false);
  expect(isFiuuOpaConfiguredForBranch({
   ...scope('BR001'),
   branchId: '88888888-8888-4888-8888-888888888888',
  })).toBe(false);
 });
});

describe('Fiuu OPA rollout ACTIVE gate', () => {
 it('checks the complete non-secret configuration tuple through the service-role RPC', async () => {
  configureRollout();
  const { rpc, service } = serviceWithRpc({ data: true, error: null });

  await expect(isFiuuOpaRolloutActive(service, SCOPE, CONFIG)).resolves.toBe(true);
  expect(rpc).toHaveBeenCalledWith('is_pos_fiuu_opa_branch_active', {
   p_organization_id: ORGANIZATION_ID,
   p_branch_id: BRANCH_IDS.BR001,
   p_branch_code: 'BR001',
   p_environment: 'sandbox',
   p_application_code: 'APP-BR001',
   p_store_id: 'STORE-BR001',
   p_terminal_id: 'TERM-BR001',
   p_credential_version: 'cred-BR001',
  });
  expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('secretKey');
  expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_secret_key');
 });

 it.each([
  { data: false, error: null },
  { data: null, error: null },
  { data: true, error: { message: 'RPC unavailable' } },
 ])('fails closed for a missing, false, or errored ACTIVE decision', async (result) => {
  configureRollout();
  const { service } = serviceWithRpc(result);

  await expect(isFiuuOpaRolloutActive(service, SCOPE, CONFIG)).resolves.toBe(false);
 });

 it('does not call the rollout RPC when the tenant and branch mapping does not match', async () => {
  configureRollout();
  const { rpc, service } = serviceWithRpc({ data: true, error: null });

  await expect(isFiuuOpaRolloutActive(service, {
   ...SCOPE,
   branchId: BRANCH_IDS.BR002,
  }, CONFIG)).resolves.toBe(false);
  expect(rpc).not.toHaveBeenCalled();
 });
});
