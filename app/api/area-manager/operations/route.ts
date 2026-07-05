import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { applyBranchIdsFilter, resolveScopedBranches } from '@/lib/auth/branch-scope';

const MANAGER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER']);
const EVENT_TYPES = new Set(['SPRING_CLEANING', 'HIGHWAY_MEETING']);
const EVENT_STATUS = new Set(['PLANNED', 'DONE', 'CANCELLED']);

type BranchOption = {
 id: string;
 branch_code: string;
 branch_name: string;
 region_id: string | null;
 status: string;
};

type OperationEventRow = {
 id: string;
 event_type: 'SPRING_CLEANING' | 'HIGHWAY_MEETING';
 title: string;
 scheduled_date: string;
 scheduled_time: string | null;
 branch_ids: string[];
 highway_party: string | null;
 status: 'PLANNED' | 'DONE' | 'CANCELLED';
 notes: string | null;
 completed_at: string | null;
 created_at: string;
 updated_at: string;
};

function assertManager(role: string) {
 if (!MANAGER_ROLES.has(role)) {
 throw new Error('Hanya AM/OM/HQ boleh urus perancangan operasi kawasan');
 }
}

function normalizeBranchIds(value: unknown) {
 if (!Array.isArray(value)) return [];
 return [...new Set(value.map(String).filter(Boolean))];
}

function assertBranchScope(branchIds: string[], allowedBranchIds: string[] | null) {
 if (!branchIds.length) throw new Error('Pilih sekurang-kurangnya satu cawangan');
 if (allowedBranchIds === null) return;
 const allowed = new Set(allowedBranchIds);
 const outside = branchIds.filter((id) => !allowed.has(id));
 if (outside.length) throw new Error('Cawangan dipilih berada di luar kawasan anda');
}

function eventLabel(type: string) {
 if (type === 'SPRING_CLEANING') return 'Spring Cleaning Bulanan';
 if (type === 'HIGHWAY_MEETING') return 'Meeting Pengurusan Highway';
 return 'Tugasan Operasi';
}

function decorateEvents(events: OperationEventRow[], branches: BranchOption[]) {
 const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
 return events.map((event) => ({
 ...event,
 branches: event.branch_ids.map((id) => branchMap.get(id)).filter(Boolean),
 branch_count: event.branch_ids.length,
 }));
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 try {
 assertManager(profile.role);
 const supabase = await createClient();
 const db = supabase as any;
 const scope = await resolveScopedBranches(supabase, profile);

 let branchesQuery = supabase
 .from('branches')
 .select('id, branch_code, branch_name, region_id, status')
 .eq('organization_id', profile.organization_id)
 .order('branch_code');

 branchesQuery = applyBranchIdsFilter(branchesQuery, 'id', scope.branchIds);

 let eventsQuery = db
 .from('area_manager_operation_events')
 .select('id, event_type, title, scheduled_date, scheduled_time, branch_ids, highway_party, status, notes, completed_at, created_at, updated_at')
 .eq('organization_id', profile.organization_id)
 .order('scheduled_date', { ascending: false })
 .limit(30);

 if (scope.branchIds !== null) {
 eventsQuery = eventsQuery.overlaps('branch_ids', scope.branchIds);
 }

 const [branchesRes, eventsRes] = await Promise.all([branchesQuery, eventsQuery]);

 if (branchesRes.error) throw new Error(branchesRes.error.message);
 if (eventsRes.error) throw new Error(eventsRes.error.message);

 const branches = (branchesRes.data ?? []) as BranchOption[];
 const events = (eventsRes.data ?? []) as OperationEventRow[];

 return NextResponse.json({
 branches,
 events: decorateEvents(events, branches),
 });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal memuatkan perancangan operasi AM' },
 { status: 400 });
 }
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 try {
 assertManager(profile.role);
 const body = await request.json();
 const eventType = String(body.event_type ?? '').toUpperCase();
 if (!EVENT_TYPES.has(eventType)) throw new Error('Jenis tugasan operasi tidak sah');
 if (!body.scheduled_date) throw new Error('Tarikh jadual diperlukan');

 const branchIds = normalizeBranchIds(body.branch_ids);
 const supabase = await createClient();
 const db = supabase as any;
 const scope = await resolveScopedBranches(supabase, profile);
 assertBranchScope(branchIds, scope.branchIds);

 const { data, error } = await db
 .from('area_manager_operation_events')
 .insert({
 organization_id: profile.organization_id,
 region_id: profile.region_id ?? null,
 event_type: eventType,
 title: String(body.title ?? '').trim() || eventLabel(eventType),
 scheduled_date: body.scheduled_date,
 scheduled_time: body.scheduled_time || null,
 branch_ids: branchIds,
 highway_party: eventType === 'HIGHWAY_MEETING' ? String(body.highway_party ?? '').trim() || null : null,
 notes: String(body.notes ?? '').trim() || null,
 created_by: profile.id,
 updated_by: profile.id,
 })
 .select('id, event_type, title, scheduled_date, scheduled_time, branch_ids, highway_party, status, notes, completed_at, created_at, updated_at')
 .single();

 if (error) throw new Error(error.message);
 return NextResponse.json({ event: data });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal cipta perancangan operasi AM' },
 { status: 400 });
 }
}

export async function PATCH(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 try {
 assertManager(profile.role);
 const body = await request.json();
 const id = String(body.id ?? '');
 const status = String(body.status ?? '').toUpperCase();
 if (!id) throw new Error('ID tugasan diperlukan');
 if (!EVENT_STATUS.has(status)) throw new Error('Status tugasan tidak sah');

 const supabase = await createClient();
 const db = supabase as any;
 const scope = await resolveScopedBranches(supabase, profile);

 const { data: existing, error: existingError } = await db
 .from('area_manager_operation_events')
 .select('id, branch_ids')
 .eq('organization_id', profile.organization_id)
 .eq('id', id)
 .single();

 if (existingError) throw new Error(existingError.message);
 assertBranchScope(((existing as { branch_ids?: string[] })?.branch_ids ?? []), scope.branchIds);

 const { data, error } = await db
 .from('area_manager_operation_events')
 .update({
 status,
 updated_by: profile.id,
 completed_at: status === 'DONE' ? new Date().toISOString() : null,
 })
 .eq('id', id)
 .select('id, event_type, title, scheduled_date, scheduled_time, branch_ids, highway_party, status, notes, completed_at, created_at, updated_at')
 .single();

 if (error) throw new Error(error.message);
 return NextResponse.json({ event: data });
 } catch (err) {
 return NextResponse.json(
 { error: err instanceof Error ? err.message : 'Gagal kemaskini tugasan operasi AM' },
 { status: 400 });
 }
}
