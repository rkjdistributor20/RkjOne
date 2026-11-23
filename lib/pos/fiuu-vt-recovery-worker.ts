import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFiuuVtBranches } from './fiuu-vt-server';
import { recoverReportedFiuuVtPayment } from './fiuu-vt-reliability';
import { createAdminClient } from '../supabase/admin';

const RECOVERY_SCAN_SIZE = 100;
const RECOVERY_BASE_BACKOFF_MS = 30_000;
const RECOVERY_MAX_BACKOFF_MS = 15 * 60_000;
const RECOVERY_REVIEW_THRESHOLD = 5;
const RELEASED_CALLBACK_GRACE_MS = 20 * 60_000;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

type RecoveryBody = {
 ok?: true;
 error?: string;
 branch?: string | null;
 branches?: string[];
 skippedBranches?: string[];
 examined?: number;
 releasedExamined?: number;
 rotated?: number;
 quarantined?: number;
 results?: Record<string, number>;
 releasedResults?: Record<string, number>;
};

export type FiuuVtRecoveryRun = {
 status: number;
 body: RecoveryBody;
};

export function isFiuuReconciliationEnabled(): boolean {
 const dedicated = process.env.FIUU_VT_RECOVERY_ENABLED?.trim().toLowerCase();
 if (dedicated === 'true' || dedicated === 'false') return dedicated === 'true';

 // Backward-compatible fallback for environments already running the VT
 // worker under the original shared reconciliation gate. New deployments
 // should set FIUU_VT_RECOVERY_ENABLED explicitly.
 return process.env.FIUU_RECONCILIATION_ENABLED?.trim().toLowerCase() === 'true';
}

