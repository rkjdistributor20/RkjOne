import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertActivePosShiftMember,
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import { assertOfficialPosDevice } from '@/lib/pos/device-auth';
import { hasRecentFiuuVtRecoverySuccess } from '@/lib/pos/fiuu-vt-recovery-heartbeat';
import {
 isFiuuVtCashierReleaseDeviceReady,
 isFiuuVtCashierReleaseEnabledForBranch,
 normalizeFiuuVtBranchCode,
} from '@/lib/pos/fiuu-vt-server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type ReleaseRequest = { attemptId: string };
type ReleaseOutcome =
 | 'RELEASED'
 | 'TERMINAL'
 | 'PAYMENT_SUCCESS_OR_REVIEW_REQUIRED'
 | 'REVIEW_REQUIRED'
 | 'VOID_NOT_DURABLY_LAUNCHED'
 | 'ATTEMPT_CONFLICT'
 | 'STATUS_CHANGED'
 | 'FORBIDDEN'
 | 'NOT_FOUND'
 | 'INVALID_REQUEST';

function jsonRecord(value: Json | null | unknown): Record<string, unknown> | null {
 return value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;
}

function parseReleaseRequest(input: unknown): ReleaseRequest | null {
 if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
 const raw = input as Record<string, unknown>;
 const attemptId = typeof raw.attempt_id === 'string'
  ? raw.attempt_id.trim().toLowerCase()
  : '';
 return UUID_PATTERN.test(attemptId) ? { attemptId } : null;
}

function releaseOutcome(value: unknown): ReleaseOutcome | null {
 return typeof value === 'string' && [
  'RELEASED',
  'TERMINAL',
  'PAYMENT_SUCCESS_OR_REVIEW_REQUIRED',
  'REVIEW_REQUIRED',
  'VOID_NOT_DURABLY_LAUNCHED',
  'ATTEMPT_CONFLICT',
  'STATUS_CHANGED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_REQUEST',
 ].includes(value)
  ? value as ReleaseOutcome
  : null;
}

