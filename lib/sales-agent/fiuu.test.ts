import { afterEach, describe, expect, it } from 'vitest';
import {
 buildFiuuCallbackSignature,
 buildFiuuHostedPaymentForm,
 buildFiuuOrderId,
 getFiuuAgentConfig,
 parseFiuuCallback,
 verifyFiuuCallback,
} from './fiuu';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
 process.env = { ...ORIGINAL_ENV };
});

describe('Fiuu Agent Payment', () => {
 it('defaults to the sandbox host and never exposes a secret in form fields', () => {
 process.env.SALES_AGENT_FIUU_MERCHANT_ID = 'rkjdistributors';
 process.env.SALES_AGENT_FIUU_VERIFY_KEY = 'verify-key';
 process.env.SALES_AGENT_FIUU_SECRET_KEY = 'secret-key';

 const config = getFiuuAgentConfig();
 expect(config?.paymentUrl).toBe(
 'https://sandbox-payment.fiuu.com/RMS/pay/rkjdistributors',
 );
 const form = buildFiuuHostedPaymentForm({
 appUrl: 'https://preview.example.test',
 config: config!,
 paymentId: '123e4567-e89b-12d3-a456-426614174000',
 amountRm: 17,
 method: 'FPX',
 purpose: 'STOCK_ORDER',
 payerEmail: 'agent@example.test',
 payerName: 'Ejen UAT',
 returnUrl: 'https://preview.example.test/sales-agent/payment-return',
 });
 expect(form.orderId).toBe('RKJA123e4567e89b12d3a45642661417');
 expect(form.fields.amount).toBe('17.00');
 expect(form.fields.currency).toBe('MYR');
 expect(JSON.stringify(form.fields)).not.toContain('secret-key');
 expect(JSON.stringify(form.fields)).not.toContain('verify-key');
 });

 it('rejects a payment URL host that does not match the environment', () => {
 process.env.SALES_AGENT_FIUU_MERCHANT_ID = 'rkjdistributors';
 process.env.SALES_AGENT_FIUU_VERIFY_KEY = 'verify-key';
 process.env.SALES_AGENT_FIUU_SECRET_KEY = 'secret-key';
 process.env.SALES_AGENT_FIUU_PAYMENT_URL = 'https://attacker.example/pay';
 expect(() => getFiuuAgentConfig()).toThrow('tidak dibenarkan');
 });

 it('uses only an allowlisted Preview callback and includes the payer phone', () => {
 process.env.SALES_AGENT_FIUU_MERCHANT_ID = 'SB_rkjdistributors';
 process.env.SALES_AGENT_FIUU_VERIFY_KEY = 'verify-key';
 process.env.SALES_AGENT_FIUU_SECRET_KEY = 'secret-key';
 process.env.SALES_AGENT_FIUU_ENVIRONMENT = 'sandbox';
 process.env.SALES_AGENT_FIUU_CALLBACK_URL =
 'https://rkj-agent-uat.vercel.app/api/sales-agent/payments/fiuu/webhook?x-vercel-protection-bypass=bypass';
 process.env.SALES_AGENT_FIUU_RETURN_URL =
 'https://rkj-agent-uat.vercel.app/api/sales-agent/payments/fiuu/return?x-vercel-protection-bypass=bypass&x-vercel-set-bypass-cookie=true';

 const config = getFiuuAgentConfig()!;
 const form = buildFiuuHostedPaymentForm({
 appUrl: 'https://wrong-preview.vercel.app',
 config,
 paymentId: '123e4567-e89b-12d3-a456-426614174000',
 amountRm: 1,
 method: 'FPX',
 purpose: 'POS_SUBSCRIPTION',
 payerEmail: 'agent@example.test',
 payerName: 'Ejen UAT',
 payerPhone: '+60 12-345 6789',
 returnUrl: 'https://wrong-preview.vercel.app/payment-return',
 });

 expect(form.fields.callbackurl).toBe(config.callbackUrl);
 expect(form.fields.returnurl).toBe(config.returnUrl);
 expect(form.fields.bill_mobile).toBe('+60123456789');
 });

 it('rejects a callback URL outside the RKJ production and Preview hosts', () => {
 process.env.SALES_AGENT_FIUU_MERCHANT_ID = 'SB_rkjdistributors';
 process.env.SALES_AGENT_FIUU_VERIFY_KEY = 'verify-key';
 process.env.SALES_AGENT_FIUU_SECRET_KEY = 'secret-key';
 process.env.SALES_AGENT_FIUU_CALLBACK_URL =
 'https://attacker.example/api/sales-agent/payments/fiuu/webhook';
 expect(() => getFiuuAgentConfig()).toThrow('tidak dibenarkan');
 });

 it('verifies the signed callback and rejects tampering', () => {
 const config = {
 environment: 'sandbox' as const,
 merchantId: 'rkjdistributors',
 verifyKey: 'verify-key',
 secretKey: 'secret-key',
 paymentUrl: 'https://sandbox-payment.fiuu.com/RMS/pay/rkjdistributors',
 };
 const callbackWithoutSignature = {
 amount: '17.00',
 applicationCode: 'BANK-APPROVAL-1',
 currency: 'MYR',
 merchantId: config.merchantId,
 orderId: buildFiuuOrderId('123e4567-e89b-12d3-a456-426614174000'),
 payDate: '20260821123000',
 status: '00',
 transactionId: 'T-10001',
 };
 const callback = {
 ...callbackWithoutSignature,
 signature: buildFiuuCallbackSignature({
 ...callbackWithoutSignature,
 secretKey: config.secretKey,
 }),
 };
 expect(verifyFiuuCallback(callback, config)).toBe(true);
 expect(verifyFiuuCallback({ ...callback, amount: '170.00' }, config)).toBe(false);
 expect(verifyFiuuCallback({ ...callback, merchantId: 'rotikayajunus' }, config)).toBe(false);
 });

 it('normalizes the official callback field names', () => {
 expect(parseFiuuCallback({
 amount: '1.00',
 appcode: 'APP',
 currency: 'myr',
 domain: 'rkjdistributors',
 orderid: 'RKJA1',
 paydate: '20260821',
 skey: 'abc',
 status: '22',
 tranID: 'T1',
 })).toEqual({
 amount: '1.00',
 applicationCode: 'APP',
 currency: 'MYR',
 merchantId: 'rkjdistributors',
 orderId: 'RKJA1',
 payDate: '20260821',
 signature: 'abc',
 status: '22',
 transactionId: 'T1',
 });
 });
});
