import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 getFiuuOpaConfig: vi.fn(),
 inquireFiuuOpaPayment: vi.fn(),
}));

vi.mock('./fiuu', () => ({
 getFiuuOpaConfig: mocks.getFiuuOpaConfig,
}));
vi.mock('./fiuu-opa-server', () => ({
 FIUU_OPA_PILOT_BRANCH: 'BR001',
}));
vi.mock('./fiuu-opa-runtime', () => ({
 inquireFiuuOpaPayment: mocks.inquireFiuuOpaPayment,
}));

import { reconcileFiuuOpaPayment } from './fiuu-opa-reconciliation';

const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
 vi.clearAllMocks();
 mocks.getFiuuOpaConfig.mockReturnValue({
  applicationCode: 'APP001',
  secretKey: 'server-only-secret',
  storeId: 'STORE001',
  terminalId: 'TERM001',
  channelId: '24',
 });
});

describe('reconcileFiuuOpaPayment', () => {
 it('records signed inquiry success using the leased claim', async () => {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
   if (name === 'claim_pos_fiuu_opa_inquiry') {
    return {
     data: {
      payment_id: PAYMENT_ID,
      claim_token: args.p_claim_token,
      attempt_no: 1,
      branch_code: 'BR001',
      device_code: 'POS-BR001-01',
      application_code: 'APP001',
      gateway_ref: null,
      amount_rm: 12.5,
      expires_at: '2026-10-26T01:03:00.000Z',
     },
     error: null,
    };
   }
   return { data: { status: 'REPORTED' }, error: null };
  });
  mocks.inquireFiuuOpaPayment.mockResolvedValue({
   statusCode: '00',
   referenceId: PAYMENT_ID,
   gatewayReference: 'TXN001',
   amount: '12.50',
   currencyCode: 'MYR',
   channelId: '24',
   providerResult: { signature: 'a'.repeat(64) },
   verifiedRawResponse: '{"statusCode":"00","signature":"redacted-test-value"}',
  });

  const result = await reconcileFiuuOpaPayment({
   service: { rpc } as never,
   paymentId: PAYMENT_ID,
  });

  expect(result).toBe('terminal');
  expect(mocks.inquireFiuuOpaPayment).toHaveBeenCalledWith(expect.objectContaining({
   expectedGatewayReference: null,
  }));
  expect(rpc).toHaveBeenCalledWith(
   'report_pos_fiuu_opa_inquiry_success',
   expect.objectContaining({
   p_payment_id: PAYMENT_ID,
   p_gateway_ref: 'TXN001',
   p_provider_result: expect.objectContaining({ amount: '12.50', statusCode: '00' }),
    p_audit_result: expect.objectContaining({
    signedResponseRaw: expect.stringContaining('statusCode'),
   }),
   }),
  );
  expect(rpc).not.toHaveBeenCalledWith(
   'complete_pos_fiuu_opa_inquiry',
   expect.objectContaining({ p_outcome: 'SUCCEEDED' }),
  );
  expect(rpc).toHaveBeenCalledWith('fulfill_pos_fiuu_payment', {
   p_payment_id: PAYMENT_ID,
   p_gateway_ref: 'TXN001',
   p_amount: 12.5,
   p_currency: 'MYR',
   p_channel_id: '24',
  });
 });

	it('retries the same signed success without issuing another provider inquiry', async () => {
		let reportCalls = 0;
		const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
			if (name === 'claim_pos_fiuu_opa_inquiry') {
				return {
					data: {
						payment_id: PAYMENT_ID,
						claim_token: args.p_claim_token,
						attempt_no: 6,
						branch_code: 'BR001',
						device_code: 'POS-BR001-01',
						application_code: 'APP001',
						gateway_ref: 'TXN001',
						amount_rm: 12.5,
						expires_at: '2026-10-26T01:03:00.000Z',
					},
					error: null,
				};
			}
			if (name === 'report_pos_fiuu_opa_inquiry_success') {
				reportCalls += 1;
				if (reportCalls === 1) {
					return { data: null, error: { message: 'temporary database response loss' } };
				}
			}
			return { data: { status: 'REPORTED' }, error: null };
		});
		mocks.inquireFiuuOpaPayment.mockResolvedValue({
			statusCode: '00',
			referenceId: PAYMENT_ID,
			gatewayReference: 'TXN001',
			amount: '12.50',
			currencyCode: 'MYR',
			channelId: '24',
			providerResult: { signature: 'a'.repeat(64) },
			verifiedRawResponse: '{"statusCode":"00","signature":"redacted-test-value"}',
		});

		await expect(reconcileFiuuOpaPayment({
			service: { rpc } as never,
			paymentId: PAYMENT_ID,
		})).resolves.toBe('terminal');
		expect(reportCalls).toBe(2);
		expect(mocks.inquireFiuuOpaPayment).toHaveBeenCalledTimes(1);
	});

 it('rejects a claim outside the six-attempt safety cap', async () => {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
   data: {
    payment_id: PAYMENT_ID,
    claim_token: args.p_claim_token,
    attempt_no: 7,
    branch_code: 'BR001',
    device_code: 'POS-BR001-01',
    application_code: 'APP001',
    gateway_ref: 'TXN001',
    amount_rm: 12.5,
    expires_at: '2026-10-26T01:03:00.000Z',
   },
   error: null,
  }));

  await expect(reconcileFiuuOpaPayment({
   service: { rpc } as never,
   paymentId: PAYMENT_ID,
  })).resolves.toBe('invalid_claim');
  expect(mocks.inquireFiuuOpaPayment).not.toHaveBeenCalled();
 });
});
