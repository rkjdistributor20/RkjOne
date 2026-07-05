import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { getAgentAccountForProfile, isAgentPaymentExempt, loadStockCatalog } from '@/lib/sales-agent/service';

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 const productionDate = body.production_date as string | undefined;
 const items = (body.items ?? []) as Array<{ stock_item_id: string; quantity: number }>;

 if (!productionDate || !items.length) {
 return NextResponse.json({ error: 'Tarikh production dan item diperlukan' }, { status: 400 });
 }

 const service = await createServiceClient();
 const account = await getAgentAccountForProfile(service, profile.id, profile.organization_id);
 if (!account) return NextResponse.json({ error: 'Daftar akaun ejen dahulu' }, { status: 400 });

 const { data: windowOpen } = await (service as SupabaseClient).rpc('is_factory_order_window_open', {
 p_org_id: profile.organization_id,
 p_production_date: productionDate,
 } as never);
 if (!windowOpen) {
 return NextResponse.json({ error: 'Tempoh order untuk tarikh ini sudah tutup' }, { status: 400 });
 }

 const paymentExempt = await isAgentPaymentExempt(service, account);
 const catalog = await loadStockCatalog(service, profile.organization_id, account.assigned_price_group_id ?? null);
 const priceMap = new Map(catalog.map((c) => [c.id, c]));

 let total = 0;
 const lineRows: Array<{
 stock_item_id: string;
 quantity: number;
 unit: string;
 unit_price_rm: number;
 line_total_rm: number;
 }> = [];

 for (const line of items) {
 const cat = priceMap.get(line.stock_item_id);
 if (!cat || line.quantity <= 0) continue;
 const lineTotal = Math.round(cat.unit_price_rm * line.quantity * 100) / 100;
 total += lineTotal;
 lineRows.push({
 stock_item_id: line.stock_item_id,
 quantity: line.quantity,
 unit: cat.unit,
 unit_price_rm: cat.unit_price_rm,
 line_total_rm: lineTotal,
 });
 }

 if (!lineRows.length) {
 return NextResponse.json({ error: 'Tiada item sah' }, { status: 400 });
 }

 let order: Record<string, unknown> | null = null;
 let orderErr: { message: string } | null = null;

 for (let attempt = 0; attempt < 5; attempt += 1) {
 const { data: orderNo } = await (service as SupabaseClient).rpc('next_agent_order_number', {
 p_org_id: profile.organization_id,
 } as never);

 const result = await (service as SupabaseClient).from('agent_stock_orders').insert({
 organization_id: profile.organization_id,
 agent_account_id: account.id,
 order_number: String(orderNo ?? `AO-${Date.now()}-${attempt}`),
 production_date: productionDate,
 status: paymentExempt ? 'SUBMITTED_FACTORY' : 'PENDING_PAYMENT',
 total_amount_rm: total,
 notes: body.notes ?? null,
 created_by: profile.id,
 submitted_at: paymentExempt ? new Date().toISOString() : null,
 }).select('*').single();

 if (!result.error && result.data) {
 order = result.data as Record<string, unknown>;
 break;
 }

 orderErr = result.error;
 if (!result.error?.message.includes('duplicate key')) break;
 }

 if (!order) return NextResponse.json({ error: orderErr?.message ?? 'Gagal cipta order' }, { status: 500 });

 const { error: itemsErr } = await (service as SupabaseClient).from('agent_stock_order_items').insert(
 lineRows.map((r) => ({...r, order_id: order.id })));
 if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

 let factoryOrderId: string | null = null;
 if (paymentExempt) {
 const { data: factoryOrder, error: factoryErr } = await (service as SupabaseClient).from('factory_agent_orders').insert({
 organization_id: profile.organization_id,
 agent_order_id: order.id,
 agent_account_id: account.id,
 production_date: productionDate,
 company_name: account.company_name,
 status: 'SUBMITTED',
 }).select('id').single();

 if (factoryErr) return NextResponse.json({ error: factoryErr.message }, { status: 500 });
 factoryOrderId = (factoryOrder as { id: string }).id;

 const { error: factoryItemsErr } = await (service as SupabaseClient).from('factory_agent_order_items').insert(
 lineRows.map((r) => ({
 factory_agent_order_id: factoryOrderId,
 stock_item_id: r.stock_item_id,
 quantity: r.quantity,
 unit: r.unit,
 })));
 if (factoryItemsErr) return NextResponse.json({ error: factoryItemsErr.message }, { status: 500 });

 await (service as SupabaseClient).from('agent_stock_orders').update({ factory_order_id: factoryOrderId, updated_at: new Date().toISOString() }).eq('id', order.id);
 }

 return NextResponse.json({
 order: {...order,
 status: paymentExempt ? 'SUBMITTED_FACTORY' : order.status,
 factory_order_id: factoryOrderId ?? order.factory_order_id ?? null,
 payment_exempt: paymentExempt,
 items: lineRows,
 },
 });
}


