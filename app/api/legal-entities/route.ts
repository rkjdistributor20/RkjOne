import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createServiceClient } from '@/lib/supabase/server';
import { loadAllLegalEntityProfiles, type LegalEntityCompanyProfile, type LegalEntityDocument } from '@/lib/brand/legal-entity-profile';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonWithPrivateCache } from '@/lib/http/cache';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR']);
const GLOBAL_VIEW_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR']);

type BranchRow = { id: string; branch_name: string | null; branch_code: string | null };

function normalize(text: string) {
 return text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

async function loadBranches(service: SupabaseClient, organizationId: string) {
 const { data, error } = await service.from('branches').select('id, branch_name, branch_code').eq('organization_id', organizationId);
 if (error) throw new Error(error.message);
 return (data ?? []) as BranchRow[];
}

function matchBranch(branchName: string | null, branches: BranchRow[]) {
 if (!branchName) return null;
 const needle = normalize(branchName);
 return (
 branches.find((branch) => normalize(branch.branch_name ?? '') === needle || normalize(branch.branch_code ?? '') === needle) ??
 branches.find((branch) => {
 const name = normalize(branch.branch_name ?? '');
 const code = normalize(branch.branch_code ?? '');
 return (name && (needle.includes(name) || name.includes(needle))) || (code && needle.includes(code));
 }) ??
 null);
}

async function filterCompaniesForProfile(
 service: SupabaseClient,
 profile: Awaited<ReturnType<typeof getCurrentProfile>>,
 companies: LegalEntityCompanyProfile[]) {
 if (!profile || GLOBAL_VIEW_ROLES.has(profile.role)) return companies;

 const ownCode = profile.legal_entity?.code ?? (profile.branch_id ? 'RKJ' : null);
 let visibleCompanies = ownCode ? companies.filter((company) => company.code === ownCode) : companies;

 const branches = await loadBranches(service, profile.organization_id);
 const scope = await resolveScopedBranches(service, profile).catch(() => ({ branchIds: [], regionId: null, branchId: null }));
 const allowAllBranches = scope.branchIds === null;
 const allowedBranchIds = scope.branchIds ?? [];

 visibleCompanies = visibleCompanies.map((company) => ({...company,
 documents: (company.documents ?? []).filter((doc: LegalEntityDocument) => {
 if (!doc.branchName) return true;
 const branch = matchBranch(doc.branchName, branches);
 if (!branch?.id) return false;
 return allowAllBranches || allowedBranchIds.includes(branch.id);
 }),
 }));

 return visibleCompanies;
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const service = await createServiceClient();
 const companies = await loadAllLegalEntityProfiles(service, profile.organization_id);
 const visibleCompanies = await filterCompaniesForProfile(service, profile, companies);
 return jsonWithPrivateCache({ companies: visibleCompanies }, 30, 120);
}

export async function PATCH(request: Request) {
 try {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!ADMIN_ROLES.has(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

 const body = await request.json().catch(() => ({}));
 const code = String(body.code ?? '').trim();
 if (!code) return NextResponse.json({ error: 'Kod syarikat diperlukan' }, { status: 400 });

 const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
 const map: Record<string, string> = {
 legalName: 'legal_name',
 name: 'name',
 scope: 'scope',
 address: 'office_address',
 phone: 'phone',
 email: 'email',
 registrationNo: 'registration_no',
 taxId: 'tax_id',
 bankName: 'bank_name',
 bankAccountName: 'bank_account_name',
 bankAccountNo: 'bank_account_no',
 };

 for (const [inputKey, column] of Object.entries(map)) {
 if (body[inputKey] !== undefined) {
 const value = String(body[inputKey] ?? '').trim();
 updates[column] = value || null;
 }
 }

 const service = await createServiceClient();
 const { error } = await (service as any).from('legal_entities').update(updates).eq('organization_id', profile.organization_id).eq('code', code);
 if (error) throw new Error(error.message);

 const companies = await loadAllLegalEntityProfiles(service, profile.organization_id);
 return NextResponse.json({ companies });
 } catch (error) {
 return NextResponse.json(
 { error: error instanceof Error ? error.message : 'Gagal kemaskini profil syarikat' },
 { status: 400 });
 }
}
