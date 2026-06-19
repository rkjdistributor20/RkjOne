import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const branchId = new URL(request.url).searchParams.get('branch_id') ?? profile.branch_id;
  const supabase = await createClient();

  let query = supabase
    .from('staff')
    .select('id, staff_code, full_name')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'ACTIVE')
    .order('full_name');

  if (branchId) query = query.eq('branch_id', branchId);

  const { data } = await query;
  return NextResponse.json({ staff: data ?? [] });
}
