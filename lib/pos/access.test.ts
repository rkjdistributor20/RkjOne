import { describe, expect, it } from 'vitest';
import { canRefundPosTransaction, canVoidPosTransaction, requiresActivePosShiftMember } from './access';

describe('POS transaction adjustment permissions', () => {
 it('allows operational management to void but not record provider refunds', () => {
  expect(canVoidPosTransaction('OPERATION_MANAGER')).toBe(true);
  expect(canVoidPosTransaction('AREA_MANAGER')).toBe(true);
  expect(canRefundPosTransaction('OPERATION_MANAGER')).toBe(false);
  expect(canRefundPosTransaction('AREA_MANAGER')).toBe(false);
 });

 it('limits refunds to administrators and Finance', () => {
  expect(canRefundPosTransaction('SUPER_ADMIN')).toBe(true);
  expect(canRefundPosTransaction('ADMIN')).toBe(true);
  expect(canRefundPosTransaction('FINANCE')).toBe(true);
 });

 it('denies transaction adjustments to branch staff and unrelated roles', () => {
  for (const role of ['STAFF', 'DRIVER', 'SALES_AGENT', 'HR', null, undefined]) {
   expect(canVoidPosTransaction(role)).toBe(false);
   expect(canRefundPosTransaction(role)).toBe(false);
  }
 });
});

describe('requiresActivePosShiftMember', () => {
 it('requires active membership for branch staff and area managers', () => {
  expect(requiresActivePosShiftMember('STAFF')).toBe(true);
  expect(requiresActivePosShiftMember('AREA_MANAGER')).toBe(true);
 });

 it('keeps the server management bypass roles aligned', () => {
  expect(requiresActivePosShiftMember('SUPER_ADMIN')).toBe(false);
  expect(requiresActivePosShiftMember('ADMIN')).toBe(false);
  expect(requiresActivePosShiftMember('OPERATION_MANAGER')).toBe(false);
 });
});
