import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createServiceClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'company-documents';
const GLOBAL_DOC_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR']);
const SCOPED_DOC_ROLES = new Set(['OPERATION_MANAGER', 'AREA_MANAGER', 'BRANCH_MANAGER', 'STAFF']);

type BranchRow = { id: string; branch_name: string | null; branch_code: string | null };
type DocumentRow = {
 storage_path?: string | null;
 branch_name?: string | null;
 file_name?: string | null;
 mime_type?: string | null;
};

function normalize(text: string) {
 return text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

async function findBranchByName(
 service: SupabaseClient,
 organizationId: string,
 branchName: string | null): Promise<BranchRow | null> {
 if (!branchName) return null;
 const { data, error } = await service.from('branches').select('id, branch_name, branch_code').eq('organization_id', organizationId);
 if (error) throw new Error(error.message);

 const needle = normalize(branchName);
 const branches = ((data ?? []) as BranchRow[]).filter((branch) => branch.branch_name || branch.branch_code);
 return (
 branches.find((branch) => normalize(branch.branch_name ?? '') === needle || normalize(branch.branch_code ?? '') === needle) ??
 branches.find((branch) => {
 const name = normalize(branch.branch_name ?? '');
 const code = normalize(branch.branch_code ?? '');
 return (name && (needle.includes(name) || name.includes(needle))) || (code && needle.includes(code));
 }) ??
 null);
}

async function canViewDocument(
 service: SupabaseClient,
 profile: Awaited<ReturnType<typeof getCurrentProfile>>,
 branchName: string | null) {
 if (!profile) return false;
 if (GLOBAL_DOC_ROLES.has(profile.role)) return true;
 if (!branchName) return true;
 if (!SCOPED_DOC_ROLES.has(profile.role)) return false;

 const branch = await findBranchByName(service, profile.organization_id, branchName);
 if (!branch?.id) return false;
 const scope = await resolveScopedBranches(service, profile);
 if (scope.branchIds === null) return true;
 return scope.branchIds.includes(branch.id);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { id } = await params;
 const service = await createServiceClient();
 const { data: doc, error } = await service.from('legal_entity_documents').select('storage_path, branch_name, file_name, mime_type').eq('id', id).eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').maybeSingle();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 const row = doc as DocumentRow | null;
 if (!row?.storage_path) return NextResponse.json({ error: 'Fail belum tersedia untuk download' }, { status: 404 });

 if (!(await canViewDocument(service, profile, row.branch_name ?? null))) {
 return NextResponse.json({ error: 'Akses dokumen cawangan ini tidak dibenarkan' }, { status: 403 });
 }

 const mode = new URL(request.url).searchParams.get('mode') === 'view' ? 'view' : 'download';
 const { data: signed, error: signedErr } = await service.storage.from(BUCKET).createSignedUrl(row.storage_path, 300);
 if (signedErr || !signed?.signedUrl) {
 return NextResponse.json({ error: signedErr?.message ?? 'Gagal jana link download' }, { status: 400 });
 }

 const upstream = await fetch(signed.signedUrl, { cache: 'no-store' });
 if (!upstream.ok || !upstream.body) {
 return NextResponse.json({ error: 'Fail dokumen tidak dapat dibaca dari storage' }, { status: 502 });
 }

 const fileName = row.file_name?.trim() || 'dokumen-rkj-one';
 const dispositionMode = mode === 'download' ? 'attachment' : 'inline';
 const headers = new Headers();
 headers.set('Content-Type', row.mime_type || upstream.headers.get('content-type') || 'application/octet-stream');
 headers.set('Content-Disposition', `${dispositionMode}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
 headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
 headers.set('Pragma', 'no-cache');
 headers.set('Expires', '0');

 return new NextResponse(upstream.body, { status: 200, headers });
}
