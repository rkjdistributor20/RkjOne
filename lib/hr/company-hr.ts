import type { SupabaseClient } from '@supabase/supabase-js';
import type { HrLeaveBalance, HrLeaveType } from '@/types/database';
import type { UserRole } from '@/types/enums';
import { LEGAL_ENTITIES, legalEntityLabel } from '@/lib/brand/legal-entities';
import {
 type HrEmployment,
 isGroupOwnerMetadata,
 isMergedProfile,
 sumMonthlyEmployments,
 sumWeeklyEmployments,
} from '@/lib/hr/group-owner';
import { remainingLeaveDays } from '@/lib/hr/leave-balances';

export type HrLeaveBalanceSummary = Pick<
 HrLeaveBalance,
 | 'id'
 | 'staff_id'
 | 'profile_id'
 | 'leave_year'
 | 'leave_type'
 | 'entitlement_days'
 | 'carried_forward_days'
 | 'used_days'
 | 'pending_days'
 | 'adjustment_days'
 | 'remaining_days'
 | 'notes'
 | 'updated_at'
> & {
 remaining: number;
};

export type HrStaffPerson = {
 id: string;
 staff_id: string | null;
 profile_id: string | null;
 staff_code: string;
 full_name: string;
 email: string | null;
 phone: string | null;
 role: UserRole | 'STAFF_RECORD';
 status: string;
 worker_type: 'LOCAL' | 'FOREIGN' | null;
 branch_code: string | null;
 branch_name: string | null;
 region_name: string | null;
 monthly_amount: number | null;
 weekly_amount: number | null;
 must_change_password: boolean | null;
 profile_completed_at: string | null;
 last_login_at: string | null;
 source: 'staff' | 'profile';
 legal_entity_code: string | null;
 is_group_owner?: boolean;
 employments?: HrEmployment[];
 total_monthly_amount?: number | null;
 total_weekly_amount?: number | null;
 legal_entity_codes?: string[];
 leave_balances?: HrLeaveBalanceSummary[];
};

export type HrAgentPriceGroupOption = {
 id: string;
 code: string | null;
 name: string;
 payment_exempt: boolean;
};

export type HrAgentPerson = {
 id: string;
 profile_id: string | null;
 company_name: string;
 registration_no: string | null;
 contact_person: string | null;
 contact_email: string | null;
 contact_phone: string | null;
 status: string;
 assigned_price_group_id: string | null;
 price_group_code: string | null;
 price_group_name: string | null;
 payment_exempt: boolean;
 agent_type_label: string;
 created_at: string | null;
};

export type HrCompanyGroup = {
 id: string;
 code: string;
 name: string;
 legal_name: string;
 scope: string | null;
 status: string;
 sort_order: number;
 people: HrStaffPerson[];
 agents: HrAgentPerson[];
 agent_price_groups: HrAgentPriceGroupOption[];
 summary: {
 total: number;
 active: number;
 local: number;
 foreign: number;
 management: number;
 branch_staff: number;
 portal_ready: number;
 profile_complete: number;
 on_hold: number;
 };
};

export type HrDashboardSummary = {
 total_companies: number;
 total_people: number;
 active_people: number;
 management_people: number;
 branch_staff: number;
 profile_complete: number;
 leave_balances: number;
 leave_pending: number;
};

export type HrServiceRequestSummary = {
 id: string;
 request_number: string;
 request_type: string;
 title: string;
 description: string;
 priority: string;
 status: string;
 requester_name: string | null;
 staff_code: string | null;
 legal_entity_code: string | null;
 legal_entity_name: string | null;
 branch_code: string | null;
 branch_name: string | null;
 start_date: string | null;
 end_date: string | null;
 created_at: string;
 reviewer_note: string | null;
 metadata: Record<string, unknown> | null;
 am_leave_cover_required: boolean;
 am_leave_cover_status: string | null;
 am_leave_covered_by: string | null;
 am_leave_covered_at: string | null;
};

export type HrDashboardData = {
 companies: HrCompanyGroup[];
 group_owners: HrStaffPerson[];
 unassigned: HrStaffPerson[];
 service_requests: HrServiceRequestSummary[];
 summary: HrDashboardSummary;
};

type LegalEntityRow = {
 id: string;
 code: string;
 name: string;
 legal_name: string;
 scope: string | null;
 status: string;
 sort_order: number;
};

