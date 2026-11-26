import { describe, expect, it } from 'vitest';
import { getManualQrSaleKey } from './manual-qr-sale-key';

describe('manual QR POS retry key', () => {
 it('recognizes the cart ID actually emitted by the POS and reuses the same key', () => {
  const cart = 'cart-1795674000000-a7kp17x8m';
  expect(getManualQrSaleKey('shift-a', cart)).toBe(`manual-qr:shift-a:${cart}`);
  expect(getManualQrSaleKey('shift-b', cart)).not.toBe(getManualQrSaleKey('shift-a', cart));
  expect(getManualQrSaleKey('shift-a', cart)).not.toBe(getManualQrSaleKey('shift-a', 'cart-1795674000000-a7kp17x8n'));
 });

 it('does not confuse an invalid identifier for the same cart', () => {
  expect(getManualQrSaleKey('shift-a', null)).toBeUndefined();
  expect(getManualQrSaleKey('shift-a', 'cart-1795674000000-a7;invalid')).toBeUndefined();
 });
});
