import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 getFiuuOpaConfig: vi.fn(),
 isFiuuOpaConfiguredForBranch: vi.fn(),
 inquireFiuuOpaPayment: vi.fn(),
}));

vi.mock('./fiuu', () => ({
 getFiuuOpaConfig: mocks.getFiuuOpaConfig,
}));
vi.mock('./fiuu-opa-server', () => ({
 isFiuuOpaConfiguredForBranch: mocks.isFiuuOpaConfiguredForBranch,
}));
vi.mock('./fiuu-opa-runtime', () => ({
 inquireFiuuOpaPayment: mocks.inquireFiuuOpaPayment,
}));

import { reconcileFiuuOpaPayment } from './fiuu-opa-reconciliation';

const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '66666666-6666-4666-8666-666666666666';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID_36 = '36363636-3636-4636-8636-363636363636';

function scope(branchCode: 'BR001' | 'BR036') {
 return {
  organizationId: ORGANIZATION_ID,
  branchId: branchCode === 'BR001' ? BRANCH_ID : BRANCH_ID_36,
  branchCode,
 };
}

beforeEach(() => {
 vi.clearAllMocks();
 mocks.isFiuuOpaConfiguredForBranch.mockReturnValue(true);
 mocks.getFiuuOpaConfig.mockReturnValue({
  applicationCode: 'APP001',
  secretKey: 'server-only-secret',
  storeId: 'STORE001',
  terminalId: 'TERM001',
  credentialVersion: 'v1-test',
  channelId: '24',
 });
});

afterEach(() => {
 vi.unstubAllEnvs();
});

