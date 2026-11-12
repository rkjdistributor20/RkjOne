import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertActivePosShiftMember,
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import { assertOfficialPosDevice } from '@/lib/pos/device-auth';
import {
 buildFiuuVtCallbackHost,
 type FiuuVtOperation,
} from '@/lib/pos/fiuu-vt';
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

type AttemptMutation = {
 action: 'MARK_LAUNCHED' | 'ABANDON_UNLAUNCHED';
 attemptId: string;
 errorCode: string | null;
};

type AttemptState =
 | 'PREPARED'
 | 'LAUNCHED'
 | 'RECEIVED'
 | 'CONSUMED'
 | 'QUARANTINED'
 | 'EXPIRED'
 | 'ABANDONED';

type LeaseAttempt = {
 id: string;
 callback_host: string;
 expires_at: string;
 op_type: FiuuVtOperation;
 state: AttemptState;
 lease_generation: number;
 lease_expires_at: string | null;
};

type LeaseDecision = {
 outcome:
  | 'LAUNCH'
  | 'ACTIVE'
  | 'STATUS_REQUIRED'
  | 'REVIEW_REQUIRED'
  | 'TERMINAL'
  | 'FORBIDDEN'
  | 'NOT_FOUND';
 attempt: LeaseAttempt | null;
 activeOperation: LeaseAttempt | null;
 retryAfterMs: number;
 reused: boolean;
 reason: string | null;
};

type ClaimLaunchLeaseRpc = (
 functionName: 'claim_pos_fiuu_vt_launch_lease',
 parameters: {
  p_payment_id: string;
  p_op_type: FiuuVtOperation;
  p_attempt_id: string;
  p_callback_host: string;
  p_lease_token: string;
  p_actor_id: string;
 },
) => Promise<{
 data: unknown;
 error: { message?: string } | null;
}>;

const ATTEMPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ATTEMPT_STATES = new Set<AttemptState>([
 'PREPARED',
 'LAUNCHED',
 'RECEIVED',
 'CONSUMED',
 'QUARANTINED',
 'EXPIRED',
 'ABANDONED',
]);

function jsonRecord(value: Json | null): Record<string, unknown> | null {
 return value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;
}

function parseOperation(input: unknown): FiuuVtOperation | null {
 if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
 const opType = (input as Record<string, unknown>).op_type;
 return opType === 'SALE' || opType === 'STATUS' || opType === 'VOID'
  ? opType
  : null;
}

function parseAttemptMutation(input: unknown): AttemptMutation | null {
 if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
 const raw = input as Record<string, unknown>;
 const action = raw.action;
 const attemptId = typeof raw.attempt_id === 'string' ? raw.attempt_id.trim().toLowerCase() : '';
 const errorCode = typeof raw.error_code === 'string' ? raw.error_code.trim().toUpperCase() : null;
 if ((action !== 'MARK_LAUNCHED' && action !== 'ABANDON_UNLAUNCHED')
  || !ATTEMPT_ID_PATTERN.test(attemptId)
  || (action === 'ABANDON_UNLAUNCHED' && (!errorCode || !PRE_LAUNCH_ERROR_CODES.has(errorCode)))) {
  return null;
 }
 return { action, attemptId, errorCode };
}

