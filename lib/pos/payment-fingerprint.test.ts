import { describe, expect, it } from 'vitest';
import {
 posFiuuVtPaymentFingerprint,
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

 it('does not treat an identical later customer cart as the same cart session', () => {
  const firstCustomer = posPaymentFingerprint({
   ...basePayload,
   cartSessionId: 'cart-customer-1',
  });
  const nextCustomer = posPaymentFingerprint({
   ...basePayload,
   cartSessionId: 'cart-customer-2',
  });

  expect(nextCustomer).not.toBe(firstCustomer);
 });

 it('reconstructs a full Fiuu VT QR fingerprint without relying on the open form method', () => {
  expect(posFiuuVtPaymentFingerprint({
   branchId: basePayload.branchId,
   shiftId: basePayload.shiftId,
   items: basePayload.items,
   total: 10,
   qrAmount: 10,
  })).toBe(posPaymentFingerprint(basePayload));
 });

 it('reconstructs a mixed Fiuu VT fingerprint from the provider amount', () => {
  const mixed = {
   ...basePayload,
   payment_method: 'MIXED' as const,
   cash_amount: 4,
   qr_amount: 6,
  };
  expect(posFiuuVtPaymentFingerprint({
   branchId: mixed.branchId,
   shiftId: mixed.shiftId,
   items: mixed.items,
   total: 10,
   qrAmount: 6,
  })).toBe(posPaymentFingerprint(mixed));
 });

 it('rejects an impossible Fiuu VT amount instead of matching the wrong cart', () => {
  expect(posFiuuVtPaymentFingerprint({
   branchId: basePayload.branchId,
   shiftId: basePayload.shiftId,
   items: basePayload.items,
   total: 10,
   qrAmount: 10.01,
  })).toBeNull();
 });

 it('reconstructs the exact fingerprint from the server-owned sale payload', () => {
  expect(posPaymentFingerprintFromSalePayload(basePayload)).toBe(
   posPaymentFingerprint(basePayload),
  );
 });

 it('reconstructs a session-bound fingerprint from the stored sale payload', () => {
  const clientFingerprint = posPaymentFingerprint({
   ...basePayload,
   cartSessionId: 'cart-customer-1',
  });
  expect(posPaymentFingerprintFromSalePayload({
   ...basePayload,
   cart_session_id: 'cart-customer-1',
  })).toBe(clientFingerprint);
 });

 it.each([
  { total: 2.50, qr: 2.50, cash: 0, method: 'QR' as const },
  { total: 2.50, qr: 1.50, cash: 1, method: 'MIXED' as const },
 ])('matches the submitted $method cart on completion, not a new identical cart', (mode) => {
  const items = [{ product_id: 'ROTI-KAYA', quantity: 1 }];
  const submitted = {
   ...basePayload,
   items,
   payment_method: mode.method,
   cash_amount: mode.cash,
   qr_amount: mode.qr,
   cart_session_id: 'customer-a',
  };
  const live = {
   branchId: submitted.branchId, shiftId: submitted.shiftId,
   items, total: mode.total, qrAmount: mode.qr, cartSessionId: 'customer-a',
  };
  const inFlight = posPaymentFingerprintFromSalePayload(submitted);
  expect(inFlight).toBeTruthy();
  expect(inFlight).not.toBe(posPaymentFingerprint(submitted)); // former bug
  expect(posFiuuVtPaymentFingerprint(live)).toBe(inFlight);
  for (const different of [
   { ...live, cartSessionId: 'customer-b' },
   { ...live, cartSessionId: 'cart-after-reload' },
   { ...live, shiftId: 'next-shift' },
   { ...live, branchId: 'next-branch' },
   { ...live, items: [{ ...items[0], quantity: 2 }], total: 5 },
  ]) {
   expect(posFiuuVtPaymentFingerprint(different)).not.toBe(inFlight);
  }
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
