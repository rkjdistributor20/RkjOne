import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { isAdminRole } from '@/lib/auth/permissions';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import type {
 StaffBranchGroup,
 StaffCompanyGroup,
 StaffGroupedResponse,
 StaffMemberRow,
 StaffRegionGroup,
} from '@/lib/staff/types';

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

 const legalEntitiesQuery = supabase
 .from('legal_entities')
 .select('id, code, name, legal_name, scope, sort_order')
 .eq('organization_id', profile.organization_id)
 .eq('status', 'ACTIVE')
 .order('sort_order');

 let staffQuery = supabase.from('staff').select(
 'id, staff_code, full_name, status, branch_id, region_id, legal_entity_id, worker_type, weekly_amount, monthly_amount, shift_hours, shifts_per_week, remarks, legal_entity:legal_entities(id, code, name, legal_name, scope, sort_order), profile:profiles!staff_profile_id_fkey(metadata)').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('staff_code').limit(MAX_GROUPED_STAFF_ROWS);

 if (scope.branchIds !== null) {
 staffQuery = staffQuery.in('branch_id', scope.branchIds);
 }

 const [regionsResult, branchesResult, legalEntitiesResult, staffResult] = await Promise.all([
 regionsQuery,
 branchesQuery,
 legalEntitiesQuery,
 staffQuery,
 ]);

 const { data: regions, error: regionErr } = regionsResult;
 const { data: branches, error: branchErr } = branchesResult;
 const { data: legalEntities, error: entityErr } = legalEntitiesResult;
 const { data: staffRows, error: staffErr } = staffResult;
 if (regionErr) return NextResponse.json({ error: regionErr.message }, { status: 500 });
 if (branchErr) return NextResponse.json({ error: branchErr.message }, { status: 500 });
 if (entityErr) return NextResponse.json({ error: entityErr.message }, { status: 500 });
 if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 });

 type StaffRow = {
 id: string;
 staff_code: string;
 full_name: string;
 status: string;
 branch_id: string | null;
 region_id: string | null;
 legal_entity_id: string | null;
 worker_type: 'LOCAL' | 'FOREIGN' | null;
 weekly_amount: number | null;
 monthly_amount: number | null;
 shift_hours: number | null;
 shifts_per_week: number | null;
 remarks: string | null;
 legal_entity?: EntityRow | EntityRow[] | null;
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

 type EntityRow = {
 id: string;
 code: string;
 name: string | null;
 legal_name: string | null;
 scope: string | null;
 sort_order: number | null;
 };

 function unwrapEntity(value: EntityRow | EntityRow[] | null | undefined) {
 return Array.isArray(value) ? value[0] ?? null : value ?? null;
 }

 const branchMap = new Map(
 ((branches ?? []) as BranchRow[]).map((b) => [b.id, b]));
 const legalEntityRows = ((legalEntities ?? []) as EntityRow[])
 .slice()
 .sort((a, b) => Number(a.sort_order ?? 999) - Number(b.sort_order ?? 999));
 const entityById = new Map(legalEntityRows.map((e) => [e.id, e]));
 const fallbackEntity: EntityRow = {
 id: 'unassigned',
 code: 'BELUM_TETAP',
 name: 'Belum Tetap',
 legal_name: 'Belum Tetap',
 scope: 'Rekod staf belum mempunyai syarikat majikan.',
 sort_order: 999,
 };

 const companyMap = new Map<string, StaffCompanyGroup>();
 for (const entity of legalEntityRows) {
 companyMap.set(entity.code, {
 legal_entity_id: entity.id,
 legal_entity_code: entity.code,
 legal_entity_name: entity.legal_name ?? entity.name ?? entity.code,
 legal_entity_scope: entity.scope,
 sort_order: Number(entity.sort_order ?? 999),
 hq_staff: [],
 regions: [],
 staff_count: 0,
 branch_staff_count: 0,
 hq_staff_count: 0,
 });
 }

 function ensureCompany(entity: EntityRow | null): StaffCompanyGroup {
 const resolved = entity ?? fallbackEntity;
 const existing = companyMap.get(resolved.code);
 if (existing) return existing;
 const created: StaffCompanyGroup = {
 legal_entity_id: resolved.id === 'unassigned' ? null : resolved.id,
 legal_entity_code: resolved.code,
 legal_entity_name: resolved.legal_name ?? resolved.name ?? resolved.code,
 legal_entity_scope: resolved.scope,
 sort_order: Number(resolved.sort_order ?? 999),
 hq_staff: [],
 regions: [],
 staff_count: 0,
 branch_staff_count: 0,
 hq_staff_count: 0,
 };
 companyMap.set(resolved.code, created);
 return created;
 }

 function ensureCompanyRegion(
 company: StaffCompanyGroup,
 region: RegionRow): StaffRegionGroup {
 let existing = company.regions.find((g) => g.region_id === region.id);
 if (existing) return existing;
 existing = {
 region_id: region.id,
 region_code: region.code,
 region_name: region.name,
 manager_name: region.manager_name,
 branches: [],
 staff_count: 0,
 };
 company.regions.push(existing);
 return existing;
 }

 function ensureRegionBranch(
 region: StaffRegionGroup,
 branch: BranchRow): StaffBranchGroup {
 let existing = region.branches.find((b) => b.branch_id === branch.id);
 if (existing) return existing;
 existing = {
 branch_id: branch.id,
 branch_code: branch.branch_code,
 branch_name: branch.branch_name,
 staff: [],
 };
 region.branches.push(existing);
 return existing;
 }

 const staffByBranch = new Map<string, StaffMemberRow[]>();
 const regionById = new Map(((regions ?? []) as RegionRow[]).map((r) => [r.id, r]));
 for (const row of (staffRows ?? []) as StaffRow[]) {
 const profileRow = Array.isArray(row.profile) ? row.profile[0] : row.profile;
 const metadata = profileRow?.metadata as { hr_onboarding?: {
 job_title?: string | null;
 department?: string | null;
 work_scope?: string | null;
 } } | null;
 const onboarding = metadata?.hr_onboarding ?? {};
 const entity = unwrapEntity(row.legal_entity) ?? entityById.get(row.legal_entity_id ?? '') ?? null;
 const company = ensureCompany(entity);
 const branch = row.branch_id ? branchMap.get(row.branch_id) : null;
 const staff: StaffMemberRow = {
 id: row.id,
 staff_code: row.staff_code,
 full_name: row.full_name,
 status: row.status,
 legal_entity_id: entity?.id ?? null,
 legal_entity_code: entity?.code ?? null,
 legal_entity_name: entity?.legal_name ?? entity?.name ?? null,
 branch_id: row.branch_id,
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? null,
 worker_type: row.worker_type,
 weekly_amount: row.weekly_amount,
 monthly_amount: row.monthly_amount,
 shift_hours: row.shift_hours,
 shifts_per_week: row.shifts_per_week,
 job_title: onboarding.job_title ?? null,
 department: onboarding.department ?? null,
 work_scope: onboarding.work_scope ?? row.remarks ?? null,
 };

 if (branch) {
 const list = staffByBranch.get(branch.id) ?? [];
 list.push(staff);
 staffByBranch.set(branch.id, list);

 const region = regionById.get(branch.region_id);
 if (region) {
 const companyRegion = ensureCompanyRegion(company, region);
 const companyBranch = ensureRegionBranch(companyRegion, branch);
 companyBranch.staff.push(staff);
 companyRegion.staff_count += 1;
 company.branch_staff_count += 1;
 }
 } else {
 company.hq_staff.push(staff);
 company.hq_staff_count += 1;
 }

 company.staff_count += 1;
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

 const includeEmptyCompanies = scope.branchIds === null && !requestedBranchId;
 const companies = [...companyMap.values()]
 .filter((company) => includeEmptyCompanies || company.staff_count > 0)
 .map((company) => ({
 ...company,
 hq_staff: company.hq_staff.sort((a, b) => a.full_name.localeCompare(b.full_name)),
 regions: company.regions
 .map((region) => ({
 ...region,
 branches: region.branches
 .map((branch) => ({
 ...branch,
 staff: branch.staff.sort((a, b) => a.full_name.localeCompare(b.full_name)),
 }))
 .sort((a, b) => a.branch_code.localeCompare(b.branch_code)),
 }))
 .sort((a, b) => a.region_code.localeCompare(b.region_code)),
 }))
 .sort((a, b) => a.sort_order - b.sort_order || a.legal_entity_code.localeCompare(b.legal_entity_code));

 return NextResponse.json({
 groups: groups.filter((g) => g.branches.length > 0),
 companies,
 scoped_region_id: scope.regionId,
 selected_branch_id: scope.branchId,
 } satisfies StaffGroupedResponse);
}
