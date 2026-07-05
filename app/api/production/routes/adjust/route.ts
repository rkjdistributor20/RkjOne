import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { canSubmitHqFactoryOrder } from '@/lib/auth/stock-access';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 if (!canSubmitHqFactoryOrder(profile.role)) {
 return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 }

 const body = await request.json();
 if (!body.stop_id || !body.adjustments?.length) {
 return NextResponse.json({ error: 'stop_id dan adjustments diperlukan' }, { status: 400 });
 }

 const supabase = await createClient();
 const { data, error } = await inventoryRpc(supabase, 'adjust_route_stop_items', {
 p_stop_id: body.stop_id,
 p_adjustments: body.adjustments,
 p_reason: body.reason ?? null,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 return NextResponse.json({ result: data });
}
