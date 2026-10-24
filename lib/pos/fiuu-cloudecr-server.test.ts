import { afterEach, describe, expect, it } from 'vitest';
import {
 getFiuuCloudEcrPilotBranches,
 getFiuuCloudEcrValiditySeconds,
 isFiuuCloudEcrEnabledForBranch,
} from './fiuu-cloudecr-server';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
 process.env = { ...ORIGINAL_ENV };
});

describe('Fiuu cloudECR pilot guard', () => {
 it('allows only BR001 while cloudECR mode is active', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu_cloudecr';
  process.env.POS_FIUU_CLOUDECR_BRANCHES = 'br001';

  expect([...getFiuuCloudEcrPilotBranches()]).toEqual(['BR001']);
  expect(isFiuuCloudEcrEnabledForBranch('br001')).toBe(true);
  expect(isFiuuCloudEcrEnabledForBranch('BR002')).toBe(false);
 });

 it('does not enable a listed branch while another payment mode is active', () => {
  process.env.POS_QR_PAYMENT_MODE = 'manual';
  process.env.POS_FIUU_CLOUDECR_BRANCHES = 'BR001';

  expect(isFiuuCloudEcrEnabledForBranch('BR001')).toBe(false);
 });

 it('rejects wildcard or malformed rollout values', () => {
  process.env.POS_FIUU_CLOUDECR_BRANCHES = 'BR001,ALL';
  expect(() => getFiuuCloudEcrPilotBranches()).toThrow('Kod cawangan pilot');
 });

 it('rejects any non-BR001 branch even when explicitly listed', () => {
  process.env.POS_FIUU_CLOUDECR_BRANCHES = 'BR001,BR002';
  expect(() => getFiuuCloudEcrPilotBranches()).toThrow('dikunci kepada BR001');
 });

 it('bounds the payment validity window', () => {
  process.env.POS_FIUU_CLOUDECR_VALIDITY_SECONDS = '240';
  expect(getFiuuCloudEcrValiditySeconds()).toBe(240);
  process.env.POS_FIUU_CLOUDECR_VALIDITY_SECONDS = '10';
  expect(getFiuuCloudEcrValiditySeconds()).toBe(180);
 });
});
