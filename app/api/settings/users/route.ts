import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertSettingsAdmin } from '@/lib/settings/admin-auth';
import {
 assertRoleCreatable,
} from '@/lib/settings/personnel-access';
import { resolveLegalEntityIdForRole } from '@/lib/settings/legal-entity';
import { loadSettingsUsersForAdmin } from '@/lib/settings/users-list';
import {
 adviseUserDashboard,
 dashboardMetadataPatch,
 mergeMetadata,
} from '@/lib/settings/dashboard-advisor';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { generateTemporaryPassword } from '@/lib/security/passwords';
import { jsonWithPrivateCache } from '@/lib/http/cache';

import type { UserRole } from '@/types/enums';

async function resolveAdminBranchAssignment(
 supabase: SupabaseClient,
 organizationId: string,
 branchIdInput: unknown) {
 const branchId = String(branchIdInput ?? '').trim() || null;
 if (!branchId) return { branchId: null, regionId: null };

 const { data, error } = await supabase
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

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 try {
 assertSettingsAdmin(profile);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 try {
 const admin = createAdminClient();
 const { users, staff_total, login_total } = await loadSettingsUsersForAdmin(
 admin,
 profile.organization_id);
 return jsonWithPrivateCache({
 users,
 total: users.length,
 staff_total,
 login_total,
 }, 10, 30);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal muat pengguna' },
 { status: 500 });
 }
}

export async function POST(request: Request) {
 try {
 const limited = enforceRateLimit(request, {
 key: 'settings-users-create',
 limit: 10,
 windowMs: 10 * 60 * 1000,
 });
 if (limited) return limited;

 const profile = assertSettingsAdmin(await getCurrentProfile());
 const body = await request.json();
 const email = String(body.email ?? '').trim().toLowerCase();
 const fullName = String(body.full_name ?? '').trim();
 const role = body.role ?? 'STAFF';

 if (!email || !fullName) {
 return NextResponse.json({ error: 'E-mel dan nama diperlukan' }, { status: 400 });
 }

 assertRoleCreatable(profile, role);

 const supabase = await createClient();
 const { branchId, regionId: branchRegionId } = await resolveAdminBranchAssignment(
 supabase,
 profile.organization_id,
 body.branch_id);
 const regionId: string | null = branchRegionId ?? profile.region_id;

 const service = await createServiceClient();
 const suppliedPassword = String(body.password ?? '').trim();
 const tempPassword = suppliedPassword || generateTemporaryPassword('RkjOne');

 const { data: authData, error: authErr } = await service.auth.admin.createUser({
 email,
 password: tempPassword,
 email_confirm: true,
 user_metadata: { full_name: fullName, role },
 });

 if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

 const { error: profileErr } = await (service as SupabaseClient).from('profiles').update({
 organization_id: profile.organization_id,
 full_name: fullName,
 email,
 role,
 branch_id: branchId,
 region_id: regionId,
 employee_code: body.employee_code ?? null,
 legal_entity_id: await resolveLegalEntityIdForRole(
 service as SupabaseClient,
 profile.organization_id,
 role),
 status: 'ACTIVE',
 must_change_password: true,
 }).eq('id', authData.user.id);

 if (profileErr) {
 await service.auth.admin.deleteUser(authData.user.id);
 return NextResponse.json({ error: profileErr.message }, { status: 400 });
 }

 const advice = adviseUserDashboard({
 role: role as UserRole,
 legal_entity_code: null,
 is_group_owner: false,
 });
 await (service as SupabaseClient).from('profiles').update({
 metadata: mergeMetadata(null, dashboardMetadataPatch(advice)),
 }).eq('id', authData.user.id);

 return NextResponse.json({
 user: {
 id: authData.user.id,
 email,
 full_name: fullName,
 role,
 },
 temporary_password: suppliedPassword ? null : tempPassword,
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}