export function hasValidBearerAuthorization(
 request: Request,
 secret: string,
 minimumSecretLength = 32,
): boolean {
 if (secret.length < minimumSecretLength) return false;
 const authorization = request.headers.get('authorization') ?? '';
 if (!authorization.startsWith('Bearer ')) return false;
 const provided = Buffer.from(authorization.slice('Bearer '.length).trim(), 'utf8');
 const expected = Buffer.from(secret, 'utf8');
 return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function unavailable(error: string): FiuuVtRecoveryRun {
 return { status: 503, body: { error } };
}

export function getFiuuVtRecoveryBackoffMs(attemptNumber: number): number {
 const normalizedAttempt = Math.max(1, Math.trunc(attemptNumber));
 const exponent = Math.min(normalizedAttempt - 1, 10);
 return Math.min(
  RECOVERY_MAX_BACKOFF_MS,
  RECOVERY_BASE_BACKOFF_MS * (2 ** exponent),
 );
}

async function rotateDeferredPayment(
 service: ReturnType<typeof createAdminClient>,
 payment: {
  id: string;
  status: string;
  updated_at: string;
  fiuu_vt_recovery_attempts: number | null;
 },
 outcome: 'retryable' | 'invalid_evidence',
 attemptedAt: string,
): Promise<boolean> {
 if (payment.status !== 'PENDING' && payment.status !== 'REPORTED') return false;
 const priorAttempts = Math.max(0, Math.trunc(payment.fiuu_vt_recovery_attempts ?? 0));
 const nextAttempt = priorAttempts + 1;
 const nextAt = new Date(
  new Date(attemptedAt).getTime() + getFiuuVtRecoveryBackoffMs(nextAttempt),
 ).toISOString();
 const { data, error } = await service
  .from('pos_online_payments')
  .update({
   fiuu_vt_recovery_attempted_at: attemptedAt,
   fiuu_vt_recovery_next_at: nextAt,
   fiuu_vt_recovery_attempts: nextAttempt,
   fiuu_vt_recovery_last_error: outcome === 'retryable'
    ? 'FULFILLMENT_RETRYABLE'
    : 'INVALID_STORED_EVIDENCE',
  })
  .eq('id', payment.id)
  .eq('status', payment.status)
  .eq('fiuu_vt_review_required', false)
  .eq('fiuu_vt_recovery_attempts', priorAttempts)
  .eq('updated_at', payment.updated_at)
  .select('id')
  .maybeSingle();
 if (error || !data) {
  console.error('[pos-fiuu-vt] recovery_rotation_failed', { paymentId: payment.id });
  return false;
 }
 return true;
}

async function quarantineRepeatedRecoveryFailure(
 service: ReturnType<typeof createAdminClient>,
 payment: {
  id: string;
  updated_at: string;
  fiuu_vt_recovery_attempts: number | null;
 },
 outcome: 'retryable' | 'invalid_evidence',
): Promise<boolean> {
 const nextAttempt = Math.max(
  0,
  Math.trunc(payment.fiuu_vt_recovery_attempts ?? 0),
 ) + 1;
 if (nextAttempt < RECOVERY_REVIEW_THRESHOLD) return false;

 const { data, error } = await service.rpc(
  'quarantine_pos_fiuu_vt_recovery_failure',
  {
   p_payment_id: payment.id,
   p_expected_updated_at: payment.updated_at,
   p_reason: outcome,
  },
 );
 if (error || !data) {
  console.error('[pos-fiuu-vt] recovery_quarantine_failed', {
   paymentId: payment.id,
  });
  return false;
 }
 return true;
}

/**
 * Runs one bounded recovery pass. A missing mapping for one configured branch
 * is reported and skipped instead of blocking receipt/stock recovery for every
 * healthy branch. Ambiguous duplicate mappings remain fail-closed per branch.
 */
export async function runFiuuVtRecovery(): Promise<FiuuVtRecoveryRun> {
 let configuredBranches: string[];
 try {
  configuredBranches = [...getFiuuVtBranches()].sort();
 } catch {
  return unavailable('Fiuu VT recovery branch configuration is invalid');
 }
 if (configuredBranches.length === 0) {
  return unavailable('Fiuu VT recovery has no configured branches');
 }

 const service = createAdminClient();
 const { data: branchRows, error: branchError } = await service
  .from('branches')
  .select('id, organization_id, branch_code')
  .in('branch_code', configuredBranches)
  .eq('status', 'ACTIVE');
 if (branchError || !branchRows) {
  return unavailable('Fiuu VT recovery branch mapping is unavailable');
 }

 const configuredSet = new Set(configuredBranches);
 const rowsByCode = new Map<string, (typeof branchRows)[number]>();
 const ambiguousCodes = new Set<string>();
 for (const row of branchRows) {
  if (!configuredSet.has(row.branch_code)) continue;
  if (rowsByCode.has(row.branch_code)) {
   rowsByCode.delete(row.branch_code);
   ambiguousCodes.add(row.branch_code);
  } else if (!ambiguousCodes.has(row.branch_code)) {
   rowsByCode.set(row.branch_code, row);
  }
 }
 const validBranches = configuredBranches.filter((code) => rowsByCode.has(code));
 const skippedBranches = configuredBranches.filter((code) => !rowsByCode.has(code));
 if (validBranches.length === 0) {
  return unavailable('Fiuu VT recovery branch mapping is incomplete');
 }

 const validRows = validBranches.map((code) => rowsByCode.get(code)!);
 const branchIds = validRows.map((row) => row.id);
 const organizationIds = [...new Set(validRows.map((row) => row.organization_id))];
 const { data: reported, error: reportedError } = await service
  .from('pos_online_payments')
  .select('id, status, amount_rm, created_by, provider_order_id, provider_transaction_id, provider_result, provider_sale_reported_at, provider_status_checked_at, fiuu_vt_recovery_attempts, fiuu_vt_recovery_next_at, updated_at')
  .eq('provider', 'fiuu_vt')
  // A callback write can durably persist STATUS=00 while losing the separate
  // PENDING -> REPORTED compare-and-swap. Scan both states; the atomic RPC is
  // responsible for promoting and fulfilling, or quarantining a closed shift.
  .in('status', ['PENDING', 'REPORTED'])
  .eq('fiuu_vt_review_required', false)
  .eq('provider_result->>opType', 'STATUS')
  .eq('provider_result->>status', '00')
  .in('organization_id', organizationIds)
  .in('branch_id', branchIds)
  .in('sale_payload->>fiuu_branch_code', validBranches)
  .not('created_by', 'is', null)
  .not('provider_order_id', 'is', null)
  .not('provider_transaction_id', 'is', null)
  .not('provider_result', 'is', null)
  .not('provider_sale_reported_at', 'is', null)
  .or(`fiuu_vt_recovery_next_at.is.null,fiuu_vt_recovery_next_at.lte.${new Date().toISOString()}`)
  .order('fiuu_vt_recovery_next_at', { ascending: true, nullsFirst: true })
  .order('created_at', { ascending: true })
  .limit(RECOVERY_SCAN_SIZE);
 if (reportedError) {
  console.error('[pos-fiuu-vt] recovery_queue_failed');
  return unavailable('Fiuu VT recovery queue unavailable');
 }

 const results: Record<string, number> = {};
 let rotated = 0;
 let quarantined = 0;
 for (const payment of reported ?? []) {
  let outcome: Awaited<ReturnType<typeof recoverReportedFiuuVtPayment>>;
  try {
   outcome = await recoverReportedFiuuVtPayment(service, payment);
  } catch {
   outcome = 'retryable';
   console.error('[pos-fiuu-vt] recovery_unexpected_error', { paymentId: payment.id });
  }
  results[outcome] = (results[outcome] ?? 0) + 1;
  if (outcome === 'retryable' || outcome === 'invalid_evidence') {
   console.error(`[pos-fiuu-vt] recovery_${outcome}`, { paymentId: payment.id });
   if (await quarantineRepeatedRecoveryFailure(service, payment, outcome)) {
    quarantined += 1;
    continue;
   }
   if (await rotateDeferredPayment(service, payment, outcome, new Date().toISOString())) {
    rotated += 1;
   }
  }
 }

 // A released cashier lane must not leave its original payment PENDING
 // forever. This scan is deliberately separate from successful STATUS=00
 // recovery above: after QR expiry plus the existing late-callback grace, an
 // atomic RPC quarantines only the old payment when no exact success or active
 // callback evidence exists.
 const releasedCutoff = new Date(Date.now() - RELEASED_CALLBACK_GRACE_MS).toISOString();
 const releasedFallbackCutoff = new Date(
  Date.now() - RELEASED_CALLBACK_GRACE_MS - (15 * 60_000),
 ).toISOString();
 const { data: releasedPending, error: releasedPendingError } = await service
  .from('pos_online_payments')
  .select('id, updated_at')
  .eq('provider', 'fiuu_vt')
  .eq('status', 'PENDING')
  .eq('fiuu_vt_review_required', false)
  .not('fiuu_vt_cashier_released_at', 'is', null)
  .or(`expires_at.lte.${releasedCutoff},and(expires_at.is.null,created_at.lte.${releasedFallbackCutoff})`)
  .in('organization_id', organizationIds)
  .in('branch_id', branchIds)
  .in('sale_payload->>fiuu_branch_code', validBranches)
  .order('expires_at', { ascending: true, nullsFirst: true })
  .limit(RECOVERY_SCAN_SIZE);
 if (releasedPendingError) {
  console.error('[pos-fiuu-vt] released_payment_queue_failed');
  return unavailable('Fiuu VT released-payment queue unavailable');
 }

 const releasedResults: Record<string, number> = {};
 for (const payment of releasedPending ?? []) {
  const { data, error } = await service.rpc(
   'quarantine_pos_fiuu_vt_released_timeout',
   {
    p_payment_id: payment.id,
    p_expected_updated_at: payment.updated_at,
   },
  );
  const outcome = error
   ? 'RPC_ERROR'
   : data && typeof data === 'object' && !Array.isArray(data)
    && typeof (data as Record<string, unknown>).outcome === 'string'
    ? String((data as Record<string, unknown>).outcome)
    : 'INVALID_RESPONSE';
  releasedResults[outcome] = (releasedResults[outcome] ?? 0) + 1;
  if (outcome === 'QUARANTINED') quarantined += 1;
  if (error || outcome === 'INVALID_RESPONSE') {
   console.error('[pos-fiuu-vt] released_payment_quarantine_failed', {
    paymentId: payment.id,
   });
  }
 }

 return {
  status: 200,
  body: {
   ok: true,
   branch: validBranches.length === 1 ? validBranches[0] : null,
   branches: validBranches,
   skippedBranches,
   examined: reported?.length ?? 0,
   releasedExamined: releasedPending?.length ?? 0,
   rotated,
   quarantined,
   results,
   releasedResults,
  },
 };
}

export function recoveryRunResponse(run: FiuuVtRecoveryRun): NextResponse {
 return NextResponse.json(run.body, {
  status: run.status,
  headers: NO_STORE_HEADERS,
 });
}
