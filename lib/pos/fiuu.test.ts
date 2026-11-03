import { afterEach, describe, expect, it, vi } from 'vitest';
import {
 buildFiuuOpaSignature,
 createFiuuDynamicQr,
 FIUU_CALLBACK_GRACE_MS,
 getFiuuEnvironment,
 getFiuuOpaConfig,
 getFiuuOpaConfigurationFingerprint,
 getPosQrPaymentMode,
  isFiuuOpaApplicationUnavailable,
 isFiuuOpaDefinitiveRejection,
 isFiuuReconciliationExpired,
 malaysiaBusinessDate,
 normalizeFiuuAmount,
 parseVerifiedFiuuOpaJson,
 verifyFiuuOpaSignature,
} from './fiuu';

const ORIGINAL_ENV = { ...process.env };
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222221';
const OPA_SCOPE = {
 organizationId: ORGANIZATION_ID,
 branchId: BRANCH_ID,
 branchCode: 'BR001',
};

function opaEntry(overrides: Record<string, string> = {}) {
 return {
  organizationId: ORGANIZATION_ID,
  branchId: BRANCH_ID,
  applicationCode: 'APP001',
  secretKey: 'secret-001',
  storeId: 'STORE001',
  terminalId: 'TERM001',
  credentialVersion: 'cred-v1',
  ...overrides,
 };
}

afterEach(() => {
 process.env = { ...ORIGINAL_ENV };
 vi.unstubAllGlobals();
});

describe('Fiuu OPA signing', () => {
 it('sorts parameter names, excludes signature and produces stable HMAC-SHA256', () => {
  const parameters = {
   referenceId: 'PAYMENT-001',
   amount: '12.50',
   applicationCode: 'RKJTEST',
   currencyCode: 'MYR',
   signature: 'must-not-be-included',
  };

  const signature = buildFiuuOpaSignature(parameters, 'test-secret');

  expect(signature).toBe('9d6156048b26711faf38ea9cc2719a427c7ae987fb23b181369cdcc209760068');
  expect(verifyFiuuOpaSignature({ ...parameters, signature }, 'test-secret')).toBe(true);
  expect(verifyFiuuOpaSignature({ ...parameters, amount: '12.51', signature }, 'test-secret')).toBe(false);
 });

 it('trims string values, omits whitespace-only values and retains numeric zero', () => {
  const canonical = {
   applicationCode: 'RKJTEST',
   amount: '0',
   description: '',
   referenceId: 'PAYMENT-001',
  };
  const padded = {
   applicationCode: '  RKJTEST  ',
   amount: ' 0 ',
   description: '   ',
   referenceId: ' PAYMENT-001 ',
  };

  expect(buildFiuuOpaSignature(padded, 'test-secret'))
   .toBe(buildFiuuOpaSignature(canonical, 'test-secret'));
 });

 it('restores documented two-decimal amount fields after JSON number parsing', () => {
  const lexicalResponse = {
   amount: '10.00',
   applicationCode: 'RKJTEST',
   baseAmount: '16.64',
   exchangeRate: '1.66',
   referenceId: 'PAYMENT-001',
  };
  const parsedJsonResponse = {
   ...lexicalResponse,
   amount: 10,
   baseAmount: 16.64,
   exchangeRate: 1.66,
  };

  expect(buildFiuuOpaSignature(parsedJsonResponse, 'test-secret'))
   .toBe(buildFiuuOpaSignature(lexicalResponse, 'test-secret'));
  expect(normalizeFiuuAmount(10)).toBe('10.00');
  expect(normalizeFiuuAmount(' 10.00 ')).toBe('10.00');
 });

 it('verifies exact decimal and nested JSON tokens before lossy parsing', () => {
  const extraInfo = '{"issuer":"DuitNow","count":0}';
  const parameters = {
   amount: '10.00',
   applicationCode: 'RKJTEST',
   exchangeRate: '1.6600',
   extraInfo,
   referenceId: 'PAYMENT-001',
   statusCode: '00',
  };
  const signature = buildFiuuOpaSignature(parameters, 'test-secret');
  const raw = '{'
   + '"amount":10.00,'
   + '"applicationCode":"RKJTEST",'
   + '"exchangeRate":1.6600,'
   + `"extraInfo":${extraInfo},`
   + '"referenceId":"PAYMENT-001",'
   + '"statusCode":"00",'
   + `"signature":"${signature}"`
   + '}';

  expect(parseVerifiedFiuuOpaJson(raw, 'test-secret')).toMatchObject({
   amount: 10,
   exchangeRate: 1.66,
   extraInfo: { issuer: 'DuitNow', count: 0 },
  });
  expect(() => parseVerifiedFiuuOpaJson(raw.replace('1.6600', '1.66'), 'test-secret'))
   .toThrow('Tandatangan respons Fiuu tidak sah');
 });
});

