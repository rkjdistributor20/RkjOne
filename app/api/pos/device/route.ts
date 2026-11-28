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
import type { PosDeviceManagementStatus, PosFiuuVtAppStatus } from '@/lib/pos/types';

function cleanText(value: unknown, maxLength = 120) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) || null : null;
}

function cleanVersionName(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.slice(0, 64) || null;
}

function normalizeManagementStatus(value: unknown): PosDeviceManagementStatus {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sdkLevel = Number(source.sdkLevel);
  const versionCode = Number(source.versionCode);
  return {
    nativeApp: source.nativeApp === true,
    packageName: cleanText(source.packageName),
    versionName: cleanVersionName(source.versionName),
    versionCode: Number.isSafeInteger(versionCode) && versionCode >= 1 && versionCode <= 2_100_000_000
      ? versionCode
      : null,
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

function cleanPackageName(value: unknown) {
  const packageName = cleanText(value, 160);
  return packageName && /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/.test(packageName)
    ? packageName
    : null;
}

function cleanNonNegativeInteger(value: unknown, maximum: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= maximum ? number : null;
}

function normalizeFiuuVtStatus(value: unknown): PosFiuuVtAppStatus {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    nativeAndroid: source.nativeAndroid === true,
    installed: source.installed === true,
    trustedInstall: source.trustedInstall === true,
    packageName: cleanPackageName(source.packageName),
    versionName: cleanVersionName(source.versionName),
    versionCode: cleanNonNegativeInteger(source.versionCode, 2_100_000_000),
    installSource: cleanPackageName(source.installSource),
    bridgeApiVersion: cleanNonNegativeInteger(source.bridgeApiVersion, 10_000),
    stateSchemaVersion: cleanNonNegativeInteger(source.stateSchemaVersion, 10_000),
    callbackRegistryRecoveryRequired: source.callbackRegistryRecoveryRequired === true,
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
  const { data: activatedDevice, error: updateError } = await (admin as any)
    .rpc('activate_pos_device_enrollment', {
      p_device_id: device.id,
      p_organization_id: profile.organization_id,
      p_actor_id: profile.id,
      p_enrollment_code_hash: hashPosDeviceValue(enrollmentCode),
      p_secret_hash: hashPosDeviceValue(secret),
    })
    .single();

  if (updateError) {
    const status = updateError.code === 'P0002'
      ? 404
      : updateError.code === '42501'
        ? 403
        : 409;
    return NextResponse.json({ error: updateError.message }, { status });
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
      enrollmentGeneration: activatedDevice.enrollment_generation,
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
  const receivedAt = new Date().toISOString();
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const context = await getPosDeviceContext(profile);
  if (context.mode !== 'PRODUCTION' || !context.device) {
    return NextResponse.json({ error: 'Tablet POS rasmi diperlukan.' }, { status: 403 });
  }

  const payload: unknown = await request.json().catch(() => null);
  const body = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const hasManagementStatus = Object.prototype.hasOwnProperty.call(body, 'status');
  const hasFiuuVtStatus = Object.prototype.hasOwnProperty.call(body, 'fiuu_vt_status');
  const hasWebCommit = Object.prototype.hasOwnProperty.call(body, 'web_commit_sha');
  const commitSha = body.web_commit_sha;
  if (hasWebCommit && (typeof commitSha !== 'string' || !/^[0-9a-f]{40}$/i.test(commitSha))) {
    return NextResponse.json({ error: 'Commit web POS tidak sah.' }, { status: 400 });
  }
  if (!hasManagementStatus && !hasFiuuVtStatus && !hasWebCommit) {
    return NextResponse.json({ error: 'Status tablet diperlukan.' }, { status: 400 });
  }

  const { id, branchId, enrollmentGeneration } = context.device;
  const admin = createAdminClient();
  // Retry against a fresh snapshot if another writer changed the row. A
  // legacy native/Fiuu payload must not clobber a concurrent web report, or vice versa.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: current, error: currentError } = await (admin as any)
      .from('pos_devices')
      .select('metadata, updated_at')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .eq('branch_id', branchId)
      .eq('status', 'ACTIVE')
      .eq('enrollment_generation', enrollmentGeneration)
      .maybeSingle();
    const metadata = current?.metadata;
    if (currentError || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return NextResponse.json({ error: 'Status tablet sedia ada tidak dapat dibaca.' }, { status: 400 });
    }
    const management = hasManagementStatus
      ? normalizeManagementStatus(body.status)
      : (metadata as { device_management?: PosDeviceManagementStatus }).device_management ?? null;
    const fiuuVt = hasFiuuVtStatus
      ? normalizeFiuuVtStatus(body.fiuu_vt_status)
      : (metadata as { fiuu_vt_app?: PosFiuuVtAppStatus }).fiuu_vt_app ?? null;
    const now = Date.now();
    // Ensure the compare-and-swap value changes even within the same millisecond.
    const updatedAt = new Date(Math.max(now, Date.parse(current.updated_at) + 1)).toISOString();
    const { data: updated, error } = await (admin as any)
      .from('pos_devices')
      .update({
        metadata: {
          ...metadata,
          ...(hasManagementStatus ? { device_management: management } : {}),
          ...(hasFiuuVtStatus ? { fiuu_vt_app: fiuuVt } : {}),
          // Client self-report for this enrollment, not build attestation or an authorization signal.
          ...(hasWebCommit ? { web_build: { commitSha, receivedAt, enrollmentGeneration } } : {}),
        },
        last_seen_at: new Date(now).toISOString(),
        updated_at: updatedAt,
      })
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .eq('branch_id', branchId)
      .eq('status', 'ACTIVE')
      .eq('enrollment_generation', enrollmentGeneration)
      .eq('updated_at', current.updated_at)
      .select('id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (updated) return NextResponse.json({ success: true, management, fiuuVt });
  }
  return NextResponse.json({ error: 'Status tablet berubah. Sila cuba semula.' }, { status: 409 });
}
