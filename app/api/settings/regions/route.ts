import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { jsonWithPrivateCache } from '@/lib/http/cache';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data, error } = await supabase.from('regions').select('id, code, name, manager_name, status').eq('organization_id', profile.organization_id).order('code');

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return jsonWithPrivateCache({ regions: data ?? [] }, 120, 300);
}
