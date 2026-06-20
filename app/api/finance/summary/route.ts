import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { count: pendingCollections } = await supabase
    .from('finance_collections')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', profile.organization_id)
    .eq('status', 'PENDING');

  const { data: collectedToday } = await supabase
    .from('finance_collections')
    .select('amount')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'COLLECTED')
    .gte('collected_at', `${today}T00:00:00`);

  const { data: bankedToday } = await supabase
    .from('bank_in_records')
    .select('amount')
    .eq('organization_id', profile.organization_id)
    .gte('banked_at', `${today}T00:00:00`);

  const { count: pendingRecon } = await supabase
    .from('cash_reconciliations')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', profile.organization_id)
    .eq('status', 'PENDING');

  const { data: outstanding } = await supabase
    .from('finance_collections')
    .select('amount')
    .eq('organization_id', profile.organization_id)
    .in('status', ['PENDING', 'COLLECTED']);

  const sum = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  return NextResponse.json({
    summary: {
      pending_collections: pendingCollections ?? 0,
      collected_today: sum(collectedToday as { amount: number }[] | null),
      banked_today: sum(bankedToday as { amount: number }[] | null),
      pending_reconciliations: pendingRecon ?? 0,
      outstanding_cash: sum(outstanding as { amount: number }[] | null),
    },
  });
}
