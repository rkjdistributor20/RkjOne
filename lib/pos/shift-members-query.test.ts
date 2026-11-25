import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchShiftMembers } from '@/lib/pos/api';
import {
 assertPosShiftMemberScope,
 getPosShiftApprovalInterval,
 getPosShiftMemberStats,
 posShiftMembersQueryOptions,
} from './shift-members-query';
import type { PosShiftStaffMember } from './types';

vi.mock('@/lib/pos/api', () => ({ fetchShiftMembers: vi.fn() }));
const fetchMembers = vi.mocked(fetchShiftMembers);
const scope = { branchId: 'branch-1', shiftId: 'shift-1', profileId: 'cashier' };
const member = (status: PosShiftStaffMember['status'], profileId = scope.profileId): PosShiftStaffMember => ({
 id: 'member-1', organization_id: 'org', branch_id: scope.branchId, shift_id: scope.shiftId,
 profile_id: profileId, staff_id: 'staff-1', full_name: 'Test PIC', role_in_shift: 'PIC', status,
 started_at: '2026-11-25T08:30:00Z', ended_at: null, started_by: null, ended_by: null,
 approved_by: null, approved_at: null, approval_notes: null, notes: null,
 created_at: '2026-11-25T08:30:00Z', updated_at: '2026-11-25T08:30:00Z',
});
const result = (...members: PosShiftStaffMember[]) => ({
 viewerProfileId: scope.profileId,
 shift: { id: scope.shiftId, shift_number: 'SH-1', branch_id: scope.branchId, organization_id: 'org' },
 members, availableStaff: [],
});

describe('scoped POS shift membership', () => {
 beforeEach(() => fetchMembers.mockReset());

 it('shares an approval read between Sales and Summary without requesting a new membership', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sales = new QueryObserver(client, posShiftMembersQueryOptions(scope, true));
  const summary = new QueryObserver(client, posShiftMembersQueryOptions(scope));
  fetchMembers.mockResolvedValue(result(member('PENDING_APPROVAL')));
  const unsubSales = sales.subscribe(() => undefined);
  const unsubSummary = summary.subscribe(() => undefined);
  try {
   const pending = await sales.refetch();
   expect(fetchMembers).toHaveBeenCalledTimes(1);
   expect(getPosShiftMemberStats(pending.data!.members, scope.profileId).status).toBe('PENDING_APPROVAL');
   expect(getPosShiftApprovalInterval(pending.data, scope.profileId)).toBe(15_000);

   // Simulate approval on a different HQ session: only the server's read changes.
   fetchMembers.mockResolvedValue(result(member('ACTIVE')));
   const rechecked = await sales.refetch();
   expect(fetchMembers).toHaveBeenCalledTimes(2);
   expect(getPosShiftMemberStats(rechecked.data!.members, scope.profileId)).toEqual({
    active: 1, pending: 0, status: 'ACTIVE',
   });
   expect(summary.getCurrentResult().data).toBe(rechecked.data);
   expect(getPosShiftApprovalInterval(rechecked.data, scope.profileId)).toBe(false);
  } finally {
   unsubSummary();
   unsubSales();
   client.clear();
  }
 });

 it('does not treat another active PIC, a rejected member or an ended member as cashier approval', () => {
  for (const inactive of ['REJECTED', 'ENDED'] as const) {
   expect(getPosShiftMemberStats([member('ACTIVE', 'other'), member(inactive)], scope.profileId))
    .toEqual({ active: 1, pending: 0, status: 'NONE' });
  }
  expect(getPosShiftMemberStats([member('ACTIVE', 'other'), member('PENDING_APPROVAL')], scope.profileId))
   .toEqual({ active: 1, pending: 1, status: 'PENDING_APPROVAL' });
 });

 it('rejects a different authenticated session, branch, shift or organization', () => {
  const active = result(member('ACTIVE'));
  for (const invalid of [
   { ...active, viewerProfileId: 'other' },
   { ...active, shift: { ...active.shift, branch_id: 'other' } },
   { ...active, shift: { ...active.shift, id: 'other' } },
   { ...active, shift: null },
   { ...active, members: [{ ...active.members[0], branch_id: 'other' }] },
   { ...active, members: [{ ...active.members[0], shift_id: 'other' }] },
   { ...active, members: [{ ...active.members[0], organization_id: 'other' }] },
  ]) {
   expect(() => assertPosShiftMemberScope(invalid, scope)).toThrow();
  }
 });

 it('does not reuse approval across session or shift changes, and rechecks on connectivity recovery', () => {
  const base = posShiftMembersQueryOptions(scope, true);
  expect(base.refetchOnReconnect).toBe(true);
  expect(base.refetchOnWindowFocus).toBe(true);
  expect(base.refetchIntervalInBackground).toBe(false);
  expect(posShiftMembersQueryOptions(null).enabled).toBe(false);
  for (const changed of [
   { ...scope, profileId: 'other' }, { ...scope, branchId: 'other' }, { ...scope, shiftId: 'other' },
  ]) {
   expect(posShiftMembersQueryOptions(changed).queryKey).not.toEqual(base.queryKey);
  }
 });
});
