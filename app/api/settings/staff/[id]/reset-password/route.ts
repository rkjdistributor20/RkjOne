import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertCanManagePersonnel,
 assertStaffTargetInScope,
} from '@/lib/settings/personnel-access';
import { resetStaffPortalPassword } from '@/lib/settings/staff-auth';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export async function POST(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 try {
 const limited = enforceRateLimit(request, {
 key: 'staff-reset-password',
 limit: 10,
 windowMs: 10 * 60 * 1000,
 });
 if (limited) return limited;

 const profile = assertCanManagePersonnel(await getCurrentProfile());
 const { id } = await params;
 const supabase = await createClient();
 const service = await createServiceClient();

 await assertStaffTargetInScope(supabase, profile, id);

 const { data: staff } = await supabase.from('staff').select('staff_code').eq('id', id).single();

 if (!staff) {
 return NextResponse.json({ error: 'Staf tidak dijumpai' }, { status: 404 });
 }

 const staffRow = staff as { staff_code: string };

 const portal = await resetStaffPortalPassword(
 service,
 id,
 staffRow.staff_code,
 profile.id);

 return NextResponse.json({
 portal,
 message: 'Kata laluan baharu - staf mesti tukar pada log masuk pertama',
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal reset kata laluan' },
 { status: 400 });
 }
}
