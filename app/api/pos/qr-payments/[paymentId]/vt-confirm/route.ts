import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertActivePosShiftMember,
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import { assertOfficialPosDevice } from '@/lib/pos/device-auth';
import { parseFiuuVtResult } from '@/lib/pos/fiuu-vt';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

function jsonRecord(value: Json | null): Record<string, unknown> | null {
 return value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;
}

export async function POST(
 request: Request,
 context: { params: Promise<{ paymentId: string }> },
) {
 const limited = enforceRateLimit(request, {
  key: 'pos-fiuu-vt-confirm',
  limit: 12,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const { paymentId } = await context.params;
 const admin = createAdminClient();
 const { data: payment, error } = await admin
  .from('pos_online_payments')
  .select('id, organization_id, branch_id, shift_id, created_by, provider, status, amount_rm, sale_payload, provider_order_id, provider_transaction_id, provider_result, provider_status_checked_at, provider_sale_reported_at')
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
  return NextResponse.json({ payment: { id: payment.id, status: 'PAID' }, reused: true });
 }
 if (payment.status !== 'REPORTED') {
  return NextResponse.json({ error: 'Percubaan Fiuu VT tidak boleh disahkan' }, { status: 409 });
 }

 let result;
 try {
  result = parseFiuuVtResult(payment.provider_result);
 } catch {
  return NextResponse.json(
   { error: 'Jalankan semakan STATUS Fiuu VT sebelum mengesahkan bayaran', mode: 'STATUS_REFRESH_REQUIRED' },
   { status: 409 },
  );
 }
 const checkedAt = payment.provider_status_checked_at
  ? new Date(payment.provider_status_checked_at).getTime()
  : 0;
 if (result.opType !== 'STATUS'
  || result.status !== '00'
  || !payment.provider_sale_reported_at
  || result.orderId !== payment.provider_order_id
  || result.transactionId !== payment.provider_transaction_id
  || Math.round(result.amountRm * 100) !== Math.round(Number(payment.amount_rm) * 100)
  || !Number.isFinite(checkedAt)
  || Date.now() - checkedAt > 5 * 60 * 1000) {
  return NextResponse.json(
   { error: 'Semakan STATUS Fiuu VT perlu diperbaharui', mode: 'STATUS_REFRESH_REQUIRED' },
   { status: 409 },
  );
 }

 const providerResult = {
  opType: result.opType,
  orderId: result.orderId,
  transactionId: result.transactionId,
  status: result.status,
  amountRm: result.amountRm,
  currency: result.currency,
  channel: result.channel,
  payDate: result.payDate,
 } satisfies Json;
 const { data: receipt, error: fulfillError } = await admin.rpc('fulfill_pos_fiuu_vt_payment', {
  p_payment_id: payment.id,
  p_provider_order_id: result.orderId,
  p_provider_transaction_id: result.transactionId,
  p_amount: result.amountRm,
  p_currency: result.currency,
  p_channel: result.channel,
  p_provider_result: providerResult,
  p_confirmed_by: profile.id,
 });
 if (fulfillError) {
  console.error('[pos-fiuu-vt] manual_confirm_failed', {
   paymentId: payment.id,
   reason: fulfillError.message.slice(0, 160),
  });
  return NextResponse.json(
   { error: 'Bayaran Fiuu VT tidak dapat dimuktamadkan. Jangan rekod jualan semula.' },
   { status: 409 },
  );
 }
 return NextResponse.json({ payment: { id: payment.id, status: 'PAID' }, result: receipt });
}
