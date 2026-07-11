import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']);

async function requireAdmin() {
 const profile = await getCurrentProfile();
 if (!profile) throw new Response('Unauthorized', { status: 401 });
 if (!ADMIN_ROLES.has(profile.role)) throw new Response('Forbidden', { status: 403 });
 return profile;
}

function jsonError(error: unknown, fallback = 'Request failed') {
 if (error instanceof Response) {
 return NextResponse.json({ error: error.statusText || fallback }, { status: error.status });
 }
 return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}

export async function POST(request: Request) {
 try {
 const profile = await requireAdmin();
 const service = await createServiceClient();
 const body = await request.json().catch(() => ({}));
 const agentAccountId = String(body.agent_account_id ?? '').trim();
 const staffId = String(body.staff_id ?? '').trim();
 const roleTitle = String(body.role_title ?? 'Ejen Khas Syarikat').trim() || 'Ejen Khas Syarikat';
 const assignmentNote = String(body.assignment_note ?? '').trim() || null;

 if (!agentAccountId || !staffId) {
 return NextResponse.json({ error: 'agent_account_id dan staff_id diperlukan' }, { status: 400 });
 }

 const { data: agent, error: agentErr } = await service.from('sales_agent_accounts').select('id, organization_id, company_name, assigned_price_group_id, price_group:agent_price_groups(code, name, payment_exempt)').eq('organization_id', profile.organization_id).eq('id', agentAccountId).is('archived_at', null).maybeSingle();
 if (agentErr) throw new Error(agentErr.message);
 const agentRow = agent as Record<string, unknown> | null;
 const priceGroup = agentRow?.price_group as { payment_exempt?: boolean; name?: string } | null;
 if (!agentRow || !priceGroup?.payment_exempt) {
 return NextResponse.json({ error: 'Hanya akaun Ejen Khas Syarikat boleh dipautkan kepada staf' }, { status: 400 });
 }

 const { data: staff, error: staffErr } = await service.from('staff').select('id, profile_id, legal_entity_id, full_name, staff_code, legal_entity:legal_entities!inner(code, legal_name, name), profile:profiles!staff_profile_id_fkey(id, email, full_name)').eq('organization_id', profile.organization_id).eq('id', staffId).eq('status', 'ACTIVE').in('legal_entity.code', ['RKJ_DIST', 'RKJ_MFG']).maybeSingle();
 if (staffErr) throw new Error(staffErr.message);
 const staffRow = staff as Record<string, unknown> | null;
 if (!staffRow?.profile_id) {
 return NextResponse.json({ error: 'Staf mesti aktif, ada akaun login, dan berada bawah RKJ Distributor atau Manufacturing' }, { status: 400 });
 }

 const { data: existingProfileAccount, error: existingProfileAccountErr } = await service
 .from('sales_agent_accounts')
 .select('id, company_name')
 .eq('organization_id', profile.organization_id)
 .eq('profile_id', staffRow.profile_id as string)
 .is('archived_at', null)
 .maybeSingle();
 if (existingProfileAccountErr) throw new Error(existingProfileAccountErr.message);
 const existingAccountRow = existingProfileAccount as { id?: string; company_name?: string | null } | null;
 if (existingAccountRow?.id && existingAccountRow.id !== agentAccountId) {
 return NextResponse.json({ error: `Staf ini sudah dipautkan kepada ${existingAccountRow.company_name ?? 'akaun Ejen Khas lain'}` }, { status: 400 });
 }

 const { error: accountUpdateErr } = await (service as SupabaseClient).from('sales_agent_accounts').update({
 profile_id: staffRow.profile_id,
 contact_person: staffRow.full_name ?? null,
 contact_email: ((staffRow.profile as { email?: string | null } | null)?.email ?? null),
 updated_at: new Date().toISOString(),
 }).eq('id', agentAccountId).eq('organization_id', profile.organization_id);
 if (accountUpdateErr) throw new Error(accountUpdateErr.message);

 await (service as SupabaseClient).from('agent_special_staff_assignments').update({ status: 'ENDED', ended_by: profile.id, ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('agent_account_id', agentAccountId).eq('status', 'ACTIVE');

 const { data: assignment, error } = await (service as SupabaseClient).from('agent_special_staff_assignments').insert({
 organization_id: profile.organization_id,
 agent_account_id: agentAccountId,
 staff_id: staffId,
 profile_id: staffRow.profile_id,
 legal_entity_id: staffRow.legal_entity_id,
 role_title: roleTitle,
 assignment_note: assignmentNote,
 status: 'ACTIVE',
 assigned_by: profile.id,
 }).select('id, agent_account_id, staff_id, profile_id, role_title, assignment_note, status, assigned_at').single();
 if (error) throw new Error(error.message);

 await (service as SupabaseClient).from('agent_account_events').insert({
 organization_id: profile.organization_id,
 legal_entity_id: staffRow.legal_entity_id ?? null,
 agent_account_id: agentAccountId,
 event_type: 'UPDATED',
 company_name: String(agentRow.company_name ?? 'Ejen Khas'),
 price_group_id: agentRow.assigned_price_group_id ?? null,
 price_group_name: priceGroup.name ?? 'Ejen Khas Syarikat',
 reason: `Staf ${(staffRow.full_name as string) ?? ''} ditugaskan sebagai ${roleTitle}`,
 event_payload: {
 source: 'admin_portal',
 action: 'assign_special_staff',
 staff_id: staffId,
 staff_code: staffRow.staff_code,
 },
 created_by: profile.id,
 });

 return NextResponse.json({ assignment });
 } catch (error) {
 return jsonError(error, 'Gagal tugaskan staf Agent Khas');
 }
}

export async function DELETE(request: Request) {
 try {
 const profile = await requireAdmin();
 const service = await createServiceClient();
 const { searchParams } = new URL(request.url);
 const assignmentId = searchParams.get('assignment_id');
 if (!assignmentId) return NextResponse.json({ error: 'assignment_id diperlukan' }, { status: 400 });

 const { error } = await (service as SupabaseClient).from('agent_special_staff_assignments').update({ status: 'ENDED', ended_by: profile.id, ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', assignmentId).eq('organization_id', profile.organization_id).eq('status', 'ACTIVE');
 if (error) throw new Error(error.message);

 return NextResponse.json({ ok: true });
 } catch (error) {
 return jsonError(error, 'Gagal tamatkan tugasan Agent Khas');
 }
}
