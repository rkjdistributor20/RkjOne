import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { loadAllLegalEntityProfiles } from '@/lib/brand/legal-entity-profile';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();
  const companies = await loadAllLegalEntityProfiles(service, profile.organization_id);
  return NextResponse.json({ companies });
}