type BranchRow = { branch_code: string | null; branch_name: string | null } | null;
type RegionRow = { name: string | null } | null;
type ProfileLite = {
 id: string;
 employee_code: string | null;
 full_name: string;
 email: string | null;
 phone: string | null;
 role: UserRole;
 status: string;
 legal_entity_id: string | null;
 branch?: BranchRow | BranchRow[];
 region?: RegionRow | RegionRow[];
 must_change_password: boolean | null;
 profile_completed_at: string | null;
 last_login_at: string | null;
 metadata?: Record<string, unknown> | null;
};

type StaffRow = {
 id: string;
 staff_code: string;
 full_name: string;
 status: string;
 worker_type: 'LOCAL' | 'FOREIGN' | null;
 weekly_amount: number | null;
 monthly_amount: number | null;
 legal_entity_id: string | null;
 on_hold: boolean | null;
 branch?: BranchRow | BranchRow[];
 region?: RegionRow | RegionRow[];
 profile?: ProfileLite | ProfileLite[] | null;
 profile_id: string | null;
};

type LeaveBalanceRow = HrLeaveBalance;

type HrServiceRequestRow = {
 id: string;
 request_number: string;
 request_type: string;
 title: string;
 description: string;
 priority: string;
 status: string;
 profile_id: string;
 staff_id: string | null;
 legal_entity_id: string | null;
 branch_id: string | null;
 start_date: string | null;
 end_date: string | null;
 created_at: string;
 reviewer_note: string | null;
 metadata: unknown;
};

type AgentPriceGroupRow = {
 id: string;
 code: string | null;
 name: string;
 payment_exempt: boolean | null;
};

type AgentAccountRow = {
 id: string;
 profile_id: string | null;
 company_name: string;
 registration_no: string | null;
 contact_person: string | null;
 contact_email: string | null;
 contact_phone: string | null;
 status: string;
 assigned_price_group_id: string | null;
 created_at: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
 if (Array.isArray(value)) return value[0] ?? null;
 return value ?? null;
}

function metadataRecord(value: unknown): Record<string, unknown> | null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 return value as Record<string, unknown>;
}

function amLeaveCoverRecord(value: unknown): Record<string, unknown> | null {
 const metadata = metadataRecord(value);
 const cover =
 metadata?.am_leave_cover &&
 typeof metadata.am_leave_cover === 'object' &&
 !Array.isArray(metadata.am_leave_cover)
 ? (metadata.am_leave_cover as Record<string, unknown>)
 : null;
 return cover?.required === true ? cover : null;
}

function companyFallback(code: string, field: 'name' | 'legalName' | 'scope') {
 const def = LEGAL_ENTITIES.find((e) => e.code === code);
 return def?.[field] ?? null;
}

function sortPeople(a: HrStaffPerson, b: HrStaffPerson) {
 const aBranch = `${a.branch_code ?? 'ZZZ'}-${a.staff_code}`;
 const bBranch = `${b.branch_code ?? 'ZZZ'}-${b.staff_code}`;
 return aBranch.localeCompare(bBranch) || a.full_name.localeCompare(b.full_name);
}

function emptySummary(): HrCompanyGroup['summary'] {
 return {
 total: 0,
 active: 0,
 local: 0,
 foreign: 0,
 management: 0,
 branch_staff: 0,
 portal_ready: 0,
 profile_complete: 0,
 on_hold: 0,
 };
}

function addToSummary(summary: HrCompanyGroup['summary'], person: HrStaffPerson, onHold = false) {
 summary.total += 1;
 if (person.status === 'ACTIVE') summary.active += 1;
 if (person.worker_type === 'LOCAL') summary.local += 1;
 if (person.worker_type === 'FOREIGN') summary.foreign += 1;
 if (person.source === 'profile') summary.management += 1;
 if (person.source === 'staff') summary.branch_staff += 1;
 if (person.email) summary.portal_ready += 1;
 if (person.profile_completed_at) summary.profile_complete += 1;
 if (onHold) summary.on_hold += 1;
}

