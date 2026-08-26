import { describe, expect, it } from 'vitest';
import { canRefundPosTransaction, canVoidPosTransaction } from './access';

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
