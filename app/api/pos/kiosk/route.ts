import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
  getPosDeviceContext,
  POS_KIOSK_BYPASS_COOKIE,
} from '@/lib/pos/device-auth';
import { createKioskBypassToken } from '@/lib/pos/kiosk-token';
import { createClient } from '@/lib/supabase/server';
import { assertCanAccessPosBranch, posAccessErrorStatus } from '@/lib/pos/access';

const MANAGEMENT_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'OPERATION_MANAGER',
  'AREA_MANAGER',
]);

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!MANAGEMENT_ROLES.has(profile.role)) {
    return NextResponse.json({ error: 'Hanya akaun pengurusan boleh keluar sementara daripada Mod Kiosk.' }, { status: 403 });
  }

  const context = await getPosDeviceContext(profile);
  if (context.mode !== 'PRODUCTION' || !context.device) {
    return NextResponse.json({ error: 'Peranti ini bukan tablet POS rasmi yang aktif.' }, { status: 409 });
  }

  if (profile.role === 'AREA_MANAGER') {
    const supabase = await createClient();
    try {
      await assertCanAccessPosBranch(supabase, profile, context.device.branchId);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Akses cawangan ditolak.' },
        { status: posAccessErrorStatus(error) },
      );
    }
  }

  const response = NextResponse.json({ success: true, expires_in_minutes: 15 });
  response.cookies.set(POS_KIOSK_BYPASS_COOKIE, await createKioskBypassToken(profile.id), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 15 * 60,
  });
  return response;
}

export async function DELETE() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const response = NextResponse.json({ success: true });
  response.cookies.set(POS_KIOSK_BYPASS_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
