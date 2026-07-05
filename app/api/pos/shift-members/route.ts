import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
  assertCanAccessPosBranch,
  canApprovePosShiftStaff,
  posAccessErrorStatus,
} from '@/lib/pos/access';

const SHIFT_ROLES = new Set(['PIC', 'JUALAN', 'PEMBANTU', 'GANTI']);

function validIsoOrNow(value: unknown) {
  if (!value) return new Date().toISOString();
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function cleanRole(value: unknown) {
  const role = String(value ?? 'JUALAN').toUpperCase();
  return SHIFT_ROLES.has(role) ? role : 'JUALAN';
}

async function getOpenShift(
  db: any,
  branchId: string,
  shiftId?: string | null
) {
  let query = db
    .from('pos_shifts')
    .select('id, organization_id, branch_id, shift_number, status, opened_at')
    .eq('branch_id', branchId)
    .eq('status', 'OPEN');

  if (shiftId) {
    query = query.eq('id', shiftId);
  } else {
    query = query.order('opened_at', { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

async function loadAvailableStaff(db: any, branchId: string) {
  const { data: staffRows, error: staffError } = await db
    .from('staff')
    .select('id, staff_code, full_name, profile_id, branch_id, status')
    .eq('status', 'ACTIVE')
    .eq('branch_id', branchId)
    .order('full_name');

  if (staffError) throw new Error(staffError.message);

  const profileIds = Array.from(
    new Set(
      (staffRows ?? [])
        .map((row: { profile_id?: string | null }) => row.profile_id)
        .filter(Boolean)
    )
  ) as string[];
  const profilesById = new Map<string, any>();
  if (profileIds.length) {
    const { data: profileRows, error: profileError } = await db
      .from('profiles')
      .select('id, employee_code, full_name, email, role, branch_id, status')
      .in('id', profileIds)
      .eq('status', 'ACTIVE');

    if (profileError) throw new Error(profileError.message);
    (profileRows ?? []).forEach((row: any) => profilesById.set(String(row.id), row));
  }

  const available = new Map<string, any>();

  (staffRows ?? []).forEach((staff: any) => {
    const profileRow = staff.profile_id ? profilesById.get(String(staff.profile_id)) : null;
    if (staff.profile_id && !profileRow) return;
    const key = staff.profile_id ? `profile:${staff.profile_id}` : `staff:${staff.id}`;
    available.set(key, {
      staff_id: staff.id,
      profile_id: staff.profile_id ?? null,
      staff_code: staff.staff_code ?? null,
      full_name: staff.full_name,
      role: profileRow?.role ?? 'STAFF',
      branch_id: staff.branch_id ?? null,
    });
  });

  return Array.from(available.values());
}

async function resolveMemberIdentity(
  db: any,
  profile: any,
  body: Record<string, unknown>,
  branchId: string
) {
  let profileId = body.profile_id ? String(body.profile_id) : null;
  let staffId = body.staff_id ? String(body.staff_id) : null;

  if (!profileId && !staffId) {
    profileId = profile.id;
  }

  let staffRow: any = null;
  if (staffId) {
    const { data, error } = await db
      .from('staff')
      .select('id, profile_id, full_name, staff_code, branch_id, organization_id, status')
      .eq('id', staffId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data || data.status !== 'ACTIVE') throw new Error('Staf tidak aktif atau tidak dijumpai');
    if (data.branch_id !== branchId) {
      throw new Error('Hanya staf yang ditetapkan di cawangan ini boleh didaftarkan dalam syif POS.');
    }
    staffRow = data;
    staffId = data.id;
    profileId = data.profile_id ?? null;
  }

  if (profileId) {
    if (!staffId) {
      const { data: linkedStaff, error: staffError } = await db
        .from('staff')
        .select('id, profile_id, full_name, staff_code, branch_id, organization_id, status')
        .eq('profile_id', profileId)
        .eq('branch_id', branchId)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (staffError) throw new Error(staffError.message);
      if (!linkedStaff) {
        throw new Error('Akaun ini bukan staf aktif cawangan yang dipilih.');
      }
      staffRow = linkedStaff;
      staffId = linkedStaff.id;
    }

    if (staffRow?.profile_id) {
      const { data, error } = await db
        .from('profiles')
        .select('id, status')
        .eq('id', staffRow.profile_id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data || data.status !== 'ACTIVE') {
        throw new Error('Akaun staf tidak aktif atau tidak dijumpai');
      }
    }
  }

  if (!staffRow) {
    throw new Error('Pilih staf berdaftar yang bekerja di cawangan ini.');
  }

  return {
    profile_id: staffRow.profile_id ?? profileId,
    staff_id: staffRow.id,
    full_name: staffRow.full_name,
    staff_row: staffRow,
  };
}

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get('branch_id') ?? profile.branch_id;
  const shiftId = searchParams.get('shift_id');
  if (!branchId) return NextResponse.json({ error: 'Branch required' }, { status: 400 });

  const supabase = await createClient();
  const db = supabase as any;

  try {
    await assertCanAccessPosBranch(supabase, profile, branchId);

    const [shift, availableStaff] = await Promise.all([
      getOpenShift(db, branchId, shiftId),
      loadAvailableStaff(db, branchId),
    ]);

    if (!shift) {
      return NextResponse.json({ shift: null, members: [], availableStaff });
    }

    const { data, error } = await db
      .from('pos_shift_staff_members')
      .select('*')
      .eq('shift_id', shift.id)
      .order('started_at', { ascending: true });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      shift,
      members: data ?? [],
      availableStaff,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal memuatkan staf syif' },
      { status: posAccessErrorStatus(err, 400) }
    );
  }
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const branchId = body.branch_id ? String(body.branch_id) : profile.branch_id;
  const shiftId = body.shift_id ? String(body.shift_id) : null;
  if (!branchId) return NextResponse.json({ error: 'Branch required' }, { status: 400 });

  const supabase = await createClient();
  const db = supabase as any;

  try {
    await assertCanAccessPosBranch(supabase, profile, branchId);

    const shift = await getOpenShift(db, branchId, shiftId);
    if (!shift) return NextResponse.json({ error: 'Syif POS terbuka tidak dijumpai' }, { status: 400 });

    const identity = await resolveMemberIdentity(db, profile, body, branchId);
    const startedAt = validIsoOrNow(body.started_at);
    const roleInShift = cleanRole(body.role_in_shift);
    const isApprovedNow = canApprovePosShiftStaff(profile.role);
    const nextStatus = isApprovedNow ? 'ACTIVE' : 'PENDING_APPROVAL';

    if (identity.profile_id || identity.staff_id) {
      let existingQuery = db
        .from('pos_shift_staff_members')
        .select('*')
        .eq('shift_id', shift.id)
        .in('status', ['ACTIVE', 'PENDING_APPROVAL'])
        .limit(1);

      if (identity.profile_id) {
        existingQuery = existingQuery.eq('profile_id', identity.profile_id);
      } else if (identity.staff_id) {
        existingQuery = existingQuery.eq('staff_id', identity.staff_id);
      }

      const { data: existing, error: existingError } = await existingQuery.maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (existing) {
        return NextResponse.json({
          member: existing,
          alreadyActive: existing.status === 'ACTIVE',
          requiresApproval: existing.status === 'PENDING_APPROVAL',
        });
      }
    }

    const { data, error } = await db
      .from('pos_shift_staff_members')
      .insert({
        organization_id: shift.organization_id,
        branch_id: shift.branch_id,
        shift_id: shift.id,
        profile_id: identity.profile_id,
        staff_id: identity.staff_id,
        full_name: identity.full_name,
        role_in_shift: roleInShift,
        status: nextStatus,
        started_at: startedAt,
        started_by: profile.id,
        approved_by: isApprovedNow ? profile.id : null,
        approved_at: isApprovedNow ? new Date().toISOString() : null,
        approval_notes: isApprovedNow ? 'Diluluskan terus oleh AM/ke atas.' : null,
        notes: body.notes ? String(body.notes) : null,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    if (data?.status === 'PENDING_APPROVAL') {
      const { error: approvalError } = await db.from('approval_requests').insert({
        organization_id: shift.organization_id,
        entity_type: 'POS_SHIFT_STAFF',
        entity_id: data.id,
        title: 'Kelulusan staf masuk syif POS',
        description: `${identity.full_name} perlu kelulusan AM/ke atas sebelum rekod staf syif POS menjadi rasmi.`,
        status: 'PENDING',
        requested_by: profile.id,
        branch_id: shift.branch_id,
        metadata: {
          workflow: 'POS_SHIFT_STAFF_APPROVAL',
          shift_id: shift.id,
          shift_number: shift.shift_number,
          staff_id: identity.staff_id,
          profile_id: identity.profile_id,
          role_in_shift: roleInShift,
        },
      });

      if (approvalError) {
        console.warn('POS shift staff approval request failed', approvalError.message);
      }
    }

    return NextResponse.json({ member: data, requiresApproval: data?.status === 'PENDING_APPROVAL' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal masuk staf syif' },
      { status: posAccessErrorStatus(err, 400) }
    );
  }
}

export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const memberId = body.member_id ? String(body.member_id) : '';
  if (!memberId) return NextResponse.json({ error: 'member_id required' }, { status: 400 });
  const action = String(body.action ?? 'end');

  const supabase = await createClient();
  const db = supabase as any;

  try {
    const { data: member, error: memberError } = await db
      .from('pos_shift_staff_members')
      .select('*')
      .eq('id', memberId)
      .maybeSingle();

    if (memberError) throw new Error(memberError.message);
    if (!member) return NextResponse.json({ error: 'Rekod staf syif tidak dijumpai' }, { status: 404 });
    await assertCanAccessPosBranch(supabase, profile, member.branch_id);

    if (action === 'approve') {
      if (!canApprovePosShiftStaff(profile.role)) {
        return NextResponse.json(
          { error: 'Kelulusan staf syif hanya boleh dibuat oleh AM dan ke atas.' },
          { status: 403 }
        );
      }
      if (member.status === 'ACTIVE') return NextResponse.json({ member });
      if (member.status !== 'PENDING_APPROVAL') {
        return NextResponse.json({ error: 'Rekod ini bukan dalam status menunggu kelulusan' }, { status: 400 });
      }

      const { data, error } = await db
        .from('pos_shift_staff_members')
        .update({
          status: 'ACTIVE',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          approval_notes: body.notes ? String(body.notes) : 'Diluluskan oleh AM/ke atas.',
        })
        .eq('id', memberId)
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      await db
        .from('approval_requests')
        .update({
          status: 'APPROVED',
          approved_by: profile.id,
          resolved_at: new Date().toISOString(),
          metadata: {
            workflow: 'POS_SHIFT_STAFF_APPROVAL',
            approved_from_pos_summary: true,
            approved_member_id: memberId,
          },
        })
        .eq('entity_type', 'POS_SHIFT_STAFF')
        .eq('entity_id', memberId)
        .eq('status', 'PENDING');

      return NextResponse.json({ member: data });
    }

    if (action === 'reject') {
      if (!canApprovePosShiftStaff(profile.role)) {
        return NextResponse.json(
          { error: 'Penolakan staf syif hanya boleh dibuat oleh AM dan ke atas.' },
          { status: 403 }
        );
      }

      const { data, error } = await db
        .from('pos_shift_staff_members')
        .update({
          status: 'REJECTED',
          ended_at: new Date().toISOString(),
          ended_by: profile.id,
          approval_notes: body.notes ? String(body.notes) : 'Ditolak oleh AM/ke atas.',
        })
        .eq('id', memberId)
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      await db
        .from('approval_requests')
        .update({
          status: 'REJECTED',
          rejected_by: profile.id,
          resolved_at: new Date().toISOString(),
          rejection_reason: body.notes ? String(body.notes) : 'Ditolak melalui ringkasan POS.',
        })
        .eq('entity_type', 'POS_SHIFT_STAFF')
        .eq('entity_id', memberId)
        .eq('status', 'PENDING');

      return NextResponse.json({ member: data });
    }

    if (member.status === 'ENDED') return NextResponse.json({ member });
    if (member.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Hanya rekod staf syif yang sudah diluluskan boleh ditamatkan tugas.' },
        { status: 400 }
      );
    }

    const endedAt = validIsoOrNow(body.ended_at);
    const { data, error } = await db
      .from('pos_shift_staff_members')
      .update({
        status: 'ENDED',
        ended_at: endedAt,
        ended_by: profile.id,
        notes: body.notes ? String(body.notes) : member.notes,
      })
      .eq('id', memberId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ member: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal tamatkan tugas staf' },
      { status: posAccessErrorStatus(err, 400) }
    );
  }
}
