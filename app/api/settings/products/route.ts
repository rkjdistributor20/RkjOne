import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertSettingsAdmin } from '@/lib/settings/admin-auth';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data, error } = await supabase.from('products').select('id, sku, name, price, status, category').eq('organization_id', profile.organization_id).order('name');

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 const products = ((data ?? []) as Array<{
 id: string;
 sku: string;
 name: string;
 price: number;
 status: string;
 category: string | null;
 }>).map((p) => ({
 id: p.id,
 sku: p.sku,
 name: p.name,
 status: p.status,
 category: p.category,
 selling_price: Number(p.price ?? 0),
 }));

 return NextResponse.json({ products });
}

export async function POST(request: Request) {
 try {
 const profile = assertSettingsAdmin(await getCurrentProfile());
 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await (supabase as SupabaseClient).from('products').insert({
 organization_id: profile.organization_id,
 sku: body.sku,
 name: body.name,
 category: body.category ?? null,
 price: Number(body.price ?? 0),
 sale_unit: body.sale_unit ?? 'Pcs',
 status: body.status ?? 'ACTIVE',
 sort_order: Number(body.sort_order ?? 99),
 }).select('id, sku, name, price, status, category').single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });

 return NextResponse.json({
 product: {...data,
 selling_price: Number(data.price ?? 0),
 },
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}
