import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const supabase = await createClient();
 const { data, error } = await supabase.from('payroll_rules').select('id, rule_code, worker_type, component, rate, period, shift_hours, status, notes').eq('organization_id', profile.organization_id).order('rule_code');

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 return NextResponse.json({ rules: data ?? [] });
}
