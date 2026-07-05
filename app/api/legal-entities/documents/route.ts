import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createServiceClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

const GLOBAL_DOC_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR']);
const SCOPED_DOC_ROLES = new Set(['OPERATION_MANAGER', 'AREA_MANAGER', 'BRANCH_MANAGER', 'STAFF']);
const BUCKET = 'company-documents';

type BranchRow = { id: string; branch_name: string | null; branch_code: string | null };
type ExistingDocumentRow = {
 id: string;
 branch_name: string | null;
 legal_entity?: { code: string | null } | { code: string | null }[] | null;
};

function clean(value: FormDataEntryValue | null) {
 const text = typeof value === 'string' ? value.trim() : '';
 return text || null;
}

function safeFileName(name: string) {
 return name.replace(/[^\w.\-() ]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function normalize(text: string) {
 return text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function one<T>(value: T | T[] | null | undefined): T | null {
 if (Array.isArray(value)) return value[0] ?? null;
 return value ?? null;
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

async function canManageDocument(
 service: SupabaseClient,
 profile: Awaited<ReturnType<typeof getCurrentProfile>>,
 branchName: string | null) {
 if (!profile) return false;
 if (GLOBAL_DOC_ROLES.has(profile.role)) return true;
 if (!SCOPED_DOC_ROLES.has(profile.role)) return false;

 if (!branchName) {
 return profile.role === 'OPERATION_MANAGER';
 }

 const branch = await findBranchByName(service, profile.organization_id, branchName);
 if (!branch?.id) return false;

 const scope = await resolveScopedBranches(service, profile);
 if (scope.branchIds === null) return true;
 return scope.branchIds.includes(branch.id);
}

async function requireDocumentAccess(
 service: SupabaseClient,
 profile: Awaited<ReturnType<typeof getCurrentProfile>>,
 branchName: string | null) {
 if (!(await canManageDocument(service, profile, branchName))) {
 throw new Response('Akses dokumen cawangan ini tidak dibenarkan', { status: 403 });
 }
}

async function getExistingDocument(service: SupabaseClient, organizationId: string, id: string) {
 const { data, error } = await service.from('legal_entity_documents').select('id, branch_name, legal_entity:legal_entities(code)').eq('id', id).eq('organization_id', organizationId).maybeSingle();
 if (error) throw new Error(error.message);
 return data as ExistingDocumentRow | null;
}

function jsonError(error: unknown, fallback: string) {
 if (error instanceof Response) {
 return NextResponse.json({ error: error.statusText || fallback }, { status: error.status });
 }
 return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}

export async function POST(request: Request) {
 try {
 const profile = await getCurrentProfile();
 if (!profile) throw new Response('Unauthorized', { status: 401 });

 const service = await createServiceClient();
 const form = await request.formData();
 const documentId = clean(form.get('id'));
 const code = clean(form.get('code'));
 const title = clean(form.get('title'));
 const documentType = clean(form.get('documentType')) ?? 'OTHER';
 const branchName = clean(form.get('branchName'));
 const issueDate = clean(form.get('issueDate'));
 const expiryDate = clean(form.get('expiryDate'));
 const notes = clean(form.get('notes'));
 const file = form.get('file');

 if (!code && !documentId) return NextResponse.json({ error: 'Syarikat diperlukan' }, { status: 400 });
 if (!title && !(file instanceof File)) return NextResponse.json({ error: 'Tajuk atau fail diperlukan' }, { status: 400 });

 let existing: ExistingDocumentRow | null = null;
 if (documentId) {
 existing = await getExistingDocument(service, profile.organization_id, documentId);
 if (!existing) return NextResponse.json({ error: 'Dokumen tidak dijumpai' }, { status: 404 });
 }

 await requireDocumentAccess(service, profile, branchName ?? existing?.branch_name ?? null);

 let legalEntityId: string | null = null;
 if (code) {
 const { data: entity, error: entityErr } = await service.from('legal_entities').select('id').eq('organization_id', profile.organization_id).eq('code', code).maybeSingle();
 if (entityErr) throw new Error(entityErr.message);
 const entityRow = entity as { id?: string } | null;
 if (!entityRow?.id) return NextResponse.json({ error: 'Syarikat tidak dijumpai' }, { status: 404 });
 legalEntityId = entityRow.id;
 }

 let storagePath: string | null = null;
 let fileName: string | null = null;
 let fileSize: number | null = null;
 let mimeType: string | null = null;

 if (file instanceof File && file.size > 0) {
 fileName = safeFileName(file.name);
 fileSize = file.size;
 mimeType = file.type || 'application/octet-stream';
 const entityCode = code ?? one(existing?.legal_entity)?.code ?? 'UNKNOWN';
 storagePath = `${entityCode}/${Date.now()}-${fileName}`;
 const buffer = Buffer.from(await file.arrayBuffer());
 const { error: uploadErr } = await service.storage.from(BUCKET).upload(storagePath, buffer, {
 contentType: mimeType,
 upsert: false,
 });
 if (uploadErr) throw new Error(uploadErr.message);
 }

 const updates: Record<string, unknown> = {
 document_type: documentType,
 title: title ?? fileName ?? 'Dokumen Syarikat',
 branch_name: branchName,
 issue_date: issueDate,
 expiry_date: expiryDate,
 notes,
 status: 'ACTIVE',
 updated_at: new Date().toISOString(),
 };
 if (legalEntityId) updates.legal_entity_id = legalEntityId;
 if (storagePath) {
 updates.storage_path = storagePath;
 updates.file_name = fileName;
 updates.file_size = fileSize;
 updates.mime_type = mimeType;
 updates.folder_path = `${code}/uploaded`;
 }

 if (documentId) {
 const { error } = await (service as any).from('legal_entity_documents').update(updates).eq('id', documentId).eq('organization_id', profile.organization_id);
 if (error) throw new Error(error.message);
 } else {
 const { error } = await (service as any).from('legal_entity_documents').insert({
 organization_id: profile.organization_id,...updates,
 file_name: fileName ?? `${updates.title}.pdf`,
 });
 if (error) throw new Error(error.message);
 }

 return NextResponse.json({ ok: true });
 } catch (error) {
 return jsonError(error, 'Gagal simpan dokumen');
 }
}

export async function DELETE(request: Request) {
 try {
 const profile = await getCurrentProfile();
 if (!profile) throw new Response('Unauthorized', { status: 401 });

 const { searchParams } = new URL(request.url);
 const id = searchParams.get('id');
 if (!id) return NextResponse.json({ error: 'id dokumen diperlukan' }, { status: 400 });

 const service = await createServiceClient();
 const existing = await getExistingDocument(service, profile.organization_id, id);
 if (!existing) return NextResponse.json({ error: 'Dokumen tidak dijumpai' }, { status: 404 });
 await requireDocumentAccess(service, profile, existing.branch_name);

 const { error } = await (service as any).from('legal_entity_documents').update({ status: 'ARCHIVED', updated_at: new Date().toISOString() }).eq('id', id).eq('organization_id', profile.organization_id);
 if (error) throw new Error(error.message);

 return NextResponse.json({ ok: true });
 } catch (error) {
 return jsonError(error, 'Gagal arkib dokumen');
 }
}
