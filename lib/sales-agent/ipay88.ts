import { createHash } from 'crypto';
import type { OnlinePaymentMethod } from './types';

/** iPay88 PaymentId — rujuk senarai rasmi iPay88 */
export const IPAY88_PAYMENT_ID: Record<OnlinePaymentMethod, string> = {
  FPX: '55',
  CARD: '2',
  DEBIT: '16',
};

export type IPay88Config = {
  merchantCode: string;
  merchantKey: string;
  entryUrl: string;
  responseUrl: string;
  backendUrl: string;
};

export function getIPay88Config(appUrl: string, paymentId?: string): IPay88Config | null {
  const merchantCode = process.env.SALES_AGENT_PAYMENT_MERCHANT_ID?.trim();
  const merchantKey = process.env.SALES_AGENT_PAYMENT_API_KEY?.trim();
  if (!merchantCode || !merchantKey) return null;

  const entryUrl =
    process.env.SALES_AGENT_PAYMENT_GATEWAY_URL?.trim() ??
    'https://payment.ipay88.com.my/epayment/entry.asp';

  const returnBase = `${appUrl}/sales-agent/payment-return`;
  const responseUrl = paymentId ? `${returnBase}?payment=${paymentId}` : returnBase;

  return {
    merchantCode,
    merchantKey,
    entryUrl,
    responseUrl,
    backendUrl: `${appUrl}/api/sales-agent/payments/webhook`,
  };
}

/** Tandatangan permintaan iPay88 (SHA256 hex) */
export function buildIPay88RequestSignature(input: {
  merchantKey: string;
  merchantCode: string;
  paymentId: string;
  refNo: string;
  amountRm: number;
  currency?: string;
  xfield1?: string;
}): string {
  const amountSen = Math.round(input.amountRm * 100).toString();
  const currency = input.currency ?? 'MYR';
  const raw =
    input.merchantKey +
    input.merchantCode +
    input.paymentId +
    input.refNo +
    amountSen +
    currency +
    (input.xfield1 ?? '');
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function buildIPay88PaymentForm(input: {
  config: IPay88Config;
  paymentId: string;
  refNo: string;
  amountRm: number;
  method: OnlinePaymentMethod;
  payerName: string;
  payerEmail: string;
  payerPhone?: string;
  description: string;
}) {
  const ipayPaymentId = IPAY88_PAYMENT_ID[input.method];
  const amountSen = Math.round(input.amountRm * 100).toString();
  const signature = buildIPay88RequestSignature({
    merchantKey: input.config.merchantKey,
    merchantCode: input.config.merchantCode,
    paymentId: ipayPaymentId,
    refNo: input.refNo,
    amountRm: input.amountRm,
  });

  return {
    action: input.config.entryUrl,
    fields: {
      MerchantCode: input.config.merchantCode,
      PaymentId: ipayPaymentId,
      RefNo: input.refNo,
      Amount: amountSen,
      Currency: 'MYR',
      ProdDesc: input.description.slice(0, 100),
      UserName: input.payerName.slice(0, 100),
      UserEmail: input.payerEmail.slice(0, 100),
      UserContact: (input.payerPhone ?? '0164366302').slice(0, 20),
      Remark: input.paymentId,
      Lang: 'UTF-8',
      SignatureType: 'SHA256',
      Signature: signature,
      ResponseURL: input.config.responseUrl,
      BackendURL: input.config.backendUrl,
    },
  };
}

export function verifyIPay88BackendSignature(input: {
  merchantKey: string;
  merchantCode: string;
  paymentId: string;
  refNo: string;
  amountSen: string;
  currency: string;
  status: string;
  signature: string;
}): boolean {
  const raw =
    input.merchantKey +
    input.merchantCode +
    input.paymentId +
    input.refNo +
    input.amountSen +
    input.currency +
    input.status;
  const expected = createHash('sha256').update(raw, 'utf8').digest('hex');
  return expected.toLowerCase() === input.signature.toLowerCase();
}
