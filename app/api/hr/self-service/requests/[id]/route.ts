import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { canViewAllLegalEntities } from '@/lib/auth/legal-entity-scope';
import { createServiceClient } from '@/lib/supabase/server';
import { approveLeaveRequestUsage, releaseLeaveRequestPending } from '@/lib/hr/leave-balances';
import type { HrServiceRequest, HrServiceRequestStatus } from '@/types/database';

const HR_DECISION_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR']);
const OPERATIONS_REVIEW_ROLES = new Set(['OPERATION_MANAGER', 'AREA_MANAGER']);
const REVIEW_STATUSES: HrServiceRequestStatus[] = [
 'IN_REVIEW',
 'APPROVED',
 'REJECTED',
 'CANCELLED',
 'COMPLETED',
];

function parseStatus(value: unknown): HrServiceRequestStatus {
 const status = String(value ?? '').toUpperCase() as HrServiceRequestStatus;
 if (!REVIEW_STATUSES.includes(status)) {
 throw new Error('Status permohonan HR tidak sah.');
 }
 return status;
}

function parseNote(value: unknown) {
 if (value == null) return null;
 const note = String(value).trim();
 return note.length ? note.slice(0, 1000) : null;
}

function metadataObject(value: unknown): Record<string, unknown> {
 return value && typeof value === 'object' && !Array.isArray(value)
 ? { ...(value as Record<string, unknown>) }
 : {};
}

function amLeaveCoverMeta(row: HrServiceRequest) {
 const meta = metadataObject(row.metadata);
 const cover =
 meta.am_leave_cover &&
 typeof meta.am_leave_cover === 'object' &&
 !Array.isArray(meta.am_leave_cover)
 ? (meta.am_leave_cover as Record<string, unknown>)
 : null;
 return cover?.required === true ? cover : null;
}

function isAmLeaveCoverComplete(row: HrServiceRequest) {
 const cover = amLeaveCoverMeta(row);
 return Boolean(cover?.covered_by && cover?.covered_at);
}

function assertHrLegalScope(
 profile: { role: string; legal_entity_id?: string | null },
 row: HrServiceRequest) {
 if (canViewAllLegalEntities(profile.role)) return;
 if (profile.role !== 'HR') return;
 if (!row.legal_entity_id || row.legal_entity_id === profile.legal_entity_id) return;
 throw new Error('HR hanya boleh proses permohonan syarikat sendiri.');
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const isHrDecisionMaker = HR_DECISION_ROLES.has(profile.role);
 const isOperationsReviewer = OPERATIONS_REVIEW_ROLES.has(profile.role);

 const { id } = await context.params;
 const body = await request.json().catch(() => ({}));
 const status = parseStatus((body as Record<string, unknown>).status);
 const reviewerNote = parseNote((body as Record<string, unknown>).reviewer_note);
 const service = await createServiceClient();

 const { data: existing, error: existingError } = await service
 .from('hr_service_requests')
 .select('*')
 .eq('id', id)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();

 if (existingError) throw existingError;
 if (!existing) return NextResponse.json({ error: 'Permohonan HR tidak ditemui.' }, { status: 404 });

 const row = existing as HrServiceRequest;
 const isOwnCancellation = row.profile_id === profile.id && status === 'CANCELLED';
 let nextMetadata = metadataObject(row.metadata);
 let nextReviewerNote = reviewerNote;

 if (isOwnCancellation) {
 if (!['SUBMITTED', 'IN_REVIEW'].includes(row.status)) {
 return NextResponse.json({ error: 'Permohonan yang sudah diproses tidak boleh dibatalkan oleh staf.' }, { status: 400 });
 }
 nextReviewerNote = reviewerNote ?? 'Dibatalkan oleh staf melalui HRMIS kendiri.';
 } else if (isHrDecisionMaker) {
 assertHrLegalScope(profile, row);
 if (status === 'APPROVED' && amLeaveCoverMeta(row) && !isAmLeaveCoverComplete(row)) {
 return NextResponse.json(
 { error: 'Cuti AM perlu disemak dan di-cover oleh OM dahulu sebelum HR luluskan.' },
 { status: 400 });
 }
 } else if (isOperationsReviewer) {
 if (row.profile_id === profile.id) {
 return NextResponse.json({ error: 'Tidak boleh semak permohonan HR sendiri sebagai operasi.' }, { status: 403 });
 }
 if (status !== 'IN_REVIEW') {
 return NextResponse.json(
 { error: 'AM/OM hanya boleh tandakan permohonan sebagai sedang disemak operasi. Kelulusan rasmi mesti dibuat oleh HR/Admin.' },
 { status: 403 });
 }
 if (profile.role === 'OPERATION_MANAGER') {
 const cover = amLeaveCoverMeta(row);
 if (!cover) {
 return NextResponse.json(
 { error: 'OM hanya boleh cover permohonan cuti AM melalui aliran operasi.' },
 { status: 403 });
 }
 nextMetadata = {
 ...nextMetadata,
 am_leave_cover: {
 ...cover,
 status: 'OM_COVER_ASSIGNED',
 covered_by: profile.id,
 covered_at: new Date().toISOString(),
 cover_note: reviewerNote ?? 'OM mengambil cover sementara kawasan AM bercuti.',
 },
 };
 nextReviewerNote = reviewerNote ?? 'OM mengambil cover sementara kawasan AM bercuti.';
 } else {
 const scope = await resolveScopedBranches(service, profile);
 if (!row.branch_id || !scope.branchIds?.includes(row.branch_id)) {
 return NextResponse.json({ error: 'Permohonan ini di luar kawasan anda.' }, { status: 403 });
 }
 nextMetadata = {
 ...nextMetadata,
 operations_review: {
 reviewed_by: profile.id,
 reviewed_at: new Date().toISOString(),
 reviewer_role: profile.role,
 note: reviewerNote ?? 'AM menyemak kesan operasi cawangan.',
 },
 };
 nextReviewerNote = reviewerNote ?? 'AM menyemak kesan operasi cawangan.';
 }
 } else {
 return NextResponse.json({ error: 'Tiada akses untuk kemaskini permohonan HR ini.' }, { status: 403 });
 }

 const { data, error } = await service
 .from('hr_service_requests')
 .update({
 status,
 reviewer_note: nextReviewerNote,
 reviewed_by: profile.id,
 reviewed_at: new Date().toISOString(),
 metadata: nextMetadata,
 updated_at: new Date().toISOString(),
 } as never)
 .eq('id', id)
 .eq('organization_id', profile.organization_id)
 .select('*')
 .single();

 if (error) throw error;
 const updated = data as HrServiceRequest;
 if (row.request_type === 'LEAVE') {
 if (status === 'APPROVED') {
 await approveLeaveRequestUsage(service, updated, profile.id);
 } else if ((status === 'REJECTED' || status === 'CANCELLED') && row.status !== 'APPROVED') {
 await releaseLeaveRequestPending(service, updated, status, profile.id);
 }
 }
 return NextResponse.json({ request: updated });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal kemaskini permohonan HR.' },
 { status: 400 },
 );
 }
}