export async function POST(
 request: Request,
 context: { params: Promise<{ paymentId: string }> },
) {
 const limited = enforceRateLimit(request, {
  key: 'pos-fiuu-vt-cashier-release',
  limit: 30,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const release = parseReleaseRequest(await request.json().catch(() => null));
 if (!release) {
  return NextResponse.json({ error: 'Bukti pelancaran VOID Fiuu VT tidak sah' }, { status: 400 });
 }

 const { paymentId } = await context.params;
 const service = createAdminClient();
 const { data: payment, error: paymentError } = await service
  .from('pos_online_payments')
  .select('id, organization_id, branch_id, shift_id, created_by, provider, status, sale_payload, fiuu_vt_cancel_attempt_id, fiuu_vt_cashier_released_at')
  .eq('id', paymentId)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();
 if (paymentError) {
  return NextResponse.json({ error: 'Transaksi Fiuu VT tidak dapat dibaca' }, { status: 400 });
 }
 if (!payment || payment.provider !== 'fiuu_vt') {
  return NextResponse.json({ error: 'Transaksi Fiuu VT tidak dijumpai' }, { status: 404 });
 }
 const committedReplay = Boolean(
  payment.fiuu_vt_cashier_released_at
  && payment.fiuu_vt_cancel_attempt_id === release.attemptId,
 );

 let officialDeviceId = '';
 let officialEnrollmentGeneration = 0;
 try {
  await assertCanAccessPosBranch(service, profile, payment.branch_id);
  const device = await assertOfficialPosDevice(profile, payment.branch_id);
  const salePayload = jsonRecord(payment.sale_payload);
  const deviceBranchCode = normalizeFiuuVtBranchCode(device.branchCode);
  const paymentBranchCode = normalizeFiuuVtBranchCode(salePayload?.fiuu_branch_code);
  if (!deviceBranchCode || paymentBranchCode !== deviceBranchCode) {
   return NextResponse.json({ error: 'Transaksi Fiuu VT bukan milik cawangan tablet ini' }, { status: 403 });
  }
  // A no-op replay of an already committed release remains available after a
  // shift/enrollment change and while the rollout gate is being disabled. The
  // first state-changing release still requires the exact canary gate, shift,
  // cashier, device and enrollment identity below.
  if (!committedReplay && !isFiuuVtCashierReleaseEnabledForBranch(deviceBranchCode)) {
   return NextResponse.json({
    error: 'Pelepasan kaunter Fiuu VT belum diaktifkan untuk cawangan ini.',
    mode: 'FIUU_VT_CASHIER_RELEASE_DISABLED',
   }, { status: 409 });
  }
  if (!committedReplay && !isFiuuVtCashierReleaseDeviceReady(device.management)) {
   return NextResponse.json({
    error: 'Kemas kini RKJ One Staff melalui Google Play sebelum menggunakan pelepasan kaunter Fiuu VT.',
    mode: 'FIUU_VT_APP_UPDATE_REQUIRED',
   }, { status: 426 });
  }
  if (!committedReplay && !await hasRecentFiuuVtRecoverySuccess(service)) {
   return NextResponse.json({
    error: 'Pelepasan kaunter Fiuu VT dihentikan sementara kerana worker pemulihan belum disahkan aktif.',
    mode: 'FIUU_VT_RECOVERY_HEARTBEAT_STALE',
   }, { status: 503 });
  }
  if (!committedReplay) {
   await assertActivePosShiftMember(service, profile, payment.shift_id, payment.branch_id);
   if (payment.created_by !== profile.id
    || salePayload?.fiuu_device_id !== device.id
    || salePayload?.fiuu_device_code !== device.deviceCode
    || Number(salePayload?.fiuu_enrollment_generation) !== device.enrollmentGeneration) {
    return NextResponse.json({ error: 'Transaksi Fiuu VT bukan milik sesi tablet ini' }, { status: 403 });
   }
  }
  officialDeviceId = device.id;
  officialEnrollmentGeneration = device.enrollmentGeneration;
 } catch (accessError) {
  return NextResponse.json(
   { error: accessError instanceof Error ? accessError.message : 'Akses Fiuu VT ditolak' },
   { status: posAccessErrorStatus(accessError) },
  );
 }

 const { data: released, error: releaseError } = await service.rpc(
  'release_pos_fiuu_vt_cashier_lane',
  {
   p_payment_id: payment.id,
   p_attempt_id: release.attemptId,
   p_actor_id: profile.id,
   p_device_id: officialDeviceId,
   p_enrollment_generation: officialEnrollmentGeneration,
  },
 );
 if (releaseError || !released) {
  return NextResponse.json({
   error: 'Kaunter belum dapat dilepaskan. Status transaksi asal mesti disemak semula.',
   mode: 'FIUU_VT_CASHIER_RELEASE_FAILED',
  }, { status: 409 });
 }

 const result = jsonRecord(released);
 const outcome = releaseOutcome(result?.outcome);
 const paymentStatus = typeof result?.payment_status === 'string'
  ? result.payment_status
  : payment.status;
 if (outcome === 'RELEASED') {
  const cancellationPhase = paymentStatus === 'CANCELLED'
   ? 'CANCELLED_CONFIRMED'
   : paymentStatus === 'PENDING'
    ? 'CANCEL_REQUESTED'
    : 'TERMINAL';
  return NextResponse.json({
   outcome,
   payment: {
    id: payment.id,
    status: paymentStatus,
    cancellation_phase: cancellationPhase,
    cancel_requested_at: typeof result?.cancel_requested_at === 'string'
     ? result.cancel_requested_at
     : null,
    cashier_released_at: typeof result?.cashier_released_at === 'string'
     ? result.cashier_released_at
     : null,
   },
   reused: result?.reused === true,
  });
 }
 if (outcome === 'TERMINAL') {
  return NextResponse.json({
   outcome,
   payment: {
    id: payment.id,
    status: paymentStatus,
    cancellation_phase: paymentStatus === 'CANCELLED'
     ? 'CANCELLED_CONFIRMED'
     : 'TERMINAL',
   },
  });
 }
 if (outcome === 'PAYMENT_SUCCESS_OR_REVIEW_REQUIRED' || outcome === 'STATUS_CHANGED') {
  return NextResponse.json({
   error: 'Status pembayaran berubah semasa pembatalan. RKJ One akan memproses keputusan sebenar sebelum melepaskan kaunter.',
   mode: 'FIUU_VT_PAYMENT_STATUS_CHANGED',
   outcome,
   payment_status: paymentStatus,
  }, { status: 409 });
 }
 if (outcome === 'FORBIDDEN') {
  return NextResponse.json({ error: 'Transaksi Fiuu VT bukan milik sesi tablet ini' }, { status: 403 });
 }
 if (outcome === 'NOT_FOUND') {
  return NextResponse.json({ error: 'Transaksi Fiuu VT tidak dijumpai' }, { status: 404 });
 }
 return NextResponse.json({
  error: outcome === 'VOID_NOT_DURABLY_LAUNCHED'
   ? 'Pelancaran pembatalan belum disimpan. Jangan lepaskan kaunter; semak STATUS atau cuba semula apabila internet stabil.'
   : outcome === 'REVIEW_REQUIRED'
   ? 'Transaksi memerlukan semakan HQ dan tidak boleh dilepaskan melalui aliran pembatalan biasa.'
   : 'Transaksi belum selamat untuk pelanggan seterusnya. Semak status Fiuu VT.',
  mode: outcome === 'VOID_NOT_DURABLY_LAUNCHED'
   ? 'FIUU_VT_VOID_NOT_DURABLY_LAUNCHED'
   : 'FIUU_VT_CASHIER_RELEASE_CONFLICT',
  outcome,
 }, { status: 409 });
}
