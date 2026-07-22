import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createAdminClient } from '@/lib/supabase/admin';
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
 legal_entity?: { code: string | null } | { code: string | null }[] | null;
};

function normalize(text: string) {
 return text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function one<T>(value: T | T[] | null | undefined): T | null {
 if (Array.isArray(value)) return value[0] ?? null;
 return value ?? null;
}

function safeFileName(name: string) {
 return name.replace(/[^\w.\-() ]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function unique(values: Array<string | null | undefined>) {
 return [...new Set(values.filter(Boolean) as string[])];
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
 // Dokumen HQ tanpa cawangan hanya boleh dibaca oleh peranan global di atas.
 if (!branchName) return false;
 if (!SCOPED_DOC_ROLES.has(profile.role)) return false;

 const branch = await findBranchByName(service, profile.organization_id, branchName);
 if (!branch?.id) return false;
 const scope = await resolveScopedBranches(service, profile);
 if (scope.branchIds === null) return true;
 return scope.branchIds.includes(branch.id);
}

async function findStoredDocument(
 service: SupabaseClient,
 id: string,
 row: DocumentRow) {
 const entityCode =
 one(row.legal_entity)?.code ??
 row.storage_path?.split('/')[0] ??
 null;
 const fileName = row.file_name?.trim() || 'dokumen-rkj-one';
 const candidates = unique([
 row.storage_path,
 entityCode ? `${entityCode}/${id}-${safeFileName(fileName)}` : null,
 ]);

 const tried = new Set<string>();
 let lastError: string | null = null;

 async function tryPath(path: string) {
 if (tried.has(path)) return null;
 tried.add(path);

 const { data: blob, error } = await service.storage
 .from(BUCKET)
 .download(path);

 if (error || !blob) {
 lastError = error?.message ?? 'Object not found';
 return null;
 }

 return { path, blob };
 }

 for (const path of candidates) {
 const found = await tryPath(path);
 if (found) return found;
 }

 if (entityCode) {
 const { data: objects } = await service.storage
 .from(BUCKET)
 .list(entityCode, { limit: 20, search: id });

 for (const object of objects ?? []) {
 const found = await tryPath(`${entityCode}/${object.name}`);
 if (found) return found;
 }
 }

 return { error: lastError ?? 'Object not found' };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { id } = await params;
 const service = createAdminClient();
 const { data: doc, error } = await service.from('legal_entity_documents').select('storage_path, branch_name, file_name, mime_type, legal_entity:legal_entities(code)').eq('id', id).eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').maybeSingle();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 const row = doc as DocumentRow | null;
 if (!row?.storage_path) return NextResponse.json({ error: 'Fail belum tersedia untuk download' }, { status: 404 });

 if (!(await canViewDocument(service, profile, row.branch_name ?? null))) {
 return NextResponse.json({ error: 'Akses dokumen cawangan ini tidak dibenarkan' }, { status: 403 });
 }

 const mode = new URL(request.url).searchParams.get('mode') === 'view' ? 'view' : 'download';
 const stored = await findStoredDocument(service, id, row);
 if ('error' in stored) {
 return NextResponse.json(
 { error: 'Fail dokumen tidak ditemui dalam storage. Sila muat naik semula fail dokumen ini.', detail: stored.error },
 { status: 404 });
 }

 const fileName = row.file_name?.trim() || 'dokumen-rkj-one';
 const dispositionMode = mode === 'download' ? 'attachment' : 'inline';
 const headers = new Headers();
 headers.set('Content-Type', row.mime_type || stored.blob.type || 'application/octet-stream');
 headers.set('Content-Disposition', `${dispositionMode}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
 headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
 headers.set('Pragma', 'no-cache');
 headers.set('Expires', '0');

 return new NextResponse(stored.blob.stream(), { status: 200, headers });
}
