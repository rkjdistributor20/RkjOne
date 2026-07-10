import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertSettingsAdmin } from '@/lib/settings/admin-auth';
import { jsonWithPrivateCache } from '@/lib/http/cache';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data, error } = await supabase.from('stock_items').select('id, item_code, name, min_threshold, critical_threshold, status, category, base_unit').eq('organization_id', profile.organization_id).order('item_code');

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return jsonWithPrivateCache({ items: data ?? [] }, 60, 180);
}

export async function POST(request: Request) {
 try {
 const profile = assertSettingsAdmin(await getCurrentProfile());
 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await (supabase as SupabaseClient).from('stock_items').insert({
 organization_id: profile.organization_id,
 item_code: body.item_code,
 name: body.name,
 category: body.category ?? null,
 base_unit: body.base_unit ?? 'PCS',
 pack_quantity: body.pack_quantity ?? null,
 pack_unit: body.pack_unit ?? null,
 conversion_text: body.conversion_text ?? null,
 min_threshold: body.min_threshold ?? null,
 critical_threshold: body.critical_threshold ?? null,
 status: body.status ?? 'ACTIVE',
 }).select('id, item_code, name, min_threshold, critical_threshold, status, category').single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ item: data });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}
