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
 isFiuuVtPendingStatus,
 parseFiuuVtResult,
 type FiuuVtResult,
} from '@/lib/pos/fiuu-vt';
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

function terminalPaymentStatus(status: FiuuVtResult['status']): 'FAILED' | 'CANCELLED' | 'EXPIRED' | null {
 if (status === '11') return 'FAILED';
 if (status === '44') return 'CANCELLED';
 if (status === '55') return 'EXPIRED';
 return null;
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
  .select('id, organization_id, branch_id, shift_id, created_by, provider, status, amount_rm, expires_at, sale_payload, provider_order_id, provider_transaction_id, provider_result')
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
   || salePayload?.fiuu_device_code !== device.deviceCode) {
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
 if (!['PENDING', 'EXPIRED'].includes(payment.status)) {
  return NextResponse.json(
   { error: 'Percubaan Fiuu VT sudah ditutup', mode: 'FIUU_ATTEMPT_TERMINAL' },
   { status: 409 },
  );
 }
 if (payment.expires_at
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
 if (payment.provider_transaction_id
  && payment.provider_transaction_id !== result.transactionId) {
  return NextResponse.json({ error: 'Transaction ID Fiuu VT tidak sepadan' }, { status: 409 });
 }

 const previous = jsonRecord(payment.provider_result);
 if (result.opType === 'STATUS'
  && previous?.opType === 'SALE'
  && typeof previous.transactionId === 'string'
  && previous.transactionId !== result.transactionId) {
  return NextResponse.json({ error: 'Semakan STATUS tidak sepadan dengan transaksi SALE Fiuu VT' }, { status: 409 });
 }

 const checkedAt = new Date().toISOString();
 const safeResult = sanitizedResult(result);
 if (result.opType === 'SALE') {
  const { error: updateError } = await admin
   .from('pos_online_payments')
   .update({
    provider_result: safeResult,
    provider_status_checked_at: checkedAt,
    updated_at: checkedAt,
   })
   .eq('id', payment.id)
   .in('status', ['PENDING', 'EXPIRED']);
  if (updateError) return NextResponse.json({ error: 'Laporan SALE Fiuu VT gagal disimpan' }, { status: 400 });
  return NextResponse.json({
   payment: { id: payment.id, status: 'PENDING' },
   next_action: 'CHECK_STATUS',
  });
 }

 const terminalStatus = terminalPaymentStatus(result.status);
 const update = {
  provider_result: safeResult,
  provider_transaction_id: result.transactionId,
  provider_status_checked_at: checkedAt,
  updated_at: checkedAt,
  ...(terminalStatus ? {
   status: terminalStatus,
   failed_at: checkedAt,
  } : {}),
 };
 const { error: updateError } = await admin
  .from('pos_online_payments')
  .update(update)
  .eq('id', payment.id)
  .in('status', ['PENDING', 'EXPIRED']);
 if (updateError) {
  return NextResponse.json({ error: 'Keputusan STATUS Fiuu VT gagal disimpan' }, { status: 400 });
 }

 if (result.status === '00') {
  return NextResponse.json({
   payment: { id: payment.id, status: 'REPORTED' },
   next_action: 'MANUAL_CONFIRMATION',
   warning: 'STATUS Fiuu VT tidak bertandatangan. Sahkan paparan berjaya sebelum memuktamadkan jualan.',
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
