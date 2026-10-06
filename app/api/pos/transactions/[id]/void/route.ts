import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/auth/session';
import type { Database, Json } from '@/types/database';
import {
 assertCanAccessPosBranch,
 canVoidPosTransaction,
 posAccessErrorStatus,
} from '@/lib/pos/access';

type DatabaseWithInternalVoidRpc = Omit<Database, 'public'> & {
 public: Omit<Database['public'], 'Functions'> & {
 Functions: Database['public']['Functions'] & {
  void_pos_transaction_internal: {
   Args: {
    p_transaction_id: string;
    p_reason: string;
    p_actor_id: string;
   };
   Returns: Json;
  };
 };
 };
};

export async function POST(
 request: Request,
 { params }: { params: Promise<{ id: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }
 if (!canVoidPosTransaction(profile.role)) {
 return NextResponse.json(
  { error: 'Batal jualan hanya dibenarkan untuk pengurus operasi yang diluluskan.' },
  { status: 403 });
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

 const { data: fiuuPayment, error: paymentError } = await supabase
 .from('pos_online_payments')
 .select('id')
 .eq('organization_id', profile.organization_id)
 .eq('branch_id', transaction.branch_id)
 .eq('transaction_id', transaction.id)
 .eq('provider', 'fiuu')
 .limit(1)
 .maybeSingle();
 if (paymentError) {
 return NextResponse.json({ error: paymentError.message }, { status: 400 });
 }
 if (fiuuPayment) {
 return NextResponse.json(
  {
   error: 'Transaksi Fiuu yang telah dibayar tidak boleh dibatalkan sebagai void dalaman. Gunakan proses refund Fiuu dan rekonsiliasi Finance.',
   code: 'FIUU_PROVIDER_REFUND_REQUIRED',
  },
  { status: 409 });
 }

 const admin = createAdminClient() as SupabaseClient<DatabaseWithInternalVoidRpc>;
 const { data, error } = await admin.rpc('void_pos_transaction_internal', {
 p_transaction_id: id,
 p_reason: reason,
 p_actor_id: profile.id,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 return NextResponse.json({ result: data });
}
