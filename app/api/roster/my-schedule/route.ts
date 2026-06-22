import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { getStaffScheduleForProfile } from '@/lib/roster/queries';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const weekStart = new URL(request.url).searchParams.get('week_start') ?? undefined;
  const supabase = await createClient();

  const schedule = await getStaffScheduleForProfile(supabase, profile.id, weekStart);

  if (!schedule) {
    return NextResponse.json({
      schedule: null,
      message: 'Rekod staf tidak dijumpai — hubungi pengurus',
    });
  }

  return NextResponse.json({ schedule });
}
