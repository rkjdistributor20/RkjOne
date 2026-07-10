import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { canAccessSalesAgent } from '@/lib/auth/permissions';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile, loadStockCatalog } from '@/lib/sales-agent/service';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!canAccessSalesAgent(profile.role)) {
 return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
 }

 const service = await createServiceClient();
 const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
 const items = await loadStockCatalog(service, profile.organization_id, account?.assigned_price_group_id ?? null);
 return NextResponse.json({ items });
}
