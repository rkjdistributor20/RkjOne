import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createClient } from '@/lib/supabase/server';

type Context = { params: Promise<{ id: string }> };

const BOOKING_STATUS = new Set(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']);
const BOOKING_PRIORITY = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const MANAGER_ROLES = new Set([
 'SUPER_ADMIN',
 'ADMIN',
 'OPERATION_MANAGER',
 'HR',
 'FINANCE',
 'CEO_FACTORY',
 'MAINTENANCE_MANAGER',
 'AREA_MANAGER',
]);

const BOOKING_SELECT = `
 id, booking_number, booking_type, status, priority, title, description,
 customer_name, customer_phone, customer_email, scheduled_date, scheduled_time,
 expected_pax, source, notes, metadata, confirmed_at, cancelled_at, completed_at,
 created_at, updated_at,
 branch:branches(id, branch_code, branch_name),
 creator:profiles!bookings_created_by_fkey(full_name, role),
 assignee:profiles!bookings_assigned_to_fkey(full_name, role)
`;

function cleanString(value: unknown, max = 255) {
 if (typeof value !== 'string') return null;
 const text = value.trim();
 if (!text) return null;
 return text.slice(0, max);
}

function normalizeEnum(value: unknown, allowed: Set<string>) {
 if (typeof value !== 'string') return null;
 const normalized = value.trim().toUpperCase();
 return allowed.has(normalized) ? normalized : null;
}

function asMetadata(value: unknown) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 return value as Record<string, unknown>;
}

function canManageBooking(role: string) {
 return MANAGER_ROLES.has(role);
}

export async function GET(_request: Request, context: Context) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { id } = await context.params;
 const supabase = await createClient();
 const { data, error } = await (supabase as SupabaseClient)
  .from('bookings' as never)
  .select(BOOKING_SELECT)
  .eq('id', id)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();

 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 if (!data) return NextResponse.json({ error: 'Booking tidak dijumpai' }, { status: 404 });

 return NextResponse.json({ booking: data });
}

export async function PATCH(request: Request, context: Context) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { id } = await context.params;
 const body = await request.json().catch(() => ({}));
 const supabase = await createClient();

 const { data: existing, error: loadError } = await (supabase as SupabaseClient)
  .from('bookings' as never)
  .select('id, organization_id, branch_id, created_by, status')
  .eq('id', id)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();

 if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
 if (!existing) return NextResponse.json({ error: 'Booking tidak dijumpai' }, { status: 404 });

 const existingRow = existing as {
  branch_id: string | null;
  created_by: string | null;
  status: string;
 };
 const manager = canManageBooking(profile.role);
 const creatorCanEdit = existingRow.created_by === profile.id && ['PENDING', 'CONFIRMED'].includes(existingRow.status);
 if (!manager && !creatorCanEdit) {
  return NextResponse.json({ error: 'Tiada akses kemaskini booking' }, { status: 403 });
 }

 const nextBranchId = body.branch_id === undefined ? existingRow.branch_id : cleanString(body.branch_id);
 try {
  await resolveScopedBranches(supabase as SupabaseClient, profile, nextBranchId);
 } catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Cawangan tidak sah' }, { status: 403 });
 }

 const update: Record<string, unknown> = {};
 const status = normalizeEnum(body.status, BOOKING_STATUS);
 const priority = normalizeEnum(body.priority, BOOKING_PRIORITY);
 const metadata = asMetadata(body.metadata);

 if (body.branch_id !== undefined) update.branch_id = nextBranchId;
 if (body.assigned_to !== undefined) update.assigned_to = cleanString(body.assigned_to);
 if (status) update.status = status;
 if (priority) update.priority = priority;
 if (body.title !== undefined) update.title = cleanString(body.title, 180);
 if (body.description !== undefined) update.description = cleanString(body.description, 2000);
 if (body.customer_name !== undefined) update.customer_name = cleanString(body.customer_name);
 if (body.customer_phone !== undefined) update.customer_phone = cleanString(body.customer_phone, 60);
 if (body.customer_email !== undefined) update.customer_email = cleanString(body.customer_email);
 if (body.scheduled_date !== undefined) update.scheduled_date = cleanString(body.scheduled_date, 20);
 if (body.scheduled_time !== undefined) update.scheduled_time = cleanString(body.scheduled_time, 20);
 if (body.expected_pax !== undefined) {
  const expectedPax = Number(body.expected_pax);
  update.expected_pax = Number.isFinite(expectedPax) && expectedPax >= 0 ? Math.trunc(expectedPax) : null;
 }
 if (body.notes !== undefined) update.notes = cleanString(body.notes, 2000);
 if (metadata) update.metadata = metadata;

 if (update.title === null) return NextResponse.json({ error: 'Tajuk booking tidak boleh kosong' }, { status: 400 });
 if (update.scheduled_date === null) return NextResponse.json({ error: 'Tarikh booking tidak boleh kosong' }, { status: 400 });

 const now = new Date().toISOString();
 if (status === 'CONFIRMED') update.confirmed_at = now;
 if (status === 'CANCELLED') update.cancelled_at = now;
 if (status === 'COMPLETED') update.completed_at = now;

 if (Object.keys(update).length === 0) {
  return NextResponse.json({ error: 'Tiada perubahan untuk disimpan' }, { status: 400 });
 }

 const { data, error } = await (supabase as SupabaseClient)
  .from('bookings' as never)
  .update(update as never)
  .eq('id', id)
  .eq('organization_id', profile.organization_id)
  .select(BOOKING_SELECT)
  .single();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });

 return NextResponse.json({ booking: data });
}
