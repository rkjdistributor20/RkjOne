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

 let officialDeviceId: string | null = null;
 let officialEnrollmentGeneration: number | null = null;
 try {
  await assertCanAccessPosBranch(service, profile, payment.branch_id);
  const device = await assertOfficialPosDevice(profile, payment.branch_id);
  officialDeviceId = device.id;
  officialEnrollmentGeneration = device.enrollmentGeneration;
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
 if (!officialDeviceId || officialEnrollmentGeneration === null) {
  return NextResponse.json({ error: 'Identiti tablet rasmi tidak dapat disahkan' }, { status: 403 });
 }

 const { data: parked, error: parkError } = await service.rpc(
  'park_pos_fiuu_vt_provider_error',
  {
   p_payment_id: payment.id,
   p_actor_id: profile.id,
   p_device_id: officialDeviceId,
   p_enrollment_generation: officialEnrollmentGeneration,
  },
 );
 if (parkError || !parked) {
  return NextResponse.json({
   error: 'Transaksi belum selamat untuk dikuarantin. Semak STATUS Fiuu VT sekali lagi.',
   mode: 'FIUU_VT_PARK_NOT_READY',
  }, { status: 409 });
 }

 const result = jsonRecord(parked);
 return NextResponse.json({
  payment: {
   id: payment.id,
   status: 'QUARANTINED' as const,
   fiuu_vt_review_required: true,
   fiuu_vt_reconciliation_state: 'PROVIDER_ERROR_REVIEW' as const,
  },
  reused: result?.reused === true,
  warning: 'Transaksi lama dikuarantin untuk semakan Finance/HQ. Troli asal dikosongkan bagi mengelakkan caj berganda; jangan caj semula pelanggan yang sama.',
 });
}