function parseLeaseAttempt(input: unknown): LeaseAttempt | null {
 if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
 const raw = input as Record<string, unknown>;
 const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
 const callbackHost = typeof raw.callback_host === 'string'
  ? raw.callback_host.trim().toLowerCase()
  : '';
 const expiresAt = typeof raw.expires_at === 'string' ? raw.expires_at : '';
 const leaseExpiresAt = typeof raw.lease_expires_at === 'string'
  ? raw.lease_expires_at
  : null;
 const opType = raw.op_type;
 const state = raw.state;
 const leaseGeneration = raw.lease_generation;
 if (!ATTEMPT_ID_PATTERN.test(id)
  || callbackHost !== buildFiuuVtCallbackHost(id)
  || !Number.isFinite(Date.parse(expiresAt))
  || (leaseExpiresAt !== null && !Number.isFinite(Date.parse(leaseExpiresAt)))
  || (opType !== 'SALE' && opType !== 'STATUS' && opType !== 'VOID')
  || typeof state !== 'string'
  || !ATTEMPT_STATES.has(state as AttemptState)
  || !Number.isInteger(leaseGeneration)
  || Number(leaseGeneration) < 0) {
  return null;
 }
 return {
  id,
  callback_host: callbackHost,
  expires_at: expiresAt,
  op_type: opType,
  state: state as AttemptState,
  lease_generation: Number(leaseGeneration),
  lease_expires_at: leaseExpiresAt,
 };
}

function parseLeaseDecision(input: unknown): LeaseDecision | null {
 if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
 const raw = input as Record<string, unknown>;
 const outcome = raw.outcome;
 if (outcome !== 'LAUNCH'
  && outcome !== 'ACTIVE'
  && outcome !== 'STATUS_REQUIRED'
  && outcome !== 'REVIEW_REQUIRED'
  && outcome !== 'TERMINAL'
  && outcome !== 'FORBIDDEN'
  && outcome !== 'NOT_FOUND') {
  return null;
 }
 const attempt = raw.attempt === null || raw.attempt === undefined
  ? null
  : parseLeaseAttempt(raw.attempt);
 const activeOperation = raw.active_operation === null || raw.active_operation === undefined
  ? null
  : parseLeaseAttempt(raw.active_operation);
 if ((outcome === 'LAUNCH' && (!attempt || attempt.lease_generation < 1))
  || (outcome === 'ACTIVE' && !activeOperation)) {
  return null;
 }
 const retryAfterMs = typeof raw.retry_after_ms === 'number'
  && Number.isFinite(raw.retry_after_ms)
  ? Math.max(0, Math.min(30_000, Math.ceil(raw.retry_after_ms)))
  : 0;
 return {
  outcome,
  attempt,
  activeOperation,
  retryAfterMs,
  reused: raw.reused === true,
  reason: typeof raw.reason === 'string' ? raw.reason : null,
 };
}

