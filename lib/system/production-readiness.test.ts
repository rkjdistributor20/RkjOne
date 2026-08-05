import { describe, expect, it } from 'vitest';
import { buildProductionReadiness } from './production-readiness';

const BASE_INPUT = {
 hasSupabaseEnv: true,
 hasFiuuCredentials: false,
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
   hasFiuuCredentials: true,
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
 });
});
