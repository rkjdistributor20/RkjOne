import { describe, expect, it } from 'vitest';
import { defaultReportRange, parseReportFilters, reportTime } from './filters';

describe('report date filters', () => {
 it('starts a new month at MYT midnight instead of UTC midnight', () => {
  const before = new Date('2026-11-30T15:59:59.999Z');
  const midnight = new Date('2026-11-30T16:00:00.000Z');
  expect(defaultReportRange(before)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  expect(defaultReportRange(midnight)).toEqual({ from: '2026-12-01', to: '2026-12-01' });
  expect(reportTime('2026-11-30T16:00:00Z')).toBe('2026-12-01 00:00:00');
 });

 it.each([
  'from=2026-02-30&to=2026-03-01',
  'from=2026-03-02&to=2026-03-01',
  'from=2025-03-01&to=2026-03-02',
  'from=&to=2026-03-01',
 ])('rejects invalid date filters: %s', (query) => {
  expect(() => parseReportFilters(new URLSearchParams(query))).toThrow('Julat tarikh MYT');
 });

 it('accepts a leap day and canonicalizes a valid selected branch', () => {
  const result = parseReportFilters(new URLSearchParams(
   'from=2028-02-29&to=2028-02-29&branch_id=AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
  ));
  expect(result).toMatchObject({
   from: '2028-02-29', to: '2028-02-29', branchId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  });
 });
});
