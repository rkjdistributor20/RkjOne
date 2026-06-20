import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = new URL(request.url).searchParams.get('status') ?? 'PENDING';
  const supabase = await createClient();

  let query = supabase
    .from('approval_requests')
    .select(`
      id, entity_type, entity_id, title, description, status, created_at,
      branch:branches(branch_name),
      requester:profiles!approval_requests_requested_by_fkey(full_name, email)
    `)
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ approvals: data ?? [] });
}
