import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { jsonWithPrivateCache } from '@/lib/http/cache';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data } = await supabase.from('vehicles').select('id, vehicle_code, vehicle_type').eq('organization_id', profile.organization_id).eq('status', 'ACTIVE');

 return jsonWithPrivateCache({ vehicles: data ?? [] }, 60, 180);
}
