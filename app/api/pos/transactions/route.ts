import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertAreaManagerScheduledForPos,
 assertActivePosShiftMember,
 assertCanAccessPosBranch,
 canViewFullPosHistory,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import type { CreateSalePayload, SaleResult } from '@/lib/pos/types';
import { assertOfficialPosDevice } from '@/lib/pos/device-auth';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { searchParams } = new URL(request.url);
 const branchId = searchParams.get('branch_id') ?? profile.branch_id;
 const shiftId = searchParams.get('shift_id');
 const requestedLimit = Number(searchParams.get('limit') ?? 50);
 const limit = canViewFullPosHistory(profile.role)
 ? Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100)
 : 3;

 if (!branchId) {
 return NextResponse.json({ error: 'Branch required' }, { status: 400 });
 }

 const supabase = await createClient();
 try {
 await assertCanAccessPosBranch(supabase, profile, branchId);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Akses cawangan ditolak' },
 { status: posAccessErrorStatus(err) });
 }

 let query = supabase.from('pos_transactions').select(
 `
 *,
 pos_transaction_items (*)
 `).eq('organization_id', profile.organization_id).eq('branch_id', branchId).order('created_at', { ascending: false }).limit(limit);

 if (shiftId) {
 query = query.eq('shift_id', shiftId);
 }

 const { data, error } = await query;

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 return NextResponse.json({ transactions: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const body = (await request.json()) as CreateSalePayload;

 if (!body.shiftId || !body.branchId || !body.items?.length) {
 return NextResponse.json({ error: 'Invalid sale payload' }, { status: 400 });
 }

 const supabase = await createClient();
 try {
 await assertCanAccessPosBranch(supabase, profile, body.branchId);
 await assertAreaManagerScheduledForPos(supabase, profile, body.branchId);
 await assertOfficialPosDevice(profile, body.branchId);
 await assertActivePosShiftMember(supabase, profile, body.shiftId, body.branchId);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Akses cawangan ditolak' },
 { status: posAccessErrorStatus(err) });
 }

 const { data: sopStatus, error: sopError } = await inventoryRpc(supabase, 'pos_sop_status', {
 p_branch_id: body.branchId,
 });
 if (sopError) {
 return NextResponse.json({ error: sopError.message }, { status: 400 });
 }

 const status = sopStatus as {
 sales_blocked?: boolean;
 delivery_pending_count?: number;
 required_stock_check?: 'OPENING' | 'MID_SHIFT' | 'CLOSE_SHIFT' | null;
 active_leave?: { reason?: string; left_at?: string } | null;
 } | null;

 const openingStockCheckRequired = status?.required_stock_check === 'OPENING';

 if (profile.role !== 'SUPER_ADMIN' && (
 status?.active_leave ||
 Number(status?.delivery_pending_count ?? 0) > 0 ||
 openingStockCheckRequired
 )) {
 if (status?.active_leave) {
 return NextResponse.json(
 { error: 'Staf masih direkod keluar kiosk. Tekan kembali dahulu sebelum teruskan jualan.' },
 { status: 400 });
 }
 if (Number(status?.delivery_pending_count ?? 0) > 0) {
 return NextResponse.json(
 { error: 'Sahkan stok driver dahulu sebelum jualan POS.' },
 { status: 400 });
 }
 return NextResponse.json(
 { error: 'Kiraan stok sebelum jualan wajib dibuat sebelum POS boleh mula jualan.' },
 { status: 400 });
 }

 const { data, error } = await callRpc(supabase, 'process_pos_sale', {
 p_shift_id: body.shiftId,
 p_branch_id: body.branchId,
 p_items: body.items,
 p_payment_method: body.payment_method,
 p_cash_amount: body.cash_amount,
 p_qr_amount: body.qr_amount,
 p_discount: body.discount ?? 0,
 ...(body.offline_id === undefined ? {} : { p_offline_id: body.offline_id }),
 ...(body.receipt_email === undefined ? {} : { p_receipt_email: body.receipt_email }),
 ...(body.receipt_phone === undefined ? {} : { p_receipt_phone: body.receipt_phone }),
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 const result = data as SaleResult;
 const qrAmount = Number(body.qr_amount ?? 0);
 let manualPaymentReview: { id: string; status: string } | null = null;
 let manualPaymentReviewError: string | null = null;

 if (qrAmount > 0) {
 const { data: review, error: reviewError } = await (supabase as SupabaseClient)
 .from('pos_online_payments')
 .insert({
 organization_id: profile.organization_id,
 branch_id: body.branchId,
 shift_id: body.shiftId,
 amount_rm: qrAmount,
 status: 'PENDING',
 provider: 'manual_qr',
 gateway_ref: `MANUAL-${result.transaction_number}`,
 checkout_url: null,
 sale_payload: {
 ...body,
 manual_verification_required: true,
 manual_verification_source: 'POS_QR_MANUAL',
 transaction_number: result.transaction_number,
 },
 transaction_id: result.transaction_id,
 created_by: profile.id,
 })
 .select('id, status')
 .single();

 if (reviewError) {
 manualPaymentReviewError = reviewError.message;
 } else if (review) {
 manualPaymentReview = review;
 }
 }

 return NextResponse.json({ result, manual_payment_review: manualPaymentReview, manual_payment_review_error: manualPaymentReviewError });
}