describe('Malaysia business dates', () => {
 it('uses Kuala Lumpur date instead of the device or server timezone', () => {
  expect(malaysiaBusinessDate(new Date('2026-12-31T15:59:59.000Z'))).toBe('2026-12-31');
  expect(malaysiaBusinessDate(new Date('2026-12-31T16:00:00.000Z'))).toBe('2027-01-01');
  expect(malaysiaBusinessDate(new Date('2028-02-28T16:00:00.000Z'))).toBe('2028-02-29');
 });
});

describe('Fiuu pre-create outcome classification', () => {
 const config = {
  applicationCode: 'APP001',
  secretKey: 'test-secret',
  storeId: 'STORE001',
  terminalId: 'TERM001',
  credentialVersion: 'cred-v1',
  channelId: '24' as const,
  environment: 'sandbox' as const,
  precreateUrl: 'https://sandbox-payment.fiuu.com/RMS/API/MOLOPA/precreate.php',
  inquiryUrl: 'https://sandbox-api.fiuu.com/RMS/API/MOLOPA/inquiry.php',
  reversalUrl: 'https://sandbox-api.fiuu.com/RMS/API/MOLOPA/reversal.php',
  validitySeconds: 180,
 };

 it('treats a provider 4xx as a definitive rejection', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 400 })));
  const promise = createFiuuDynamicQr({
   config,
   paymentId: 'PAYMENT-001',
   amountRm: 12.5,
   description: 'RKJ POS BR001',
  });
  const error = await promise.catch((caught: unknown) => caught);

  expect(isFiuuOpaDefinitiveRejection(error)).toBe(true);
  expect(isFiuuOpaApplicationUnavailable(error)).toBe(false);
  });

  it('identifies a pre-create 404 as unavailable OPA application provisioning', async () => {
   vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
   const promise = createFiuuDynamicQr({
    config,
    paymentId: 'PAYMENT-001',
    amountRm: 12.5,
    description: 'RKJ POS BR001',
   });
   const error = await promise.catch((caught: unknown) => caught);

   expect(isFiuuOpaDefinitiveRejection(error)).toBe(true);
   expect(isFiuuOpaApplicationUnavailable(error)).toBe(true);
 });

 it('keeps a transport exception as an unknown payment outcome', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network interrupted')));
  const promise = createFiuuDynamicQr({
   config,
   paymentId: 'PAYMENT-001',
   amountRm: 12.5,
   description: 'RKJ POS BR001',
  });
  const error = await promise.catch((caught: unknown) => caught);

  expect(isFiuuOpaDefinitiveRejection(error)).toBe(false);
  expect(isFiuuOpaApplicationUnavailable(error)).toBe(false);
 });
});

