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
  const { data, error } = await supabase
    .from('pos_daily_summaries')
    .select('summary_date, total_sales, total_cash, total_qr, transaction_count')
    .eq('organization_id', profile.organization_id)
    .gte('summary_date', from)
    .lte('summary_date', to)
    .order('summary_date');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byDate = new Map<string, { total_sales: number; total_cash: number; total_qr: number; transaction_count: number }>();

  for (const row of (data ?? []) as Array<{
    summary_date: string;
    total_sales: number;
    total_cash: number;
    total_qr: number;
    transaction_count: number;
  }>) {
    const key = row.summary_date;
    const cur = byDate.get(key) ?? { total_sales: 0, total_cash: 0, total_qr: 0, transaction_count: 0 };
    cur.total_sales += Number(row.total_sales);
    cur.total_cash += Number(row.total_cash);
    cur.total_qr += Number(row.total_qr);
    cur.transaction_count += Number(row.transaction_count);
    byDate.set(key, cur);
  }

  const trend = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({ period, ...v }));

  return NextResponse.json({ trend });
}
