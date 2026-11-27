import { describe, expect, it } from 'vitest';
import { reportTime } from '@/lib/reports/filters';
import { dateRangeError, PAGE_SIZE, presetRange, readSelection, reportUrl, workspaceUrl } from './model';

const TODAY = '2026-11-28';
const BRANCH = '00000000-0000-4000-8000-000000000001';
const AM = '00000000-0000-4000-8000-000000000002';
const STAFF = '00000000-0000-4000-8000-000000000003';
const TRANSACTION = '00000000-0000-4000-8000-000000000004';
const params = (url: string) => new URL(url, 'http://localhost').searchParams;

describe('operational report selection', () => {
 it('uses MYT across midnight and a Monday-based week', () => {
  const mytDay = reportTime('2026-11-30T16:00:00Z').slice(0, 10);
  expect(presetRange('today', mytDay)).toEqual({ from: '2026-12-01', to: '2026-12-01' });
  expect(presetRange('yesterday', mytDay)).toEqual({ from: '2026-11-30', to: '2026-11-30' });
  expect(presetRange('week', mytDay)).toEqual({ from: '2026-11-30', to: '2026-12-01' });
  expect(presetRange('month', mytDay)).toEqual({ from: '2026-12-01', to: '2026-12-01' });
 });

 it('rejects impossible, reversed, and oversized custom dates', () => {
  expect(dateRangeError('2026-02-29', '2026-03-01')).not.toBe('');
  expect(dateRangeError('2026-11-29', '2026-11-28')).not.toBe('');
  expect(dateRangeError('2024-01-01', '2025-01-01')).not.toBe('');
  expect(dateRangeError('2024-01-01', '2024-12-31')).toBe('');
 });

 it('round-trips tab and filters through the legacy link without exposing an AM selector to AMs', () => {
  const query = { branch_id: BRANCH, am_id: AM, staff_id: STAFF, tab: 'actions', case_type: 'payment_pending', data: 'trial' };
  const selection = readSelection(query, TODAY, true);
  const legacy = params(workspaceUrl(selection, true));
  expect(legacy.get('mode')).toBe('legacy');
  expect(readSelection(Object.fromEntries(legacy.entries()), TODAY, true)).toEqual(selection);
  expect(readSelection(query, TODAY, false).filters.amId).toBe('');
 });

 it('requests export using the same scope without page or an empty filter', () => {
  const { filters } = readSelection({ branch_id: BRANCH, staff_id: STAFF }, TODAY, false);
  const page = params(reportUrl('actions', filters, { page: 2, caseType: 'cash_variance' }));
  const csv = params(reportUrl('actions', filters, { csv: true, caseType: 'cash_variance' }));
  expect(page.get('page')).toBe('2');
  expect(page.get('limit')).toBe(String(PAGE_SIZE));
  expect(csv.has('page')).toBe(false);
  expect(csv.has('limit')).toBe(false);
  expect(csv.has('am_id')).toBe(false);
  for (const key of ['from', 'to', 'data', 'view', 'branch_id', 'staff_id', 'case_type']) {
   expect(csv.get(key)).toBe(page.get(key));
  }
 });

 it('keeps receipt requests narrowed to the active filters and transaction', () => {
  const { filters } = readSelection({ branch_id: BRANCH, data: 'trial' }, TODAY, false);
  const receipt = params(reportUrl('receipt', filters, { transactionId: TRANSACTION, caseType: 'payment_pending' }));
  expect(receipt.get('transaction_id')).toBe(TRANSACTION);
  expect(receipt.get('branch_id')).toBe(BRANCH);
  expect(receipt.get('data')).toBe('trial');
  expect(receipt.has('page')).toBe(false);
  expect(receipt.has('case_type')).toBe(false);
 });
});