export async function POST(
 request: Request,
 context: { params: Promise<{ paymentId: string }> },
) {
 const limited = enforceRateLimit(request, {
  key: 'pos-fiuu-vt-attempt',
  limit: 90,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const opType = parseOperation(await request.json().catch(() => null));
 if (!opType) {
  return NextResponse.json({ error: 'Operasi Fiuu VT tidak sah' }, { status: 400 });
 }

 const { paymentId } = await context.params;
 const service = createAdminClient();
 const { data: payment, error: paymentError } = await service
  .from('pos_online_payments')
  .select('id, organization_id, branch_id, shift_id, created_by, provider, status, amount_rm, sale_payload, provider_order_id, provider_transaction_id, provider_sale_reported_at, fiuu_vt_review_required')
  .eq('id', paymentId)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();
 if (paymentError) {
  return NextResponse.json({ error: 'Percubaan Fiuu VT tidak dapat dibaca' }, { status: 400 });
 }
 if (!payment || payment.provider !== 'fiuu_vt' || !payment.provider_order_id) {
  return NextResponse.json({ error: 'Percubaan Fiuu VT tidak dijumpai' }, { status: 404 });
 }

 try {
  await assertCanAccessPosBranch(service, profile, payment.branch_id);
  const device = await assertOfficialPosDevice(profile, payment.branch_id);
  await assertActivePosShiftMember(service, profile, payment.shift_id, payment.branch_id);
  const salePayload = jsonRecord(payment.sale_payload);
  const deviceBranchCode = normalizeFiuuVtBranchCode(device.branchCode);
  const paymentBranchCode = normalizeFiuuVtBranchCode(salePayload?.fiuu_branch_code);
  if (payment.created_by !== profile.id
   || salePayload?.fiuu_device_id !== device.id
   || salePayload?.fiuu_device_code !== device.deviceCode
   || Number(salePayload?.fiuu_enrollment_generation) !== device.enrollmentGeneration
   || !deviceBranchCode
   || paymentBranchCode !== deviceBranchCode) {
   return NextResponse.json({ error: 'Percubaan Fiuu VT bukan milik sesi tablet ini' }, { status: 403 });
  }
 } catch (accessError) {
  return NextResponse.json(
   { error: accessError instanceof Error ? accessError.message : 'Akses Fiuu VT ditolak' },
   { status: posAccessErrorStatus(accessError) },
  );
 }

 if (payment.fiuu_vt_review_required) {
  return NextResponse.json({
   error: 'Transaksi Fiuu VT memerlukan semakan HQ sebelum percubaan baharu',
   mode: 'FIUU_VT_RECONCILIATION_REQUIRED',
  }, { status: 409 });
 }
 if (payment.status !== 'PENDING') {
  return NextResponse.json({
   error: 'Percubaan Fiuu VT sudah ditutup',
   mode: 'FIUU_ATTEMPT_TERMINAL',
  }, { status: 409 });
 }
 if (opType === 'SALE' && (payment.provider_sale_reported_at || payment.provider_transaction_id)) {
  return NextResponse.json({
   error: 'SALE Fiuu VT sudah bermula. Gunakan semakan STATUS; jangan buka SALE kedua.',
   mode: 'FIUU_VT_STATUS_REQUIRED',
  }, { status: 409 });
 }

 const attemptId = randomUUID();
 const callbackHost = buildFiuuVtCallbackHost(attemptId);
 const leaseToken = randomUUID();
 const claimLaunchLease = service.rpc.bind(service) as unknown as ClaimLaunchLeaseRpc;
 const { data: leaseData, error: leaseError } = await claimLaunchLease(
  'claim_pos_fiuu_vt_launch_lease',
  {
   p_payment_id: payment.id,
   p_op_type: opType,
   p_attempt_id: attemptId,
   p_callback_host: callbackHost,
   p_lease_token: leaseToken,
   p_actor_id: profile.id,
  },
 );
 if (leaseError) {
  return NextResponse.json({
   error: 'Lease pelancaran Fiuu VT tidak dapat dituntut',
  }, { status: 400 });
 }
 const decision = parseLeaseDecision(leaseData);
 if (!decision) {
  return NextResponse.json({
   error: 'Respons lease pelancaran Fiuu VT tidak sah',
  }, { status: 400 });
 }

 if (decision.outcome === 'LAUNCH' && decision.attempt) {
  if (decision.attempt.op_type !== opType) {
   return NextResponse.json({ error: 'Operasi lease Fiuu VT tidak sepadan' }, { status: 409 });
  }
  return NextResponse.json({
   attempt: decision.attempt,
   reused: decision.reused,
   retry_lease: {
    generation: decision.attempt.lease_generation,
    expires_at: decision.attempt.lease_expires_at,
   },
  });
 }

 if (decision.outcome === 'ACTIVE' && decision.activeOperation) {
  const active = decision.activeOperation;
  const operationLabel = active.op_type === 'VOID' ? 'VOID' : active.op_type;
  return NextResponse.json({
   error: `Operasi ${operationLabel} Fiuu VT masih aktif. Jangan buka operasi kedua.`,
   mode: 'FIUU_VT_OPERATION_ACTIVE',
   attempt: active,
   active_operation: active,
   retry_after_ms: decision.retryAfterMs,
   reason: decision.reason,
  }, { status: 409 });
 }

 if (decision.outcome === 'STATUS_REQUIRED') {
  return NextResponse.json({
   error: 'SALE Fiuu VT tidak boleh diulang. Gunakan semakan STATUS.',
   mode: 'FIUU_VT_STATUS_REQUIRED',
  }, { status: 409 });
 }
 if (decision.outcome === 'REVIEW_REQUIRED') {
  return NextResponse.json({
   error: 'Transaksi Fiuu VT memerlukan semakan HQ sebelum percubaan baharu',
   mode: 'FIUU_VT_RECONCILIATION_REQUIRED',
  }, { status: 409 });
 }
 if (decision.outcome === 'TERMINAL') {
  return NextResponse.json({
   error: 'Percubaan Fiuu VT sudah ditutup',
   mode: 'FIUU_ATTEMPT_TERMINAL',
  }, { status: 409 });
 }
 if (decision.outcome === 'FORBIDDEN') {
  return NextResponse.json({ error: 'Percubaan Fiuu VT bukan milik sesi ini' }, { status: 403 });
 }
 return NextResponse.json({ error: 'Percubaan Fiuu VT tidak dijumpai' }, { status: 404 });
}

export async function PATCH(
 request: Request,
 context: { params: Promise<{ paymentId: string }> },
) {
 const limited = enforceRateLimit(request, {
  key: 'pos-fiuu-vt-attempt-state',
  limit: 120,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 const mutation = parseAttemptMutation(await request.json().catch(() => null));
 if (!mutation) {
  return NextResponse.json({ error: 'Perubahan keadaan Fiuu VT tidak sah' }, { status: 400 });
 }

 const { paymentId } = await context.params;
 const service = createAdminClient();
 const { data: payment, error: paymentError } = await service
  .from('pos_online_payments')
  .select('id, organization_id, branch_id, shift_id, created_by, provider, sale_payload')
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
   return NextResponse.json({ error: 'Percubaan Fiuu VT bukan milik sesi tablet ini' }, { status: 403 });
  }
 } catch (accessError) {
  return NextResponse.json(
   { error: accessError instanceof Error ? accessError.message : 'Akses Fiuu VT ditolak' },
   { status: posAccessErrorStatus(accessError) },
  );
 }

 const nowIso = new Date().toISOString();
 const update = mutation.action === 'MARK_LAUNCHED'
  ? {
    state: 'LAUNCHED',
    launched_at: nowIso,
    launch_error_code: null,
    updated_at: nowIso,
   }
  : {
    state: 'ABANDONED',
    abandoned_at: nowIso,
    launch_error_code: mutation.errorCode,
    updated_at: nowIso,
   };
 const { data: changed, error: updateError } = await service
  .from('pos_fiuu_vt_attempts')
  .update(update)
  .eq('id', mutation.attemptId)
  .eq('payment_id', payment.id)
  .eq('state', 'PREPARED')
  .select('id, state, op_type, launched_at, abandoned_at, launch_error_code')
  .maybeSingle();
 if (updateError) {
  return NextResponse.json({ error: 'Keadaan percubaan Fiuu VT tidak dapat disimpan' }, { status: 400 });
 }
 if (changed) return NextResponse.json({ attempt: changed });

 const { data: existing, error: existingError } = await service
  .from('pos_fiuu_vt_attempts')
  .select('id, state, op_type, launched_at, abandoned_at, launch_error_code')
  .eq('id', mutation.attemptId)
  .eq('payment_id', payment.id)
  .maybeSingle();
 if (existingError) {
  return NextResponse.json({ error: 'Keadaan percubaan Fiuu VT tidak dapat dibaca' }, { status: 400 });
 }
 const idempotent = mutation.action === 'MARK_LAUNCHED'
  ? existing && ['LAUNCHED', 'RECEIVED', 'CONSUMED'].includes(existing.state)
  : existing?.state === 'ABANDONED';
 if (idempotent) return NextResponse.json({ attempt: existing, reused: true });
 return NextResponse.json({
  error: 'Keadaan percubaan Fiuu VT telah berubah. Semak status sebelum cuba lagi.',
  mode: 'FIUU_VT_ATTEMPT_STATE_CONFLICT',
 }, { status: 409 });
}
