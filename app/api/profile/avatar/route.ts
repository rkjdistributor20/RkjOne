import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, profileNeedsAvatar } from '@/lib/profile/requirements';

const BUCKET = 'profile-avatars';

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

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

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Fail gambar diperlukan' }, { status: 400 });
  }

  if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
    return NextResponse.json(
      { error: 'Format JPG, PNG atau WebP sahaja' },
      { status: 400 }
    );
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json({ error: 'Saiz gambar maksimum 5 MB' }, { status: 400 });
  }

  const supabase = await createClient();
  const ext = extForMime(file.type);
  const objectPath = `${profile.id}/avatar.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buffer, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 400 });
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;

  const { data, error } = await (supabase as SupabaseClient)
    .from('profiles')
    .update({ avatar_url: avatarUrl })
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
