import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import {
 getOrCreateRosterPlan,
 loadRosterPlanWithEntries,
 saveRosterEntries,
} from '@/lib/roster/queries';
import type { RosterEntryInput } from '@/lib/roster/types';

const MANAGER_ROLES = new Set([
 'SUPER_ADMIN',
 'ADMIN',
 'OPERATION_MANAGER',
 'AREA_MANAGER',
]);

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { searchParams } = new URL(request.url);
 const branchId = searchParams.get('branch_id');
 const weekStart = searchParams.get('week_start');

 if (!branchId || !weekStart) {
 return NextResponse.json({ error: 'branch_id dan week_start diperlukan' }, { status: 400 });
 }

 const supabase = await createClient();
 try {
 await resolveScopedBranches(supabase, profile, branchId);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 const plan = await getOrCreateRosterPlan(
 supabase,
 profile.organization_id,
 branchId,
 weekStart,
 profile.id);

 const full = await loadRosterPlanWithEntries(supabase, plan.id);
 return NextResponse.json({ plan: full });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 if (!MANAGER_ROLES.has(profile.role)) {
 return NextResponse.json({ error: 'Hanya pengurus boleh edit jadual' }, { status: 403 });
 }

 const body = await request.json();
 const branchId = body.branch_id as string;
 const weekStart = body.week_start as string;
 const entries = (body.entries ?? []) as RosterEntryInput[];

 if (!branchId || !weekStart) {
 return NextResponse.json({ error: 'branch_id dan week_start diperlukan' }, { status: 400 });
 }

 const supabase = await createClient();
 try {
 await resolveScopedBranches(supabase, profile, branchId);
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Forbidden' },
 { status: 403 });
 }

 try {
 const plan = await getOrCreateRosterPlan(
 supabase,
 profile.organization_id,
 branchId,
 weekStart,
 profile.id);
 await saveRosterEntries(supabase, plan.id, entries);
 const full = await loadRosterPlanWithEntries(supabase, plan.id);
 return NextResponse.json({ plan: full });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal simpan' },
 { status: 400 });
 }
}
