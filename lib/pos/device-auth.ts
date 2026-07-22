import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ProfileWithBranch } from '@/types/database';
import { PosAccessError } from '@/lib/pos/access';
import { verifyKioskBypassToken } from '@/lib/pos/kiosk-token';
import type { PosDeviceManagementStatus, PosOfficialHardwareProfile } from '@/lib/pos/types';

export const POS_DEVICE_COOKIE = 'rkj_pos_device';
export const POS_KIOSK_BYPASS_COOKIE = 'rkj_pos_kiosk_bypass';

export type PosDeviceContext = {
  mode: 'PRODUCTION' | 'TRAINING';
  device: {
    id: string;
    deviceCode: string;
    deviceName: string;
    branchId: string;
    branchCode: string | null;
    branchName: string | null;
    lastSeenAt: string | null;
    hardwareProfile: PosOfficialHardwareProfile | null;
    management: PosDeviceManagementStatus | null;
  } | null;
  reason?: string;
};

export function hashPosDeviceValue(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function createPosDeviceSecret() {
  return randomBytes(32).toString('base64url');
}

export function createEnrollmentCode() {
  return randomBytes(5).toString('hex').toUpperCase();
}

export async function isPosKioskBypassed(userId: string) {
  const cookieStore = await cookies();
  return verifyKioskBypassToken(cookieStore.get(POS_KIOSK_BYPASS_COOKIE)?.value, userId);
}

function hashesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function getPosDeviceContext(
  profile: Pick<ProfileWithBranch, 'organization_id'>,
): Promise<PosDeviceContext> {
  const cookieStore = await cookies();
  const credential = cookieStore.get(POS_DEVICE_COOKIE)?.value;
  if (!credential) {
    return {
      mode: 'TRAINING',
      device: null,
      reason: 'Tablet ini belum didaftarkan sebagai POS rasmi cawangan.',
    };
  }

  const separator = credential.indexOf('.');
  if (separator < 1) {
    return { mode: 'TRAINING', device: null, reason: 'Pendaftaran tablet tidak sah.' };
  }

  const deviceId = credential.slice(0, separator);
  const secret = credential.slice(separator + 1);
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from('pos_devices')
    .select('id, organization_id, branch_id, device_code, device_name, status, secret_hash, last_seen_at, metadata, branch:branches(branch_code, branch_name)')
    .eq('id', deviceId)
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  const storedHash = typeof data?.secret_hash === 'string' ? data.secret_hash : '';
  const suppliedHash = hashPosDeviceValue(secret);
  if (!data || data.status !== 'ACTIVE' || !storedHash || !hashesMatch(storedHash, suppliedHash)) {
    return {
      mode: 'TRAINING',
      device: null,
      reason: 'Pendaftaran tablet telah tamat, dibatalkan atau tidak sah.',
    };
  }

  const branch = Array.isArray(data.branch) ? data.branch[0] : data.branch;
  const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  return {
    mode: 'PRODUCTION',
    device: {
      id: data.id,
      deviceCode: data.device_code,
      deviceName: data.device_name,
      branchId: data.branch_id,
      branchCode: branch?.branch_code ?? null,
      branchName: branch?.branch_name ?? null,
      lastSeenAt: data.last_seen_at ?? null,
      hardwareProfile: (metadata as { official_hardware_profile?: PosOfficialHardwareProfile }).official_hardware_profile ?? null,
      management: (metadata as { device_management?: PosDeviceManagementStatus }).device_management ?? null,
    },
  };
}

export async function assertOfficialPosDevice(
  profile: Pick<ProfileWithBranch, 'organization_id'>,
  branchId: string,
) {
  const context = await getPosDeviceContext(profile);
  if (context.mode !== 'PRODUCTION' || !context.device) {
    throw new PosAccessError(
      'Transaksi sebenar hanya dibenarkan pada tablet POS rasmi cawangan. Peranti ini berada dalam Mod Latihan.',
      403,
    );
  }
  if (context.device.branchId !== branchId) {
    throw new PosAccessError(
      `Tablet ini dikunci kepada ${context.device.branchCode ?? 'cawangan lain'} dan tidak boleh digunakan untuk cawangan yang dipilih.`,
      403,
    );
  }

  const admin = createAdminClient();
  await (admin as any)
    .from('pos_devices')
    .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', context.device.id);
  return context.device;
}
