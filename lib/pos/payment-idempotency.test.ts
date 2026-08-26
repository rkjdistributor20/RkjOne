import { describe, expect, it } from 'vitest';
import {
 createPosPaymentIdempotencyKey,
 isSamePosPaymentIntent,
 isValidPosPaymentIdempotencyKey,
} from './payment-idempotency';

const EXPECTED = {
 branchId: 'branch-1',
 shiftId: 'shift-1',
 createdBy: 'profile-1',
 amountRm: 17,
 salePayload: {
  branchId: 'branch-1',
  items: [{ product_id: 'product-1', quantity: 1 }],
  qr_amount: 17,
 },
};

describe('POS payment idempotency', () => {
 it('accepts a bounded opaque key and rejects malformed values', () => {
  expect(isValidPosPaymentIdempotencyKey('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  expect(isValidPosPaymentIdempotencyKey('short')).toBe(false);
 expect(isValidPosPaymentIdempotencyKey('550e8400 e29b 41d4 a716 446655440000')).toBe(false);
 });

 it('generates a valid opaque key for a new client attempt', () => {
  expect(isValidPosPaymentIdempotencyKey(createPosPaymentIdempotencyKey())).toBe(true);
 });

 it('matches the same intent independently of JSON object key order', () => {
  expect(isSamePosPaymentIntent({
   ...EXPECTED,
   salePayload: {
    qr_amount: 17,
    items: [{ quantity: 1, product_id: 'product-1' }],
    branchId: 'branch-1',
   },
  }, EXPECTED)).toBe(true);
 });

 it.each([
  { branchId: 'branch-2' },
  { shiftId: 'shift-2' },
  { createdBy: 'profile-2' },
  { amountRm: 18 },
  { salePayload: { branchId: 'branch-1', items: [], qr_amount: 17 } },
 ])('rejects a reused key when intent identity changes: %o', (change) => {
  expect(isSamePosPaymentIntent({ ...EXPECTED, ...change }, EXPECTED)).toBe(false);
 });
});
