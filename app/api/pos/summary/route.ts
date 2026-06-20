import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get('branch_id') ?? profile.branch_id;
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  if (!branchId) {
    return NextResponse.json({ error: 'Branch required' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('pos_daily_summaries')
    .select('*')
    .eq('branch_id', branchId)
    .eq('summary_date', date)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    summary: data ?? {
      summary_date: date,
      total_sales: 0,
      total_cash: 0,
      total_qr: 0,
      transaction_count: 0,
      void_count: 0,
      refund_count: 0,
      shift_count: 0,
    },
  });
}
