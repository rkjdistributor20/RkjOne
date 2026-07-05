import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertSettingsAdmin } from '@/lib/settings/admin-auth';

export async function PATCH(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 try {
 const profile = assertSettingsAdmin(await getCurrentProfile());
 const { id } = await params;
 const body = await request.json();
 const supabase = await createClient();

 const updates: Record<string, unknown> = {};
 if (body.name !== undefined) updates.name = body.name;
 if (body.sku !== undefined) updates.sku = body.sku;
 if (body.category !== undefined) updates.category = body.category;
 if (body.price !== undefined) updates.price = Number(body.price);
 if (body.status !== undefined) updates.status = body.status;
 updates.updated_at = new Date().toISOString();

 const { data, error } = await (supabase as SupabaseClient).from('products').update(updates).eq('id', id).eq('organization_id', profile.organization_id).select('id, sku, name, price, status, category').single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });

 return NextResponse.json({
 product: { ...data, selling_price: Number(data.price ?? 0) },
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}

export async function DELETE(
 _request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 try {
 const profile = assertSettingsAdmin(await getCurrentProfile());
 const { id } = await params;
 const supabase = await createClient();

 const { error } = await (supabase as SupabaseClient).from('products').delete().eq('id', id).eq('organization_id', profile.organization_id);

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: { id, deleted: true } });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}
