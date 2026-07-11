import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { SALES_AGENT_EMPLOYER_CODE } from '@/lib/brand/legal-entities';
import { adviseUserDashboard, dashboardMetadataPatch, mergeMetadata } from '@/lib/settings/dashboard-advisor';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { generateTemporaryPassword } from '@/lib/security/passwords';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER']);

type AccountPatch = {
 account_id?: string;
 company_name?: string;
 registration_no?: string | null;
 contact_person?: string | null;
 contact_phone?: string | null;
 contact_email?: string | null;
 business_address?: string | null;
 assigned_price_group_id?: string | null;
 status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
 assigned_driver_name?: string | null;
 pickup_location?: string | null;
 source_reference?: string | null;
 full_name?: string;
 email?: string;
};

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

async function getDistributorLegalEntity(service: SupabaseClient, organizationId: string) {
 const { data, error } = await service.from('legal_entities').select('id').eq('organization_id', organizationId).eq('code', SALES_AGENT_EMPLOYER_CODE).maybeSingle();
 if (error) throw new Error(error.message);
 if (!data?.id) throw new Error('Legal entity RKJ Distributor tidak dijumpai');
 return data.id as string;
}

export async function GET() {
 try {
 const profile = await requireAdmin();
 const service = await createServiceClient();

 const [{ data: accounts, error: accountErr }, { data: priceGroups, error: priceErr }] = await Promise.all([
 service.from('sales_agent_accounts').select('id, profile_id, company_name, registration_no, contact_person, contact_phone, contact_email, business_address, status, assigned_price_group_id, source_reference, assigned_driver_name, pickup_location, created_at, updated_at, archived_at').eq('organization_id', profile.organization_id).is('archived_at', null).neq('status', 'SUSPENDED').order('company_name'),
 service.from('agent_price_groups').select('id, code, name, description, is_default, status, payment_exempt').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('name'),
 ]);
 if (accountErr) throw new Error(accountErr.message);
 if (priceErr) throw new Error(priceErr.message);

 const rows = (accounts ?? []) as Array<Record<string, unknown>>;
 const profileIds = rows.map((a) => a.profile_id as string).filter(Boolean);
 const accountIds = rows.map((a) => a.id as string);

 const [profileRes, outletRes, orderRes, eventRes, staffRes, assignmentRes, driverRes, branchRes] = await Promise.all([
 profileIds.length
 ? service.from('profiles').select('id, full_name, email, status, last_login_at').in('id', profileIds)
 : Promise.resolve({ data: [] }),
 accountIds.length
 ? service.from('agent_outlets').select('id, agent_account_id, outlet_code, outlet_name, address_line, city, state, status, subscription_active').in('agent_account_id', accountIds)
 : Promise.resolve({ data: [] }),
 accountIds.length
 ? service.from('agent_stock_orders').select('agent_account_id, status, total_amount_rm').in('agent_account_id', accountIds)
 : Promise.resolve({ data: [] }),
 service.from('agent_account_events').select('id, event_type, company_name, contact_person, contact_email, registration_no, price_group_name, reason, created_at').eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(60),
 service.from('staff').select('id, staff_code, full_name, profile_id, legal_entity_id, legal_entity:legal_entities!inner(id, code, name, legal_name)').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').not('profile_id', 'is', null).in('legal_entity.code', ['RKJ_DIST', 'RKJ_MFG']).order('full_name'),
 service.from('agent_special_staff_assignments').select('id, agent_account_id, staff_id, profile_id, role_title, assignment_note, status, assigned_at, staff:staff(staff_code, full_name), legal_entity:legal_entities(code, legal_name, name), agent_account:sales_agent_accounts(company_name)').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('assigned_at', { ascending: false }),
 service.from('drivers').select('id, driver_code, full_name, route_description, phone').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('full_name'),
 service.from('branches').select('id, branch_code, branch_name, area, status').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE').order('branch_code'),
 ]);

 const profileRows = (profileRes.data ?? []) as Array<Record<string, unknown>>;
 const outletRows = (outletRes.data ?? []) as Array<Record<string, unknown>>;
 const orderRows = (orderRes.data ?? []) as Array<Record<string, unknown>>;
 const profileById = new Map(profileRows.map((p) => [p.id as string, p]));
 const groupRows = (priceGroups ?? []) as Array<Record<string, unknown>>;
 const groupById = new Map(groupRows.map((g) => [g.id as string, g]));

 const accountsWithStats = rows.map((account) => {
 const id = account.id as string;
 const accountOutlets = outletRows.filter((o) => o.agent_account_id === id);
 const accountOrders = orderRows.filter((o) => o.agent_account_id === id);
 const group = account.assigned_price_group_id
 ? groupById.get(account.assigned_price_group_id as string)
 : null;
 return {...account,
 profile: profileById.get(account.profile_id as string) ?? null,
 price_group: group
 ? { id: group.id, code: group.code, name: group.name, payment_exempt: group.payment_exempt }
 : null,
 outlets: accountOutlets.map((o) => ({
 id: o.id,
 outlet_code: o.outlet_code,
 outlet_name: o.outlet_name,
 address_line: o.address_line,
 city: o.city,
 state: o.state,
 status: o.status,
 subscription_active: o.subscription_active,
 })),
 stats: {
 outlets: accountOutlets.length,
 active_outlets: accountOutlets.filter((o) => o.subscription_active).length,
 orders: accountOrders.length,
 paid_or_submitted_orders: accountOrders.filter((o) => ['PAID', 'SUBMITTED_FACTORY', 'ACKNOWLEDGED', 'FULFILLED'].includes(String(o.status))).length,
 total_order_rm: accountOrders.reduce((sum, o) => sum + Number(o.total_amount_rm ?? 0), 0),
 },
 };
 });

 return NextResponse.json({
 accounts: accountsWithStats,
 price_groups: groupRows,
 report_events: eventRes.data ?? [],
 assignable_staff: staffRes.data ?? [],
 special_assignments: assignmentRes.data ?? [],
 drivers: driverRes.data ?? [],
 branches: branchRes.data ?? [],
 });
 } catch (error) {
 return jsonError(error, 'Gagal muat senarai ejen');
 }
}

