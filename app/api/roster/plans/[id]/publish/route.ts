import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

const MANAGER_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'OPERATION_MANAGER',
  'AREA_MANAGER',
]);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!MANAGER_ROLES.has(profile.role)) {
    return NextResponse.json({ error: 'Hanya pengurus boleh terbitkan jadual' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, string>
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc('publish_weekly_roster', { p_plan_id: id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
