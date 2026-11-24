import { describe, expect, it, vi } from 'vitest';
import {
 FIUU_VT_RECOVERY_HEARTBEAT_MAX_AGE_SECONDS,
 hasRecentFiuuVtRecoverySuccess,
 recordFiuuVtRecoverySuccess,
} from './fiuu-vt-recovery-heartbeat';

function client(result: { data: unknown; error: unknown }) {
 return {
  rpc: vi.fn(async () => result),
 } as unknown as NonNullable<Parameters<typeof recordFiuuVtRecoverySuccess>[0]>;
}

describe('Fiuu VT recovery operational heartbeat', () => {
 it('records only a successful timestamp response', async () => {
  const service = client({ data: '2026-11-24T13:00:00.000Z', error: null });

  await expect(recordFiuuVtRecoverySuccess(service)).resolves.toBe(true);
  expect(service.rpc).toHaveBeenCalledWith('record_pos_fiuu_vt_recovery_success');
 });

 it.each([
  { data: null, error: null },
  { data: null, error: new Error('rpc unavailable') },
 ])('fails closed when heartbeat recording is not confirmed: %j', async (result) => {
  await expect(recordFiuuVtRecoverySuccess(client(result))).resolves.toBe(false);
 });

 it('requires a recent-success boolean from the service-role RPC', async () => {
  const service = client({ data: true, error: null });

  await expect(hasRecentFiuuVtRecoverySuccess(service)).resolves.toBe(true);
  expect(service.rpc).toHaveBeenCalledWith(
   'has_recent_pos_fiuu_vt_recovery_success',
   { p_max_age_seconds: FIUU_VT_RECOVERY_HEARTBEAT_MAX_AGE_SECONDS },
  );
 });

 it.each([
  { data: false, error: null },
  { data: null, error: null },
  { data: true, error: new Error('rpc unavailable') },
 ])('fails closed when recent-success is not proven: %j', async (result) => {
  await expect(hasRecentFiuuVtRecoverySuccess(client(result))).resolves.toBe(false);
 });

 it.each([29, 601, 180.5, Number.NaN])(
  'rejects an unbounded max age without querying: %j',
  async (maxAgeSeconds) => {
   const service = client({ data: true, error: null });

   await expect(hasRecentFiuuVtRecoverySuccess(service, maxAgeSeconds)).resolves.toBe(false);
   expect(service.rpc).not.toHaveBeenCalled();
  },
 );

 it('fails closed when either RPC throws', async () => {
  const service = {
   rpc: vi.fn(async () => {
    throw new Error('network down');
   }),
  } as unknown as NonNullable<Parameters<typeof recordFiuuVtRecoverySuccess>[0]>;

  await expect(recordFiuuVtRecoverySuccess(service)).resolves.toBe(false);
  await expect(hasRecentFiuuVtRecoverySuccess(service)).resolves.toBe(false);
 });
});
