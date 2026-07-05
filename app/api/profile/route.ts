import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { PROFILE_SELECT } from '@/lib/profile/fields';
import {
 buildProfileUpdates,
 completionTimestamp,
 serializeProfileMe,
} from '@/lib/profile/serialize';

async function loadStaffForProfile(supabase: SupabaseClient, profileId: string) {
 const { data } = await supabase.from('staff').select(`
 staff_code, worker_type, bank_name, account_number, account_holder,
 legal_entity:legal_entities(code, name, legal_name, scope, office_address, phone, email, registration_no, tax_id, bank_name, bank_account_name, bank_account_no)
 `).eq('profile_id', profileId).maybeSingle();
 return data as Record<string, unknown> | null;
}

async function fetchProfileRow(supabase: SupabaseClient, profileId: string) {
 const { data, error } = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', profileId).single();
 if (error) throw new Error(error.message);
 return data as Record<string, unknown>;
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 try {
 const [row, staff] = await Promise.all([
 fetchProfileRow(supabase as SupabaseClient, profile.id),
 loadStaffForProfile(supabase as SupabaseClient, profile.id),
 ]);
 return NextResponse.json({ profile: serializeProfileMe(row, staff) });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal muat profil' },
 { status: 400 });
 }
}

export async function PATCH(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 const { updates, error: buildError } = buildProfileUpdates(body);
 if (buildError) return NextResponse.json({ error: buildError }, { status: 400 });
 if (Object.keys(updates).length === 0) {
 return NextResponse.json({ error: 'Tiada perubahan' }, { status: 400 });
 }

 const supabase = await createClient();
 const { data: patched, error } = await (supabase as SupabaseClient).from('profiles').update(updates).eq('id', profile.id).select(PROFILE_SELECT).single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });

 const row = patched as Record<string, unknown>;
 const completedAt = completionTimestamp(row);
 if (completedAt && !row.profile_completed_at) {
 await (supabase as SupabaseClient).from('profiles').update({ profile_completed_at: completedAt }).eq('id', profile.id);
 row.profile_completed_at = completedAt;
 } else if (!completedAt && row.profile_completed_at) {
 await (supabase as SupabaseClient).from('profiles').update({ profile_completed_at: null }).eq('id', profile.id);
 row.profile_completed_at = null;
 }

 const staff = await loadStaffForProfile(supabase as SupabaseClient, profile.id);
 return NextResponse.json({ profile: serializeProfileMe(row, staff) });
}
