import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bank_in_records')
    .select('id, bank_in_number, amount, bank_name, reference_number, slip_url, banked_at, status')
    .eq('organization_id', profile.organization_id)
    .order('banked_at', { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ records: data ?? [] });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = await createClient();

  const { data, error } = await inventoryRpc(supabase, 'record_bank_in', {
    p_amount: body.amount,
    p_collection_id: body.collection_id ?? null,
    p_bank_name: body.bank_name ?? null,
    p_reference_number: body.reference_number ?? null,
    p_slip_url: body.slip_url ?? null,
    p_notes: body.notes ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: data });
}
