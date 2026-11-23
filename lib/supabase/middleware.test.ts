import { describe, expect, it } from 'vitest';
import { isPublicApiPath } from './public-api-paths';

describe('Supabase middleware public API allowlist', () => {
 it('allows the exact Fiuu VT recovery cron route to use bearer authentication', () => {
  expect(isPublicApiPath('/api/cron/fiuu-vt-recover')).toBe(true);
 });

 it('does not allow related or suffixed cron paths without a user session', () => {
  expect(isPublicApiPath('/api/cron/fiuu-vt-recover/')).toBe(false);
  expect(isPublicApiPath('/api/cron/fiuu-vt-recover/extra')).toBe(false);
  expect(isPublicApiPath('/api/cron/other')).toBe(false);
 });

 it('preserves the existing exact public webhook allowlist', () => {
  expect(isPublicApiPath('/api/pos/qr-payments/webhook')).toBe(true);
  expect(isPublicApiPath('/api/pos/qr-payments/webhook/extra')).toBe(false);
 });
});
