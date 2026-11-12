import { describe, expect, it } from 'vitest';
import {
 posPaymentFingerprint,
 posPaymentFingerprintFromSalePayload,
} from './payment-fingerprint';

const basePayload = {
 branchId: '11111111-1111-4111-8111-111111111111',
 shiftId: '22222222-2222-4222-8222-222222222222',
 items: [
  { product_id: 'PRODUCT-B', quantity: 2 },
  { product_id: 'PRODUCT-A', quantity: 1 },
 ],
 payment_method: 'QR' as const,
 cash_amount: 0,
 qr_amount: 10,
};

describe('POS payment fingerprint', () => {
 it('is stable across item ordering and provider money formatting', () => {
  const first = posPaymentFingerprint(basePayload);
  const second = posPaymentFingerprint({
   ...basePayload,
   items: [...basePayload.items].reverse(),
   qr_amount: 10.0001,
  });

  expect(second).toBe(first);
 });

 it('does not treat a different cart with the same total as the paid cart', () => {
  const original = posPaymentFingerprint(basePayload);
  const differentCart = posPaymentFingerprint({
   ...basePayload,
   items: [{ product_id: 'PRODUCT-C', quantity: 1 }],
  });

  expect(differentCart).not.toBe(original);
 });

 it('reconstructs the exact fingerprint from the server-owned sale payload', () => {
  expect(posPaymentFingerprintFromSalePayload(basePayload)).toBe(
   posPaymentFingerprint(basePayload),
  );
 });

 it('rejects malformed or incomplete sale payloads', () => {
  expect(posPaymentFingerprintFromSalePayload(null)).toBeNull();
  expect(posPaymentFingerprintFromSalePayload({ ...basePayload, items: [] })).toBeNull();
  expect(posPaymentFingerprintFromSalePayload({
   ...basePayload,
   items: [{ product_id: 'PRODUCT-A', quantity: 0 }],
  })).toBeNull();
  expect(posPaymentFingerprintFromSalePayload({
   ...basePayload,
   payment_method: 'CARD',
  })).toBeNull();
 });
});
