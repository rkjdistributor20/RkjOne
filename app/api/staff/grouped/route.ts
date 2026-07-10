import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { isAdminRole } from '@/lib/auth/permissions';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import type { StaffBranchGroup, StaffGroupedResponse, StaffMemberRow, StaffRegionGroup } from '@/lib/staff/types';

const MAX_GROUPED_STAFF_ROWS = 1200;

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });

 const requestedBranchId = new URL(request.url).searchParams.get('branch_id');
 const supabase = await createClient();

 let scope;
 try {
 scope = await resolveScopedBranches(supabase, profile, requestedBranchId);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Akses ditolak' },
 { status: 403 });
 }

 let regionsQuery = supabase.from('regions').select('id, code, name, manager_name').eq('organization_id', profile.organization_id).order('code');

 if (!isAdminRole(profile.role) && scope.regionId) {
 regionsQuery = regionsQuery.eq('id', scope.regionId);
 }

 let branchesQuery = supabase.from('branches').select('id, branch_code, branch_name, region_id, status').eq('organization_id', profile.organization_id).order('branch_code');

 if (scope.branchIds !== null) {
 if (scope.branchIds.length === 0) {
 return NextResponse.json({
 groups: [],
 scoped_region_id: scope.regionId,
 selected_branch_id: scope.branchId,
 } satisfies StaffGroupedResponse);
 }
 branchesQuery = branchesQuery.in('id', scope.branchIds);
 }

 let staffQuery = supabase.from('staff').select(
 'id, staff_code, full_name, status, branch_id, region_id, worker_type, weekly_amount, monthly_amount, shift_hours, shifts_per_week, remarks, profile:profiles!staff_profile_id_fkey(metadata)').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('staff_code').limit(MAX_GROUPED_STAFF_ROWS);

 if (scope.branchIds !== null) {
 staffQuery = staffQuery.in('branch_id', scope.branchIds);
 }

 const [regionsResult, branchesResult, staffResult] = await Promise.all([
 regionsQuery,
 branchesQuery,
 staffQuery,
 ]);

 const { data: regions, error: regionErr } = regionsResult;
 const { data: branches, error: branchErr } = branchesResult;
 const { data: staffRows, error: staffErr } = staffResult;
 if (regionErr) return NextResponse.json({ error: regionErr.message }, { status: 500 });
 if (branchErr) return NextResponse.json({ error: branchErr.message }, { status: 500 });
 if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 });

 type StaffRow = {
 id: string;
 staff_code: string;
 full_name: string;
 status: string;
 branch_id: string | null;
 region_id: string | null;
 worker_type: 'LOCAL' | 'FOREIGN' | null;
 weekly_amount: number | null;
 monthly_amount: number | null;
 shift_hours: number | null;
 shifts_per_week: number | null;
 remarks: string | null;
 profile?: { metadata: unknown } | { metadata: unknown }[] | null;
 };

 type BranchRow = {
 id: string;
 branch_code: string;
 branch_name: string;
 region_id: string;
 };

 type RegionRow = {
 id: string;
 code: string;
 name: string;
 manager_name: string | null;
 };

 const branchMap = new Map(
 ((branches ?? []) as BranchRow[]).map((b) => [b.id, b]));

 const staffByBranch = new Map<string, StaffMemberRow[]>();
 for (const row of (staffRows ?? []) as StaffRow[]) {
 if (!row.branch_id) continue;
 const branch = branchMap.get(row.branch_id);
 if (!branch) continue;
 const profileRow = Array.isArray(row.profile) ? row.profile[0] : row.profile;
 const metadata = profileRow?.metadata as { hr_onboarding?: {
 job_title?: string | null;
 department?: string | null;
 work_scope?: string | null;
 } } | null;
 const onboarding = metadata?.hr_onboarding ?? {};

 const list = staffByBranch.get(row.branch_id) ?? [];
 list.push({
 id: row.id,
 staff_code: row.staff_code,
 full_name: row.full_name,
 status: row.status,
 branch_id: row.branch_id,
 branch_code: branch.branch_code,
 branch_name: branch.branch_name,
 worker_type: row.worker_type,
 weekly_amount: row.weekly_amount,
 monthly_amount: row.monthly_amount,
 shift_hours: row.shift_hours,
 shifts_per_week: row.shifts_per_week,
 job_title: onboarding.job_title ?? null,
 department: onboarding.department ?? null,
 work_scope: onboarding.work_scope ?? row.remarks ?? null,
 });
 staffByBranch.set(row.branch_id, list);
 }

 const groups: StaffRegionGroup[] = ((regions ?? []) as RegionRow[]).map((region) => {
 const regionBranches = ((branches ?? []) as BranchRow[]).filter(
 (b) => b.region_id === region.id);
 const branchGroups: StaffBranchGroup[] = regionBranches.map((b) => ({
 branch_id: b.id,
 branch_code: b.branch_code,
 branch_name: b.branch_name,
 staff: (staffByBranch.get(b.id) ?? []).sort((a, c) =>
 a.full_name.localeCompare(c.full_name)),
 }));

 const staff_count = branchGroups.reduce((n, bg) => n + bg.staff.length, 0);

 return {
 region_id: region.id,
 region_code: region.code,
 region_name: region.name,
 manager_name: region.manager_name,
 branches: branchGroups,
 staff_count,
 };
 });

 return NextResponse.json({
 groups: groups.filter((g) => g.branches.length > 0),
 scoped_region_id: scope.regionId,
 selected_branch_id: scope.branchId,
 } satisfies StaffGroupedResponse);
}
