import type { PaymentMethod } from '@/lib/pos/types';

export type PosPaymentFingerprintPayload = {
 branchId: string;
 shiftId: string;
 items: Array<{ product_id: string; quantity: number }>;
 payment_method: PaymentMethod;
 cash_amount: number;
 qr_amount: number;
};

export function posPaymentFingerprint(payload: PosPaymentFingerprintPayload): string {
 return JSON.stringify({
  branchId: payload.branchId,
  shiftId: payload.shiftId,
  items: [...payload.items].sort((a, b) => a.product_id.localeCompare(b.product_id)),
  payment_method: payload.payment_method,
  cash_amount: Math.round(payload.cash_amount * 100),
  qr_amount: Math.round(payload.qr_amount * 100),
 });
}

export function posPaymentFingerprintFromSalePayload(value: unknown): string | null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const payload = value as Record<string, unknown>;
 const branchId = payload.branchId;
 const shiftId = payload.shiftId;
 const paymentMethod = payload.payment_method;
 const cashAmount = payload.cash_amount;
 const qrAmount = payload.qr_amount;
 const rawItems = payload.items;
 if (typeof branchId !== 'string' || !branchId
  || typeof shiftId !== 'string' || !shiftId
  || (paymentMethod !== 'CASH' && paymentMethod !== 'QR' && paymentMethod !== 'MIXED')
  || typeof cashAmount !== 'number' || !Number.isFinite(cashAmount)
  || typeof qrAmount !== 'number' || !Number.isFinite(qrAmount)
  || !Array.isArray(rawItems) || rawItems.length === 0) return null;

 const items: Array<{ product_id: string; quantity: number }> = [];
 for (const valueItem of rawItems) {
  if (!valueItem || typeof valueItem !== 'object' || Array.isArray(valueItem)) return null;
  const item = valueItem as Record<string, unknown>;
  if (typeof item.product_id !== 'string' || !item.product_id
   || typeof item.quantity !== 'number' || !Number.isFinite(item.quantity)
   || item.quantity <= 0) return null;
  items.push({ product_id: item.product_id, quantity: item.quantity });
 }

 return posPaymentFingerprint({
  branchId,
  shiftId,
  items,
  payment_method: paymentMethod,
  cash_amount: cashAmount,
  qr_amount: qrAmount,
 });
}
