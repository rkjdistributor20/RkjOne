import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import type { HrServiceRequest } from '@/types/database';

const READ_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATION_MANAGER']);
const COVER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']);

type ProfileLite = {
 id: string;
 full_name: string;
 email: string | null;
 employee_code: string | null;
 role: string;
 branch_id: string | null;
 region_id: string | null;
};

type BranchLite = {
 id: string;
 branch_code: string | null;
 branch_name: string | null;
};

type RegionLite = {
 id: string;
 name: string | null;
};

function metadataObject(value: unknown): Record<string, unknown> {
 return value && typeof value === 'object' && !Array.isArray(value)
 ? { ...(value as Record<string, unknown>) }
 : {};
}

function amLeaveCoverMeta(row: HrServiceRequest) {
 const metadata = metadataObject(row.metadata);
 const cover =
 metadata.am_leave_cover &&
 typeof metadata.am_leave_cover === 'object' &&
 !Array.isArray(metadata.am_leave_cover)
 ? (metadata.am_leave_cover as Record<string, unknown>)
 : null;
 return cover?.required === true ? cover : null;
}

function cleanNote(value: unknown) {
 const note = String(value ?? '').trim();
 return note ? note.slice(0, 1000) : null;
}

function serializeCoverageRequest(
 row: HrServiceRequest,
 lookups: {
 profiles: Map<string, ProfileLite>;
 branches: Map<string, BranchLite>;
 regions: Map<string, RegionLite>;
 },
) {
 const cover = amLeaveCoverMeta(row) ?? {};
 const requester = lookups.profiles.get(row.profile_id);
 const coveredBy = typeof cover.covered_by === 'string' ? lookups.profiles.get(cover.covered_by) : null;
 const branch = row.branch_id ? lookups.branches.get(row.branch_id) : null;
 const regionId =
 typeof cover.requester_region_id === 'string'
 ? cover.requester_region_id
 : requester?.region_id ?? null;
 const region = regionId ? lookups.regions.get(regionId) : null;

 return {
 id: row.id,
 request_number: row.request_number,
 title: row.title,
 description: row.description,
 priority: row.priority,
 status: row.status,
 requester_name: requester?.full_name ?? null,
 requester_email: requester?.email ?? null,
 employee_code: requester?.employee_code ?? null,
 branch_code: branch?.branch_code ?? null,
 branch_name: branch?.branch_name ?? null,
 region_name: region?.name ?? null,
 start_date: row.start_date,
 end_date: row.end_date,
 created_at: row.created_at,
 reviewer_note: row.reviewer_note,
 coverage_status: typeof cover.status === 'string' ? cover.status : 'PENDING_OM_REVIEW',
 covered_by_name: coveredBy?.full_name ?? null,
 covered_at: typeof cover.covered_at === 'string' ? cover.covered_at : null,
 cover_note: typeof cover.cover_note === 'string' ? cover.cover_note : null,
 };
}

async function loadLookups(
 service: Awaited<ReturnType<typeof createServiceClient>>,
 rows: HrServiceRequest[],
 organizationId: string,
) {
 const profileIds = new Set<string>();
 const branchIds = new Set<string>();
 const regionIds = new Set<string>();

 for (const row of rows) {
 profileIds.add(row.profile_id);
 if (row.branch_id) branchIds.add(row.branch_id);
 const cover = amLeaveCoverMeta(row);
 if (typeof cover?.covered_by === 'string') profileIds.add(cover.covered_by);
 if (typeof cover?.requester_region_id === 'string') regionIds.add(cover.requester_region_id);
 }

 const [{ data: profileRows }, { data: branchRows }, { data: regionRows }] = await Promise.all([
 profileIds.size
 ? service
 .from('profiles')
 .select('id, full_name, email, employee_code, role, branch_id, region_id')
 .eq('organization_id', organizationId)
 .in('id', [...profileIds])
 : Promise.resolve({ data: [] }),
 branchIds.size
 ? service.from('branches').select('id, branch_code, branch_name').eq('organization_id', organizationId).in('id', [...branchIds])
 : Promise.resolve({ data: [] }),
 regionIds.size
 ? service.from('regions').select('id, name').eq('organization_id', organizationId).in('id', [...regionIds])
 : Promise.resolve({ data: [] }),
 ]);

 for (const profile of (profileRows ?? []) as ProfileLite[]) {
 if (profile.region_id) regionIds.add(profile.region_id);
 }

 let extraRegionRows: RegionLite[] = [];
 const missingRegionIds = [...regionIds].filter(
 (id) => !((regionRows ?? []) as RegionLite[]).some((region) => region.id === id),
 );
 if (missingRegionIds.length) {
 const { data } = await service
 .from('regions')
 .select('id, name')
 .eq('organization_id', organizationId)
 .in('id', missingRegionIds);
 extraRegionRows = (data ?? []) as RegionLite[];
 }

 return {
 profiles: new Map(((profileRows ?? []) as ProfileLite[]).map((profile) => [profile.id, profile])),
 branches: new Map(((branchRows ?? []) as BranchLite[]).map((branch) => [branch.id, branch])),
 regions: new Map(
 [...((regionRows ?? []) as RegionLite[]), ...extraRegionRows].map((region) => [region.id, region]),
 ),
 };
}

