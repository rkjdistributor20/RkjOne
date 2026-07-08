import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createServiceClient } from '@/lib/supabase/server';
import { approveLeaveRequestUsage, releaseLeaveRequestPending } from '@/lib/hr/leave-balances';
import type { HrServiceRequest, HrServiceRequestStatus } from '@/types/database';

const REVIEW_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR', 'OPERATION_MANAGER', 'AREA_MANAGER']);
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const isReviewer = REVIEW_ROLES.has(profile.role);

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
 if (!isReviewer) {
 if (row.profile_id !== profile.id) {
 return NextResponse.json({ error: 'Tiada akses untuk permohonan HR ini.' }, { status: 403 });
 }
 if (status !== 'CANCELLED') {
 return NextResponse.json({ error: 'Staf hanya boleh batalkan permohonan sendiri.' }, { status: 403 });
 }
 if (!['SUBMITTED', 'IN_REVIEW'].includes(row.status)) {
 return NextResponse.json({ error: 'Permohonan yang sudah diproses tidak boleh dibatalkan oleh staf.' }, { status: 400 });
 }
 } else if (profile.role === 'AREA_MANAGER') {
 const scope = await resolveScopedBranches(service, profile);
 if (!row.branch_id || !scope.branchIds?.includes(row.branch_id)) {
 return NextResponse.json({ error: 'Permohonan ini di luar kawasan anda.' }, { status: 403 });
 }
 }

 const { data, error } = await service
 .from('hr_service_requests')
 .update({
 status,
 reviewer_note: reviewerNote ?? (!isReviewer ? 'Dibatalkan oleh staf melalui HRMIS kendiri.' : null),
 reviewed_by: profile.id,
 reviewed_at: new Date().toISOString(),
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
