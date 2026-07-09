import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { isSettingsAdmin } from '@/lib/settings/admin-auth';
import {
 assertCanManagePersonnel,
 assertUserTargetInScope,
} from '@/lib/settings/personnel-access';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { generateTemporaryPassword } from '@/lib/security/passwords';

export async function POST(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 try {
 const limited = enforceRateLimit(request, {
 key: 'settings-users-reset-password',
 limit: 10,
 windowMs: 10 * 60 * 1000,
 });
 if (limited) return limited;

 const profile = assertCanManagePersonnel(await getCurrentProfile());
 if (!isSettingsAdmin(profile.role)) {
  return NextResponse.json({ error: 'Hanya admin boleh reset kata laluan pengguna' }, { status: 403 });
 }

 const { id } = await params;
 const supabase = await createClient();

 await assertUserTargetInScope(supabase, profile, id);

 const { data: targetRow } = await supabase
 .from('profiles')
 .select('id, email, full_name, employee_code')
 .eq('id', id)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();

 const target = targetRow as {
 id: string;
 email: string | null;
 full_name: string | null;
 employee_code: string | null;
 } | null;

 if (!target?.email) {
 return NextResponse.json({ error: 'Pengguna tidak dijumpai' }, { status: 404 });
 }

 const seed = String(target.employee_code ?? target.email ?? 'RkjOne');
 const temporaryPassword = generateTemporaryPassword(seed);
 const service = await createServiceClient();

 const { error: authErr } = await service.auth.admin.updateUserById(id, {
 password: temporaryPassword,
 });
 if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

 const { error: profileErr } = await (service as SupabaseClient)
 .from('profiles')
 .update({
  must_change_password: true,
  updated_at: new Date().toISOString(),
 })
 .eq('id', id)
 .eq('organization_id', profile.organization_id);

 if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 });

 return NextResponse.json({
 user: {
  id,
  email: target.email,
  full_name: target.full_name,
 },
 temporary_password: temporaryPassword,
 message: 'Kata laluan baharu dijana. Pengguna mesti tukar selepas login.',
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal reset kata laluan' },
 { status: 400 });
 }
}
