import { afterEach, describe, expect, it } from 'vitest';
import {
 buildFiuuOpaSignature,
 FIUU_CALLBACK_GRACE_MS,
 getFiuuOpaConfig,
 getPosQrPaymentMode,
 isFiuuReconciliationExpired,
 malaysiaBusinessDate,
 verifyFiuuOpaSignature,
} from './fiuu';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
 process.env = { ...ORIGINAL_ENV };
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
});

describe('Malaysia business dates', () => {
 it('uses Kuala Lumpur date instead of the device or server timezone', () => {
  expect(malaysiaBusinessDate(new Date('2026-12-31T15:59:59.000Z'))).toBe('2026-12-31');
  expect(malaysiaBusinessDate(new Date('2026-12-31T16:00:00.000Z'))).toBe('2027-01-01');
  expect(malaysiaBusinessDate(new Date('2028-02-28T16:00:00.000Z'))).toBe('2028-02-29');
 });
});

describe('Fiuu configuration safety', () => {
 it('defaults to manual mode', () => {
  delete process.env.POS_QR_PAYMENT_MODE;
  expect(getPosQrPaymentMode()).toBe('manual');
  expect(getFiuuOpaConfig('BR001', 'POS001')).toBeNull();
 });

 it('loads only the requested branch credentials and fixes DuitNow to channel 24', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_ENVIRONMENT = 'sandbox';
  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
   BR001: { applicationCode: 'APP001', secretKey: 'secret-001', storeId: 'STORE001' },
   BR002: { applicationCode: 'APP002', secretKey: 'secret-002' },
  });

  const config = getFiuuOpaConfig('br001', 'device-01');

  expect(config).toMatchObject({
   applicationCode: 'APP001',
   secretKey: 'secret-001',
   storeId: 'STORE001',
   channelId: '24',
   environment: 'sandbox',
  });
  expect(config?.terminalId).toBe('RKJDEVICE01');
  expect(config?.precreateUrl).toContain('sandbox-payment.fiuu.com');
 });

 it('loads callback credentials while new QR creation is disabled', () => {
  process.env.POS_QR_PAYMENT_MODE = 'manual';
  process.env.POS_FIUU_ENVIRONMENT = 'sandbox';
  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
   BR001: { applicationCode: 'APP001', secretKey: 'secret-001', storeId: 'STORE001' },
  });

  expect(getFiuuOpaConfig('BR001', 'POS001')).toBeNull();
  expect(getFiuuOpaConfig('BR001', 'POS001', { requireActiveMode: false })).toMatchObject({
   applicationCode: 'APP001',
   secretKey: 'secret-001',
   storeId: 'STORE001',
  });
 });

 it('requires an explicit branch and store mapping in production', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_ENVIRONMENT = 'production';
  process.env.POS_FIUU_APPLICATION_CODE = 'GLOBAL_APP';
  process.env.POS_FIUU_SECRET_KEY = 'global-secret';

  expect(getFiuuOpaConfig('BR001', 'POS001')).toBeNull();

  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
   BR001: { applicationCode: 'APP001', secretKey: 'secret-001' },
  });
  expect(getFiuuOpaConfig('BR001', 'POS001')).toBeNull();

  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
   BR001: { applicationCode: 'APP001', secretKey: 'secret-001', storeId: 'STORE001' },
  });
  expect(getFiuuOpaConfig('BR001', 'POS001')).toMatchObject({
   applicationCode: 'APP001',
   storeId: 'STORE001',
   environment: 'production',
  });
 });

 it('rejects an override outside the approved Fiuu environment host', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_ENVIRONMENT = 'production';
  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
   BR001: { applicationCode: 'APP001', secretKey: 'secret-001', storeId: 'STORE001' },
  });
  process.env.POS_FIUU_PRECREATE_URL = 'https://example.com/precreate';

  expect(() => getFiuuOpaConfig('BR001', 'POS001')).toThrow(
   'Endpoint Fiuu production tidak berada pada hos yang diluluskan',
  );
 });

 it('rejects a sandbox endpoint when production mode is selected', () => {
  process.env.POS_QR_PAYMENT_MODE = 'fiuu';
  process.env.POS_FIUU_ENVIRONMENT = 'production';
  process.env.POS_FIUU_APPLICATIONS_JSON = JSON.stringify({
   BR001: { applicationCode: 'APP001', secretKey: 'secret-001', storeId: 'STORE001' },
  });
  process.env.POS_FIUU_PRECREATE_URL = 'https://sandbox-payment.fiuu.com/RMS/API/MOLOPA/precreate.php';

  expect(() => getFiuuOpaConfig('BR001', 'POS001')).toThrow(
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
