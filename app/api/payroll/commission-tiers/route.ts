import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('commission_tiers')
    .select('id, tier_from, tier_to, commission_amount, formula_description, status')
    .eq('organization_id', profile.organization_id)
    .order('tier_from');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tiers: data ?? [] });
}
