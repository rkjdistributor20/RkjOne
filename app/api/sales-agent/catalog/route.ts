import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile, loadStockCatalog } from '@/lib/sales-agent/service';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();
  const items = await loadStockCatalog(service, profile.organization_id);
  return NextResponse.json({ items });
}
