import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { canAccessSalesAgent } from '@/lib/auth/permissions';
import { ensureAgentAccount, getAgentAccountForProfile } from '@/lib/sales-agent/service';
import { getLegalEntityByCode, SALES_AGENT_EMPLOYER_CODE } from '@/lib/brand/legal-entities';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessSalesAgent(profile.role)) {
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
  }

  const service = await createServiceClient();
  const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
  return NextResponse.json({ account });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (profile.role !== 'SALES_AGENT' && profile.role !== 'SUPER_ADMIN' && profile.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (!body.company_name?.trim()) {
    return NextResponse.json({ error: 'Nama syarikat diperlukan' }, { status: 400 });
  }

  const entity = getLegalEntityByCode(SALES_AGENT_EMPLOYER_CODE);
  if (!entity) return NextResponse.json({ error: 'Entiti RKJ_DIST tiada' }, { status: 500 });

  const service = await createServiceClient();
  const { data: le } = await (service as SupabaseClient)
    .from('legal_entities')
    .select('id')
    .eq('code', SALES_AGENT_EMPLOYER_CODE)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!le?.id) return NextResponse.json({ error: 'Legal entity tiada' }, { status: 500 });

  try {
    const account = await ensureAgentAccount(service, profile.id, profile.organization_id, le.id as string, {
      company_name: body.company_name.trim(),
      registration_no: body.registration_no,
      contact_person: body.contact_person ?? profile.full_name,
      contact_phone: body.contact_phone,
      contact_email: body.contact_email ?? profile.email,
      business_address: body.business_address,
    });
    return NextResponse.json({ account });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gagal daftar' }, { status: 400 });
  }
}
