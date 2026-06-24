import type { SupabaseClient } from '@supabase/supabase-js';
import { getRkjDistributorMerchantProfile } from './merchant-profile';
import type { AgentPaymentReceipt } from './types';

export function enrichAgentReceipt(raw: Record<string, unknown>): AgentPaymentReceipt {
  const merchant = getRkjDistributorMerchantProfile();
  const issuer = (raw.issuer ?? {}) as Record<string, unknown>;

  return {
    ...(raw as AgentPaymentReceipt),
    issuer: {
      code: String(issuer.code ?? merchant.code),
      legal_name: String(issuer.legal_name ?? merchant.legalName),
      name: String(issuer.name ?? merchant.name),
      address: merchant.address,
      phone: merchant.phone,
      email: merchant.email,
      registration_no: merchant.registrationNo,
      tax_id: merchant.taxId,
      bank_name: merchant.bankName,
      bank_account_name: merchant.bankAccountName,
      bank_account_no: merchant.bankAccountNo,
    },
  };
}

export async function getAgentReceiptForPayment(
  service: SupabaseClient,
  paymentId: string,
  agentAccountId: string
) {
  const { data: payment } = await service
    .from('agent_online_payments')
    .select('id, agent_account_id, status')
    .eq('id', paymentId)
    .maybeSingle();

  if (!payment || payment.agent_account_id !== agentAccountId) return null;
  if (payment.status !== 'PAID') return null;

  const { data: row } = await service
    .from('agent_payment_receipts')
    .select('receipt_number, receipt_data')
    .eq('payment_id', paymentId)
    .maybeSingle();

  if (!row?.receipt_data) return null;
  return enrichAgentReceipt(row.receipt_data as Record<string, unknown>);
}
