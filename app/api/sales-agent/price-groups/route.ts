import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { SALES_AGENT_EMPLOYER_CODE } from '@/lib/brand/legal-entities';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER'];

async function assertAdmin() {
 const profile = await getCurrentProfile();
 if (!profile) throw new Response('Unauthorized', { status: 401 });
 if (!ADMIN_ROLES.includes(profile.role)) throw new Response('Forbidden', { status: 403 });
 return profile;
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const service = await createServiceClient();
 const { data, error } = await service.from('agent_price_groups').select('*, items:agent_price_group_items(*, stock_item:stock_items(item_code, name, base_unit))').eq('organization_id', profile.organization_id).order('name');
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ groups: data ?? [] });
}

export async function POST(request: Request) {
 try {
 const profile = await assertAdmin();
 const body = await request.json();
 const service = await createServiceClient();
 const { data: entity } = await (service as SupabaseClient).from('legal_entities').select('id').eq('organization_id', profile.organization_id).eq('code', SALES_AGENT_EMPLOYER_CODE).single();
 if (!(entity as { id?: string } | null)?.id) return NextResponse.json({ error: 'RKJ Distributor tidak dijumpai' }, { status: 500 });

 const { data, error } = await (service as SupabaseClient).from('agent_price_groups').insert({
 organization_id: profile.organization_id,
 legal_entity_id: (entity as { id: string }).id,
 code: String(body.code ?? '').trim().toUpperCase(),
 name: String(body.name ?? '').trim(),
 description: body.description ?? null,
 is_default: Boolean(body.is_default),
 payment_exempt: Boolean(body.payment_exempt),
 status: body.status ?? 'ACTIVE',
 }).select('*').single();
 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ group: data });
 } catch (err) {
 if (err instanceof Response) return err;
 return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal cipta group' }, { status: 400 });
 }
}

