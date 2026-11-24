import { describe, expect, it } from 'vitest';
import { buildProductionReadiness } from './production-readiness';

const BASE_INPUT = {
 hasSupabaseEnv: true,
 roleUatPassed: false,
 auditTrailVerified: false,
 backupRestoreConfirmed: false,
 posPilotPassed: false,
 monitoringVerified: false,
 hasFiuuCredentials: false,
 hasFiuuRecoveryWorker: false,
 hasFiuuVtPilot: false,
 hasFiuuVtCashierReleasePilot: false,
 hasFiuuVtRecoveryWorkerConfig: false,
 hasFiuuVtRecoveryHeartbeat: false,
 hasFiuuCloudEcrPilot: false,
 hasFiuuSchema: false,
 fiuuLiveUatPassed: false,
 posQrPaymentMode: 'manual' as const,
 branches: 36,
 legalEntities: 3,
 activeProfiles: 107,
 activeAdmins: 0,
 activeProfilesMissingLegalEntity: 2,
 activeProfilesWithoutAuthUser: 0,
 activeProfilesNeverSignedIn: 68,
 migrationRows: null,
};

function statusFor(
 snapshot: ReturnType<typeof buildProductionReadiness>,
 key: string,
) {
 return snapshot.areas.find((area) => area.key === key)?.status;
}

describe('production readiness evidence', () => {
 it('does not mark role UAT, access scope or Fiuu live when evidence is incomplete', () => {
  const snapshot = buildProductionReadiness(BASE_INPUT);

  expect(statusFor(snapshot, 'uat-roles')).toBe('NEEDS_ACTION');
  expect(statusFor(snapshot, 'access-scope')).toBe('NEEDS_ACTION');
  expect(statusFor(snapshot, 'payment-gateway')).toBe('NEEDS_ACTION');
  expect(statusFor(snapshot, 'backup-restore')).toBe('NEEDS_ACTION');
 });

 it('marks the evidence-backed areas ready after their explicit gates pass', () => {
  const snapshot = buildProductionReadiness({
   ...BASE_INPUT,
   roleUatPassed: true,
   auditTrailVerified: true,
   backupRestoreConfirmed: true,
   posPilotPassed: true,
   monitoringVerified: true,
   hasFiuuCredentials: true,
   hasFiuuRecoveryWorker: true,
   hasFiuuSchema: true,
   fiuuLiveUatPassed: true,
   posQrPaymentMode: 'fiuu',
   activeAdmins: 1,
   activeProfilesMissingLegalEntity: 0,
   activeProfilesNeverSignedIn: 0,
   migrationRows: 152,
  });

  expect(statusFor(snapshot, 'uat-roles')).toBe('READY');
  expect(statusFor(snapshot, 'access-scope')).toBe('READY');
  expect(statusFor(snapshot, 'payment-gateway')).toBe('READY');
  expect(statusFor(snapshot, 'backup-restore')).toBe('READY');
  expect(statusFor(snapshot, 'pos-offline')).toBe('READY');
  expect(statusFor(snapshot, 'monitoring-alerts')).toBe('READY');
 });

 it('keeps OPA blocked until the authenticated recovery worker is configured', () => {
  const snapshot = buildProductionReadiness({
   ...BASE_INPUT,
   hasFiuuCredentials: true,
   hasFiuuSchema: true,
   fiuuLiveUatPassed: true,
   posQrPaymentMode: 'fiuu',
  });

  expect(statusFor(snapshot, 'payment-gateway')).toBe('NEEDS_ACTION');
 });

 it('keeps cloudECR blocked until schema and live UAT both pass', () => {
  const configuredOnly = buildProductionReadiness({
   ...BASE_INPUT,
   hasFiuuCloudEcrPilot: true,
   hasFiuuSchema: true,
   posQrPaymentMode: 'fiuu_cloudecr',
  });
  expect(statusFor(configuredOnly, 'payment-gateway')).toBe('NEEDS_ACTION');

  const signedUatPassed = buildProductionReadiness({
   ...BASE_INPUT,
   hasFiuuCloudEcrPilot: true,
   hasFiuuSchema: true,
   fiuuLiveUatPassed: true,
   posQrPaymentMode: 'fiuu_cloudecr',
  });
  expect(statusFor(signedUatPassed, 'payment-gateway')).toBe('READY');
 });

 it('keeps VT cashier release blocked until its dedicated cron worker is configured', () => {
  const unsafeRelease = buildProductionReadiness({
   ...BASE_INPUT,
   hasFiuuVtPilot: true,
   hasFiuuVtCashierReleasePilot: true,
   hasFiuuSchema: true,
   fiuuLiveUatPassed: true,
   posQrPaymentMode: 'fiuu_vt',
  });
  expect(statusFor(unsafeRelease, 'payment-gateway')).toBe('NEEDS_ACTION');

  const configuredButStale = buildProductionReadiness({
   ...BASE_INPUT,
   hasFiuuVtPilot: true,
   hasFiuuVtCashierReleasePilot: true,
   hasFiuuVtRecoveryWorkerConfig: true,
   hasFiuuSchema: true,
   fiuuLiveUatPassed: true,
   posQrPaymentMode: 'fiuu_vt',
  });
  expect(statusFor(configuredButStale, 'payment-gateway')).toBe('NEEDS_ACTION');

  const recoveredRelease = buildProductionReadiness({
   ...BASE_INPUT,
   hasFiuuVtPilot: true,
   hasFiuuVtCashierReleasePilot: true,
   hasFiuuVtRecoveryWorkerConfig: true,
   hasFiuuVtRecoveryHeartbeat: true,
   hasFiuuSchema: true,
   fiuuLiveUatPassed: true,
   posQrPaymentMode: 'fiuu_vt',
  });
  expect(statusFor(recoveredRelease, 'payment-gateway')).toBe('READY');
 });
});
