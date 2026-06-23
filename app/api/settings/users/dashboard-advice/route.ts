import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { isSettingsAdmin } from '@/lib/settings/admin-auth';
import {
  adviseUserDashboard,
  dashboardMetadataPatch,
  mergeMetadata,
} from '@/lib/settings/dashboard-advisor';
import { isGroupOwnerMetadata } from '@/lib/hr/group-owner';
import type { UserRole } from '@/types/enums';

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSettingsAdmin(profile.role)) {
    return NextResponse.json({ error: 'Hanya Pentadbir Utama' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const apply = body.apply === true;
  const userId = body.user_id as string | undefined;

  const service = await createServiceClient();

  let query = service
    .from('profiles')
    .select('id, full_name, email, role, metadata, legal_entity_id, legal_entity:legal_entities(code)')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'ACTIVE');

  if (userId) query = query.eq('id', userId);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const profileIds = (rows ?? []).map((r) => (r as { id: string }).id);
  const { data: staffRows } = profileIds.length
    ? await service
        .from('staff')
        .select('profile_id, worker_type, status, legal_entity:legal_entities(code)')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'ACTIVE')
        .in('profile_id', profileIds)
    : { data: [] };

  const staffByProfile = new Map<string, Array<{ legal_entity_code: string; worker_type: string | null }>>();
  type StaffLinkRow = {
    profile_id: string | null;
    worker_type: string | null;
    legal_entity: { code: string } | { code: string }[] | null;
  };
  type ProfileRow = {
    id: string;
    full_name: string;
    role: string;
    metadata: unknown;
    legal_entity: { code: string } | { code: string }[] | null;
  };

  for (const s of (staffRows ?? []) as StaffLinkRow[]) {
    if (!s.profile_id) continue;
    const le = Array.isArray(s.legal_entity) ? s.legal_entity[0] : s.legal_entity;
    const list = staffByProfile.get(s.profile_id as string) ?? [];
    list.push({
      legal_entity_code: (le as { code: string } | null)?.code ?? 'RKJ',
      worker_type: s.worker_type as string | null,
    });
    staffByProfile.set(s.profile_id as string, list);
  }

  const results: Array<{
    user_id: string;
    full_name: string;
    role: string;
    advice: ReturnType<typeof adviseUserDashboard>;
    applied?: boolean;
  }> = [];

  for (const row of (rows ?? []) as ProfileRow[]) {
    const entity = Array.isArray(row.legal_entity)
      ? row.legal_entity[0]
      : row.legal_entity;
    const employments = staffByProfile.get(row.id) ?? [];
    const advice = adviseUserDashboard({
      role: row.role as UserRole,
      legal_entity_code: entity?.code ?? null,
      staff_employments: employments,
      is_group_owner: isGroupOwnerMetadata(row.metadata),
    });

    let applied = false;
    if (apply) {
      const patch = dashboardMetadataPatch(advice);
      const { error: updErr } = await (service as SupabaseClient)
        .from('profiles')
        .update({
          metadata: mergeMetadata(row.metadata, patch),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      applied = !updErr;
    }

    results.push({
      user_id: row.id,
      full_name: row.full_name,
      role: row.role,
      advice,
      applied: apply ? applied : undefined,
    });
  }

  return NextResponse.json({
    count: results.length,
    applied: apply,
    results,
  });
}

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSettingsAdmin(profile.role)) {
    return NextResponse.json({ error: 'Hanya Pentadbir Utama' }, { status: 403 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  return POST(
    new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, apply: false }),
    })
  );
}
