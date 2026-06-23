import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserRole } from '@/types/enums';
import { LEGAL_ENTITIES, legalEntityLabel } from '@/lib/brand/legal-entities';

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
};

export type HrDashboardData = {
  companies: HrCompanyGroup[];
  unassigned: HrStaffPerson[];
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

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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
  organizationId: string
): Promise<HrDashboardData> {
  const [{ data: legalRows, error: legalError }, { data: staffRows, error: staffError }, { data: profileRows, error: profileError }] = await Promise.all([
    supabase
      .from('legal_entities')
      .select('id, code, name, legal_name, scope, status, sort_order')
      .eq('organization_id', organizationId)
      .order('sort_order'),
    supabase
      .from('staff')
      .select('id, staff_code, full_name, status, worker_type, weekly_amount, monthly_amount, legal_entity_id, on_hold, profile_id, branch:branches!staff_branch_id_fkey(branch_code, branch_name), region:regions!staff_region_id_fkey(name), profile:profiles!staff_profile_id_fkey(id, employee_code, full_name, email, phone, role, status, legal_entity_id, must_change_password, profile_completed_at, last_login_at)')
      .eq('organization_id', organizationId)
      .order('staff_code'),
    supabase
      .from('profiles')
      .select('id, employee_code, full_name, email, phone, role, status, legal_entity_id, branch:branches!profiles_branch_id_fkey(branch_code, branch_name), region:regions!profiles_region_id_fkey(name), must_change_password, profile_completed_at, last_login_at')
      .eq('organization_id', organizationId)
      .order('full_name'),
  ]);

  if (legalError) throw new Error(legalError.message);
  if (staffError) throw new Error(staffError.message);
  if (profileError) throw new Error(profileError.message);

  const legalEntities = (legalRows ?? []) as LegalEntityRow[];
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
      summary: emptySummary(),
    });
  }

  const staffProfileIds = new Set<string>();
  const unassigned: HrStaffPerson[] = [];

  for (const staff of (staffRows ?? []) as StaffRow[]) {
    const branch = one(staff.branch);
    const region = one(staff.region);
    const profile = one(staff.profile);
    if (profile?.id) staffProfileIds.add(profile.id);

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
    };
    if (company) {
      company.people.push(person);
      addToSummary(company.summary, person, Boolean(staff.on_hold));
    } else {
      unassigned.push(person);
    }
  }

  for (const profile of (profileRows ?? []) as ProfileLite[]) {
    if (staffProfileIds.has(profile.id)) continue;
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
    };
    if (company) {
      company.people.push(person);
      addToSummary(company.summary, person);
    } else {
      unassigned.push(person);
    }
  }

  const companyList = [...companies.values()]
    .map((company) => ({ ...company, people: company.people.sort(sortPeople) }))
    .sort((a, b) => a.sort_order - b.sort_order || a.legal_name.localeCompare(b.legal_name));

  const allSummaries = companyList.map((c) => c.summary);
  return {
    companies: companyList,
    unassigned: unassigned.sort(sortPeople),
    summary: {
      total_companies: companyList.length,
      total_people: allSummaries.reduce((n, s) => n + s.total, 0) + unassigned.length,
      active_people: allSummaries.reduce((n, s) => n + s.active, 0),
      management_people: allSummaries.reduce((n, s) => n + s.management, 0),
      branch_staff: allSummaries.reduce((n, s) => n + s.branch_staff, 0),
      profile_complete: allSummaries.reduce((n, s) => n + s.profile_complete, 0),
    },
  };
}
