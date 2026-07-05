import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { PROFILE_SELECT } from '@/lib/profile/fields';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@/lib/profile/requirements';
import { completionTimestamp, serializeProfileMe } from '@/lib/profile/serialize';

const BUCKET = 'profile-avatars';

function extForMime(mime: string): string {
 if (mime === 'image/png') return 'png';
 if (mime === 'image/webp') return 'webp';
 return 'jpg';
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
 { status: 400 });
 }

 if (file.size > AVATAR_MAX_BYTES) {
 return NextResponse.json({ error: 'Saiz gambar maksimum 5 MB' }, { status: 400 });
 }

 const supabase = await createClient();
 const ext = extForMime(file.type);
 const objectPath = `${profile.id}/avatar.${ext}`;
 const buffer = Buffer.from(await file.arrayBuffer());

 const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, {
 upsert: true,
 contentType: file.type,
 cacheControl: '3600',
 });

 if (uploadErr) {
 return NextResponse.json({ error: uploadErr.message }, { status: 400 });
 }

 const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
 const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;

 const { data, error } = await (supabase as SupabaseClient).from('profiles').update({ avatar_url: avatarUrl }).eq('id', profile.id).select(PROFILE_SELECT).single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });

 const row = data as Record<string, unknown>;
 const completedAt = completionTimestamp(row);
 if (completedAt && !row.profile_completed_at) {
 await (supabase as SupabaseClient).from('profiles').update({ profile_completed_at: completedAt }).eq('id', profile.id);
 row.profile_completed_at = completedAt;
 }

 const { data: staff } = await (supabase as SupabaseClient).from('staff').select('staff_code, worker_type, bank_name, account_number, account_holder').eq('profile_id', profile.id).maybeSingle();

 return NextResponse.json({
 profile: serializeProfileMe(row, staff as Record<string, unknown> | null),
 });
}
