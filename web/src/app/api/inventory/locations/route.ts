import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const branchId = searchParams.get('branch_id') ?? profile.branch_id;

  const supabase = await createClient();

  let query = supabase
    .from('inventory_locations')
    .select(`
      *,
      branch:branches(branch_code, branch_name),
      vehicle:vehicles(vehicle_code, vehicle_type)
    `)
    .eq('organization_id', profile.organization_id)
    .eq('is_active', true)
    .order('location_type')
    .order('name');

  if (type) query = query.eq('location_type', type);
  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ locations: data ?? [] });
}
