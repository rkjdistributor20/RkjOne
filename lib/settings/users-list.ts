import type { SupabaseClient } from '@supabase/supabase-js';
import { parseDashboardMetadata } from '@/lib/settings/dashboard-advisor';
import type { SettingsUser } from '@/lib/settings/types';

const PROFILE_EMBED = `
 id, full_name, email, role, status, branch_id, region_id, employee_code, metadata,
 branch:branches!profiles_branch_id_fkey(branch_name, branch_code),
 region:regions!profiles_region_id_fkey(name, code),
 legal_entity:legal_entities(code, legal_name)
`;

const STAFF_EMBED = `
 id, staff_code, full_name, branch_id, region_id, profile_id,
 legal_entity:legal_entities(code, legal_name),
 branch:branches!staff_branch_id_fkey(branch_code, branch_name),
 profile:profiles!staff_profile_id_fkey(${PROFILE_EMBED})
`;

type EntityRef = { code: string; legal_name: string } | null;
type BranchRef = { branch_name: string; branch_code: string } | null;
type RegionRef = { name: string; code: string } | null;

type ProfileRow = {
 id: string;
 full_name: string;
 email: string;
 role: string;
 status: string;
 branch_id: string | null;
 region_id: string | null;
 employee_code: string | null;
 metadata: unknown;
 branch: BranchRef | BranchRef[];
 region: RegionRef | RegionRef[];
 legal_entity: EntityRef | EntityRef[];
};

type StaffRow = {
 id: string;
 staff_code: string;
 full_name: string;
 branch_id: string | null;
 region_id: string | null;
 profile_id: string | null;
 legal_entity: EntityRef | EntityRef[];
 branch: { branch_code: string; branch_name: string } | { branch_code: string; branch_name: string }[] | null;
 profile: ProfileRow | ProfileRow[] | null;
};

function unwrap<T>(value: T | T[] | null | undefined): T | null {
 if (value == null) return null;
 return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapProfileRow(
 row: ProfileRow,
 extras?: {
 staff_code?: string | null;
 staff_id?: string | null;
 legal_entity_code?: string | null;
 legal_entity_name?: string | null;
 branch?: SettingsUser['branch'];
 }): SettingsUser {
 const entity = unwrap(row.legal_entity);
 const dash = parseDashboardMetadata(row.metadata);
 const branch = extras?.branch ?? unwrap(row.branch);

 return {
 id: row.id,
 staff_id: extras?.staff_id ?? null,
 staff_code: extras?.staff_code ?? row.employee_code ?? null,
 full_name: row.full_name,
 email: row.email,
 role: row.role,
 status: row.status,
 branch_id: row.branch_id,
 region_id: row.region_id,
 branch,
 region: unwrap(row.region),
 legal_entity_code: extras?.legal_entity_code ?? entity?.code ?? null,
 legal_entity_name: extras?.legal_entity_name ?? entity?.legal_name ?? null,
 has_login: true,
 dashboard_profile: dash.profile_id,
 dashboard_label: dash.label,
 dashboard_home: dash.home_path,
 dashboard_ai_reason: dash.reason,
 };
}

export async function loadSettingsUsersForAdmin(
 service: SupabaseClient,
 organizationId: string): Promise<{ users: SettingsUser[]; staff_total: number; login_total: number }> {
 const [{ data: staffRows, error: staffErr }, { data: profileRows, error: profileErr }] =
 await Promise.all([
 service.from('staff').select(STAFF_EMBED).eq('organization_id', organizationId).eq('status', 'ACTIVE').order('staff_code'),
 service.from('profiles').select(PROFILE_EMBED).eq('organization_id', organizationId).eq('status', 'ACTIVE').order('full_name'),
 ]);

 if (staffErr) throw new Error(staffErr.message);
 if (profileErr) throw new Error(profileErr.message);

 const staff = (staffRows ?? []) as StaffRow[];
 const profiles = (profileRows ?? []) as ProfileRow[];
 const linkedProfileIds = new Set<string>();
 const users: SettingsUser[] = [];

 for (const row of staff) {
 const staffEntity = unwrap(row.legal_entity);
 const staffBranch = unwrap(row.branch);
 const profile = unwrap(row.profile);

 if (profile) {
 linkedProfileIds.add(profile.id);
 users.push(
 mapProfileRow(profile, {
 staff_id: row.id,
 staff_code: row.staff_code,
 legal_entity_code: staffEntity?.code ?? null,
 legal_entity_name: staffEntity?.legal_name ?? null,
 branch: staffBranch
 ? { branch_code: staffBranch.branch_code, branch_name: staffBranch.branch_name }
 : unwrap(profile.branch),
 }));
 continue;
 }

 users.push({
 id: `staff:${row.id}`,
 staff_id: row.id,
 staff_code: row.staff_code,
 full_name: row.full_name,
 email: '',
 role: 'STAFF',
 status: 'ACTIVE',
 branch_id: row.branch_id,
 region_id: row.region_id,
 branch: staffBranch
 ? { branch_code: staffBranch.branch_code, branch_name: staffBranch.branch_name }
 : null,
 region: null,
 legal_entity_code: staffEntity?.code ?? null,
 legal_entity_name: staffEntity?.legal_name ?? null,
 has_login: false,
 dashboard_profile: null,
 dashboard_label: null,
 dashboard_home: null,
 dashboard_ai_reason: null,
 });
 }

 for (const profile of profiles) {
 if (linkedProfileIds.has(profile.id)) continue;
 users.push(mapProfileRow(profile));
 }

 users.sort((a, b) => {
 const codeA = a.staff_code ?? a.full_name;
 const codeB = b.staff_code ?? b.full_name;
 return codeA.localeCompare(codeB, 'ms');
 });

 const loginIds = new Set(users.filter((u) => u.has_login !== false).map((u) => u.id));

 return {
 users,
 staff_total: staff.length,
 login_total: loginIds.size,
 };
}

export async function loadSettingsUsersFromProfiles(
 service: SupabaseClient,
 organizationId: string,
 filters?: { role?: string; branchIds?: string[] | null }): Promise<SettingsUser[]> {
 let query = service.from('profiles').select(PROFILE_EMBED).eq('organization_id', organizationId).eq('status', 'ACTIVE').order('full_name');

 if (filters?.role) query = query.eq('role', filters.role);
 if (filters?.branchIds !== undefined && filters.branchIds !== null) {
 if (filters.branchIds.length === 0) return [];
 query = query.in('branch_id', filters.branchIds);
 }

 const { data, error } = await query;
 if (error) throw new Error(error.message);

 return ((data ?? []) as ProfileRow[]).map((row) => mapProfileRow(row));
}
