import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertActivePosShiftMember,
 assertCanAccessPosBranch,
 getOpenPosBranchShiftId,
 PosMissingOpenShiftError,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import { assertOfficialPosDevice } from '@/lib/pos/device-auth';
import {
 getFiuuVtStatusDisposition,
 isFiuuVtErrorResult,
 isFiuuVtPendingStatus,
 parseFiuuVtCallbackResult,
 type FiuuVtCallbackResult,
 type FiuuVtResult,
} from '@/lib/pos/fiuu-vt';
import { normalizeFiuuVtBranchCode } from '@/lib/pos/fiuu-vt-server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/types/database';

type PaymentStatus = 'PENDING' | 'REPORTED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'QUARANTINED';
type PaymentUpdate = Database['public']['Tables']['pos_online_payments']['Update'];
type ReviewState = 'LATE_SUCCESS_REVIEW' | 'REVERSAL_REVIEW' | 'FOREIGN_CALLBACK_REVIEW';
type NextAction =
 | 'CHECK_STATUS'
 | 'CHECK_STATUS_LATER'
 | 'PARK_AVAILABLE'
 | 'AUTO_CONFIRMATION'
 | 'COMPLETE'
 | 'ACK_ONLY'
 | 'ACK_AND_QUARANTINE';
type CallbackClaimOutcome =
 | 'CLAIMED'
 | 'ACTIVE'
 | 'CONSUMED'
 | 'CONFLICT'
 | 'INELIGIBLE'
 | 'NOT_FOUND';
type CallbackClaimDecision = {
 outcome: CallbackClaimOutcome;
 retryAfterMs: number;
 existingResult: Json | null;
 cashierReleasedAt: string | null;
 paymentStatus: PaymentStatus | null;
};
type ClaimCallbackProcessingRpc = (
 functionName: 'claim_pos_fiuu_vt_callback_processing',
 parameters: {
  p_payment_id: string;
  p_attempt_id: string;
  p_result_fingerprint: string;
  p_result_json: Json;
  p_processing_token: string;
  p_allow_expired: boolean;
 },
) => Promise<{
 data: unknown;
 error: { message?: string } | null;
}>;
type CompleteCallbackProcessingRpc = (
 functionName: 'complete_pos_fiuu_vt_callback_processing',
 parameters: {
  p_payment_id: string;
  p_attempt_id: string;
  p_result_fingerprint: string;
  p_processing_token: string;
 },
) => Promise<{
 data: unknown;
 error: { message?: string } | null;
}>;

const TERMINAL_PAYMENT_STATUSES = new Set<PaymentStatus>([
 'FAILED',
 'EXPIRED',
 'CANCELLED',
 'QUARANTINED',
]);
const PAYMENT_STATUSES = new Set<PaymentStatus>([
 'PENDING',
 'REPORTED',
 'PAID',
 'FAILED',
 'EXPIRED',
 'CANCELLED',
 'QUARANTINED',
]);
const LATE_STATUS_SUCCESS_GRACE_MS = 2 * 60 * 1000;

function jsonRecord(value: Json | null): Record<string, unknown> | null {
 return value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;
}

function reviewLockedPaymentStatus(input: unknown, fallback: PaymentStatus): PaymentStatus {
 const record = input && typeof input === 'object' && !Array.isArray(input)
  ? input as Record<string, unknown>
  : null;
 const status = record?.payment_status;
 if (typeof status === 'string' && PAYMENT_STATUSES.has(status as PaymentStatus)) {
  return status as PaymentStatus;
 }
 return fallback === 'PENDING' || fallback === 'REPORTED' ? 'QUARANTINED' : fallback;
}

function parseCallbackClaimDecision(input: unknown): CallbackClaimDecision | null {
 if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
 const raw = input as Record<string, unknown>;
 const outcome = raw.outcome;
 if (outcome !== 'CLAIMED'
  && outcome !== 'ACTIVE'
  && outcome !== 'CONSUMED'
  && outcome !== 'CONFLICT'
  && outcome !== 'INELIGIBLE'
  && outcome !== 'NOT_FOUND') {
  return null;
 }
 const retryAfterMs = typeof raw.retry_after_ms === 'number'
  && Number.isFinite(raw.retry_after_ms)
  ? Math.max(0, Math.round(raw.retry_after_ms))
  : 0;
 const existingResult = raw.existing_result
  && typeof raw.existing_result === 'object'
  && !Array.isArray(raw.existing_result)
  ? raw.existing_result as Json
  : null;
 const cashierReleasedAt = typeof raw.cashier_released_at === 'string'
  ? raw.cashier_released_at
  : null;
 const paymentStatus = typeof raw.payment_status === 'string'
  && PAYMENT_STATUSES.has(raw.payment_status as PaymentStatus)
  ? raw.payment_status as PaymentStatus
  : null;
 return {
  outcome,
  retryAfterMs,
  existingResult,
  cashierReleasedAt,
  paymentStatus,
 };
}

function isCallbackCompletion(input: unknown): boolean {
 return Boolean(input
  && typeof input === 'object'
  && !Array.isArray(input)
  && (input as Record<string, unknown>).outcome === 'COMPLETED');
}

