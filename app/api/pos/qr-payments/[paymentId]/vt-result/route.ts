import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertActivePosShiftMember,
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import { assertOfficialPosDevice } from '@/lib/pos/device-auth';
import { FIUU_CALLBACK_GRACE_MS } from '@/lib/pos/fiuu';
import {
 getFiuuVtStatusDisposition,
 isFiuuVtPendingStatus,
 parseFiuuVtResult,
 type FiuuVtResult,
} from '@/lib/pos/fiuu-vt';
import { FIUU_VT_PILOT_BRANCH } from '@/lib/pos/fiuu-vt-server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

function jsonRecord(value: Json | null): Record<string, unknown> | null {
 return value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;
}

function sanitizedResult(result: FiuuVtResult): Json {
 return {
  opType: result.opType,
  orderId: result.orderId,
  transactionId: result.transactionId,
  status: result.status,
  amountRm: result.amountRm,
  currency: result.currency,
  channel: result.channel,
  payDate: result.payDate,
 };
}

export async function POST(
 request: Request,
 context: { params: Promise<{ paymentId: string }> },
) {
 const limited = enforceRateLimit(request, {
  key: 'pos-fiuu-vt-result',
  limit: 60,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body: unknown = await request.json().catch(() => null);
 let result: FiuuVtResult;
 try {
  result = parseFiuuVtResult(
   body && typeof body === 'object' && !Array.isArray(body)
    ? Reflect.get(body, 'result')
    : null,
  );
 } catch (error) {
  return NextResponse.json(
   { error: error instanceof Error ? error.message : 'Keputusan Fiuu VT tidak sah' },
   { status: 400 },
  );
 }

 const { paymentId } = await context.params;
 const admin = createAdminClient();
 const { data: payment, error } = await admin
  .from('pos_online_payments')
  .select('id, organization_id, branch_id, shift_id, created_by, provider, status, amount_rm, expires_at, sale_payload, provider_order_id, provider_transaction_id, provider_result, provider_sale_reported_at')
  .eq('id', paymentId)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();
 if (error) return NextResponse.json({ error: 'Percubaan Fiuu VT tidak dapat dibaca' }, { status: 400 });
 if (!payment || payment.provider !== 'fiuu_vt') {
  return NextResponse.json({ error: 'Percubaan Fiuu VT tidak dijumpai' }, { status: 404 });
 }

 try {
  await assertCanAccessPosBranch(admin, profile, payment.branch_id);
  const device = await assertOfficialPosDevice(profile, payment.branch_id);
  await assertActivePosShiftMember(admin, profile, payment.shift_id, payment.branch_id);
  const salePayload = jsonRecord(payment.sale_payload);
  if (payment.created_by !== profile.id
   || salePayload?.fiuu_device_code !== device.deviceCode
   || device.branchCode?.trim().toUpperCase() !== FIUU_VT_PILOT_BRANCH
   || salePayload?.fiuu_branch_code !== FIUU_VT_PILOT_BRANCH) {
   return NextResponse.json({ error: 'Percubaan Fiuu VT bukan milik sesi tablet ini' }, { status: 403 });
  }
 } catch (accessError) {
  return NextResponse.json(
   { error: accessError instanceof Error ? accessError.message : 'Akses Fiuu VT ditolak' },
   { status: posAccessErrorStatus(accessError) },
  );
 }

 if (payment.status === 'PAID') {
  return NextResponse.json({ payment: { id: payment.id, status: 'PAID' }, next_action: 'COMPLETE' });
 }
 if (payment.status !== 'PENDING' && payment.status !== 'REPORTED') {
  return NextResponse.json(
   { error: 'Percubaan Fiuu VT sudah ditutup', mode: 'FIUU_ATTEMPT_TERMINAL' },
   { status: 409 },
  );
 }
 if (payment.status === 'PENDING' && payment.expires_at
  && Date.now() > new Date(payment.expires_at).getTime() + FIUU_CALLBACK_GRACE_MS) {
  return NextResponse.json(
   { error: 'Tempoh rekonsiliasi Fiuu VT telah tamat', mode: 'FIUU_ATTEMPT_TERMINAL' },
   { status: 409 },
  );
 }
 if (payment.provider_order_id !== result.orderId
  || Math.round(Number(payment.amount_rm) * 100) !== Math.round(result.amountRm * 100)) {
  return NextResponse.json({ error: 'Keputusan Fiuu VT tidak sepadan dengan jualan' }, { status: 409 });
 }
 const checkedAt = new Date().toISOString();
 const safeResult = sanitizedResult(result);
 if (result.opType === 'SALE') {
  if (payment.provider_sale_reported_at || payment.provider_transaction_id) {
   if (payment.provider_transaction_id !== result.transactionId) {
    return NextResponse.json({ error: 'Transaction ID SALE Fiuu VT tidak sepadan' }, { status: 409 });
   }
   if (payment.status === 'REPORTED') {
    return NextResponse.json({
     payment: { id: payment.id, status: 'REPORTED' },
     next_action: 'AUTO_CONFIRMATION',
     warning: 'Bayaran berjaya telah dilaporkan. RKJ One akan memuktamadkan jualan secara automatik.',
    });
   }
   return NextResponse.json({
    payment: { id: payment.id, status: 'PENDING' },
    next_action: 'CHECK_STATUS',
   });
  }
  const { data: updatedSale, error: updateError } = await admin
   .from('pos_online_payments')
   .update({
    provider_result: safeResult,
    provider_transaction_id: result.transactionId,
    provider_sale_reported_at: checkedAt,
    provider_status_checked_at: null,
    updated_at: checkedAt,
   })
   .eq('id', payment.id)
   .eq('status', 'PENDING')
   .is('provider_sale_reported_at', null)
   .is('provider_transaction_id', null)
   .select('id')
   .maybeSingle();
  if (updateError) return NextResponse.json({ error: 'Laporan SALE Fiuu VT gagal disimpan' }, { status: 400 });
  if (!updatedSale) {
   return NextResponse.json({ error: 'Laporan SALE Fiuu VT bertindih. Jalankan semakan STATUS semula.' }, { status: 409 });
  }
  return NextResponse.json({
   payment: { id: payment.id, status: 'PENDING' },
   next_action: 'CHECK_STATUS',
  });
 }

 if (!payment.provider_sale_reported_at || !payment.provider_transaction_id) {
  return NextResponse.json(
   { error: 'Laporan SALE Fiuu VT diperlukan sebelum semakan STATUS', mode: 'FIUU_VT_SALE_REQUIRED' },
   { status: 409 },
  );
 }
 if (payment.provider_transaction_id !== result.transactionId) {
  return NextResponse.json({ error: 'Semakan STATUS tidak sepadan dengan transaksi SALE Fiuu VT' }, { status: 409 });
 }
 const disposition = getFiuuVtStatusDisposition(result.status);
 const reportedContradiction = payment.status === 'REPORTED' && result.status !== '00';
 const terminalStatus = disposition === 'FAILED' || disposition === 'CANCELLED'
  ? disposition
  : null;
 const nextStatus = payment.status === 'REPORTED'
  ? 'REPORTED'
  : disposition === 'REPORTED'
   ? 'REPORTED'
   : terminalStatus;
 const update = {
  provider_result: safeResult,
  provider_status_checked_at: checkedAt,
  updated_at: checkedAt,
  ...(nextStatus ? {
   status: nextStatus,
   ...(terminalStatus ? { failed_at: checkedAt } : {}),
  } : {}),
 };
 const { data: updatedStatus, error: updateError } = await admin
  .from('pos_online_payments')
  .update(update)
  .eq('id', payment.id)
  .eq('status', payment.status)
  .eq('provider_transaction_id', result.transactionId)
  .not('provider_sale_reported_at', 'is', null)
  .select('id')
  .maybeSingle();
 if (updateError) {
  return NextResponse.json({ error: 'Keputusan STATUS Fiuu VT gagal disimpan' }, { status: 400 });
 }
 if (!updatedStatus) {
  return NextResponse.json({ error: 'Status percubaan Fiuu VT berubah. Semak semula transaksi.' }, { status: 409 });
 }

 if (reportedContradiction) {
  return NextResponse.json(
   {
    error: 'Keputusan Fiuu VT bercanggah dengan kejayaan terdahulu. Jangan sahkan atau jana SALE baharu; hubungi HQ untuk rekonsiliasi.',
    mode: 'FIUU_VT_RECONCILIATION_REQUIRED',
   },
   { status: 409 },
  );
 }

 if (result.status === '00') {
  return NextResponse.json({
   payment: { id: payment.id, status: 'REPORTED' },
   next_action: 'AUTO_CONFIRMATION',
   warning: 'STATUS Fiuu VT berjaya diterima. RKJ One sedang memuktamadkan jualan secara automatik.',
  });
 }
 if (result.status === '55') {
  return NextResponse.json({
   payment: { id: payment.id, status: 'PENDING' },
   next_action: 'CHECK_STATUS_LATER',
   warning: 'Fiuu VT melaporkan transaksi tamat. Percubaan dikunci sementara rekonsiliasi lewat masih dibenarkan.',
  });
 }
 if (isFiuuVtPendingStatus(result.status)) {
  return NextResponse.json({
   payment: { id: payment.id, status: 'PENDING' },
   next_action: 'CHECK_STATUS_LATER',
  });
 }
 return NextResponse.json({
  payment: { id: payment.id, status: terminalStatus ?? 'FAILED' },
  next_action: 'COMPLETE',
 });
}
