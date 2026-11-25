import { queryOptions, useQuery } from '@tanstack/react-query';
import { fetchShiftMembers } from '@/lib/pos/api';
import type { PosShiftStaffMember } from '@/lib/pos/types';

type ShiftMemberScope = { branchId: string; shiftId: string; profileId: string };
type ShiftMembers = Awaited<ReturnType<typeof fetchShiftMembers>>;

export function getPosShiftMemberStats(members: PosShiftStaffMember[], profileId?: string) {
 const active = members.filter((member) => member.status === 'ACTIVE');
 const pending = members.filter((member) => member.status === 'PENDING_APPROVAL');
 const status = profileId && active.some((member) => member.profile_id === profileId)
  ? 'ACTIVE'
  : profileId && pending.some((member) => member.profile_id === profileId)
   ? 'PENDING_APPROVAL'
   : 'NONE';
 return { active: active.length, pending: pending.length, status } as const;
}

export function assertPosShiftMemberScope(result: ShiftMembers, scope: ShiftMemberScope) {
 const { shift, members, viewerProfileId } = result;
 if (
  viewerProfileId !== scope.profileId ||
  shift?.id !== scope.shiftId ||
  shift.branch_id !== scope.branchId ||
  members.some((member) =>
   member.shift_id !== scope.shiftId ||
   member.branch_id !== scope.branchId ||
   member.organization_id !== shift.organization_id)
 ) {
  throw new Error('Sesi, cawangan atau syif POS telah berubah. Sila semak semula.');
 }
 return result;
}

export function getPosShiftApprovalInterval(result: ShiftMembers | undefined, profileId: string) {
 return result && getPosShiftMemberStats(result.members, profileId).status === 'PENDING_APPROVAL'
  ? 15_000
  : false;
}

export function posShiftMembersQueryOptions(scope: ShiftMemberScope | null, monitorApproval = false) {
 return queryOptions({
  queryKey: ['pos-shift-members', scope?.profileId, scope?.branchId, scope?.shiftId] as const,
  enabled: scope !== null,
  queryFn: async ({ signal }) => {
   if (!scope) throw new Error('Syif POS tidak tersedia.');
   return assertPosShiftMemberScope(await fetchShiftMembers(scope.branchId, scope.shiftId, signal), scope);
  },
  gcTime: 0,
  staleTime: 0,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  refetchInterval: (query) => monitorApproval && scope
   ? getPosShiftApprovalInterval(query.state.data, scope.profileId)
   : false,
 });
}

export function usePosShiftMembers(
 branchId?: string | null,
 shiftId?: string | null,
 profileId?: string | null,
 monitorApproval = false,
) {
 return useQuery(posShiftMembersQueryOptions(
  branchId && shiftId && profileId ? { branchId, shiftId, profileId } : null,
  monitorApproval,
 ));
}
