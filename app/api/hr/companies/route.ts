import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertCanManageHrPeople } from '@/lib/hr/hr-access';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyHrDashboard } from '@/lib/hr/company-hr';

export async function GET() {
  try {
    const profile = assertCanManageHrPeople(await getCurrentProfile());
    const service = await createServiceClient();
    const data = await getCompanyHrDashboard(service, profile.organization_id);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}
