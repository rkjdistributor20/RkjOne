import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { canManageFactorySchedule } from '@/lib/auth/stock-access';
import { inventoryRpc } from '@/lib/supabase/inventory-rpc';
import { mondayForProductionDate, normalizeProductionWeekStart } from '@/lib/production/week-utils';

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 const rawWeekStart = new URL(request.url).searchParams.get('week_start');
 const weekStart = rawWeekStart ? normalizeProductionWeekStart(rawWeekStart) : null;
 if (!weekStart) {
 return NextResponse.json({ error: 'week_start diperlukan' }, { status: 400 });
 }

 const supabase = await createClient();
 const { data: weekRow, error: weekErr } = await supabase.from('factory_production_weeks').select('id, week_start, status, notes, published_at').eq('organization_id', profile.organization_id).eq('week_start', weekStart).maybeSingle();

 if (weekErr) {
 return NextResponse.json({ error: weekErr.message }, { status: 500 });
 }

 const week = weekRow as {
 id: string;
 week_start: string;
 status: string;
 notes: string | null;
 published_at: string | null;
 } | null;

 if (!week) {
 return NextResponse.json({ week: null });
 }

 const { data: days, error: daysErr } = await supabase.from('factory_production_days').select('production_date').eq('week_id', week.id).order('production_date');

 if (daysErr) {
 return NextResponse.json({ error: daysErr.message }, { status: 500 });
 }

 return NextResponse.json({
 week: {...week,
  days: (days ?? []).map(
 (d) => d.production_date),
 },
 });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
 return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 if (!canManageFactorySchedule(profile.role)) {
 return NextResponse.json(
 { error: 'Hanya kilang/HQ pentadbir boleh urus jadual production' },
 { status: 403 });
 }

 const body = await request.json();
 const supabase = await createClient();
 const productionDates = Array.isArray(body.production_dates)
 ? [...body.production_dates].filter((d): d is string => typeof d === 'string').sort()
 : [];
 const rawWeekStart = typeof body.week_start === 'string' ? body.week_start : '';
 if (!productionDates[0] && !rawWeekStart) {
 return NextResponse.json({ error: 'week_start diperlukan' }, { status: 400 });
 }
 const weekStart = productionDates[0]
 ? mondayForProductionDate(productionDates[0])
 : normalizeProductionWeekStart(rawWeekStart);

 const { data, error } = await inventoryRpc(supabase, 'upsert_factory_production_week', {
 p_week_start: weekStart,
 p_production_dates: productionDates,
 p_notes: body.notes ?? null,
 p_publish: body.publish ?? false,
 });

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 return NextResponse.json({ result: data });
}