export async function GET() {
 try {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!READ_ROLES.has(profile.role)) {
 return NextResponse.json({ error: 'Tiada akses untuk senarai cover cuti AM.' }, { status: 403 });
 }

 const service = await createServiceClient();
 const { data, error } = await service
 .from('hr_service_requests')
 .select('*')
 .eq('organization_id', profile.organization_id)
 .eq('request_type', 'LEAVE')
 .in('status', ['SUBMITTED', 'IN_REVIEW'])
 .order('created_at', { ascending: false })
 .limit(60);

 if (error) throw error;

 const rows = ((data ?? []) as HrServiceRequest[]).filter((row) => amLeaveCoverMeta(row));
 const lookups = await loadLookups(service, rows, profile.organization_id);
 return NextResponse.json({
 requests: rows.map((row) => serializeCoverageRequest(row, lookups)),
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal memuatkan cover cuti AM.' },
 { status: 500 },
 );
 }
}

export async function PATCH(request: Request) {
 try {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!COVER_ROLES.has(profile.role)) {
 return NextResponse.json({ error: 'Hanya OM/Admin boleh ambil cover cuti AM.' }, { status: 403 });
 }

 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const requestId = String(body.request_id ?? '').trim();
 if (!requestId) return NextResponse.json({ error: 'Permohonan perlu dipilih.' }, { status: 400 });

 const service = await createServiceClient();
 const { data: existing, error: existingError } = await service
 .from('hr_service_requests')
 .select('*')
 .eq('id', requestId)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();

 if (existingError) throw existingError;
 if (!existing) return NextResponse.json({ error: 'Permohonan HR tidak ditemui.' }, { status: 404 });

 const row = existing as HrServiceRequest;
 if (row.profile_id === profile.id) {
 return NextResponse.json({ error: 'OM tidak boleh cover permohonan sendiri.' }, { status: 403 });
 }
 if (row.request_type !== 'LEAVE' || !['SUBMITTED', 'IN_REVIEW'].includes(row.status)) {
 return NextResponse.json({ error: 'Hanya permohonan cuti aktif boleh di-cover oleh OM.' }, { status: 400 });
 }

 const cover = amLeaveCoverMeta(row);
 if (!cover) {
 return NextResponse.json({ error: 'Permohonan ini bukan cuti AM yang perlukan cover OM.' }, { status: 400 });
 }

 const now = new Date().toISOString();
 const note = cleanNote(body.reviewer_note) ?? 'OM mengambil cover sementara kawasan AM bercuti.';
 const metadata = {
 ...metadataObject(row.metadata),
 am_leave_cover: {
 ...cover,
 status: 'OM_COVER_ASSIGNED',
 covered_by: profile.id,
 covered_at: now,
 cover_note: note,
 },
 };

 const { data, error } = await service
 .from('hr_service_requests')
 .update({
 status: 'IN_REVIEW',
 reviewer_note: note,
 reviewed_by: profile.id,
 reviewed_at: now,
 metadata,
 updated_at: now,
 } as never)
 .eq('id', row.id)
 .eq('organization_id', profile.organization_id)
 .select('*')
 .single();

 if (error) throw error;
 const updated = data as HrServiceRequest;
 const lookups = await loadLookups(service, [updated], profile.organization_id);

 return NextResponse.json({
 request: serializeCoverageRequest(updated, lookups),
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal ambil cover cuti AM.' },
 { status: 400 },
 );
 }
}
