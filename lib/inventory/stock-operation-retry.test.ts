import { describe, expect, it } from 'vitest';
import { withStockOperationId } from './stock-operation-retry';

describe('manual stock posting retries', () => {
 it('reuses the key after an uncertain response; confirmation allows a new operation', async () => {
  const fixture = JSON.stringify({ items: [{ stock_item_id: 'one', quantity: 1 }] });
  let first = '';
  await expect(withStockOperationId('receive', fixture, async id => {
   first = id;
   throw new Error('Connection lost');
  })).rejects.toThrow('Connection lost');
  expect(await withStockOperationId('receive', fixture, async id => id)).toBe(first);
  expect(await withStockOperationId('receive', fixture, async id => id)).not.toBe(first);
 });
});
