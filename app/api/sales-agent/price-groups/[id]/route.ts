import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER'];

async function assertAdmin() {
 const profile = await getCurrentProfile();
 if (!profile) throw new Response('Unauthorized', { status: 401 });
 if (!ADMIN_ROLES.includes(profile.role)) throw new Response('Forbidden', { status: 403 });
 return profile;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
 const profile = await assertAdmin();
 const { id } = await context.params;
 const body = await request.json();
 const service = await createServiceClient();

 const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
 for (const key of ['name', 'description', 'status', 'is_default']) {
 if (body[key] !== undefined) updates[key] = body[key];
 }

 const { data, error } = await (service as SupabaseClient).from('agent_price_groups').update(updates).eq('organization_id', profile.organization_id).eq('id', id).select('*').single();
 if (error) return NextResponse.json({ error: error.message }, { status: 400 });

 if (Array.isArray(body.items)) {
 for (const item of body.items) {
 if (item.delete && item.id) {
 await (service as SupabaseClient).from('agent_price_group_items').delete().eq('id', item.id).eq('organization_id', profile.organization_id);
 continue;
 }
 if (item.id) {
 await (service as SupabaseClient).from('agent_price_group_items').update({
 item_label: item.item_label,
 package_description: item.package_description ?? null,
 unit_price_rm: item.unit_price_rm,
 status: item.status ?? 'ACTIVE',
 updated_at: new Date().toISOString(),
 }).eq('id', item.id).eq('organization_id', profile.organization_id);
 } else if (item.stock_item_id) {
 await (service as SupabaseClient).from('agent_price_group_items').upsert({
 organization_id: profile.organization_id,
 price_group_id: id,
 stock_item_id: item.stock_item_id,
 item_label: item.item_label,
 package_description: item.package_description ?? null,
 unit_price_rm: item.unit_price_rm,
 status: item.status ?? 'ACTIVE',
 }, { onConflict: 'price_group_id,stock_item_id' });
 }
 }
 }

 return NextResponse.json({ group: data });
 } catch (err) {
 if (err instanceof Response) return err;
 return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal update group' }, { status: 400 });
 }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
 try {
 const profile = await assertAdmin();
 const { id } = await context.params;
 const service = await createServiceClient();
 const { error } = await (service as SupabaseClient).from('agent_price_groups').update({ status: 'INACTIVE', updated_at: new Date().toISOString() }).eq('organization_id', profile.organization_id).eq('id', id);
 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ ok: true });
 } catch (err) {
 if (err instanceof Response) return err;
 return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal delete group' }, { status: 400 });
 }
}
