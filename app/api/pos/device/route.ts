import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertCanAccessPosBranch, posAccessErrorStatus } from '@/lib/pos/access';
import {
  createPosDeviceSecret,
  getPosDeviceContext,
  hashPosDeviceValue,
  POS_DEVICE_COOKIE,
} from '@/lib/pos/device-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import type { PosDeviceManagementStatus } from '@/lib/pos/types';

function cleanText(value: unknown, maxLength = 120) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) || null : null;
}

function normalizeManagementStatus(value: unknown): PosDeviceManagementStatus {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sdkLevel = Number(source.sdkLevel);
  return {
    nativeApp: source.nativeApp === true,
    packageName: cleanText(source.packageName),
    manufacturer: cleanText(source.manufacturer, 80),
    model: cleanText(source.model, 80),
    androidVersion: cleanText(source.androidVersion, 32),
    sdkLevel: Number.isInteger(sdkLevel) && sdkLevel >= 21 && sdkLevel <= 100 ? sdkLevel : null,
    deviceOwner: source.deviceOwner === true,
    lockTaskPermitted: source.lockTaskPermitted === true,
    lockTaskActive: source.lockTaskActive === true,
    screenLockSecure: source.screenLockSecure === true,
    kioskRequested: source.kioskRequested === true,
    reportedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getPosDeviceContext(profile));
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, {
    key: 'pos-device-enrollment',
    limit: 10,
    windowMs: 5 * 60 * 1000,
  });
  if (limited) return limited;

  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const enrollmentCode = String(body.enrollment_code ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (enrollmentCode.length !== 10) {
    return NextResponse.json({ error: 'Kod pendaftaran tablet mesti 10 aksara.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: device, error } = await (admin as any)
    .from('pos_devices')
    .select('id, organization_id, branch_id, device_code, device_name, status, enrollment_expires_at')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'PENDING')
    .eq('enrollment_code_hash', hashPosDeviceValue(enrollmentCode))
    .maybeSingle();

  if (error || !device) {
    return NextResponse.json({ error: 'Kod pendaftaran tidak sah atau telah digunakan.' }, { status: 400 });
  }
  if (!device.enrollment_expires_at || new Date(device.enrollment_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Kod pendaftaran telah tamat. Minta HQ jana kod baharu.' }, { status: 410 });
  }

  const supabase = await createClient();
  try {
    await assertCanAccessPosBranch(supabase, profile, device.branch_id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Akses cawangan ditolak' },
      { status: posAccessErrorStatus(err) },
    );
  }

  const secret = createPosDeviceSecret();
  const now = new Date().toISOString();
  const { data: activatedDevice, error: updateError } = await (admin as any)
    .from('pos_devices')
    .update({
      status: 'ACTIVE',
      secret_hash: hashPosDeviceValue(secret),
      enrollment_code_hash: null,
      enrollment_used_at: now,
      enrolled_at: now,
      enrolled_by: profile.id,
      last_seen_at: now,
      updated_at: now,
    })
    .eq('id', device.id)
    .eq('status', 'PENDING')
    .select('id')
    .maybeSingle();

  if (updateError) {
    const message = updateError.message.includes('idx_pos_devices_one_active_per_branch')
      ? 'Cawangan ini sudah mempunyai tablet POS rasmi aktif. Batalkan tablet lama dahulu.'
      : updateError.message;
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (!activatedDevice) {
    return NextResponse.json(
      { error: 'Kod pendaftaran telah digunakan pada peranti lain. Minta HQ jana kod baharu.' },
      { status: 409 },
    );
  }

  const response = NextResponse.json({
    success: true,
    device: {
      id: device.id,
      deviceCode: device.device_code,
      deviceName: device.device_name,
      branchId: device.branch_id,
    },
  });
  response.cookies.set(POS_DEVICE_COOKIE, `${device.id}.${secret}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 400,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(POS_DEVICE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function PUT(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const context = await getPosDeviceContext(profile);
  if (context.mode !== 'PRODUCTION' || !context.device) {
    return NextResponse.json({ error: 'Tablet POS rasmi diperlukan.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const management = normalizeManagementStatus(body.status);
  const admin = createAdminClient();
  const { data: current } = await (admin as any)
    .from('pos_devices')
    .select('metadata')
    .eq('id', context.device.id)
    .maybeSingle();
  const metadata = current?.metadata && typeof current.metadata === 'object' ? current.metadata : {};
  const now = new Date().toISOString();
  const { error } = await (admin as any)
    .from('pos_devices')
    .update({
      metadata: { ...metadata, device_management: management },
      last_seen_at: now,
      updated_at: now,
    })
    .eq('id', context.device.id)
    .eq('organization_id', profile.organization_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, management });
}