export async function POST(request: Request) {
 let createdUserId: string | null = null;
 try {
 const limited = enforceRateLimit(request, {
 key: 'sales-agent-account-create',
 limit: 12,
 windowMs: 10 * 60 * 1000,
 });
 if (limited) return limited;

 const profile = await requireAdmin();
 const service = await createServiceClient();
 const body = await request.json().catch(() => ({}));

 const requestedGroupId = String(body.assigned_price_group_id ?? '').trim() || null;
 const staffId = String(body.staff_id ?? '').trim() || null;
 const legalEntityId = await getDistributorLegalEntity(service as SupabaseClient, profile.organization_id);

 const groupLookup = requestedGroupId
 ? await service.from('agent_price_groups').select('id, code, name, payment_exempt').eq('organization_id', profile.organization_id).eq('id', requestedGroupId).maybeSingle()
 : { data: null, error: null };
 if ('error' in groupLookup && groupLookup.error) throw new Error(groupLookup.error.message);
 const selectedGroup = groupLookup.data as { id?: string; code?: string | null; name?: string | null; payment_exempt?: boolean | null } | null;
 const isSpecialAgent = Boolean(selectedGroup?.payment_exempt || selectedGroup?.code === 'EJEN_KHAS_SYARIKAT');

 let email = String(body.email ?? '').trim().toLowerCase();
 let fullName = String(body.full_name ?? body.contact_person ?? '').trim();
 let companyName = String(body.company_name ?? '').trim();
 const suppliedPassword = String(body.password ?? '').trim();
 const password = suppliedPassword || generateTemporaryPassword('RkjAgent');
 let targetProfileId: string | null = null;
 let assignedStaff: Record<string, unknown> | null = null;

 if (isSpecialAgent) {
 if (!staffId) {
 return NextResponse.json({ error: 'Pilih staf RKJ Distributor atau Manufacturing untuk Ejen Khas' }, { status: 400 });
 }
 const { data: staff, error: staffErr } = await service.from('staff').select('id, profile_id, legal_entity_id, full_name, staff_code, legal_entity:legal_entities!inner(id, code, legal_name, name), profile:profiles!staff_profile_id_fkey(id, email, full_name)').eq('organization_id', profile.organization_id).eq('id', staffId).eq('status', 'ACTIVE').in('legal_entity.code', ['RKJ_DIST', 'RKJ_MFG']).maybeSingle();
 if (staffErr) throw new Error(staffErr.message);
 if (!staff) return NextResponse.json({ error: 'Staf Ejen Khas tidak dijumpai' }, { status: 404 });
 assignedStaff = staff as Record<string, unknown>;
 const staffProfile = assignedStaff.profile as Record<string, unknown> | null;
 targetProfileId = String(assignedStaff.profile_id ?? staffProfile?.id ?? '').trim() || null;
 if (!targetProfileId) {
 return NextResponse.json({ error: 'Staf dipilih belum mempunyai akaun login sistem' }, { status: 400 });
 }
 fullName = String(assignedStaff.full_name ?? staffProfile?.full_name ?? fullName).trim();
 email = String(staffProfile?.email ?? email).trim().toLowerCase();
 companyName = companyName || 'Ejen Khas - ' + fullName;
 } else {
 if (!email || !fullName || !companyName) {
 return NextResponse.json({ error: 'Email, nama penuh dan nama syarikat diperlukan' }, { status: 400 });
 }

 const advice = adviseUserDashboard({
 role: 'SALES_AGENT',
 legal_entity_code: SALES_AGENT_EMPLOYER_CODE,
 is_group_owner: false,
 });

 const { data: authData, error: authErr } = await service.auth.admin.createUser({
 email,
 password,
 email_confirm: true,
 user_metadata: { full_name: fullName, role: 'SALES_AGENT' },
 });
 if (authErr) throw new Error(authErr.message);
 createdUserId = authData.user.id;
 targetProfileId = authData.user.id;

 const { error: profileErr } = await (service as SupabaseClient).from('profiles').update({
 organization_id: profile.organization_id,
 full_name: fullName,
 email,
 role: 'SALES_AGENT',
 branch_id: null,
 region_id: null,
 legal_entity_id: legalEntityId,
 status: 'ACTIVE',
 must_change_password: true,
 metadata: mergeMetadata(null, dashboardMetadataPatch(advice)),
 }).eq('id', targetProfileId);
 if (profileErr) throw new Error(profileErr.message);
 }

 if (!targetProfileId) throw new Error('Profile pengguna tidak dapat ditentukan');

 const accountPayload = {
 organization_id: profile.organization_id,
 legal_entity_id: legalEntityId,
 profile_id: targetProfileId,
 company_name: companyName,
 registration_no: body.registration_no ?? null,
 contact_person: body.contact_person ?? fullName,
 contact_phone: body.contact_phone ?? null,
 contact_email: body.contact_email ?? email,
 business_address: body.business_address ?? null,
 assigned_price_group_id: requestedGroupId,
 assigned_driver_name: body.assigned_driver_name ?? null,
 pickup_location: body.pickup_location ?? null,
 source_reference: body.source_reference ?? null,
 status: 'ACTIVE',
 approved_at: new Date().toISOString(),
 approved_by: profile.id,
 archived_at: null,
 archived_by: null,
 archive_reason: null,
 notes: body.notes ?? null,
 updated_at: new Date().toISOString(),
 };

 const { data: existingAccount, error: existingErr } = await (service as SupabaseClient).from('sales_agent_accounts').select('id').eq('organization_id', profile.organization_id).eq('profile_id', targetProfileId).maybeSingle();
 if (existingErr) throw new Error(existingErr.message);

 const accountResult = existingAccount?.id
 ? await (service as SupabaseClient).from('sales_agent_accounts').update(accountPayload).eq('id', existingAccount.id as string).select('*').single()
 : await (service as SupabaseClient).from('sales_agent_accounts').insert(accountPayload).select('*').single();
 if (accountResult.error) throw new Error(accountResult.error.message);
 const account = accountResult.data as Record<string, unknown>;
 const posSync = isSpecialAgent
 ? await syncSpecialAgentPickupOutlets(service as SupabaseClient, profile.organization_id, account.id as string, body.pickup_location ?? null)
 : null;

 if (isSpecialAgent && staffId && assignedStaff) {
 await (service as SupabaseClient).from('agent_special_staff_assignments').update({ status: 'ENDED', ended_by: profile.id, ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('agent_account_id', account.id as string).eq('status', 'ACTIVE');

 const { error: assignmentErr } = await (service as SupabaseClient).from('agent_special_staff_assignments').insert({
 organization_id: profile.organization_id,
 legal_entity_id: assignedStaff.legal_entity_id ?? legalEntityId,
 agent_account_id: account.id,
 staff_id: staffId,
 profile_id: targetProfileId,
 role_title: 'Ejen Khas Syarikat',
 assignment_note: 'Dipautkan semasa tambah Ejen Khas oleh Pentadbir Utama',
 assigned_by: profile.id,
 status: 'ACTIVE',
 });
 if (assignmentErr) throw new Error(assignmentErr.message);
 }

 await (service as SupabaseClient).from('agent_account_events').insert({
 organization_id: profile.organization_id,
 legal_entity_id: legalEntityId,
 agent_account_id: account.id,
 event_type: existingAccount?.id ? 'UPDATED' : 'CREATED',
 company_name: companyName,
 contact_person: body.contact_person ?? fullName,
 contact_email: body.contact_email ?? email,
 registration_no: body.registration_no ?? null,
 price_group_id: requestedGroupId,
 price_group_name: selectedGroup?.name ?? null,
 reason: isSpecialAgent ? 'Ejen Khas Syarikat dipautkan kepada staf sedia ada dan POS pickup/cawangan diaktifkan' : 'Ejen baharu didaftarkan oleh pentadbir',
 event_payload: { source: 'admin_portal', special_agent: isSpecialAgent, staff_id: staffId, pos_sync: posSync },
 created_by: profile.id,
 });

 return NextResponse.json({ account, login: isSpecialAgent ? null : { email, password } });
 } catch (error) {
 if (createdUserId) {
 const service = await createServiceClient();
 await service.auth.admin.deleteUser(createdUserId).catch(() => undefined);
 }
 return jsonError(error, 'Gagal tambah ejen');
 }
}

function pickupLines(value?: string | null) {
 const seen = new Set<string>();
 return String(value ?? '').split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean).filter((line) => {
 const key = line.toLowerCase();
 if (seen.has(key)) return false;
 seen.add(key);
 return true;
 });
}

function stablePickupCode(line: string, index: number) {
 const first = line.split(' - ')[0]?.trim().toUpperCase();
 if (first && /^[A-Z]{2,}[0-9A-Z-]{1,24}$/.test(first)) return first.slice(0, 32);
 let hash = 0;
 for (let i = 0; i < line.length; i += 1) hash = (hash * 31 + line.charCodeAt(i)) >>> 0;
 return 'PKP' + String(index + 1).padStart(2, '0') + '-' + hash.toString(36).toUpperCase().slice(0, 6);
}

function pickupOutletName(line: string, code: string) {
 const prefix = code + ' - ';
 return line.toUpperCase().startsWith(prefix.toUpperCase()) ? line.slice(prefix.length).trim() || code : line;
}

async function syncSpecialAgentPickupOutlets(
 service: SupabaseClient,
 organizationId: string,
 agentAccountId: string,
 pickupLocation?: string | null) {
 const lines = pickupLines(pickupLocation);
 if (!lines.length) return { outlet_count: 0, subscription_count: 0 };

 const { data: existing, error: existingErr } = await service.from('agent_outlets').select('id, outlet_code').eq('organization_id', organizationId).eq('agent_account_id', agentAccountId);
 if (existingErr) throw new Error(existingErr.message);

 const existingByCode = new Map((existing ?? []).map((row) => [String(row.outlet_code).toUpperCase(), row as Record<string, unknown>]));
 const outletIds: string[] = [];

 for (const [index, line] of lines.entries()) {
 const outletCode = stablePickupCode(line, index);
 const outletName = pickupOutletName(line, outletCode);
 const current = existingByCode.get(outletCode.toUpperCase());
 if (current?.id) {
 const { error } = await service.from('agent_outlets').update({ outlet_name: outletName, address_line: line, pos_enabled: true, subscription_active: true, status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', current.id as string);
 if (error) throw new Error(error.message);
 outletIds.push(current.id as string);
 continue;
 }

 const { data: inserted, error } = await service.from('agent_outlets').insert({
 organization_id: organizationId,
 agent_account_id: agentAccountId,
 outlet_code: outletCode,
 outlet_name: outletName,
 address_line: line,
 city: null,
 state: null,
 postcode: null,
 pos_enabled: true,
 subscription_active: true,
 status: 'ACTIVE',
 }).select('id').single();
 if (error) throw new Error(error.message);
 if (inserted?.id) outletIds.push(inserted.id as string);
 }

 const start = new Date();
 const end = new Date(start);
 end.setMonth(end.getMonth() + 1);
 const periodStart = start.toISOString().slice(0, 10);
 const periodEnd = end.toISOString().slice(0, 10);

 let subscriptionCount = 0;
 let subscriptionWarning: string | null = null;
 if (outletIds.length) {
 const { error: subErr } = await service.from('agent_outlet_subscriptions').upsert(
 outletIds.map((outletId) => ({ organization_id: organizationId, outlet_id: outletId, period_start: periodStart, period_end: periodEnd, amount_rm: 0, status: 'ACTIVE' })),
 { onConflict: 'outlet_id,period_start' });
 if (subErr) {
 subscriptionWarning = subErr.message;
 } else {
 subscriptionCount = outletIds.length;
 }
 }

 return { outlet_count: outletIds.length, subscription_count: subscriptionCount, subscription_warning: subscriptionWarning };
}

export async function PATCH(request: Request) {
 try {
 const limited = enforceRateLimit(request, {
 key: 'sales-agent-account-update',
 limit: 30,
 windowMs: 10 * 60 * 1000,
 });
 if (limited) return limited;

 const profile = await requireAdmin();
 const service = await createServiceClient();
 const body = (await request.json().catch(() => ({}))) as AccountPatch;
 const accountId = String(body.account_id ?? '').trim();
 if (!accountId) return NextResponse.json({ error: 'account_id diperlukan' }, { status: 400 });

 const { data: existing, error: existingErr } = await service.from('sales_agent_accounts').select('id, profile_id, legal_entity_id, company_name, contact_person, contact_email, registration_no, assigned_price_group_id, pickup_location').eq('organization_id', profile.organization_id).eq('id', accountId).maybeSingle();
 if (existingErr) throw new Error(existingErr.message);
 if (!existing) return NextResponse.json({ error: 'Ejen tidak dijumpai' }, { status: 404 });
 const existingRow = existing as Record<string, unknown>;

 const accountUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
 for (const key of ['company_name', 'registration_no', 'contact_person', 'contact_phone', 'contact_email', 'business_address', 'assigned_price_group_id', 'assigned_driver_name', 'pickup_location', 'source_reference', 'status'] as const) {
 if (body[key] !== undefined) accountUpdates[key] = body[key] || null;
 }
 if (body.status === 'ACTIVE') accountUpdates.approved_at = new Date().toISOString();

 const { error: updateErr } = await (service as SupabaseClient).from('sales_agent_accounts').update(accountUpdates).eq('id', accountId).eq('organization_id', profile.organization_id);
 if (updateErr) throw new Error(updateErr.message);

 const profileUpdates: Record<string, unknown> = {};
 if (body.full_name !== undefined) profileUpdates.full_name = String(body.full_name).trim();
 if (body.email !== undefined) profileUpdates.email = String(body.email).trim().toLowerCase();
 if (body.status !== undefined) profileUpdates.status = body.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';

 if (Object.keys(profileUpdates).length) {
 const { error: profileErr } = await (service as SupabaseClient).from('profiles').update(profileUpdates).eq('id', existingRow.profile_id as string);
 if (profileErr) throw new Error(profileErr.message);
 }

 if (body.email !== undefined || body.full_name !== undefined) {
 const authUpdate: Record<string, unknown> = {};
 if (body.email !== undefined) authUpdate.email = String(body.email).trim().toLowerCase();
 if (body.full_name !== undefined) authUpdate.user_metadata = { full_name: String(body.full_name).trim(), role: 'SALES_AGENT' };
 const { error: authErr } = await service.auth.admin.updateUserById(existingRow.profile_id as string, authUpdate);
 if (authErr) throw new Error(authErr.message);
 }
 const priceGroupId = (body.assigned_price_group_id ?? existingRow.assigned_price_group_id) as string | null;
 const priceGroupLookup = priceGroupId
 ? await service.from('agent_price_groups').select('name, code, payment_exempt').eq('id', priceGroupId).maybeSingle()
 : { data: null };
 const priceGroup = priceGroupLookup.data as { name?: string; code?: string | null; payment_exempt?: boolean | null } | null;
 const patchIsSpecialAgent = Boolean(priceGroup?.payment_exempt || priceGroup?.code === 'EJEN_KHAS_SYARIKAT');
 const effectivePickupLocation = (body.pickup_location ?? existingRow.pickup_location ?? null) as string | null;
 const posSync = patchIsSpecialAgent
 ? await syncSpecialAgentPickupOutlets(service as SupabaseClient, profile.organization_id, accountId, effectivePickupLocation)
 : null;

 await (service as SupabaseClient).from('agent_account_events').insert({
 organization_id: profile.organization_id,
 legal_entity_id: existingRow.legal_entity_id ?? null,
 agent_account_id: accountId,
 event_type: 'UPDATED',
 company_name: String(body.company_name ?? existingRow.company_name ?? 'Ejen'),
 contact_person: (body.contact_person ?? existingRow.contact_person ?? null) as string | null,
 contact_email: (body.contact_email ?? existingRow.contact_email ?? null) as string | null,
 registration_no: (body.registration_no ?? existingRow.registration_no ?? null) as string | null,
 price_group_id: priceGroupId,
 price_group_name: priceGroup?.name ?? null,
 reason: patchIsSpecialAgent ? 'Profil/tugasan Ejen Khas dikemaskini dan POS pickup/cawangan diselaraskan' : 'Profil/tugasan ejen dikemaskini oleh pentadbir',
 event_payload: {
 source: 'admin_portal',
 special_agent: patchIsSpecialAgent,
 assigned_driver_name: body.assigned_driver_name ?? null,
 pickup_location: effectivePickupLocation,
 source_reference: body.source_reference ?? null,
 pos_sync: posSync,
 },
 created_by: profile.id,
 });

 return NextResponse.json({ ok: true });
 } catch (error) {
 return jsonError(error, 'Gagal kemas kini ejen');
 }
}

export async function DELETE(request: Request) {
 try {
 const limited = enforceRateLimit(request, {
 key: 'sales-agent-account-delete',
 limit: 20,
 windowMs: 10 * 60 * 1000,
 });
 if (limited) return limited;

 const profile = await requireAdmin();
 const service = await createServiceClient();
 const { searchParams } = new URL(request.url);
 const accountId = searchParams.get('account_id');
 if (!accountId) return NextResponse.json({ error: 'account_id diperlukan' }, { status: 400 });

 const { data: account, error: accountErr } = await service.from('sales_agent_accounts').select('id, profile_id, legal_entity_id, company_name, contact_person, contact_email, registration_no, assigned_price_group_id').eq('organization_id', profile.organization_id).eq('id', accountId).maybeSingle();
 if (accountErr) throw new Error(accountErr.message);
 if (!account) return NextResponse.json({ error: 'Ejen tidak dijumpai' }, { status: 404 });
 const accountRow = account as Record<string, unknown>;

 const { error: updateErr } = await (service as SupabaseClient).from('sales_agent_accounts').update({ status: 'SUSPENDED', archived_at: new Date().toISOString(), archived_by: profile.id, archive_reason: 'Deleted dari dashboard Portal Ejen', updated_at: new Date().toISOString() }).eq('id', accountId).eq('organization_id', profile.organization_id);
 if (updateErr) throw new Error(updateErr.message);

 await (service as SupabaseClient).from('agent_outlets').update({ status: 'SUSPENDED', pos_enabled: false, subscription_active: false, updated_at: new Date().toISOString() }).eq('agent_account_id', accountId).eq('organization_id', profile.organization_id);

 await (service as SupabaseClient).from('profiles').update({ status: 'SUSPENDED' }).eq('id', accountRow.profile_id as string);

 const priceGroupLookup = accountRow.assigned_price_group_id
 ? await service.from('agent_price_groups').select('name').eq('id', accountRow.assigned_price_group_id as string).maybeSingle()
 : { data: null };
 const priceGroup = priceGroupLookup.data as { name?: string } | null;

 await (service as SupabaseClient).from('agent_account_events').insert({
 organization_id: profile.organization_id,
 legal_entity_id: accountRow.legal_entity_id ?? null,
 agent_account_id: accountId,
 event_type: 'ARCHIVED',
 company_name: String(accountRow.company_name ?? 'Ejen'),
 contact_person: (accountRow.contact_person as string | null) ?? null,
 contact_email: (accountRow.contact_email as string | null) ?? null,
 registration_no: (accountRow.registration_no as string | null) ?? null,
 price_group_id: (accountRow.assigned_price_group_id as string | null) ?? null,
 price_group_name: (priceGroup as { name?: string } | null)?.name ?? null,
 reason: 'Ejen dikeluarkan dari dashboard aktif oleh pentadbir',
 event_payload: { source: 'admin_portal', action: 'delete_archive' },
 created_by: profile.id,
 });

 await (service as SupabaseClient).from('agent_special_staff_assignments').update({ status: 'ENDED', ended_by: profile.id, ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('agent_account_id', accountId).eq('status', 'ACTIVE');

 return NextResponse.json({ ok: true });
 } catch (error) {
 return jsonError(error, 'Gagal nonaktifkan ejen');
 }
}









