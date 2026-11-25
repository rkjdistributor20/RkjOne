import { describe, expect, it } from 'vitest';
import type { Product } from '@/types/database';
import { posPreCheckoutDraftKey, readPosPreCheckoutDraft, retirePosPreCheckoutDraft, writePosPreCheckoutDraft } from './pre-checkout-draft';

const scope = { organizationId: 'rkj', branchId: 'br001', deviceId: 'tablet-1', enrollmentGeneration: 1,
 shiftId: 'shift-1', staffId: 'staff-1' };
const product = { id: 'butter', sku: 'RB', name: 'Kaya Butter', category: 'Roti Kaya', price: 3.5 } as Product;
const cart = [{ productId: product.id, sku: product.sku, name: product.name,
 category: product.category, price: 3.5, quantity: 1 }];
const key = posPreCheckoutDraftKey(scope);
const NOW = 1_795_600_000_000;

function storageFixture() {
 const data = new Map<string, string>();
 return {
  getItem: (id: string) => data.get(id) ?? null,
  setItem: (id: string, value: string) => { data.set(id, value); },
  removeItem: (id: string) => { data.delete(id); },
 };
}

describe('pre-checkout drafts for an enrolled POS', () => {
 it('restores a draft after reopening with the same identity, quantities, and authoritative product data', () => {
  const storage = storageFixture();
  writePosPreCheckoutDraft(storage, key, { cartSessionId: 'cart-new', cart }, NOW);
  expect(JSON.parse(storage.getItem(key)!)).toEqual({
   cartSessionId: 'cart-new', savedAt: NOW, lines: [{ id: 'butter', qty: 1 }],
  });
  expect(readPosPreCheckoutDraft(storage, key, [product], NOW + 10_000))
   .toEqual({ cartSessionId: 'cart-new', cart });
  expect(readPosPreCheckoutDraft(storage, key, [{ ...product, price: 4 }], NOW)?.cart[0].price).toBe(4);
 });

 it('never recovers a previous checkout but allows an identical new order with a different cart ID', () => {
  const storage = storageFixture();
  writePosPreCheckoutDraft(storage, key, { cartSessionId: 'cart-paid', cart }, NOW);
  retirePosPreCheckoutDraft(storage, key); // required before any checkout
  expect(readPosPreCheckoutDraft(storage, key, [product], NOW)).toBeNull();
  writePosPreCheckoutDraft(storage, key, { cartSessionId: 'cart-new', cart }, NOW);
  expect(readPosPreCheckoutDraft(storage, key, [product], NOW))
   .toEqual({ cartSessionId: 'cart-new', cart });
 });

 it('isolates staff, branch, shift, tablet and enrollment and does not recover stale or corrupt data', () => {
  const storage = storageFixture();
  writePosPreCheckoutDraft(storage, key, { cartSessionId: 'cart-ok', cart }, NOW);
  for (const change of [{ staffId: 'different' }, { deviceId: 'different' },
   { enrollmentGeneration: 2 }, { branchId: 'br002' }, { shiftId: 'different' }, { organizationId: 'different' }]) {
   expect(readPosPreCheckoutDraft(storage, posPreCheckoutDraftKey({ ...scope, ...change }), [product], NOW))
    .toBeNull();
  }
  expect(readPosPreCheckoutDraft(storage, key, [product], NOW + 86_400_001)).toBeNull();
  expect(readPosPreCheckoutDraft(storage, key, [], NOW)).toBeNull();
  storage.setItem(key, '{"incomplete":');
  expect(readPosPreCheckoutDraft(storage, key, [product], NOW)).toBeNull();
 });
});
