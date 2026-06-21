import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { fetchRotiExpirySummary } from '@/lib/pos/expired-stock-server';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const branchId = new URL(request.url).searchParams.get('branch_id');
  if (!branchId) {
    return NextResponse.json({ error: 'branch_id diperlukan' }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const summary = await fetchRotiExpirySummary(supabase, branchId);
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal semak expired roti' },
      { status: 500 }
    );
  }
}
