import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20261027221500_br001_pos_device_reenrollment.sql',
), 'utf8');

describe('BR001 official tablet reenrollment boundary', () => {
  it('locks reenrollment to the active, verified BR001 asset', () => {
    expect(migration).toContain("v_device.status IS DISTINCT FROM 'ACTIVE'");
    expect(migration).toContain("v_branch_code IS DISTINCT FROM 'BR001'");
    expect(migration).toContain('v_device.asset_verified_at IS NULL');
    expect(migration).toContain("v_device.metadata->>'official_hardware_profile' NOT IN");
  });

  it('serializes credential rotation against unresolved Fiuu VT payments', () => {
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain("payment.provider = 'fiuu_vt'");
    expect(migration).toContain("payment.status IN ('PENDING', 'REPORTED')");
    expect(migration).toContain('FOR SHARE OF device');
    expect(migration).toContain('guard_fiuu_vt_payment_active_device');
  });

  it('writes a redacted immutable audit event and never logs secrets', () => {
    expect(migration).toContain("'REENROLL_POS_DEVICE'");
    expect(migration).toContain("'BR001_UAT_REENROLL'");
    expect(migration).not.toContain("'secret_hash', v_device.secret_hash");
    expect(migration).not.toContain("'enrollment_code_hash', p_enrollment_code_hash");
  });
});
