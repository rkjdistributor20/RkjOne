import { afterEach, describe, expect, it } from 'vitest';
import {
 FIUU_OPA_PILOT_BRANCH,
 getFiuuOpaPilotBranches,
 isFiuuOpaEnabledForBranch,
} from './fiuu-opa-server';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
 process.env = { ...ORIGINAL_ENV };
});

describe('Fiuu OPA pilot guard', () => {
 it('fails closed when the OPA allowlist is not configured', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  delete process.env.POS_FIUU_OPA_BRANCHES;

  expect([...getFiuuOpaPilotBranches()]).toEqual([]);
  expect(isFiuuOpaEnabledForBranch(FIUU_OPA_PILOT_BRANCH)).toBe(false);
 });

 it('allows only BR001 while OPA mode is active', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_OPA_BRANCHES = ' br001 ';

  expect([...getFiuuOpaPilotBranches()]).toEqual(['BR001']);
  expect(isFiuuOpaEnabledForBranch('br001')).toBe(true);
  expect(isFiuuOpaEnabledForBranch('BR002')).toBe(false);
  expect(isFiuuOpaEnabledForBranch('not-a-branch')).toBe(false);
 });

 it('does not enable BR001 while another payment mode is active', () => {
  process.env.POS_QR_PAYMENT_MODE = 'manual';
  process.env.POS_FIUU_OPA_BRANCHES = 'BR001';

  expect(isFiuuOpaEnabledForBranch('BR001')).toBe(false);
 });

 it.each(['*', 'ALL', 'BR01', 'BR0001', 'BR001,', ',BR001', 'BR001,,BR001'])(
  'rejects wildcard or malformed allowlist value %s',
  (allowlist) => {
   process.env.POS_FIUU_OPA_BRANCHES = allowlist;
   expect(() => getFiuuOpaPilotBranches()).toThrow('Kod cawangan pilot Fiuu OPA tidak sah');
  },
 );

 it.each(['BR002', 'BR001,BR002'])(
  'rejects non-BR001 allowlist value %s',
  (allowlist) => {
   process.env.POS_FIUU_OPA_BRANCHES = allowlist;
   expect(() => getFiuuOpaPilotBranches()).toThrow('dikunci kepada BR001');
  },
 );
});
