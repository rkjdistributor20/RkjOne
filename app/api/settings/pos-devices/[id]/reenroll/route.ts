import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createEnrollmentCode, hashPosDeviceValue } from '@/lib/pos/device-auth';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { isSettingsAdmin } from '@/lib/settings/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';

const ENROLLMENT_VALIDITY_MS = 24 * 60 * 60 * 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = enforceRateLimit(request, {
    key: 'settings-pos-devices-reenroll',
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  const profile = await getCurrentProfile();
  if (!profile || !isSettingsAdmin(profile.role)) {
    return NextResponse.json({ error: 'Akses pentadbir diperlukan.' }, { status: 403 });
  }

  const { id } = await params;
  const deviceId = id.trim();
  if (!deviceId) {
    return NextResponse.json({ error: 'Tablet POS tidak sah.' }, { status: 400 });
  }

  const enrollmentCode = createEnrollmentCode();
  const expiresAt = new Date(Date.now() + ENROLLMENT_VALIDITY_MS).toISOString();
  const admin = createAdminClient();
  const { data: updated, error } = await (admin as any)
    .rpc('request_br001_pos_device_reenrollment', {
      p_device_id: deviceId,
      p_organization_id: profile.organization_id,
      p_actor_id: profile.id,
      p_enrollment_code_hash: hashPosDeviceValue(enrollmentCode),
      p_enrollment_expires_at: expiresAt,
    })
    .single();

  if (error) {
    const status = error.code === 'P0002'
      ? 404
      : error.code === '42501'
        ? 403
        : (error.code === 'P0001' || error.code === '40001')
          ? 409
          : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    enrollment_code: enrollmentCode,
    device: updated,
    message: 'Kod pendaftaran baharu dijana. Akses lama telah ditamatkan.',
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
