import type { SupabaseClient } from '@supabase/supabase-js';
import { profileToReceiptIssuer } from '@/lib/brand/legal-entity-profile';
import { SALES_AGENT_EMPLOYER_CODE } from '@/lib/brand/legal-entities';
import { loadMerchantProfile } from '@/lib/sales-agent/merchant-profile';
import type { AgentPaymentReceipt } from './types';

export async function enrichAgentReceipt(
 service: SupabaseClient,
 raw: Record<string, unknown>,
 organizationId?: string): Promise<AgentPaymentReceipt> {
 const issuer = (raw.issuer ?? {}) as Record<string, unknown>;
 const issuerCode = String(issuer.code ?? SALES_AGENT_EMPLOYER_CODE);
 const profile = await loadMerchantProfile(service, issuerCode, organizationId);

 return {...(raw as AgentPaymentReceipt),
 issuer: profileToReceiptIssuer(profile),
 };
}

export async function getAgentReceiptForPayment(
 service: SupabaseClient,
 paymentId: string,
 agentAccountId: string,
 organizationId?: string) {
 const { data: payment } = await service.from('agent_online_payments').select('id, agent_account_id, status, organization_id').eq('id', paymentId).maybeSingle();

 if (!payment || payment.agent_account_id !== agentAccountId) return null;
 if (payment.status !== 'PAID') return null;

 const { data: row } = await service.from('agent_payment_receipts').select('receipt_number, receipt_data').eq('payment_id', paymentId).maybeSingle();

 if (!row?.receipt_data) return null;
 return enrichAgentReceipt(
 service,
 row.receipt_data as Record<string, unknown>,
 organizationId ?? (payment.organization_id as string));
}
