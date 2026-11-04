import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20261104130000_expand_fiuu_vt_registered_branches.sql',
), 'utf8');

describe('BR001-BR036 official tablet enrollment boundary', () => {
  it('locks reenrollment to an active, verified canonical branch asset', () => {
    expect(migration).toContain("v_device.status IS DISTINCT FROM 'ACTIVE'");
    expect(migration).toContain('^BR(00[1-9]|0[12][0-9]|03[0-6])$');
    expect(migration).toContain('v_device.asset_verified_at IS NULL');
    expect(migration).toContain("v_device.metadata->>'official_hardware_profile'");
    expect(migration).toContain('request_pos_device_reenrollment');
  });

  it('serializes credential rotation against unresolved Fiuu VT payments', () => {
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain("payment.provider = 'fiuu_vt'");
    expect(migration).toContain("payment.status IN ('PENDING', 'REPORTED')");
    expect(migration).toContain('FOR SHARE OF device');
    expect(migration).toContain('guard_fiuu_vt_payment_active_device');
    expect(migration).toContain('guard_pos_device_unresolved_fiuu_vt');
  });

  it('increments the enrollment generation atomically and keeps old intents isolated', () => {
    expect(migration).toContain('activate_pos_device_enrollment');
    expect(migration).toContain('enrollment_generation = v_new_generation');
    expect(migration).toContain('device.enrollment_generation = v_generation');
  });

  it('writes a redacted immutable audit event and never logs secrets', () => {
    expect(migration).toContain("'REENROLL_POS_DEVICE'");
    expect(migration).toContain("'FIUU_VT_FLEET_REENROLL'");
    expect(migration).not.toContain("'secret_hash', v_device.secret_hash");
    expect(migration).not.toContain("'enrollment_code_hash', p_enrollment_code_hash");
  });
});
