import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const url = new URL(request.url);
 const to = url.searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
 const from =
 url.searchParams.get('from') ??
 new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

 const supabase = await createClient();
 const { data, error } = await supabase.from('pos_daily_summaries').select(`
 total_sales, total_cash, total_qr, transaction_count,
 branch:branches(id, branch_code, branch_name, region:regions(name))
 `).eq('organization_id', profile.organization_id).gte('summary_date', from).lte('summary_date', to);

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 type Row = {
 total_sales: number;
 total_cash: number;
 total_qr: number;
 transaction_count: number;
 branch: {
 id: string;
 branch_code: string;
 branch_name: string;
 region: { name: string } | null;
 } | null;
 };

 const byBranch = new Map<string, {
 branch_id: string;
 branch_code: string;
 branch_name: string;
 region_name: string | null;
 total_sales: number;
 total_cash: number;
 total_qr: number;
 transaction_count: number;
 }>();

 for (const row of (data ?? []) as unknown as Row[]) {
 if (!row.branch) continue;
 const cur = byBranch.get(row.branch.id) ?? {
 branch_id: row.branch.id,
 branch_code: row.branch.branch_code,
 branch_name: row.branch.branch_name,
 region_name: row.branch.region?.name ?? null,
 total_sales: 0,
 total_cash: 0,
 total_qr: 0,
 transaction_count: 0,
 };
 cur.total_sales += Number(row.total_sales);
 cur.total_cash += Number(row.total_cash);
 cur.total_qr += Number(row.total_qr);
 cur.transaction_count += Number(row.transaction_count);
 byBranch.set(row.branch.id, cur);
 }

 const branches = [...byBranch.values()].sort((a, b) => b.total_sales ?? a.total_sales);
 return NextResponse.json({ branches });
}
