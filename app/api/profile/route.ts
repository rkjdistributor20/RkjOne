import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { profileNeedsAvatar } from '@/lib/profile/requirements';

function serializeProfile(row: Record<string, unknown>) {
  const branch = row.branch as { branch_code: string; branch_name: string } | null;
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    avatar_url: row.avatar_url,
    role: row.role,
    employee_code: row.employee_code,
    must_change_password: row.must_change_password,
    needs_avatar: profileNeedsAvatar(row as { avatar_url: string | null }),
    branch,
  };
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ profile: serializeProfile(profile as unknown as Record<string, unknown>) });
}

export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const fullName = body.full_name != null ? String(body.full_name).trim() : undefined;
  const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : undefined;

  if (fullName !== undefined && fullName.length < 2) {
    return NextResponse.json({ error: 'Nama mesti sekurang-kurangnya 2 aksara' }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};
  if (fullName !== undefined) updates.full_name = fullName;
  if (phone !== undefined) updates.phone = phone;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Tiada perubahan' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await (supabase as SupabaseClient)
    .from('profiles')
    .update(updates)
    .eq('id', profile.id)
    .select(
      `
      id, full_name, email, phone, avatar_url, role, employee_code, must_change_password,
      branch:branches(branch_code, branch_name)
    `
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ profile: serializeProfile(data as Record<string, unknown>) });
}
