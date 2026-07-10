import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const url = new URL(request.url);
 const requestedLimit = Number(url.searchParams.get('limit') ?? 20);
 const limit = Number.isFinite(requestedLimit)
 ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 60)
 : 20;

 const supabase = await createClient();
 const { data, error } = await supabase.from('daily_financial_reports').select(`
 id, report_date, total_qr, total_cash_collected,
 total_banked, total_verified, outstanding_cash,
 branch:branches(branch_name)
 `).eq('organization_id', profile.organization_id).order('report_date', { ascending: false }).limit(limit);

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ reports: data ?? [] }, {
 headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=90' },
 });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json();
 const supabase = await createClient();

 const { data, error } = await inventoryRpc(supabase, 'generate_daily_financial_report', {
 p_report_date: body.report_date,
 p_branch_id: body.branch_id ?? null,
 });

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 return NextResponse.json({ result: data });
}
