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

const PRE_LAUNCH_ERROR_CODES = new Set([
 'INVALID_FIUU_REQUEST',
 'FIUU_ACTIVE_ATTEMPT_EXISTS',
 'FIUU_VT_BRIDGE_UNAVAILABLE',
 'FIUU_VT_BRIDGE_OUTDATED',
 'FIUU_VT_NOT_INSTALLED',
 'FIUU_VT_UNTRUSTED_INSTALL',
 'FIUU_VT_LAUNCH_IN_PROGRESS',
 'FIUU_VT_LAUNCH_FAILED',
 'FIUU_ATTEMPT_MISMATCH',
 'FIUU_RESULT_PENDING',
 'FIUU_VOID_IN_PROGRESS',
]);

type PrelaunchCancellation = {
 attemptId: string;
 errorCode: string;
};

function jsonRecord(value: Json | null): Record<string, unknown> | null {
 return value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;
}

function parseCancellation(input: unknown): PrelaunchCancellation | null {
 if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
 const raw = input as Record<string, unknown>;
 const attemptId = typeof raw.attempt_id === 'string' ? raw.attempt_id.trim().toLowerCase() : '';
 const errorCode = typeof raw.error_code === 'string' ? raw.error_code.trim().toUpperCase() : '';
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(attemptId)
  || !PRE_LAUNCH_ERROR_CODES.has(errorCode)) {
  return null;
 }
 return { attemptId, errorCode };
}

export async function POST(
 request: Request,
 context: { params: Promise<{ paymentId: string }> },
) {
 const limited = enforceRateLimit(request, {
  key: 'pos-fiuu-vt-prelaunch-cancel',
  limit: 30,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const cancellation = parseCancellation(await request.json().catch(() => null));
 if (!cancellation) {
  return NextResponse.json({ error: 'Bukti kegagalan pra-pelancaran Fiuu VT tidak sah' }, { status: 400 });
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

 const { data: cancelled, error: cancelError } = await service.rpc(
  'cancel_pos_fiuu_vt_prelaunch',
  {
   p_payment_id: payment.id,
   p_attempt_id: cancellation.attemptId,
   p_error_code: cancellation.errorCode,
   p_actor_id: profile.id,
  },
 );
 if (cancelError || !cancelled) {
  return NextResponse.json({
   error: 'Kaunter belum boleh dilepaskan secara tempatan. Semak status Fiuu VT dahulu.',
   mode: 'FIUU_VT_RECONCILIATION_REQUIRED',
  }, { status: 409 });
 }

 const result = jsonRecord(cancelled);
 return NextResponse.json({
  payment: { id: payment.id, status: 'CANCELLED' as const },
  reused: result?.reused === true,
 });
}