describe('reconcileFiuuOpaPayment', () => {
 it('reconciles a configured BR036 payment', async () => {
  mocks.getFiuuOpaConfig.mockReturnValue({
   applicationCode: 'APP036',
   secretKey: 'server-only-secret',
   storeId: 'STORE036',
   terminalId: 'TERM036',
   credentialVersion: 'v1-test',
   channelId: '24',
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
   if (name === 'claim_pos_fiuu_opa_inquiry') {
    return {
     data: {
      payment_id: PAYMENT_ID,
      organization_id: ORGANIZATION_ID,
      branch_id: BRANCH_ID_36,
      claim_token: args.p_claim_token,
      attempt_no: 1,
      branch_code: 'BR036',
      device_code: 'POS-BR036-01',
      application_code: 'APP036',
      gateway_ref: 'TXN036',
      amount_rm: 36.5,
      expires_at: '2026-11-03T01:03:00.000Z',
     },
     error: null,
    };
   }
   return { data: { status: 'REPORTED' }, error: null };
  });
  mocks.inquireFiuuOpaPayment.mockResolvedValue({
   statusCode: '00',
   referenceId: PAYMENT_ID,
   gatewayReference: 'TXN036',
   amount: '36.50',
   currencyCode: 'MYR',
   channelId: '24',
   providerResult: { signature: 'b'.repeat(64) },
   verifiedRawResponse: '{"statusCode":"00","signature":"redacted-test-value"}',
  });

  await expect(reconcileFiuuOpaPayment({
   service: { rpc } as never,
   paymentId: PAYMENT_ID,
  })).resolves.toBe('terminal');

  expect(mocks.isFiuuOpaConfiguredForBranch).toHaveBeenCalledWith(scope('BR036'));
  expect(mocks.getFiuuOpaConfig).toHaveBeenCalledWith(scope('BR036'), {
   requireActiveMode: false,
  });
  expect(mocks.inquireFiuuOpaPayment).toHaveBeenCalledWith(expect.objectContaining({
   expectedGatewayReference: 'TXN036',
   expectedAmountRm: 36.5,
  }));
 });

 it('rejects a canonical branch whose tenant tuple does not match the configured target', async () => {
  mocks.isFiuuOpaConfiguredForBranch.mockReturnValue(false);
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
   if (name === 'claim_pos_fiuu_opa_inquiry') {
    return {
     data: {
      payment_id: PAYMENT_ID,
      organization_id: ORGANIZATION_ID,
      branch_id: BRANCH_ID_36,
      claim_token: args.p_claim_token,
      attempt_no: 1,
      branch_code: 'BR036',
      device_code: 'POS-BR036-01',
      application_code: 'APP036',
      gateway_ref: null,
      amount_rm: 12.5,
      expires_at: '2026-11-03T01:03:00.000Z',
     },
     error: null,
    };
   }
   return { data: null, error: null };
  });

  await expect(reconcileFiuuOpaPayment({
   service: { rpc } as never,
   paymentId: PAYMENT_ID,
  })).resolves.toBe('invalid_claim');

  expect(mocks.isFiuuOpaConfiguredForBranch).toHaveBeenCalledWith(scope('BR036'));
  expect(mocks.getFiuuOpaConfig).not.toHaveBeenCalled();
  expect(mocks.inquireFiuuOpaPayment).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('complete_pos_fiuu_opa_inquiry', expect.objectContaining({
   p_failure_code: 'CONFIGURATION_MISMATCH',
  }));
 });

 it('rejects a claim whose branch does not match its configured application mapping', async () => {
  mocks.getFiuuOpaConfig.mockReturnValue({
   applicationCode: 'APP036',
   secretKey: 'server-only-secret',
   storeId: 'STORE036',
   terminalId: 'TERM036',
   credentialVersion: 'v1-test',
   channelId: '24',
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
   if (name === 'claim_pos_fiuu_opa_inquiry') {
    return {
     data: {
      payment_id: PAYMENT_ID,
      organization_id: ORGANIZATION_ID,
      branch_id: BRANCH_ID_36,
      claim_token: args.p_claim_token,
      attempt_no: 1,
      branch_code: 'BR036',
      device_code: 'POS-BR036-01',
      application_code: 'APP001',
      gateway_ref: null,
      amount_rm: 12.5,
      expires_at: '2026-11-03T01:03:00.000Z',
     },
     error: null,
    };
   }
   return { data: null, error: null };
  });

  await expect(reconcileFiuuOpaPayment({
   service: { rpc } as never,
   paymentId: PAYMENT_ID,
  })).resolves.toBe('invalid_claim');

  expect(mocks.getFiuuOpaConfig).toHaveBeenCalledWith(scope('BR036'), {
   requireActiveMode: false,
  });
  expect(mocks.inquireFiuuOpaPayment).not.toHaveBeenCalled();
 });

 it('recovers an already-issued intent while the current payment mode is manual', async () => {
  vi.stubEnv('POS_QR_PAYMENT_MODE', 'manual');
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
   if (name === 'claim_pos_fiuu_opa_inquiry') {
    return {
     data: {
      payment_id: PAYMENT_ID,
      organization_id: ORGANIZATION_ID,
      branch_id: BRANCH_ID,
      claim_token: args.p_claim_token,
      attempt_no: 2,
      branch_code: 'BR001',
      device_code: 'POS-BR001-01',
      application_code: 'APP001',
      gateway_ref: 'TXN001',
      amount_rm: 12.5,
      expires_at: '2026-11-03T01:03:00.000Z',
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
   providerResult: { signature: 'c'.repeat(64) },
   verifiedRawResponse: '{"statusCode":"00","signature":"redacted-test-value"}',
  });

  await expect(reconcileFiuuOpaPayment({
   service: { rpc } as never,
   paymentId: PAYMENT_ID,
  })).resolves.toBe('terminal');

  expect(mocks.isFiuuOpaConfiguredForBranch).toHaveBeenCalledWith(scope('BR001'));
  expect(mocks.getFiuuOpaConfig).toHaveBeenCalledWith(scope('BR001'), {
   requireActiveMode: false,
  });
  expect(rpc).toHaveBeenCalledWith('fulfill_pos_fiuu_payment', expect.objectContaining({
   p_payment_id: PAYMENT_ID,
  }));
 });

 it.each(['br036', 'BR037', 'BR36', ' BR036 '])(
  'rejects malformed or non-canonical claim branch %s',
  async (branchCode) => {
   const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
    data: {
     payment_id: PAYMENT_ID,
     organization_id: ORGANIZATION_ID,
     branch_id: BRANCH_ID_36,
     claim_token: args.p_claim_token,
     attempt_no: 1,
     branch_code: branchCode,
     device_code: 'POS-BR036-01',
     application_code: 'APP036',
     gateway_ref: null,
     amount_rm: 12.5,
     expires_at: '2026-11-03T01:03:00.000Z',
    },
    error: null,
   }));

   await expect(reconcileFiuuOpaPayment({
    service: { rpc } as never,
    paymentId: PAYMENT_ID,
   })).resolves.toBe('invalid_claim');
   expect(mocks.isFiuuOpaConfiguredForBranch).not.toHaveBeenCalled();
   expect(mocks.inquireFiuuOpaPayment).not.toHaveBeenCalled();
   expect(rpc).toHaveBeenCalledWith('complete_pos_fiuu_opa_inquiry', expect.objectContaining({
    p_payment_id: PAYMENT_ID,
    p_outcome: 'INVALID',
    p_failure_code: 'INVALID_CLAIM',
   }));
  },
 );

 it('records signed inquiry success using the leased claim', async () => {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
   if (name === 'claim_pos_fiuu_opa_inquiry') {
    return {
     data: {
      payment_id: PAYMENT_ID,
      organization_id: ORGANIZATION_ID,
      branch_id: BRANCH_ID,
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
						organization_id: ORGANIZATION_ID,
						branch_id: BRANCH_ID,
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
    organization_id: ORGANIZATION_ID,
    branch_id: BRANCH_ID,
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
