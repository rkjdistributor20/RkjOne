import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const { error } = await (supabase as SupabaseClient)
    .from('stock_items')
    .update({
      min_threshold: body.min_threshold,
      critical_threshold: body.critical_threshold,
    })
    .eq('id', id)
    .eq('organization_id', profile.organization_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: { id, status: 'UPDATED' } });
}
