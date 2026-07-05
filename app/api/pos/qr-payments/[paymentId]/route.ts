import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import {
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';

export async function GET(
 _request: Request,
 context: { params: Promise<{ paymentId: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { paymentId } = await context.params;
 const service = await createServiceClient();
 const { data, error } = await (service as SupabaseClient).from('pos_online_payments').select('id, branch_id, shift_id, amount_rm, status, gateway_ref, checkout_url, paid_at, transaction_id, sale_payload').eq('id', paymentId).eq('organization_id', profile.organization_id).maybeSingle();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 if (!data) return NextResponse.json({ error: 'QR payment tidak dijumpai' }, { status: 404 });

 try {
 await assertCanAccessPosBranch(service, profile, data.branch_id);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Akses cawangan ditolak' },
 { status: posAccessErrorStatus(err) });
 }

 return NextResponse.json({ payment: data });
}
