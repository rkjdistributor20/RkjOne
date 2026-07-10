import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { canSubmitHqFactoryOrder } from '@/lib/auth/stock-access';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 const searchParams = new URL(request.url).searchParams;
 const status = searchParams.get('status');
 const requestedLimit = Number(searchParams.get('limit') ?? 20);
 const limit = Number.isFinite(requestedLimit)
 ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
 : 20;
 const supabase = await createClient();

 let query = supabase.from('hq_factory_orders' as 'products').select(
 `
 id, order_number, production_date, status, order_phase, notes, created_at, acknowledged_at, routes_planned_at, created_by,
 hq_factory_order_items(
 id, quantity, unit,
 stock_item:stock_items(item_code, name, category)),
 hq_factory_order_branch_items(
 id, branch_id, quantity, unit,
 branch:branches(branch_code, branch_name),
 stock_item:stock_items(item_code, name, category))
 `).eq('organization_id', profile.organization_id).order('created_at', { ascending: false }).limit(limit);

 if (status) {
 query = query.eq('status', status);
 }

 const { data, error } = await query;
 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 return NextResponse.json({ orders: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 if (!canSubmitHqFactoryOrder(profile.role)) {
 return NextResponse.json(
 { error: 'Hanya pembuat order HQ boleh hantar order ke kilang' },
 { status: 403 });
 }

 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'create_hq_factory_order', {
 p_production_date: body.production_date,
 p_items: body.items ?? null,
 p_notes: body.notes ?? null,
 p_branch_items: body.branch_items ?? null,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 return NextResponse.json({ result: data });
}
