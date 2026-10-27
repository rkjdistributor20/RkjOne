import { randomUUID } from 'node:crypto';
import { getFiuuOpaConfig } from './fiuu';
import { FIUU_OPA_PILOT_BRANCH } from './fiuu-opa-server';
import {
 inquireFiuuOpaPayment,
 type FiuuOpaInquiryResult,
} from './fiuu-opa-runtime';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/types/database';

type FiuuOpaClaim = {
 payment_id: string;
 claim_token: string;
 attempt_no: number;
 branch_code: string;
 device_code: string;
 application_code: string;
 gateway_ref: string | null;
 amount_rm: number;
 expires_at: string;
};

const SUCCESS_REPORT_RETRY_DELAYS_MS = [0, 100, 250] as const;

export type FiuuOpaReconciliationResult =
 | 'not_due'
 | 'pending'
 | 'terminal'
 | 'recorded_unknown'
 | 'invalid_claim';

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanProviderValue(value: unknown, maxLength: number): string {
 return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parseFiuuOpaClaim(value: Json | null): FiuuOpaClaim | null {
 if (!isRecord(value)) return null;
 const claim = {
  payment_id: cleanProviderValue(value.payment_id, 40),
  claim_token: cleanProviderValue(value.claim_token, 40),
  attempt_no: Number(value.attempt_no),
  branch_code: cleanProviderValue(value.branch_code, 40).toUpperCase(),
  device_code: cleanProviderValue(value.device_code, 40),
  application_code: cleanProviderValue(value.application_code, 32),
  gateway_ref: cleanProviderValue(value.gateway_ref, 40) || null,
  amount_rm: Number(value.amount_rm),
  expires_at: cleanProviderValue(value.expires_at, 40),
 };
 if (!claim.payment_id || !claim.claim_token || !Number.isInteger(claim.attempt_no)
  || claim.attempt_no < 1 || claim.attempt_no > 6
  || claim.branch_code !== FIUU_OPA_PILOT_BRANCH
  || !claim.device_code || !claim.application_code
  || !Number.isFinite(claim.amount_rm) || claim.amount_rm <= 0
  || !Number.isFinite(new Date(claim.expires_at).getTime())) return null;
 return claim;
}

function sanitizedInquiryEvidence(
 result: FiuuOpaInquiryResult,
 applicationCode: string,
): Json {
 return {
  applicationCode,
  referenceId: result.referenceId,
  molTransactionId: result.gatewayReference,
  amount: result.amount,
  currencyCode: result.currencyCode,
  channelId: result.channelId,
  statusCode: result.statusCode,
  signature: cleanProviderValue(result.providerResult.signature, 64).toLowerCase(),
 };
}

function inquiryAuditEvidence(
 result: FiuuOpaInquiryResult,
 applicationCode: string,
): Json {
 return {
  ...sanitizedInquiryEvidence(result, applicationCode) as Record<string, Json>,
  signedResponseRaw: result.verifiedRawResponse,
 };
}

async function reportSignedInquirySuccess(
 service: ReturnType<typeof createAdminClient>,
 args: Database['public']['Functions']['report_pos_fiuu_opa_inquiry_success']['Args'],
): Promise<{ message: string } | null> {
 let lastError: { message: string } | null = null;
 for (const retryDelay of SUCCESS_REPORT_RETRY_DELAYS_MS) {
  if (retryDelay > 0) {
   await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
  }
  const { error } = await service.rpc('report_pos_fiuu_opa_inquiry_success', args);
  if (!error) return null;
  lastError = error;
 }
 return lastError;
}

/**
 * Runs one leased BR001 inquiry. The database decides whether the payment is
 * due, fences concurrent workers and caps the cadence at six attempts.
 */
export async function reconcileFiuuOpaPayment(input: {
 service: ReturnType<typeof createAdminClient>;
 paymentId: string;
}): Promise<FiuuOpaReconciliationResult> {
 const claimToken = randomUUID();
 const { data: claimData, error: claimError } = await input.service.rpc('claim_pos_fiuu_opa_inquiry', {
  p_payment_id: input.paymentId,
  p_claim_token: claimToken,
  p_lease_seconds: 30,
 });
 if (claimError) {
  console.error('[pos-fiuu] inquiry_claim_failed', {
   paymentId: input.paymentId,
   reason: claimError.message.slice(0, 160),
  });
  return 'invalid_claim';
 }
 if (!claimData) return 'not_due';
 const claim = parseFiuuOpaClaim(claimData);
 if (!claim || claim.payment_id !== input.paymentId || claim.claim_token !== claimToken) {
  console.error('[pos-fiuu] inquiry_claim_invalid', { paymentId: input.paymentId });
  return 'invalid_claim';
 }

 let config;
 try {
  config = getFiuuOpaConfig(claim.branch_code, claim.device_code, {
   requireActiveMode: false,
  });
 } catch {
  config = null;
 }
 if (!config || config.applicationCode !== claim.application_code) {
  await input.service.rpc('complete_pos_fiuu_opa_inquiry', {
   p_payment_id: input.paymentId,
   p_claim_token: claimToken,
   p_outcome: 'INVALID',
   p_status_code: null,
   p_provider_result: null,
   p_failure_code: 'CONFIGURATION_MISMATCH',
  });
  return 'invalid_claim';
 }

 try {
  const result = await inquireFiuuOpaPayment({
   config,
   referenceId: input.paymentId,
   expectedGatewayReference: claim.gateway_ref,
   expectedAmountRm: claim.amount_rm,
  });
  const evidence = sanitizedInquiryEvidence(result, config.applicationCode);
  const auditEvidence = inquiryAuditEvidence(result, config.applicationCode);

   if (result.statusCode === '00') {
    const reportError = await reportSignedInquirySuccess(input.service, {
    p_payment_id: input.paymentId,
    p_claim_token: claimToken,
    p_gateway_ref: result.gatewayReference,
    p_amount: claim.amount_rm,
    p_currency: 'MYR',
    p_channel_id: config.channelId,
    p_status_code: '00',
    p_provider_result: evidence,
    p_audit_result: auditEvidence,
   });
   if (reportError) {
    console.error('[pos-fiuu] inquiry_success_report_failed', {
     paymentId: input.paymentId,
     reason: reportError.message.slice(0, 160),
    });
    return 'recorded_unknown';
   }
    const { error: fulfillError } = await input.service.rpc('fulfill_pos_fiuu_payment', {
    p_payment_id: input.paymentId,
    p_gateway_ref: result.gatewayReference,
    p_amount: claim.amount_rm,
    p_currency: 'MYR',
    p_channel_id: config.channelId,
   });
   if (fulfillError) {
    console.error('[pos-fiuu] inquiry_success_fulfillment_failed', {
     paymentId: input.paymentId,
     reason: fulfillError.message.slice(0, 160),
    });
    return 'recorded_unknown';
   }
   return 'terminal';
  }

  const outcome = result.statusCode === '99' ? 'FAILED' : 'PENDING';
   const { error: completeError } = await input.service.rpc('complete_pos_fiuu_opa_inquiry', {
   p_payment_id: input.paymentId,
   p_claim_token: claimToken,
   p_outcome: outcome,
   p_status_code: result.statusCode,
   p_provider_result: auditEvidence,
   p_failure_code: null,
  });
  if (completeError) {
   console.error('[pos-fiuu] inquiry_completion_failed', {
    paymentId: input.paymentId,
    reason: completeError.message.slice(0, 160),
   });
   return 'recorded_unknown';
  }
  return result.statusCode === '99' ? 'terminal' : 'pending';
 } catch (error) {
  const { error: completeError } = await input.service.rpc('complete_pos_fiuu_opa_inquiry', {
   p_payment_id: input.paymentId,
   p_claim_token: claimToken,
   p_outcome: 'UNKNOWN',
   p_status_code: null,
   p_provider_result: null,
   p_failure_code: 'PROVIDER_RESPONSE_UNAVAILABLE',
  });
  console.error('[pos-fiuu] inquiry_failed', {
   paymentId: input.paymentId,
   reason: error instanceof Error ? error.message.slice(0, 160) : 'unknown',
   completion: completeError?.message.slice(0, 160) ?? 'recorded',
  });
  return completeError ? 'recorded_unknown' : 'pending';
 }
}
