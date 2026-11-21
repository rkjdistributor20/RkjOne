import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertActivePosShiftMember,
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import { assertOfficialPosDevice } from '@/lib/pos/device-auth';
import { normalizeFiuuVtBranchCode } from '@/lib/pos/fiuu-vt-server';
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
  key: 'pos-fiuu-vt-provider-error-park',
  limit: 12,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 // Safety gate: a repeated STATUS transport error is not authoritative proof
 // that the provider has cancelled the charge. Keep the endpoint closed until
 // the quarantined-payment workflow can preserve and reconcile that ambiguity
 // without exposing the customer to a duplicate charge.
 if (process.env.FIUU_VT_PROVIDER_ERROR_PARKING !== 'enabled') {
  return NextResponse.json({
   error: 'Transaksi belum boleh dilepaskan secara automatik. Teruskan semakan STATUS Fiuu VT atau hubungi HQ.',
   mode: 'FIUU_VT_PARK_DISABLED',
  }, { status: 409 });
 }

 const { paymentId } = await context.params;
 const service = createAdminClient();
 const { data: payment, error: paymentError } = await service
  .from('pos_online_payments')
  .select('id, organization_id, branch_id, shift_id, created_by, provider, status, sale_payload')
  .eq('id', paymentId)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();
 if (paymentError) {
  return NextResponse.json({ error: 'Transaksi Fiuu VT tidak dapat dibaca' }, { status: 400 });
 }
 if (!payment || payment.provider !== 'fiuu_vt') {
  return NextResponse.json({ error: 'Transaksi Fiuu VT tidak dijumpai' }, { status: 404 });
 }

 try {
  await assertCanAccessPosBranch(service, profile, payment.branch_id);
  const device = await assertOfficialPosDevice(profile, payment.branch_id);
  await assertActivePosShiftMember(service, profile, payment.shift_id, payment.branch_id);
  const salePayload = jsonRecord(payment.sale_payload);
  const deviceBranchCode = normalizeFiuuVtBranchCode(device.branchCode);
  if (payment.created_by !== profile.id
   || salePayload?.fiuu_device_id !== device.id
   || salePayload?.fiuu_device_code !== device.deviceCode
   || Number(salePayload?.fiuu_enrollment_generation) !== device.enrollmentGeneration
   || !deviceBranchCode
   || normalizeFiuuVtBranchCode(salePayload?.fiuu_branch_code) !== deviceBranchCode) {
   return NextResponse.json({ error: 'Transaksi Fiuu VT bukan milik sesi tablet ini' }, { status: 403 });
  }
 } catch (accessError) {
  return NextResponse.json(
   { error: accessError instanceof Error ? accessError.message : 'Akses Fiuu VT ditolak' },
   { status: posAccessErrorStatus(accessError) },
  );
 }

 const { data: parked, error: parkError } = await service.rpc(
  'park_pos_fiuu_vt_provider_error',
  {
   p_payment_id: payment.id,
   p_actor_id: profile.id,
  },
 );
 if (parkError || !parked) {
  return NextResponse.json({
   error: 'Transaksi belum selamat untuk diparkir. Semak STATUS Fiuu VT sekali lagi.',
   mode: 'FIUU_VT_PARK_NOT_READY',
  }, { status: 409 });
 }

 const result = jsonRecord(parked);
 return NextResponse.json({
  payment: {
   id: payment.id,
   status: 'CANCELLED' as const,
   fiuu_vt_review_required: true,
   fiuu_vt_reconciliation_state: 'PROVIDER_ERROR_REVIEW' as const,
  },
  reused: result?.reused === true,
  warning: 'Transaksi lama diparkir untuk semakan HQ. Troli dikekalkan dan kaunter boleh meneruskan jualan.',
 });
}
