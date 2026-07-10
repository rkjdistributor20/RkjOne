import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertCanManageHrPeople } from '@/lib/hr/hr-access';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyHrDashboard } from '@/lib/hr/company-hr';
import { getAllowedLegalEntityCodes } from '@/lib/auth/legal-entity-scope';
import { jsonWithPrivateCache } from '@/lib/http/cache';

export async function GET() {
 try {
 const profile = assertCanManageHrPeople(await getCurrentProfile());
 const service = await createServiceClient();
 const data = await getCompanyHrDashboard(service, profile.organization_id, {
 allowedLegalEntityCodes: getAllowedLegalEntityCodes(profile),
 });
 return jsonWithPrivateCache(data, 20, 60);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}
