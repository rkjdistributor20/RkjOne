import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { canAccessSalesAgent } from '@/lib/auth/permissions';
import { buildAgentDashboard } from '@/lib/sales-agent/service';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!canAccessSalesAgent(profile.role)) {
 return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
 }

 const service = await createServiceClient();
 const dashboard = await buildAgentDashboard(service, profile.id, profile.organization_id);
 return NextResponse.json({ dashboard });
}
