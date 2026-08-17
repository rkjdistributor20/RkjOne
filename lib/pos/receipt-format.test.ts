import { describe, expect, it } from 'vitest';
import { build58mmReceipt, RECEIPT_58MM_COLUMNS } from './receipt-format';
import type { SaleResult } from './types';

const receipt: SaleResult = {
 transaction_id: 'transaction-id',
 transaction_number: 'TX-2026-0001',
 receipt_number: 'RKJ-0001',
 subtotal: 21,
 discount: 2,
 total: 19,
 change_amount: 1,
 items: [
  {
   name: 'Roti Kaya Butter Sangat Panjang Untuk Ujian',
   sku: 'RK-01',
   quantity: 2,
   unit_price: 10.5,
   line_total: 21,
  },
 ],
};

describe('build58mmReceipt', () => {
 it('formats verified receipt data within a 32-column 58 mm layout', () => {
  const output = build58mmReceipt(receipt, 'RNR Elmina Arah Utara');
  expect(output).toContain('ROTI KAYA JUNUS');
  expect(output).toContain('RKJ-0001');
  expect(output).toContain('JUMLAH');
  expect(output).toContain('RM 19.00');
  expect(output).toContain('-RM 2.00');
  expect(output.split('\n').every((line) => line.length <= RECEIPT_58MM_COLUMNS)).toBe(true);
 });

 it('removes unsupported control and non-ASCII characters safely', () => {
  const output = build58mmReceipt(
   { ...receipt, items: [{ ...receipt.items[0], name: 'Roti\u0000 Kaya™ 🍞' }] },
   'Cawangan Élmína',
  );
  expect(output).not.toContain('\u0000');
  expect(output).not.toContain('™');
  expect(output).not.toContain('🍞');
  expect(output).toContain('Elmina');
 });
});
