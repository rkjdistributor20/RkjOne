import type { CartItem } from './types';
import { parsePrice } from './utils';
import type { Product } from '@/types/database';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_LINES = 200;
const SESSION_ID = /^cart-[a-zA-Z0-9-]{1,122}$/;
type Draft = { cartSessionId: string; cart: CartItem[] };
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function posPreCheckoutDraftKey(scope: {
 organizationId: string;
 branchId: string;
 deviceId: string;
 enrollmentGeneration: number;
 shiftId: string;
 staffId: string;
}): string {
 return `rkj:pos:pre-checkout:v1:${JSON.stringify([
  scope.organizationId, scope.branchId, scope.deviceId, scope.enrollmentGeneration,
  scope.shiftId, scope.staffId,
 ])}`;
}

export function readPosPreCheckoutDraft(
 storage: DraftStorage, key: string, catalog: readonly Product[], now = Date.now(),
): Draft | null {
 try {
  const record = JSON.parse(storage.getItem(key) ?? 'null');
  if (!record || typeof record.cartSessionId !== 'string' || !SESSION_ID.test(record.cartSessionId)
   || !Number.isFinite(record.savedAt) || now - record.savedAt > MAX_AGE_MS
   || record.savedAt > now || !Array.isArray(record.lines)
   || record.lines.length === 0 || record.lines.length > MAX_LINES) return null;

  const products = new Map(catalog.map(p => [p.id, p]));
  const seen = new Set<string>();
  const cart: CartItem[] = [];
  for (const line of record.lines) {
   if (!line || typeof line.id !== 'string' || seen.has(line.id)
    || !Number.isSafeInteger(line.qty) || line.qty < 1) return null;
   const product = products.get(line.id);
   const price = parsePrice(product?.price);
   // Never partially recover an order. Reprice from the active catalog;
   // availability and checkout are still validated by the existing workflow.
   if (!product || price <= 0) return null;
   seen.add(product.id);
   cart.push({ productId: product.id, sku: product.sku, name: product.name,
    category: product.category, price, quantity: line.qty });
  }
  return { cartSessionId: record.cartSessionId, cart };
 } catch {
  return null;
 }
}

export function writePosPreCheckoutDraft(
 storage: DraftStorage, key: string, { cartSessionId, cart }: Draft, now = Date.now(),
): void {
 storage.setItem(key, JSON.stringify({
  cartSessionId, savedAt: now, lines: cart.map(i => ({ id: i.productId, qty: i.quantity })),
 }));
}

export function retirePosPreCheckoutDraft(storage: DraftStorage, key: string): void {
 storage.removeItem(key);
}