export async function getCompanyHrDashboard(
 supabase: SupabaseClient,
 organizationId: string,
 options: { allowedLegalEntityCodes?: string[] | null } = {}): Promise<HrDashboardData> {
 const [
 { data: legalRows, error: legalError },
 { data: staffRows, error: staffError },
 { data: leaveRows, error: leaveError },
 { data: profileRows, error: profileError },
 { data: agentRows, error: agentError },
 { data: agentPriceRows, error: agentPriceError },
 { data: serviceRequestRows, error: serviceRequestError },
 ] = await Promise.all([
 supabase.from('legal_entities').select('id, code, name, legal_name, scope, status, sort_order').eq('organization_id', organizationId).order('sort_order'),
 supabase.from('staff').select('id, staff_code, full_name, status, worker_type, weekly_amount, monthly_amount, legal_entity_id, on_hold, profile_id, branch:branches!staff_branch_id_fkey(branch_code, branch_name), region:regions!staff_region_id_fkey(name), profile:profiles!staff_profile_id_fkey(id, employee_code, full_name, email, phone, role, status, legal_entity_id, must_change_password, profile_completed_at, last_login_at)').eq('organization_id', organizationId).eq('status', 'ACTIVE').order('staff_code'),
 supabase.from('hr_leave_balances').select('*').eq('organization_id', organizationId).order('leave_year', { ascending: false }).order('leave_type'),
 supabase.from('profiles').select('id, employee_code, full_name, email, phone, role, status, legal_entity_id, metadata, branch:branches!profiles_branch_id_fkey(branch_code, branch_name), region:regions!profiles_region_id_fkey(name), must_change_password, profile_completed_at, last_login_at').eq('organization_id', organizationId).eq('status', 'ACTIVE').order('full_name'),
 supabase.from('sales_agent_accounts').select('id, profile_id, company_name, registration_no, contact_person, contact_email, contact_phone, status, assigned_price_group_id, created_at').eq('organization_id', organizationId).is('archived_at', null).neq('status', 'SUSPENDED').order('company_name'),
 supabase.from('agent_price_groups').select('id, code, name, payment_exempt').eq('organization_id', organizationId).eq('status', 'ACTIVE').order('name'),
 supabase.from('hr_service_requests').select('id, request_number, request_type, title, description, priority, status, profile_id, staff_id, legal_entity_id, branch_id, start_date, end_date, created_at, reviewer_note, metadata').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(20),
 ]);

 if (legalError) throw new Error(legalError.message);
 if (staffError) throw new Error(staffError.message);
 if (leaveError) throw new Error(leaveError.message);
 if (profileError) throw new Error(profileError.message);
 if (agentError) throw new Error(agentError.message);
 if (agentPriceError) throw new Error(agentPriceError.message);
 if (serviceRequestError) throw new Error(serviceRequestError.message);

 const allowedCodes = options.allowedLegalEntityCodes ?? null;
 const legalEntities = ((legalRows ?? []) as LegalEntityRow[]).filter(
 (entity) => allowedCodes == null || allowedCodes.includes(entity.code));
 const allowedEntityIds = new Set(legalEntities.map((entity) => entity.id));
 const companies = new Map<string, HrCompanyGroup>();
 for (const entity of legalEntities) {
 companies.set(entity.id, {
 id: entity.id,
 code: entity.code,
 name: entity.name || companyFallback(entity.code, 'name') || entity.code,
 legal_name: legalEntityLabel(entity.code, entity.legal_name),
 scope: entity.scope || companyFallback(entity.code, 'scope'),
 status: entity.status,
 sort_order: entity.sort_order,
 people: [],
 agents: [],
 agent_price_groups: [],
 summary: emptySummary(),
 });
 }

 const agentPriceGroups = ((agentPriceRows ?? []) as AgentPriceGroupRow[]).map((group) => ({
 id: group.id,
 code: group.code,
 name: group.name,
 payment_exempt: Boolean(group.payment_exempt),
 }));
 const agentPriceGroupById = new Map(agentPriceGroups.map((group) => [group.id, group]));
 const distributorCompany = [...companies.values()].find((company) => company.code === 'RKJ_DIST');
 if (distributorCompany) {
 distributorCompany.agent_price_groups = agentPriceGroups;
 distributorCompany.agents = ((agentRows ?? []) as AgentAccountRow[]).map((agent) => {
 const group = agent.assigned_price_group_id ? agentPriceGroupById.get(agent.assigned_price_group_id) : null;
 const typeLabel = group?.payment_exempt
 ? 'Ejen Khas Syarikat'
 : group?.name
 ? `Ejen Biasa - ${group.name}`
 : 'Ejen Biasa - Default sistem';
 return {
 id: agent.id,
 profile_id: agent.profile_id,
 company_name: agent.company_name,
 registration_no: agent.registration_no,
 contact_person: agent.contact_person,
 contact_email: agent.contact_email,
 contact_phone: agent.contact_phone,
 status: agent.status,
 assigned_price_group_id: agent.assigned_price_group_id,
 price_group_code: group?.code ?? null,
 price_group_name: group?.name ?? null,
 payment_exempt: Boolean(group?.payment_exempt),
 agent_type_label: typeLabel,
 created_at: agent.created_at,
 };
 }).sort((a, b) => a.company_name.localeCompare(b.company_name));
 }

 const staffProfileIds = new Set<string>();
 const unassigned: HrStaffPerson[] = [];
 const group_owners: HrStaffPerson[] = [];
 const groupOwnerProfileIds = new Set<string>();
 const consumedStaffIds = new Set<string>();

 const profileById = new Map<string, ProfileLite>();
 const staffByProfile = new Map<string, StaffRow[]>();
 const scopedStaffRows = ((staffRows ?? []) as StaffRow[]).filter(
 (staff) => allowedCodes == null || (staff.legal_entity_id != null && allowedEntityIds.has(staff.legal_entity_id)));
 const scopedProfileRows = ((profileRows ?? []) as ProfileLite[]).filter(
 (profile) => allowedCodes == null || (profile.legal_entity_id != null && allowedEntityIds.has(profile.legal_entity_id)));

 for (const profile of scopedProfileRows) {
 profileById.set(profile.id, profile);
 }

 const scopedStaffIds = new Set(scopedStaffRows.map((staff) => staff.id));
 const leaveBalancesByStaff = new Map<string, HrLeaveBalanceSummary[]>();
 for (const row of (leaveRows ?? []) as LeaveBalanceRow[]) {
 if (!scopedStaffIds.has(row.staff_id)) continue;
 const balance: HrLeaveBalanceSummary = {
 id: row.id,
 staff_id: row.staff_id,
 profile_id: row.profile_id,
 leave_year: row.leave_year,
 leave_type: row.leave_type as HrLeaveType,
 entitlement_days: Number(row.entitlement_days ?? 0),
 carried_forward_days: Number(row.carried_forward_days ?? 0),
 used_days: Number(row.used_days ?? 0),
 pending_days: Number(row.pending_days ?? 0),
 adjustment_days: Number(row.adjustment_days ?? 0),
 remaining_days: Number(row.remaining_days ?? remainingLeaveDays(row)),
 notes: row.notes,
 updated_at: row.updated_at,
 remaining: Number(row.remaining_days ?? remainingLeaveDays(row)),
 };
 leaveBalancesByStaff.set(row.staff_id, [...(leaveBalancesByStaff.get(row.staff_id) ?? []), balance]);
 }

 for (const staff of scopedStaffRows) {
 if (!staff.profile_id) continue;
 const list = staffByProfile.get(staff.profile_id) ?? [];
 list.push(staff);
 staffByProfile.set(staff.profile_id, list);
 }

 for (const [profileId, rows] of staffByProfile) {
 const entityIds = new Set(rows.map((r) => r.legal_entity_id).filter(Boolean));
 const profileMeta = profileById.get(profileId)?.metadata;
 if (entityIds.size >= 2 || isGroupOwnerMetadata(profileMeta)) {
 groupOwnerProfileIds.add(profileId);
 }
 }

 for (const profile of scopedProfileRows) {
 if (isGroupOwnerMetadata(profile.metadata)) {
 groupOwnerProfileIds.add(profile.id);
 }
 }

 for (const profileId of groupOwnerProfileIds) {
 const rows = staffByProfile.get(profileId) ?? [];
 const profile = profileById.get(profileId) ?? one(rows[0]?.profile);
 if (!profile) continue;

 const employments: HrEmployment[] = rows.map((staff) => {
 const company = staff.legal_entity_id ? companies.get(staff.legal_entity_id) : null;
 consumedStaffIds.add(staff.id);
 return {
 staff_id: staff.id,
 staff_code: staff.staff_code,
 legal_entity_code: company?.code ?? ' - ',
 legal_entity_name: company?.legal_name ?? company?.code ?? ' - ',
 monthly_amount: staff.monthly_amount,
 weekly_amount: staff.weekly_amount,
 status: staff.status,
 };
 }).sort(
 (a, b) =>
 LEGAL_ENTITIES.findIndex((e) => e.code === a.legal_entity_code) -
 LEGAL_ENTITIES.findIndex((e) => e.code === b.legal_entity_code));

 const branch = one(profile.branch);
 const region = one(profile.region);
 const totalMonthly = sumMonthlyEmployments(employments);
 const totalWeekly = sumWeeklyEmployments(employments);

 group_owners.push({
 id: profile.id,
 staff_id: employments[0]?.staff_id ?? null,
 profile_id: profile.id,
 staff_code: profile.employee_code ?? employments.map((e) => e.staff_code).join(' - '),
 full_name: profile.full_name,
 email: profile.email,
 phone: profile.phone,
 role: profile.role,
 status: profile.status,
 worker_type: rows[0]?.worker_type ?? 'LOCAL',
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? 'Pemilik Kumpulan / HQ',
 region_name: region?.name ?? null,
 monthly_amount: totalMonthly,
 weekly_amount: totalWeekly,
 must_change_password: profile.must_change_password,
 profile_completed_at: profile.profile_completed_at,
 last_login_at: profile.last_login_at,
 source: 'profile',
 legal_entity_code: null,
 is_group_owner: true,
 employments,
 total_monthly_amount: totalMonthly,
 total_weekly_amount: totalWeekly,
 legal_entity_codes: employments.map((e) => e.legal_entity_code),
 leave_balances: rows.flatMap((staff) => leaveBalancesByStaff.get(staff.id) ?? []),
 });
 }

 for (const staff of scopedStaffRows) {
 if (consumedStaffIds.has(staff.id)) continue;

 const branch = one(staff.branch);
 const region = one(staff.region);
 const profile = one(staff.profile);
 if (profile?.id) staffProfileIds.add(profile.id);
 if (profile?.id && groupOwnerProfileIds.has(profile.id)) continue;

 const company = staff.legal_entity_id ? companies.get(staff.legal_entity_id) : null;

 const person: HrStaffPerson = {
 id: staff.id,
 staff_id: staff.id,
 profile_id: profile?.id ?? staff.profile_id,
 staff_code: staff.staff_code,
 full_name: staff.full_name,
 email: profile?.email ?? null,
 phone: profile?.phone ?? null,
 role: profile?.role ?? 'STAFF_RECORD',
 status: staff.status,
 worker_type: staff.worker_type,
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? null,
 region_name: region?.name ?? null,
 weekly_amount: staff.weekly_amount,
 monthly_amount: staff.monthly_amount,
 must_change_password: profile?.must_change_password ?? null,
 profile_completed_at: profile?.profile_completed_at ?? null,
 last_login_at: profile?.last_login_at ?? null,
 source: 'staff',
 legal_entity_code: company?.code ?? null,
 leave_balances: leaveBalancesByStaff.get(staff.id) ?? [],
 };
 if (company) {
 company.people.push(person);
 addToSummary(company.summary, person, Boolean(staff.on_hold));
 } else {
 unassigned.push(person);
 }
 }

 for (const profile of scopedProfileRows) {
 if (staffProfileIds.has(profile.id)) continue;
 if (groupOwnerProfileIds.has(profile.id)) continue;
 if (isMergedProfile(profile.metadata)) continue;

 const branch = one(profile.branch);
 const region = one(profile.region);
 const company = profile.legal_entity_id ? companies.get(profile.legal_entity_id) : null;
 const person: HrStaffPerson = {
 id: profile.id,
 staff_id: null,
 profile_id: profile.id,
 staff_code: profile.employee_code ?? profile.role,
 full_name: profile.full_name,
 email: profile.email,
 phone: profile.phone,
 role: profile.role,
 status: profile.status,
 worker_type: null,
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? null,
 region_name: region?.name ?? null,
 weekly_amount: null,
 monthly_amount: null,
 must_change_password: profile.must_change_password,
 profile_completed_at: profile.profile_completed_at,
 last_login_at: profile.last_login_at,
 source: 'profile',
 legal_entity_code: company?.code ?? null,
 leave_balances: [],
 };
 if (company) {
 company.people.push(person);
 addToSummary(company.summary, person);
 } else {
 unassigned.push(person);
 }
 }

 const companyList = [...companies.values()].map((company) => ({...company, people: company.people.sort(sortPeople) })).sort((a, b) => a.sort_order - b.sort_order || a.legal_name.localeCompare(b.legal_name));

 const requestBranchIds = [
 ...new Set(((serviceRequestRows ?? []) as HrServiceRequestRow[]).map((row) => row.branch_id).filter(Boolean) as string[]),
 ];
 const { data: requestBranches } = requestBranchIds.length
 ? await supabase.from('branches').select('id, branch_code, branch_name').in('id', requestBranchIds)
 : { data: [] };
 const requestBranchById = new Map(
 ((requestBranches ?? []) as Array<{ id: string; branch_code: string | null; branch_name: string | null }>).map(
 (branch) => [branch.id, branch]));
 const staffById = new Map(scopedStaffRows.map((staff) => [staff.id, staff]));
 const serviceRequests: HrServiceRequestSummary[] = ((serviceRequestRows ?? []) as HrServiceRequestRow[])
 .filter((request) => !allowedEntityIds.size || !request.legal_entity_id || allowedEntityIds.has(request.legal_entity_id))
 .map((request) => {
 const profile = profileById.get(request.profile_id);
 const staff = request.staff_id ? staffById.get(request.staff_id) : null;
 const company = request.legal_entity_id ? companies.get(request.legal_entity_id) : null;
 const branch = request.branch_id ? requestBranchById.get(request.branch_id) : null;
 const metadata = metadataRecord(request.metadata);
 const amLeaveCover = amLeaveCoverRecord(request.metadata);
 return {
 id: request.id,
 request_number: request.request_number,
 request_type: request.request_type,
 title: request.title,
 description: request.description,
 priority: request.priority,
 status: request.status,
 requester_name: profile?.full_name ?? staff?.full_name ?? null,
 staff_code: staff?.staff_code ?? profile?.employee_code ?? null,
 legal_entity_code: company?.code ?? null,
 legal_entity_name: company?.legal_name ?? null,
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? null,
 start_date: request.start_date,
 end_date: request.end_date,
 created_at: request.created_at,
 reviewer_note: request.reviewer_note,
 metadata,
 am_leave_cover_required: Boolean(amLeaveCover),
 am_leave_cover_status: typeof amLeaveCover?.status === 'string' ? amLeaveCover.status : null,
 am_leave_covered_by: typeof amLeaveCover?.covered_by === 'string' ? amLeaveCover.covered_by : null,
 am_leave_covered_at: typeof amLeaveCover?.covered_at === 'string' ? amLeaveCover.covered_at : null,
 };
 });

 const sortedGroupOwners = group_owners.sort((a, b) => a.full_name.localeCompare(b.full_name));
 const allSummaries = companyList.map((c) => c.summary);
 const companyPeople = allSummaries.reduce((n, s) => n + s.total, 0);
 const allLeaveBalances = [...leaveBalancesByStaff.values()].flat();
 return {
 companies: companyList,
 group_owners: sortedGroupOwners,
 unassigned: unassigned.sort(sortPeople),
 service_requests: serviceRequests,
 summary: {
 total_companies: companyList.length,
 total_people: companyPeople + unassigned.length + sortedGroupOwners.length,
 active_people:
 allSummaries.reduce((n, s) => n + s.active, 0) +
 unassigned.filter((p) => p.status === 'ACTIVE').length +
 sortedGroupOwners.filter((p) => p.status === 'ACTIVE').length,
 management_people:
 allSummaries.reduce((n, s) => n + s.management, 0) +
 unassigned.filter((p) => p.source === 'profile').length +
 sortedGroupOwners.length,
 branch_staff: allSummaries.reduce((n, s) => n + s.branch_staff, 0),
 profile_complete:
 allSummaries.reduce((n, s) => n + s.profile_complete, 0) +
 unassigned.filter((p) => p.profile_completed_at).length +
 sortedGroupOwners.filter((p) => p.profile_completed_at).length,
 leave_balances: allLeaveBalances.length,
 leave_pending: allLeaveBalances.reduce((sum, balance) => sum + Number(balance.pending_days ?? 0), 0),
 },
 };
}
