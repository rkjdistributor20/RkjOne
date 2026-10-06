import type { Json } from '@/types/database';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export type PosPaymentIntentIdentity = {
 branchId: string;
 shiftId: string;
 createdBy: string;
 amountRm: number;
 salePayload: Json;
};

function canonicalJson(value: Json): string {
 if (Array.isArray(value)) {
  return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
 }
 if (value !== null && typeof value === 'object') {
  return `{${Object.keys(value)
   .sort()
   .filter((key) => value[key] !== undefined)
   .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`)
   .join(',')}}`;
 }
 return JSON.stringify(value);
}

export function isValidPosPaymentIdempotencyKey(value: unknown): value is string {
 return typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value);
}

export function createPosPaymentIdempotencyKey(): string {
 return globalThis.crypto.randomUUID();
}

export function isSamePosPaymentIntent(
 existing: PosPaymentIntentIdentity,
 expected: PosPaymentIntentIdentity,
): boolean {
 return existing.branchId === expected.branchId
  && existing.shiftId === expected.shiftId
  && existing.createdBy === expected.createdBy
  && Math.round(existing.amountRm * 100) === Math.round(expected.amountRm * 100)
  && canonicalJson(existing.salePayload) === canonicalJson(expected.salePayload);
}
