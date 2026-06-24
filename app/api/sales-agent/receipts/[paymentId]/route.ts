import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile } from '@/lib/sales-agent/service';
import { getAgentReceiptForPayment } from '@/lib/sales-agent/receipt';

export async function GET(
  _request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (profile.role !== 'SALES_AGENT') {
    return NextResponse.json({ error: 'Hanya ejen jualan' }, { status: 403 });
  }

  const { paymentId } = await context.params;
  const service = await createServiceClient();
  const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
  if (!account) return NextResponse.json({ error: 'Akaun ejen tiada' }, { status: 400 });

  const receipt = await getAgentReceiptForPayment(
    service as SupabaseClient,
    paymentId,
    account.id as string
  );
  if (!receipt) {
    return NextResponse.json({ error: 'Resit tidak dijumpai atau bayaran belum selesai' }, { status: 404 });
  }

  return NextResponse.json({ receipt });
}