function sanitizedCallback(result: FiuuVtCallbackResult): Record<string, Json> {
 if (isFiuuVtErrorResult(result)) {
  return {
   kind: 'ERROR',
   callbackAttemptId: result.callbackAttemptId,
   callbackHost: result.callbackHost,
   opType: result.opType,
   orderId: result.orderId,
   errorCode: result.errorCode,
   errorMessage: result.errorMessage,
  };
 }
 return {
  callbackAttemptId: result.callbackAttemptId,
  callbackHost: result.callbackHost,
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

function callbackFingerprint(result: Record<string, Json>): string {
 return createHash('sha256').update(JSON.stringify(result), 'utf8').digest('hex');
}

function responseForStatus(
 paymentId: string,
 status: PaymentStatus,
 nextAction?: NextAction,
 warning?: string,
) {
 const inferredAction: NextAction = nextAction
  ?? (status === 'REPORTED' ? 'AUTO_CONFIRMATION'
   : status === 'PENDING' ? 'CHECK_STATUS'
   : 'COMPLETE');
 return NextResponse.json({
  payment: { id: paymentId, status },
  next_action: inferredAction,
  ...(warning ? { warning } : {}),
 });
}

function terminalStatus(result: FiuuVtResult): Extract<PaymentStatus, 'FAILED' | 'EXPIRED' | 'CANCELLED'> | null {
 const disposition = getFiuuVtStatusDisposition(result.status);
 return disposition === 'FAILED' || disposition === 'EXPIRED' || disposition === 'CANCELLED'
  ? disposition
  : null;
}

function terminalWarning(status: Extract<PaymentStatus, 'FAILED' | 'EXPIRED' | 'CANCELLED'>): string {
 if (status === 'CANCELLED') {
  return 'Percubaan Fiuu VT dibatalkan. Troli dikekalkan dan kaunter sedia untuk bayaran baharu.';
 }
 if (status === 'EXPIRED') {
  return 'Kod QR Fiuu VT tamat tempoh. Troli dikekalkan dan kaunter sedia untuk bayaran baharu.';
 }
 return 'Bayaran Fiuu VT gagal. Troli dikekalkan dan kaunter sedia untuk bayaran baharu.';
}

export async function POST(
 request: Request,
 context: { params: Promise<{ paymentId: string }> },
) {
 const limited = enforceRateLimit(request, {
  key: 'pos-fiuu-vt-result',
  limit: 90,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body: unknown = await request.json().catch(() => null);
 const bodyRecord = body && typeof body === 'object' && !Array.isArray(body)
  ? body as Record<string, unknown>
  : null;
 const rawResult = bodyRecord?.result;
 let result: FiuuVtCallbackResult;
 try {
  result = parseFiuuVtCallbackResult(rawResult);
 } catch (parseError) {
  return NextResponse.json(
   { error: parseError instanceof Error ? parseError.message : 'Keputusan Fiuu VT tidak sah' },
   { status: 400 },
  );
 }
 const nativeValidation = rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)
  ? (rawResult as Record<string, unknown>).callbackValidation
  : undefined;

 const { paymentId } = await context.params;
 const service = createAdminClient();
 const { data: payment, error: paymentError } = await service
  .from('pos_online_payments')
  .select('id, organization_id, branch_id, shift_id, created_by, provider, status, amount_rm, sale_payload, provider_order_id, provider_transaction_id, provider_result, provider_sale_reported_at, provider_status_checked_at, fiuu_vt_review_required, fiuu_vt_reconciliation_state, fiuu_vt_provider_error_code, fiuu_vt_provider_error_count, fiuu_vt_provider_error_at, fiuu_vt_cashier_released_at')
  .eq('id', paymentId)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();
 if (paymentError) {
  return NextResponse.json({ error: 'Percubaan Fiuu VT tidak dapat dibaca' }, { status: 400 });
 }
 if (!payment || payment.provider !== 'fiuu_vt' || !payment.provider_order_id) {
  return NextResponse.json({ error: 'Percubaan Fiuu VT tidak dijumpai' }, { status: 404 });
 }

 const { data: authorizationAttempt, error: authorizationAttemptError } = await service
  .from('pos_fiuu_vt_attempts')
  .select('id, payment_id, provider_order_id, op_type, callback_host')
  .eq('id', result.callbackAttemptId)
  .eq('payment_id', payment.id)
  .maybeSingle();
 if (authorizationAttemptError) {
  return NextResponse.json({ error: 'Identiti callback Fiuu VT tidak dapat disahkan' }, { status: 400 });
 }
 const exactAuthorizationAttempt = Boolean(
  authorizationAttempt
  && authorizationAttempt.provider_order_id === result.orderId
  && authorizationAttempt.op_type === result.opType
  && authorizationAttempt.callback_host === result.callbackHost
  && nativeValidation === 'MATCHED',
 );
 const turnoverOperationCandidate = exactAuthorizationAttempt
  && (result.opType === 'SALE' || result.opType === 'VOID');
 let nativeReleaseStatusResult = false;
 let turnoverCallbackResult = false;

 try {
  await assertCanAccessPosBranch(service, profile, payment.branch_id);
  const device = await assertOfficialPosDevice(profile, payment.branch_id);
  const nativeReleaseStatusCandidate = result.opType === 'STATUS' && (
   (payment.status === 'PENDING' && !payment.fiuu_vt_review_required)
   || (payment.status === 'QUARANTINED' && payment.fiuu_vt_review_required)
  );
  if (nativeReleaseStatusCandidate || turnoverOperationCandidate) {
   const openShiftId = await getOpenPosBranchShiftId(service, profile, payment.branch_id).catch(async (err: unknown) => {
    if (!(err instanceof PosMissingOpenShiftError)
     || payment.created_by !== profile.id || !exactAuthorizationAttempt) throw err;
    const { data: closedReview, error } = await service.rpc('is_pos_fiuu_vt_closed_review', {
     p_payment_id: payment.id,
     p_actor_id: profile.id,
    });
    if (error || closedReview !== true) throw err;
    // Only the original creator on the same verified tablet may deliver
    // registered callbacks while the next shift is not yet open. The
    // ordinary device, generation and callback checks still apply below.
    return null;
   });
   nativeReleaseStatusResult = nativeReleaseStatusCandidate && (payment.status === 'QUARANTINED'
    || payment.shift_id !== openShiftId
    || payment.created_by !== profile.id);
   // SALE/VOID turnover is strictly a prior-shift recovery path. A different
   // cashier in the same shift must not inherit another cashier's callback.
   turnoverCallbackResult = turnoverOperationCandidate && payment.shift_id !== openShiftId;
   if (openShiftId !== null) {
    await assertActivePosShiftMember(
     service,
     profile,
     nativeReleaseStatusResult || turnoverCallbackResult ? openShiftId : payment.shift_id,
     payment.branch_id,
    );
   }
  } else {
   await assertActivePosShiftMember(service, profile, payment.shift_id, payment.branch_id);
  }
  const salePayload = jsonRecord(payment.sale_payload);
  const deviceBranchCode = normalizeFiuuVtBranchCode(device.branchCode);
  const paymentBranchCode = normalizeFiuuVtBranchCode(salePayload?.fiuu_branch_code);
  if ((!nativeReleaseStatusResult && !turnoverCallbackResult && payment.created_by !== profile.id)
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

 const safeResult = sanitizedCallback(result);
 const fingerprint = callbackFingerprint(safeResult);
 const observedAt = new Date().toISOString();
 const processingToken = randomUUID();
 const claimCallbackProcessing = service.rpc.bind(service) as unknown as ClaimCallbackProcessingRpc;
 const completeCallbackProcessing = service.rpc.bind(service) as unknown as CompleteCallbackProcessingRpc;

 const markReview = async (
  state: ReviewState,
  reason: string,
  attemptId: string,
  paymentStatus: string = payment.status,
 ) => {
  const evidence: Json = {
   observedAt,
   reason,
   paymentStatus,
   attemptId,
   callback: safeResult,
  };
  // The status-aware RPC locks the shift and source payment before deciding
  // whether related active checkouts need protection. This avoids selecting a
  // stale path while cashier release wins concurrently. Evidence is appended
  // to fiuu_vt_review_evidence in the same transaction.
  const review = await service.rpc('mark_pos_fiuu_vt_review_status_aware', {
   p_payment_id: payment.id,
   p_state: state,
   p_evidence: evidence,
  });
  return {
   ...review,
   paymentStatus: reviewLockedPaymentStatus(review.data, payment.status as PaymentStatus),
  };
 };

 const quarantineAttempt = async (
  attemptId: string,
  evidence: Json = safeResult,
  firstEvidence: Json | null = null,
 ) => service
  .from('pos_fiuu_vt_attempts')
  .update({
   state: 'QUARANTINED',
   result_fingerprint: fingerprint,
   result_json: firstEvidence
    ? {
      first: firstEvidence,
      replay: evidence,
      quarantinedAt: observedAt,
     }
    : evidence,
   received_at: observedAt,
   quarantined_at: observedAt,
   updated_at: observedAt,
  })
  .eq('id', attemptId)
  .eq('payment_id', payment.id)
  .select('id')
  .maybeSingle();

 const quarantineAttemptAndMarkReview = async ({
  state,
  reason,
  attemptId,
  paymentStatus = payment.status,
  attemptEvidence = safeResult,
  firstEvidence = null,
  providerSuccess = null,
 }: {
  state: ReviewState;
  reason: string;
  attemptId: string;
  paymentStatus?: string;
  attemptEvidence?: Json;
  firstEvidence?: Json | null;
  providerSuccess?: {
   transactionId: string;
   result: Json;
   saleReportedAt: string | null;
   statusCheckedAt: string | null;
  } | null;
 }) => {
  const resultJson: Json = firstEvidence
   ? {
     first: firstEvidence,
     replay: attemptEvidence,
     quarantinedAt: observedAt,
    }
   : attemptEvidence;
  const evidence: Json = {
   observedAt,
   reason,
   paymentStatus,
   attemptId,
   callback: safeResult,
  };
  const review = await service.rpc('quarantine_pos_fiuu_vt_callback_review', {
   p_payment_id: payment.id,
   p_attempt_id: attemptId,
   p_result_fingerprint: fingerprint,
   p_result_json: resultJson,
   p_state: state,
   p_evidence: evidence,
   p_provider_transaction_id: providerSuccess?.transactionId ?? null,
   p_provider_result: providerSuccess?.result ?? null,
   p_provider_sale_reported_at: providerSuccess?.saleReportedAt ?? null,
   p_provider_status_checked_at: providerSuccess?.statusCheckedAt ?? null,
  });
  return {
   ...review,
   paymentStatus: reviewLockedPaymentStatus(review.data, payment.status as PaymentStatus),
  };
 };

 const completeAttempt = async (attemptId: string) => {
  const completion = await completeCallbackProcessing(
   'complete_pos_fiuu_vt_callback_processing',
   {
    p_payment_id: payment.id,
    p_attempt_id: attemptId,
    p_result_fingerprint: fingerprint,
    p_processing_token: processingToken,
   },
  );
  return {
   ok: !completion.error && isCallbackCompletion(completion.data),
   error: completion.error,
  };
 };

 const { data: attempt, error: attemptError } = await service
  .from('pos_fiuu_vt_attempts')
  .select('id, payment_id, provider_order_id, op_type, callback_host, state, result_fingerprint, result_json, expires_at')
  .eq('id', result.callbackAttemptId)
  .eq('payment_id', payment.id)
  .maybeSingle();
 if (attemptError) {
  return NextResponse.json({ error: 'Percubaan callback Fiuu VT tidak dapat dibaca' }, { status: 400 });
 }

 // A callback that cannot be tied to a server-created one-time attempt must
 // be removed from the native queue, but never trusted to mutate stock/sales.
 if (!attempt) {
  const review = await markReview(
   'FOREIGN_CALLBACK_REVIEW',
   'CALLBACK_ATTEMPT_NOT_FOUND',
   result.callbackAttemptId,
  );
  if (review.error) {
   return NextResponse.json({ error: 'Bukti callback asing tidak dapat disimpan' }, { status: 400 });
  }
  return responseForStatus(
   payment.id,
   review.paymentStatus,
   'ACK_AND_QUARANTINE',
   'Callback Fiuu VT asing dikuarantin untuk semakan HQ. Jangan ulang caj pelanggan.',
  );
 }

 const attemptIdentityMismatch = attempt.provider_order_id !== result.orderId
  || attempt.op_type !== result.opType
  || attempt.callback_host !== result.callbackHost
  || nativeValidation === 'MISMATCH';
 if (attemptIdentityMismatch) {
  const review = await quarantineAttemptAndMarkReview({
   state: 'FOREIGN_CALLBACK_REVIEW',
   reason: nativeValidation === 'MISMATCH'
    ? 'NATIVE_CALLBACK_HOST_MISMATCH'
    : 'CALLBACK_ATTEMPT_IDENTITY_MISMATCH',
   attemptId: attempt.id,
   firstEvidence: attempt.result_json,
  });
  if (review.error) {
   return NextResponse.json({ error: 'Bukti callback tidak sepadan tidak dapat disimpan' }, { status: 400 });
  }
  return responseForStatus(
   payment.id,
   review.paymentStatus,
   'ACK_AND_QUARANTINE',
   'Callback Fiuu VT tidak sepadan dan telah dikuarantin. Jangan ulang caj pelanggan.',
  );
 }

 const quarantineReplayConflict = async (firstEvidence: Json | null) => {
  const conflictingEvidence: Json = {
   first: firstEvidence,
   conflicting: safeResult,
   observedAt,
  };
  const review = await quarantineAttemptAndMarkReview({
   state: 'FOREIGN_CALLBACK_REVIEW',
   reason: 'CALLBACK_ATTEMPT_REPLAY_CONFLICT',
   attemptId: attempt.id,
   attemptEvidence: conflictingEvidence,
  });
  if (review.error) {
   return NextResponse.json({ error: 'Konflik callback Fiuu VT tidak dapat disimpan' }, { status: 400 });
  }
  return responseForStatus(
   payment.id,
   review.paymentStatus,
   'ACK_AND_QUARANTINE',
   'Callback Fiuu VT bercanggah dan memerlukan semakan HQ.',
  );
 };

 if ((attempt.state === 'CONSUMED' || attempt.state === 'QUARANTINED')
  && attempt.result_fingerprint === fingerprint) {
  return responseForStatus(payment.id, payment.status as PaymentStatus, 'ACK_ONLY');
 }
 if ((attempt.state === 'CONSUMED'
   || attempt.state === 'RECEIVED'
   || attempt.state === 'QUARANTINED')
  && attempt.result_fingerprint
  && attempt.result_fingerprint !== fingerprint) {
  return quarantineReplayConflict(attempt.result_json);
 }

 const paymentDetailsMismatch = result.orderId !== payment.provider_order_id
  || (!isFiuuVtErrorResult(result)
   && Math.round(result.amountRm * 100) !== Math.round(Number(payment.amount_rm) * 100))
  || (!isFiuuVtErrorResult(result)
   && payment.provider_transaction_id
   && payment.provider_transaction_id !== result.transactionId);
 if (paymentDetailsMismatch) {
  const review = await quarantineAttemptAndMarkReview({
   state: 'FOREIGN_CALLBACK_REVIEW',
   reason: 'CALLBACK_PAYMENT_DETAILS_MISMATCH',
   attemptId: attempt.id,
   firstEvidence: attempt.result_json,
  });
  if (review.error) {
   return NextResponse.json({ error: 'Callback tidak sepadan tidak dapat disimpan' }, { status: 400 });
  }
  return responseForStatus(
   payment.id,
   review.paymentStatus,
   'ACK_AND_QUARANTINE',
   'Butiran callback Fiuu VT tidak sepadan dan memerlukan semakan HQ.',
  );
 }

 const attemptExpiresAtMs = Date.parse(attempt.expires_at);
 const expiredForMs = Date.now() - attemptExpiresAtMs;
 const attemptExpired = Number.isFinite(attemptExpiresAtMs) && expiredForMs >= 0;
 const lateStatusSuccessIsRecoverable = attemptExpired
  && expiredForMs <= LATE_STATUS_SUCCESS_GRACE_MS
  && nativeValidation === 'MATCHED'
  && payment.status === 'PENDING'
  && !payment.fiuu_vt_review_required
  && ['PREPARED', 'LAUNCHED', 'EXPIRED'].includes(attempt.state)
  && !isFiuuVtErrorResult(result)
  && result.opType === 'STATUS'
  && result.status === '00';
 const callbackAttemptIsClosed = attempt.state === 'EXPIRED'
  || attempt.state === 'ABANDONED'
  || attempt.state === 'QUARANTINED'
  // Once the callback evidence is RECEIVED, its processing lease owns
  // concurrency; the provider-attempt deadline must not prevent recovery.
  || (attemptExpired && attempt.state !== 'RECEIVED');
 if (callbackAttemptIsClosed && !lateStatusSuccessIsRecoverable) {
  const isLateSuccess = !isFiuuVtErrorResult(result)
   && result.opType !== 'VOID'
   && result.status === '00';
  const isPossibleReversal = !isFiuuVtErrorResult(result)
   && (result.opType === 'VOID'
    || ((payment.status === 'PAID' || payment.status === 'REPORTED') && result.status !== '00'));
  let reviewError: unknown = null;
  let reviewStatus: PaymentStatus | null = null;
  if (isLateSuccess || isPossibleReversal) {
   const review = await quarantineAttemptAndMarkReview({
    state: isLateSuccess ? 'LATE_SUCCESS_REVIEW' : 'REVERSAL_REVIEW',
    reason: isLateSuccess ? 'CALLBACK_AFTER_ATTEMPT_EXPIRY' : 'REVERSAL_AFTER_ATTEMPT_EXPIRY',
    attemptId: attempt.id,
    firstEvidence: attempt.result_json,
   });
   reviewError = review.error;
   reviewStatus = review.paymentStatus;
  } else {
   const quarantined = await quarantineAttempt(attempt.id, safeResult, attempt.result_json);
   reviewError = quarantined.error;
  }
  if (reviewError) {
   return NextResponse.json({ error: 'Callback lewat Fiuu VT tidak dapat dikuarantin' }, { status: 400 });
  }
  return reviewStatus
   ? responseForStatus(
     payment.id,
     reviewStatus,
     'ACK_AND_QUARANTINE',
     'Callback lewat disimpan untuk semakan HQ. Jangan ulang caj pelanggan.',
    )
   : responseForStatus(
     payment.id,
     payment.status as PaymentStatus,
     'CHECK_STATUS',
     'Callback lewat yang gagal telah diasingkan. Jalankan semakan STATUS baharu.',
    );
 }

 const { data: claimData, error: claimError } = await claimCallbackProcessing(
  'claim_pos_fiuu_vt_callback_processing',
  {
   p_payment_id: payment.id,
   p_attempt_id: attempt.id,
   p_result_fingerprint: fingerprint,
   p_result_json: safeResult,
   p_processing_token: processingToken,
   p_allow_expired: lateStatusSuccessIsRecoverable,
  },
 );
 if (claimError) {
  return NextResponse.json({ error: 'Callback Fiuu VT tidak dapat dituntut' }, { status: 400 });
 }
 const claimDecision = parseCallbackClaimDecision(claimData);
 if (!claimDecision) {
  return NextResponse.json({ error: 'Respons tuntutan callback Fiuu VT tidak sah' }, { status: 400 });
 }
 if (claimDecision.outcome === 'CONSUMED') {
  return responseForStatus(payment.id, payment.status as PaymentStatus, 'ACK_ONLY');
 }
 if (claimDecision.outcome === 'CONFLICT') {
  return quarantineReplayConflict(claimDecision.existingResult);
 }
 if (claimDecision.outcome === 'ACTIVE') {
  return NextResponse.json(
   {
    error: 'Callback Fiuu VT sedang diproses. Cuba semula.',
    mode: 'FIUU_VT_CALLBACK_ACTIVE',
    retry_after_ms: claimDecision.retryAfterMs,
   },
   {
    status: 409,
    headers: claimDecision.retryAfterMs > 0
     ? { 'Retry-After': String(Math.max(1, Math.ceil(claimDecision.retryAfterMs / 1000))) }
     : undefined,
   },
  );
 }
 if (claimDecision.outcome !== 'CLAIMED') {
  return NextResponse.json(
   { error: 'Callback Fiuu VT tidak lagi layak diproses' },
   { status: 409 },
  );
 }
 const cashierReleasedAfterClaim = Boolean(
  claimDecision.cashierReleasedAt || payment.fiuu_vt_cashier_released_at,
 );

 if (payment.fiuu_vt_review_required) {
  const lateSuccessAfterProviderError = payment.fiuu_vt_reconciliation_state === 'PROVIDER_ERROR_REVIEW'
   && !isFiuuVtErrorResult(result)
   && result.opType !== 'VOID'
   && result.status === '00';
  const review = lateSuccessAfterProviderError
   ? await quarantineAttemptAndMarkReview({
     state: 'LATE_SUCCESS_REVIEW',
     reason: 'SUCCESS_AFTER_PROVIDER_ERROR_QUARANTINE',
     attemptId: attempt.id,
     firstEvidence: attempt.result_json,
     providerSuccess: !isFiuuVtErrorResult(result) && result.opType === 'STATUS' ? {
      transactionId: result.transactionId,
      result: safeResult,
      saleReportedAt: null,
      statusCheckedAt: observedAt,
     } : null,
    })
   : null;
  const quarantined = review
   ? null
   : await quarantineAttempt(attempt.id, safeResult, attempt.result_json);
  if (quarantined?.error || review?.error) {
   return NextResponse.json({ error: 'Bukti callback transaksi dikuarantin tidak dapat disimpan' }, { status: 400 });
  }
  const lockedStatus = review?.paymentStatus
   ?? reviewLockedPaymentStatus(null, payment.status as PaymentStatus);
  return responseForStatus(
   payment.id,
   lockedStatus,
   'ACK_AND_QUARANTINE',
   lateSuccessAfterProviderError
    ? 'Fiuu melaporkan kejayaan selepas transaksi dikuarantin. Jangan ulang caj pelanggan; Finance/HQ perlu menyemak.'
    : 'Transaksi ini sedang menunggu semakan HQ. Jangan ulang caj pelanggan.',
  );
 }

 // A success claimed while the cashier lane was already released belongs to
 // the original order only. The claim RPC returns this release snapshot under
 // the same row locks used to store the callback. If the claim wins first,
 // its exact status-00 evidence makes a concurrent release fail closed.
 if (cashierReleasedAfterClaim
  && payment.status === 'PENDING'
  && !isFiuuVtErrorResult(result)
  && result.opType !== 'VOID'
  && result.status === '00') {
  const review = await quarantineAttemptAndMarkReview({
   state: 'LATE_SUCCESS_REVIEW',
   reason: result.opType === 'SALE'
    ? 'SALE_SUCCESS_AFTER_CASHIER_RELEASE'
    : 'STATUS_SUCCESS_AFTER_CASHIER_RELEASE',
   attemptId: attempt.id,
   firstEvidence: attempt.result_json,
   providerSuccess: {
    transactionId: result.transactionId,
    result: safeResult,
    saleReportedAt: result.opType === 'SALE'
     ? payment.provider_sale_reported_at ?? observedAt
     : null,
    statusCheckedAt: result.opType === 'STATUS' ? observedAt : null,
   },
  });
  if (review.error) {
   return NextResponse.json({ error: 'Bukti kejayaan lewat Fiuu VT tidak dapat disimpan' }, { status: 400 });
  }
  return responseForStatus(
   payment.id,
   review.paymentStatus,
   'ACK_AND_QUARANTINE',
   'Fiuu melaporkan kejayaan selepas kaunter dilepaskan. Bayaran dipadankan kepada pesanan asal untuk semakan HQ; pelanggan baharu tidak terjejas.',
  );
 }

 if (nativeReleaseStatusResult
  && payment.status === 'PENDING'
  && !isFiuuVtErrorResult(result)
  && result.opType === 'STATUS'
  && result.status === '00') {
  const review = await quarantineAttemptAndMarkReview({
   state: 'LATE_SUCCESS_REVIEW',
   reason: 'SUCCESS_FROM_DETACHED_STATUS_RECOVERY',
   attemptId: attempt.id,
   firstEvidence: attempt.result_json,
   providerSuccess: {
    transactionId: result.transactionId,
    result: safeResult,
    saleReportedAt: null,
    statusCheckedAt: observedAt,
   },
  });
  if (review.error) {
   return NextResponse.json({ error: 'Bukti kejayaan syif terdahulu tidak dapat disimpan' }, { status: 400 });
  }
  return responseForStatus(
   payment.id,
   review.paymentStatus,
   'ACK_AND_QUARANTINE',
   'Bayaran syif terdahulu disimpan untuk semakan HQ. Jangan ulang caj pelanggan; kaunter semasa boleh dilepaskan.',
  );
 }

 if (payment.status === 'PAID' || payment.status === 'REPORTED') {
  const contradictory = !isFiuuVtErrorResult(result)
   && (result.opType === 'VOID' || result.status !== '00');
  if (contradictory) {
   const review = await quarantineAttemptAndMarkReview({
    state: 'REVERSAL_REVIEW',
    reason: 'CALLBACK_CONTRADICTS_SUCCESS',
    attemptId: attempt.id,
    firstEvidence: attempt.result_json,
   });
   if (review.error) {
    return NextResponse.json({ error: 'Bukti pembalikan Fiuu VT tidak dapat disimpan' }, { status: 400 });
   }
   return responseForStatus(
    payment.id,
    review.paymentStatus,
    'ACK_AND_QUARANTINE',
    'Fiuu melaporkan keputusan bercanggah selepas kejayaan. Resit dan stok dikekalkan untuk semakan HQ.',
   );
  }
  const completion = await completeAttempt(attempt.id);
  if (!completion.ok) {
   return NextResponse.json({ error: 'Callback Fiuu VT tidak dapat ditandakan selesai' }, { status: 400 });
  }
  return responseForStatus(
   payment.id,
   payment.status as PaymentStatus,
   'ACK_ONLY',
  );
 }

 if (TERMINAL_PAYMENT_STATUSES.has(payment.status as PaymentStatus)) {
  const lateSuccess = !isFiuuVtErrorResult(result)
   && result.opType !== 'VOID'
   && result.status === '00';
  if (lateSuccess) {
   const review = await quarantineAttemptAndMarkReview({
    state: 'LATE_SUCCESS_REVIEW',
    reason: 'SUCCESS_AFTER_PAYMENT_CLOSED',
    attemptId: attempt.id,
    firstEvidence: attempt.result_json,
   });
   if (review.error) {
    return NextResponse.json({ error: 'Bukti kejayaan lewat tidak dapat disimpan' }, { status: 400 });
   }
   return responseForStatus(
    payment.id,
    review.paymentStatus,
    'ACK_AND_QUARANTINE',
    'Fiuu melaporkan kejayaan selepas transaksi ditutup. Jangan ulang caj pelanggan; HQ perlu menyemak.',
   );
  }
  const completion = await completeAttempt(attempt.id);
  if (!completion.ok) {
   return NextResponse.json({ error: 'Callback Fiuu VT tidak dapat ditandakan selesai' }, { status: 400 });
  }
  return responseForStatus(payment.id, payment.status as PaymentStatus, 'COMPLETE');
 }

 if (payment.status !== 'PENDING') {
  await quarantineAttempt(attempt.id, safeResult, attempt.result_json);
  return NextResponse.json(
   { error: 'Status percubaan Fiuu VT tidak dikenali', mode: 'FIUU_ATTEMPT_TERMINAL' },
   { status: 409 },
  );
 }

 if (isFiuuVtErrorResult(result)) {
  let parkAvailable = false;
  if (result.opType === 'STATUS') {
   const { data: errorRecord, error: recordError } = await service.rpc(
    'record_pos_fiuu_vt_provider_error',
    {
     p_payment_id: payment.id,
     p_error_code: result.errorCode,
     p_error_message: result.errorMessage,
     p_provider_result: safeResult,
     p_observed_at: observedAt,
    },
   );
   if (recordError) {
    return NextResponse.json({ error: 'Ralat STATUS Fiuu VT tidak dapat direkod' }, { status: 400 });
   }
   // A STATUS transport error is not proof that Fiuu cancelled the charge.
   // The hardened RPC offers parking only after three distinct errors, expiry,
   // and the absence of every SALE/transaction/payment signal. Parking keeps
   // the payment quarantined for Finance/HQ instead of treating it as cancelled.
   parkAvailable = jsonRecord(errorRecord as Json | null)?.park_available === true;
  } else {
   const { error: updateError } = await service
    .from('pos_online_payments')
    .update({
     provider_result: safeResult,
     updated_at: observedAt,
    })
    .eq('id', payment.id)
    .eq('provider', 'fiuu_vt')
    .eq('status', 'PENDING');
   if (updateError) {
    return NextResponse.json({ error: 'Ralat Fiuu VT tidak dapat direkod' }, { status: 400 });
   }
  }
  const completion = await completeAttempt(attempt.id);
  if (!completion.ok) {
   return NextResponse.json({ error: 'Callback ralat Fiuu VT tidak dapat ditandakan selesai' }, { status: 400 });
  }
  return responseForStatus(
   payment.id,
   'PENDING',
   result.opType === 'STATUS' && parkAvailable
    ? 'PARK_AVAILABLE'
    : result.opType === 'STATUS'
     ? 'CHECK_STATUS_LATER'
     : 'CHECK_STATUS',
   parkAvailable
    ? 'QR telah tamat dan semakan STATUS Fiuu VT gagal berulang tanpa bukti transaksi. Kuarantin untuk semakan Finance/HQ dan teruskan pelanggan seterusnya; jangan caj semula pelanggan yang sama.'
    : `Fiuu VT memulangkan ralat ${result.errorCode}. Semak STATUS; jangan buka SALE kedua.`,
  );
 }

 let update: PaymentUpdate = {
  provider_transaction_id: result.transactionId,
  provider_result: safeResult,
  updated_at: observedAt,
 };
 if (result.opType === 'STATUS') {
  update = {
   ...update,
   fiuu_vt_provider_error_code: null,
   fiuu_vt_provider_error_count: 0,
   fiuu_vt_provider_error_at: null,
  };
 }
 let nextStatus: PaymentStatus = 'PENDING';
 let nextAction: NextAction = 'CHECK_STATUS';
 let warning: string | undefined;

 if (result.opType === 'SALE') {
  update = {
   ...update,
   provider_sale_reported_at: payment.provider_sale_reported_at ?? observedAt,
  };
  warning = 'Keputusan SALE diterima. RKJ One sedang membuat semakan STATUS automatik.';
 } else if (result.opType === 'VOID') {
  update = {
   ...update,
   provider_status_checked_at: observedAt,
  };
  warning = 'Keputusan VOID diterima. STATUS akhir akan disemak sebelum kaunter dilepaskan.';
 } else if (result.status === '00') {
  nextStatus = 'REPORTED';
  nextAction = 'AUTO_CONFIRMATION';
  update = {
   ...update,
   status: 'REPORTED',
   // A fresh, one-time STATUS callback is authoritative recovery evidence
   // when the preceding SALE callback was lost by the Android handoff.
   provider_sale_reported_at: payment.provider_sale_reported_at ?? observedAt,
   provider_status_checked_at: observedAt,
   fiuu_vt_recovery_next_at: null,
   fiuu_vt_recovery_last_error: null,
  };
  warning = 'Fiuu VT mengesahkan bayaran berjaya. Resit dan stok sedang dimuktamadkan.';
 } else if (isFiuuVtPendingStatus(result.status)) {
  nextAction = 'CHECK_STATUS_LATER';
  update = {
   ...update,
   provider_status_checked_at: observedAt,
  };
  warning = 'Bayaran masih diproses oleh Fiuu. Semakan STATUS boleh diulang sebentar lagi.';
 } else {
  const closedStatus = terminalStatus(result);
  if (!closedStatus) {
   return NextResponse.json({ error: 'Status Fiuu VT tidak dapat diproses' }, { status: 400 });
  }
  nextStatus = closedStatus;
  nextAction = 'COMPLETE';
  update = {
   ...update,
   status: closedStatus,
   provider_status_checked_at: observedAt,
   failed_at: observedAt,
   fiuu_vt_recovery_next_at: null,
   fiuu_vt_recovery_last_error: null,
  };
  warning = terminalWarning(closedStatus);
 }

 const { data: updated, error: updateError } = await service
  .from('pos_online_payments')
  .update(update)
  .eq('id', payment.id)
  .eq('provider', 'fiuu_vt')
  .eq('status', 'PENDING')
  .eq('fiuu_vt_review_required', false)
  .select('id, status')
  .maybeSingle();
 if (updateError) {
  return NextResponse.json({ error: 'Keputusan Fiuu VT tidak dapat disimpan' }, { status: 400 });
 }
 if (!updated) {
  const { data: current } = await service
   .from('pos_online_payments')
   .select('status, fiuu_vt_review_required')
   .eq('id', payment.id)
   .maybeSingle();
  if (!current) {
   return NextResponse.json({ error: 'Status Fiuu VT berubah semasa diproses' }, { status: 409 });
  }
   const concurrentLateSuccess = !isFiuuVtErrorResult(result)
    && result.opType !== 'VOID'
    && result.status === '00'
    && current.status !== 'REPORTED'
    && current.status !== 'PAID';
   if (current.fiuu_vt_review_required || concurrentLateSuccess) {
    const review = concurrentLateSuccess
     ? await quarantineAttemptAndMarkReview({
       state: 'LATE_SUCCESS_REVIEW',
       reason: 'SUCCESS_AFTER_CONCURRENT_PAYMENT_CLOSE',
       attemptId: attempt.id,
       paymentStatus: current.status,
       firstEvidence: attempt.result_json,
      })
     : null;
    const quarantined = review
     ? null
     : await quarantineAttempt(attempt.id, safeResult, attempt.result_json);
    if (quarantined?.error || review?.error) {
     return NextResponse.json({ error: 'Bukti kejayaan serentak Fiuu VT tidak dapat disimpan' }, { status: 400 });
    }
   const concurrentReviewStatus = review?.paymentStatus
    ?? reviewLockedPaymentStatus(null, current.status as PaymentStatus);
   return responseForStatus(
    payment.id,
    concurrentReviewStatus,
    'ACK_AND_QUARANTINE',
     concurrentLateSuccess
      ? 'Fiuu melaporkan kejayaan selepas transaksi ditutup serentak. Jangan ulang caj pelanggan; HQ perlu menyemak.'
      : 'Transaksi berubah kepada semakan HQ semasa callback diproses.',
   );
  }
  const completion = await completeAttempt(attempt.id);
  if (!completion.ok) {
   return NextResponse.json({ error: 'Callback Fiuu VT tidak dapat ditandakan selesai' }, { status: 400 });
  }
  return responseForStatus(
   payment.id,
   current.status as PaymentStatus,
   current.status === 'REPORTED' || current.status === 'PAID' ? 'ACK_ONLY' : undefined,
  );
 }

 const completion = await completeAttempt(attempt.id);
 if (!completion.ok) {
  return NextResponse.json({ error: 'Callback Fiuu VT tidak dapat ditandakan selesai' }, { status: 400 });
 }
 return responseForStatus(payment.id, nextStatus, nextAction, warning);
}
