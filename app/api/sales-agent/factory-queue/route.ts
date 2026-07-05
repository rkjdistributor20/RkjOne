import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';

const FACTORY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER'];

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!FACTORY_ROLES.includes(profile.role)) {
 return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
 }

 const service = await createServiceClient();
 const { data, error } = await (service as SupabaseClient).from('factory_agent_orders').select(`
 id, production_date, status, company_name, submitted_at,
 items:factory_agent_order_items(quantity, unit, stock_item:stock_items(name, item_code))
 `).eq('organization_id', profile.organization_id).order('submitted_at', { ascending: false }).limit(50);

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ orders: data ?? [] });
}
