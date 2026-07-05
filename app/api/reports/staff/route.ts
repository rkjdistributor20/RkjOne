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
 const { data, error } = await supabase.from('pos_shifts').select(`
 total_sales,
 staff:staff(id, staff_code, full_name, branch:branches(branch_name))
 `).eq('organization_id', profile.organization_id).eq('status', 'CLOSED').gte('closed_at', `${from}T00:00:00`).lte('closed_at', `${to}T23:59:59`);

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 type Row = {
 total_sales: number;
 staff: {
 id: string;
 staff_code: string;
 full_name: string;
 branch: { branch_name: string } | null;
 } | null;
 };

 const byStaff = new Map<string, {
 staff_id: string;
 staff_code: string;
 full_name: string;
 branch_name: string | null;
 total_sales: number;
 shift_count: number;
 }>();

 for (const row of (data ?? []) as unknown as Row[]) {
 if (!row.staff) continue;
 const cur = byStaff.get(row.staff.id) ?? {
 staff_id: row.staff.id,
 staff_code: row.staff.staff_code,
 full_name: row.staff.full_name,
 branch_name: row.staff.branch?.branch_name ?? null,
 total_sales: 0,
 shift_count: 0,
 };
 cur.total_sales += Number(row.total_sales);
 cur.shift_count += 1;
 byStaff.set(row.staff.id, cur);
 }

 const staff = [...byStaff.values()].sort((a, b) => b.total_sales ?? a.total_sales);
 return NextResponse.json({ staff });
}
