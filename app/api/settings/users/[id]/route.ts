import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertSettingsAdmin } from '@/lib/settings/admin-auth';
import { resolveLegalEntityIdForRole } from '@/lib/settings/legal-entity';
import {
 adviseUserDashboard,
 dashboardMetadataPatch,
 mergeMetadata,
} from '@/lib/settings/dashboard-advisor';
import { isGroupOwnerMetadata } from '@/lib/hr/group-owner';
import type { UserRole } from '@/types/enums';

async function resolveAdminBranchAssignment(
 client: SupabaseClient,
 organizationId: string,
 branchIdInput: unknown) {
 const branchId = String(branchIdInput ?? '').trim() || null;
 if (!branchId) return { branchId: null, regionId: null };

 const { data, error } = await client
 .from('branches')
 .select('id, region_id')
 .eq('id', branchId)
 .eq('organization_id', organizationId)
 .maybeSingle();

 if (error) throw new Error(error.message);
 if (!data) throw new Error('Cawangan tidak dijumpai dalam organisasi ini');

 return {
 branchId: data.id as string,
 regionId: (data.region_id as string | null) ?? null,
 };
}

async function resolveAdminRegionAssignment(
 client: SupabaseClient,
 organizationId: string,
 regionIdInput: unknown) {
 const regionId = String(regionIdInput ?? '').trim() || null;
 if (!regionId) return null;

 const { data, error } = await client
 .from('regions')
 .select('id')
 .eq('id', regionId)
 .eq('organization_id', organizationId)
 .maybeSingle();

 if (error) throw new Error(error.message);
 if (!data) throw new Error('Kawasan tidak dijumpai dalam organisasi ini');

 return data.id as string;
}

export async function PATCH(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 try {
 const profile = assertSettingsAdmin(await getCurrentProfile());
 const { id } = await params;
 const body = await request.json();

 if (id === profile.id && body.status === 'INACTIVE') {
 return NextResponse.json({ error: 'Tidak boleh nyahaktifkan akaun sendiri' }, { status: 400 });
 }

 const client = await createServiceClient();
 const updates: Record<string, unknown> = {};
 if (body.full_name !== undefined) updates.full_name = body.full_name;
 if (body.status !== undefined) updates.status = body.status;
 if (body.role !== undefined) updates.role = body.role;
 if (body.branch_id !== undefined) {
 const assignment = await resolveAdminBranchAssignment(
 client as SupabaseClient,
 profile.organization_id,
 body.branch_id);
 updates.branch_id = assignment.branchId;
 updates.region_id = assignment.regionId;
 } else if (body.region_id !== undefined) {
 updates.region_id = await resolveAdminRegionAssignment(
 client as SupabaseClient,
 profile.organization_id,
 body.region_id);
 }

 const { data: existing } = await (client as SupabaseClient)
 .from('profiles')
 .select('metadata, role, legal_entity:legal_entities(code)')
 .eq('id', id)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();

 if (!existing) {
 return NextResponse.json({ error: 'Pengguna tidak dijumpai' }, { status: 404 });
 }

 if (body.role !== undefined) {
 updates.legal_entity_id = await resolveLegalEntityIdForRole(
 client as SupabaseClient,
 profile.organization_id,
 body.role);
 }

 if (body.dashboard_profile !== undefined) {
 const meta = mergeMetadata(existing?.metadata, {
 dashboard_profile: body.dashboard_profile,
 dashboard_label: body.dashboard_label ?? null,
 dashboard_home: body.dashboard_home ?? null,
 dashboard_ai_reason: body.dashboard_ai_reason ?? 'Diset manual oleh pentadbir',
 dashboard_ai_at: new Date().toISOString(),
 });
 updates.metadata = meta;
 } else if (body.auto_dashboard === true) {
 const entity = Array.isArray(existing?.legal_entity)
 ? existing?.legal_entity[0]
 : existing?.legal_entity;
 const { data: staffRows } = await (client as SupabaseClient).from('staff').select('legal_entity:legal_entities(code), worker_type').eq('profile_id', id).eq('status', 'ACTIVE');
 const employments = (staffRows ?? []).map((s) => {
 const le = Array.isArray(s.legal_entity) ? s.legal_entity[0] : s.legal_entity;
 return {
 legal_entity_code: (le as { code: string } | null)?.code ?? 'RKJ',
 worker_type: s.worker_type as string | null,
 };
 });
 const advice = adviseUserDashboard({
 role: (body.role ?? existing?.role ?? 'STAFF') as UserRole,
 legal_entity_code: (entity as { code: string } | null)?.code ?? null,
 staff_employments: employments,
 is_group_owner: isGroupOwnerMetadata(existing?.metadata),
 });
 updates.metadata = mergeMetadata(existing?.metadata, dashboardMetadataPatch(advice));
 }

 updates.updated_at = new Date().toISOString();

 const { data, error } = await (client as SupabaseClient).from('profiles').update(updates).eq('id', id).eq('organization_id', profile.organization_id).select('id, full_name, email, role, status').single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ user: data });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}

export async function DELETE(
 _request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 try {
 const profile = assertSettingsAdmin(await getCurrentProfile());
 const { id } = await params;

 if (id === profile.id) {
 return NextResponse.json({ error: 'Tidak boleh padam akaun sendiri' }, { status: 400 });
 }

 const service = await createServiceClient();
 const { data: target } = await (service as SupabaseClient)
 .from('profiles')
 .select('id')
 .eq('id', id)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();

 if (!target) {
 return NextResponse.json({ error: 'Pengguna tidak dijumpai' }, { status: 404 });
 }

 const { error } = await service.auth.admin.deleteUser(id);

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: { id, deleted: true } });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}
