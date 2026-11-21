import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
 assertActivePosBranchShiftMember,
 canRefundPosTransaction,
 canVoidPosTransaction,
 requiresActivePosShiftMember,
} from './access';

describe('POS transaction adjustment permissions', () => {
 it('allows operational management to void but not record provider refunds', () => {
  expect(canVoidPosTransaction('OPERATION_MANAGER')).toBe(true);
  expect(canVoidPosTransaction('AREA_MANAGER')).toBe(true);
  expect(canRefundPosTransaction('OPERATION_MANAGER')).toBe(false);
  expect(canRefundPosTransaction('AREA_MANAGER')).toBe(false);
 });

 it('limits refunds to administrators and Finance', () => {
  expect(canRefundPosTransaction('SUPER_ADMIN')).toBe(true);
  expect(canRefundPosTransaction('ADMIN')).toBe(true);
  expect(canRefundPosTransaction('FINANCE')).toBe(true);
 });

 it('denies transaction adjustments to branch staff and unrelated roles', () => {
  for (const role of ['STAFF', 'DRIVER', 'SALES_AGENT', 'HR', null, undefined]) {
   expect(canVoidPosTransaction(role)).toBe(false);
   expect(canRefundPosTransaction(role)).toBe(false);
  }
 });
});

describe('requiresActivePosShiftMember', () => {
 it('requires active membership for branch staff and area managers', () => {
  expect(requiresActivePosShiftMember('STAFF')).toBe(true);
  expect(requiresActivePosShiftMember('AREA_MANAGER')).toBe(true);
 });

 it('keeps the server management bypass roles aligned', () => {
  expect(requiresActivePosShiftMember('SUPER_ADMIN')).toBe(false);
  expect(requiresActivePosShiftMember('ADMIN')).toBe(false);
  expect(requiresActivePosShiftMember('OPERATION_MANAGER')).toBe(false);
 });
});

describe('assertActivePosBranchShiftMember', () => {
 it('uses the current open branch shift after cashier turnover', async () => {
  const shiftQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  const memberQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const query of [shiftQuery, memberQuery]) {
   query.select = vi.fn(() => query);
   query.eq = vi.fn(() => query);
  }
  shiftQuery.maybeSingle = vi.fn(async () => ({ data: { id: 'open-shift-2' }, error: null }));
  memberQuery.maybeSingle = vi.fn(async () => ({
   data: { id: 'member-1', status: 'ACTIVE', role_in_shift: 'CASHIER' },
   error: null,
  }));
  const from = vi.fn((table: string) => (
   table === 'pos_shifts' ? shiftQuery : memberQuery
  ));

  await expect(assertActivePosBranchShiftMember(
   { from } as unknown as SupabaseClient,
   { id: 'cashier-2', organization_id: 'org-1', role: 'STAFF' },
   'branch-1',
  )).resolves.toMatchObject({ id: 'member-1' });

  expect(shiftQuery.eq).toHaveBeenCalledWith('status', 'OPEN');
  expect(memberQuery.eq).toHaveBeenCalledWith('shift_id', 'open-shift-2');
  expect(memberQuery.eq).toHaveBeenCalledWith('profile_id', 'cashier-2');
 });
});
