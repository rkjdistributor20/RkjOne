import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { AGENT_POS_SUBSCRIPTION_RM, getAgentAccountForProfile } from '@/lib/sales-agent/service';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (profile.role !== 'SALES_AGENT') {
    return NextResponse.json({ error: 'Hanya ejen jualan' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const outletId = body.outlet_id as string | undefined;
  if (!outletId) return NextResponse.json({ error: 'outlet_id diperlukan' }, { status: 400 });

  const service = await createServiceClient();
  const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
  if (!account) return NextResponse.json({ error: 'Akaun ejen tiada' }, { status: 400 });

  const { data: outlet } = await service
    .from('agent_outlets')
    .select('id')
    .eq('id', outletId)
    .eq('agent_account_id', account.id)
    .maybeSingle();

  if (!outlet) return NextResponse.json({ error: 'Cawangan tidak dijumpai' }, { status: 404 });

  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const periodStart = start.toISOString().slice(0, 10);
  const periodEnd = end.toISOString().slice(0, 10);

  const { data: sub, error } = await (service as SupabaseClient)
    .from('agent_outlet_subscriptions')
    .insert({
      organization_id: profile.organization_id,
      outlet_id: outletId,
      period_start: periodStart,
      period_end: periodEnd,
      amount_rm: AGENT_POS_SUBSCRIPTION_RM,
      status: 'PENDING',
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: sub });
}
