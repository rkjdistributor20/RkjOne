import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const branchId = new URL(request.url).searchParams.get('branch_id') ?? profile.branch_id;
  const supabase = await createClient();

  let query = supabase
    .from('staff_shifts')
    .select(`
      id, shift_date, scheduled_start, scheduled_end, scheduled_hours,
      actual_hours, ot_hours, status,
      staff:staff(staff_code, full_name),
      branch:branches(branch_code, branch_name),
      template:shift_templates(name)
    `)
    .eq('organization_id', profile.organization_id)
    .order('shift_date', { ascending: false })
    .limit(50);

  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ shifts: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = await createClient();

  const { data, error } = await inventoryRpc(supabase, 'create_staff_shift', {
    p_staff_id: body.staff_id,
    p_branch_id: body.branch_id,
    p_shift_date: body.shift_date,
    p_template_id: body.template_id ?? null,
    p_scheduled_start: body.scheduled_start ?? null,
    p_scheduled_end: body.scheduled_end ?? null,
    p_notes: body.notes ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: data });
}
