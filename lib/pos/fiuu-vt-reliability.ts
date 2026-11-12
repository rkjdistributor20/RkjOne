import { parseFiuuVtResult, type FiuuVtResult } from './fiuu-vt';
import type { createAdminClient } from '../supabase/admin';
import type { Database, Json } from '../../types/database';

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
>;

export type FiuuVtRecoveryOutcome =
 | 'already_paid'
 | 'fulfilled'
 | 'invalid_evidence'
 | 'retryable';

function sanitizedStatusResult(result: FiuuVtResult): Json {
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

/**
 * Replays only durable, authoritative REPORTED success evidence through the
 * existing row-locked fulfillment RPC. The RPC remains the exact-once stock
 * and receipt boundary; this helper never calls the provider or handles its
 * credentials.
 */
export async function recoverReportedFiuuVtPayment(
 service: ReturnType<typeof createAdminClient>,
 payment: FiuuVtRecoveryPayment,
): Promise<FiuuVtRecoveryOutcome> {
 if (payment.status === 'PAID') return 'already_paid';
 if (payment.status !== 'REPORTED'
  || !payment.created_by
  || !payment.provider_sale_reported_at
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

 const { error } = await service.rpc('fulfill_pos_fiuu_vt_payment', {
  p_payment_id: payment.id,
  p_provider_order_id: result.orderId,
  p_provider_transaction_id: result.transactionId,
  p_amount: result.amountRm,
  p_currency: result.currency,
  p_channel: result.channel,
  p_provider_result: sanitizedStatusResult(result),
  p_confirmed_by: payment.created_by,
 });
 return error ? 'retryable' : 'fulfilled';
}
