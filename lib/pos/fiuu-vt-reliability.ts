import { parseFiuuVtResult, type FiuuVtResult } from './fiuu-vt';
import type { createAdminClient } from '../supabase/admin';
import type { Database } from '../../types/database';

export type FiuuVtRecoveryPayment = Pick<
 Database['public']['Tables']['pos_online_payments']['Row'],
 | 'id'
 | 'status'
 | 'amount_rm'
 | 'created_by'
 | 'provider_order_id'
 | 'provider_transaction_id'
 | 'provider_result'
 | 'provider_sale_reported_at'
 | 'provider_status_checked_at'
>;

export type FiuuVtRecoveryOutcome =
 | 'already_paid'
 | 'fulfilled'
 | 'quarantined'
 | 'invalid_evidence'
 | 'retryable';

/**
 * Replays only durable, authoritative STATUS=00 evidence through one atomic
 * recovery RPC. The database promotes PENDING -> REPORTED and fulfils in the
 * same transaction, or quarantines a success whose original shift is closed.
 * This helper never calls the provider or handles its credentials.
 */
export async function recoverReportedFiuuVtPayment(
 service: ReturnType<typeof createAdminClient>,
 payment: FiuuVtRecoveryPayment,
): Promise<FiuuVtRecoveryOutcome> {
 if (payment.status === 'PAID') return 'already_paid';
 if ((payment.status !== 'PENDING' && payment.status !== 'REPORTED')
  || !payment.created_by
  || !payment.provider_sale_reported_at
  || !payment.provider_status_checked_at
  || !payment.provider_order_id
  || !payment.provider_transaction_id
  || !payment.provider_result) {
  return 'invalid_evidence';
 }

 let result: FiuuVtResult;
 try {
  result = parseFiuuVtResult(payment.provider_result);
 } catch {
  return 'invalid_evidence';
 }

 if (result.opType !== 'STATUS'
  || result.status !== '00'
  || result.orderId !== payment.provider_order_id
  || result.transactionId !== payment.provider_transaction_id
  || Math.round(result.amountRm * 100) !== Math.round(Number(payment.amount_rm) * 100)) {
  return 'invalid_evidence';
 }

 const { data, error } = await service.rpc('recover_pos_fiuu_vt_reported_payment', {
  p_payment_id: payment.id,
  p_confirmed_by: payment.created_by,
 });
 if (error) return 'retryable';

 const outcome = data && typeof data === 'object' && !Array.isArray(data)
  ? (data as Record<string, unknown>).outcome
  : null;
 if (outcome === 'FULFILLED') return 'fulfilled';
 if (outcome === 'ALREADY_PAID') return 'already_paid';
 if (outcome === 'QUARANTINED') return 'quarantined';
 if (outcome === 'INVALID_EVIDENCE'
  || outcome === 'NOT_FOUND'
  || outcome === 'NOT_RECOVERABLE'
  || outcome === 'REVIEW_REQUIRED') {
  return 'invalid_evidence';
 }
 return 'retryable';
}
