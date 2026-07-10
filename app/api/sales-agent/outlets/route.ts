import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { canAccessSalesAgent } from '@/lib/auth/permissions';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile } from '@/lib/sales-agent/service';

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!canAccessSalesAgent(profile.role)) {
 return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
 }

 const body = await request.json().catch(() => ({}));
 if (!body.outlet_code?.trim() || !body.outlet_name?.trim()) {
 return NextResponse.json({ error: 'Kod dan nama cawangan diperlukan' }, { status: 400 });
 }

 const service = await createServiceClient();
 const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
 if (!account) return NextResponse.json({ error: 'Daftar akaun ejen dahulu' }, { status: 400 });

 const { data: outlet, error } = await (service as SupabaseClient).from('agent_outlets').insert({
 organization_id: profile.organization_id,
 agent_account_id: account.id,
 outlet_code: body.outlet_code.trim().toUpperCase(),
 outlet_name: body.outlet_name.trim(),
 address_line: body.address_line ?? null,
 city: body.city ?? null,
 state: body.state ?? null,
 postcode: body.postcode ?? null,
 status: 'PENDING',
 }).select('*').single();

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ outlet });
}
