import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';

export async function POST(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { id } = await params;
 const body = await request.json();
 const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
 if (reason.length < 5) {
 return NextResponse.json({ error: 'Sebab batal jualan wajib diisi' }, { status: 400 });
 }

 const supabase = await createClient();

 const { data: transactionData, error: txError } = await supabase
 .from('pos_transactions')
 .select('id, branch_id')
 .eq('id', id)
 .eq('organization_id', profile.organization_id)
 .maybeSingle();
 const transaction = transactionData as { id: string; branch_id: string } | null;

 if (txError) {
 return NextResponse.json({ error: txError.message }, { status: 400 });
 }
 if (!transaction) {
 return NextResponse.json({ error: 'Transaksi tidak dijumpai' }, { status: 404 });
 }

 try {
 await assertCanAccessPosBranch(supabase, profile, transaction.branch_id);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Akses cawangan ditolak' },
 { status: posAccessErrorStatus(err) });
 }

 const { data, error } = await callRpc(supabase, 'void_pos_transaction', {
 p_transaction_id: id,
 p_reason: reason,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 return NextResponse.json({ result: data });
}
