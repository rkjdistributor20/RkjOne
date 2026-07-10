import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import type { MalaysiaHoliday, OrgStockPlanningSettings } from '@/types/database';
import {
 assertStockPlanningEditor,
 assertStockPlanningViewer,
} from '@/lib/settings/stock-planning-access';
import { jsonWithPrivateCache } from '@/lib/http/cache';

const DEFAULTS = {
 stock_coverage_days: 1,
 safety_buffer_pcs: 10,
};

type PlanningRow = Pick<
 OrgStockPlanningSettings,
 'stock_coverage_days' | 'safety_buffer_pcs' | 'updated_at'
>;

type HolidayRow = Pick<
 MalaysiaHoliday,
 'holiday_date' | 'name' | 'holiday_type' | 'demand_multiplier'
>;

export async function GET() {
 try {
 const profile = assertStockPlanningViewer(await getCurrentProfile());
 const supabase = await createClient();

 const { data: settingsRow, error } = await supabase.from('org_stock_planning_settings').select('stock_coverage_days, safety_buffer_pcs, updated_at').eq('organization_id', profile.organization_id).maybeSingle();

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }

 const settings = settingsRow as PlanningRow | null;

 const today = new Date().toISOString().slice(0, 10);
 const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

 const { data: holidaysRow, error: holErr } = await supabase.from('malaysia_holidays').select('holiday_date, name, holiday_type, demand_multiplier').gte('holiday_date', today).lte('holiday_date', in90).order('holiday_date').limit(12);

 if (holErr) {
 return NextResponse.json({ error: holErr.message }, { status: 500 });
 }

 const holidays = (holidaysRow ?? []) as HolidayRow[];

 return jsonWithPrivateCache({
 settings: {
 stock_coverage_days: settings?.stock_coverage_days ?? DEFAULTS.stock_coverage_days,
 safety_buffer_pcs: settings?.safety_buffer_pcs ?? DEFAULTS.safety_buffer_pcs,
 updated_at: settings?.updated_at ?? null,
 },
 upcoming_holidays: holidays ?? [],
 can_edit: ['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER'].includes(profile.role),
 }, 60, 180);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}

export async function PATCH(request: Request) {
 try {
 const profile = assertStockPlanningEditor(await getCurrentProfile());
 const body = (await request.json()) as {
 stock_coverage_days?: number;
 safety_buffer_pcs?: number;
 };

 const coverage = body.stock_coverage_days;
 const buffer = body.safety_buffer_pcs;

 if (coverage != null && (!Number.isInteger(coverage) || coverage < 0 || coverage > 7)) {
 return NextResponse.json(
 { error: 'Hari coverage mesti 0-7' },
 { status: 400 });
 }

 if (buffer != null && (typeof buffer !== 'number' || buffer < 0 || buffer > 200)) {
 return NextResponse.json(
 { error: 'Buffer keselamatan mesti 0-200 pcs' },
 { status: 400 });
 }

 if (coverage == null && buffer == null) {
 return NextResponse.json({ error: 'Tiada medan untuk dikemaskini' }, { status: 400 });
 }

 const supabase = await createClient();

 const { data: existing } = await supabase.from('org_stock_planning_settings').select('stock_coverage_days, safety_buffer_pcs').eq('organization_id', profile.organization_id).maybeSingle();

 const existingRow = existing as Pick<
 OrgStockPlanningSettings,
 'stock_coverage_days' | 'safety_buffer_pcs'
 > | null;

 const payload: OrgStockPlanningSettings = {
 organization_id: profile.organization_id,
 stock_coverage_days: coverage ?? existingRow?.stock_coverage_days ?? DEFAULTS.stock_coverage_days,
 safety_buffer_pcs: buffer ?? existingRow?.safety_buffer_pcs ?? DEFAULTS.safety_buffer_pcs,
 updated_at: new Date().toISOString(),
 };

 const { data: savedRow, error } = await (supabase as SupabaseClient).from('org_stock_planning_settings').upsert(payload, { onConflict: 'organization_id' }).select('stock_coverage_days, safety_buffer_pcs, updated_at').single();

 if (error) {
 return NextResponse.json({ error: error.message }, { status: 400 });
 }

 return NextResponse.json({ settings: savedRow as PlanningRow });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }
}