describe('Fiuu configuration safety', () => {
 it('defaults to manual mode', () => {
  delete process.env.POS_QR_PAYMENT_MODE;
  expect(getPosQrPaymentMode()).toBe('manual');
  expect(getFiuuOpaConfig(OPA_SCOPE)).toBeNull();
 });

 it('recognizes the dedicated VT mode without enabling OPA credentials', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu_vt';
  expect(getPosQrPaymentMode()).toBe('fiuu_vt');
  expect(getFiuuOpaConfig(OPA_SCOPE)).toBeNull();
 });

 it('recognizes cloudECR without enabling OPA credentials', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu_cloudecr';
  expect(getPosQrPaymentMode()).toBe('fiuu_cloudecr');
  expect(getFiuuOpaConfig(OPA_SCOPE)).toBeNull();
 });

 it('defaults VT to sandbox and rejects an ambiguous environment', () => {
  delete process.env.POS_FIUU_ENVIRONMENT;
  expect(getFiuuEnvironment()).toBe('sandbox');
  process.env.POS_FIUU_ENVIRONMENT = 'production';
  expect(getFiuuEnvironment()).toBe('production');
  process.env.POS_FIUU_ENVIRONMENT = 'prod';
  expect(() => getFiuuEnvironment()).toThrow('Persekitaran Fiuu mesti sandbox atau production');
 });

 it('loads only the requested branch credentials and fixes DuitNow to channel 24', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_ENVIRONMENT = 'sandbox';
  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
    BR001: opaEntry(),
    BR002: opaEntry({
     branchId: '22222222-2222-4222-8222-222222222222',
     applicationCode: 'APP002',
     secretKey: 'secret-002',
     storeId: 'STORE002',
     terminalId: 'TERM002',
    }),
  });

   const config = getFiuuOpaConfig({ ...OPA_SCOPE, branchCode: 'br001' });

  expect(config).toMatchObject({
   applicationCode: 'APP001',
   secretKey: 'secret-001',
   storeId: 'STORE001',
   terminalId: 'TERM001',
   credentialVersion: 'cred-v1',
   channelId: '24',
   environment: 'sandbox',
  });
  expect(config?.precreateUrl).toContain('sandbox-payment.fiuu.com');
  expect(config?.validitySeconds).toBe(180);
 });

 it('requires and validates a non-secret credential generation', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_ENVIRONMENT = 'sandbox';
  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
   BR001: opaEntry({ credentialVersion: '' }),
  });

  expect(() => getFiuuOpaConfig(OPA_SCOPE)).toThrow(
   'Konfigurasi OPA Fiuu BR001 mesti lengkap',
  );

  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
   BR001: opaEntry({ credentialVersion: 'secret/version' }),
  });
  expect(() => getFiuuOpaConfig(OPA_SCOPE)).toThrow(
   'Versi kelayakan Fiuu mesti 1 hingga 32 aksara',
  );
 });

 it('fingerprints the complete non-secret rollout configuration generation', () => {
  const config = {
   environment: 'sandbox' as const,
   applicationCode: 'APP001',
   storeId: 'STORE001',
   terminalId: 'TERM001',
   credentialVersion: 'cred-v1',
  };

  expect(getFiuuOpaConfigurationFingerprint(config)).toBe(
   '9e0192d964f325892a890a56289d3f3f7d0ad421a00381872040f6d79d6c88b1',
  );
  expect(getFiuuOpaConfigurationFingerprint({ ...config, environment: 'production' }))
   .not.toBe(getFiuuOpaConfigurationFingerprint(config));
  expect(getFiuuOpaConfigurationFingerprint({ ...config, applicationCode: 'APP002' }))
   .not.toBe(getFiuuOpaConfigurationFingerprint(config));
  expect(getFiuuOpaConfigurationFingerprint({ ...config, storeId: 'STORE002' }))
   .not.toBe(getFiuuOpaConfigurationFingerprint(config));
  expect(getFiuuOpaConfigurationFingerprint({ ...config, terminalId: 'TERM002' }))
   .not.toBe(getFiuuOpaConfigurationFingerprint(config));
  expect(getFiuuOpaConfigurationFingerprint({ ...config, credentialVersion: 'cred-v2' }))
   .not.toBe(getFiuuOpaConfigurationFingerprint(config));
 });

 it('uses only the documented 60 to 180 second DuitNow validity range', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_ENVIRONMENT = 'sandbox';
  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
    BR001: opaEntry(),
  });

  process.env.POS_FIUU_QR_VALIDITY_SECONDS = '60';
   expect(getFiuuOpaConfig(OPA_SCOPE)?.validitySeconds).toBe(60);

  process.env.POS_FIUU_QR_VALIDITY_SECONDS = '180';
   expect(getFiuuOpaConfig(OPA_SCOPE)?.validitySeconds).toBe(180);

  process.env.POS_FIUU_QR_VALIDITY_SECONDS = '181';
   expect(getFiuuOpaConfig(OPA_SCOPE)?.validitySeconds).toBe(180);
 });

 it('loads callback credentials while new QR creation is disabled', () => {
  process.env.POS_QR_PAYMENT_MODE = 'manual';
  process.env.POS_FIUU_ENVIRONMENT = 'sandbox';
  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
    BR001: opaEntry(),
  });

   expect(getFiuuOpaConfig(OPA_SCOPE)).toBeNull();
   expect(getFiuuOpaConfig(OPA_SCOPE, { requireActiveMode: false })).toMatchObject({
   applicationCode: 'APP001',
   secretKey: 'secret-001',
   storeId: 'STORE001',
  });
 });

 it('requires explicit branch, store and terminal mappings in production', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_ENVIRONMENT = 'production';
   expect(getFiuuOpaConfig(OPA_SCOPE)).toBeNull();

  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
    BR001: { ...opaEntry(), storeId: '', terminalId: '' },
  });
   expect(() => getFiuuOpaConfig(OPA_SCOPE)).toThrow('Konfigurasi OPA Fiuu BR001 mesti lengkap');

  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
    BR001: { ...opaEntry(), terminalId: '' },
  });
   expect(() => getFiuuOpaConfig(OPA_SCOPE)).toThrow('Konfigurasi OPA Fiuu BR001 mesti lengkap');

  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
    BR001: opaEntry(),
  });
   expect(getFiuuOpaConfig(OPA_SCOPE)).toMatchObject({
   applicationCode: 'APP001',
   storeId: 'STORE001',
   terminalId: 'TERM001',
   credentialVersion: 'cred-v1',
   environment: 'production',
  });
 });

 it('rejects an override outside the approved Fiuu environment host', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_ENVIRONMENT = 'production';
  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
    BR001: opaEntry(),
  });
  process.env.POS_FIUU_PRECREATE_URL = 'https://example.com/precreate';

   expect(() => getFiuuOpaConfig(OPA_SCOPE)).toThrow(
   'Endpoint Fiuu production tidak berada pada hos yang diluluskan',
  );
 });

 it('rejects a sandbox endpoint when production mode is selected', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_ENVIRONMENT = 'production';
  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
    BR001: opaEntry(),
  });
  process.env.POS_FIUU_PRECREATE_URL = 'https://sandbox-payment.fiuu.com/RMS/API/MOLOPA/precreate.php';

   expect(() => getFiuuOpaConfig(OPA_SCOPE)).toThrow(
   'Endpoint Fiuu production tidak berada pada hos yang diluluskan',
  );
 });
});

describe('Fiuu callback reconciliation window', () => {
 it('keeps an expired display intent reconcilable until the grace boundary', () => {
  const expiry = '2026-08-26T12:00:00.000Z';
  const expiryMs = new Date(expiry).getTime();

  expect(isFiuuReconciliationExpired(expiry, expiryMs + FIUU_CALLBACK_GRACE_MS - 1)).toBe(false);
  expect(isFiuuReconciliationExpired(expiry, expiryMs + FIUU_CALLBACK_GRACE_MS)).toBe(true);
 });

 it('does not terminalize an invalid provider expiry value', () => {
  expect(isFiuuReconciliationExpired('invalid-date')).toBe(false);
 });
});
