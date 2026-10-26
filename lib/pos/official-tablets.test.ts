import { describe, expect, it } from 'vitest';
import { matchOfficialTablet } from './official-tablets';

describe('official POS tablet matching', () => {
 it('matches the Samsung Galaxy Tab S10 Lite hardware model reported by Android', () => {
  expect(matchOfficialTablet(
   'SAMSUNG_TAB_S10_LITE_5G_128',
   'samsung',
   'SM-X406B',
  )).toEqual({
   state: 'MATCHED',
   label: 'Samsung Galaxy Tab S10 Lite 5G 128GB',
  });
 });

 it('keeps a different Samsung model at brand-only review', () => {
  expect(matchOfficialTablet(
   'SAMSUNG_TAB_S10_LITE_5G_128',
   'samsung',
   'SM-X999B',
  ).state).toBe('BRAND_MATCHED');
 });
});
