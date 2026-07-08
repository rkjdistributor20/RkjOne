import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
 BOOKING_PRIORITY_VALUES,
 BOOKING_STATUS_VALUES,
 bookingValidationResponse,
 cleanString,
 isTerminalBookingStatus,
 parseDateValue,
 parseEnumValue,
 parseExpectedPax,
 parseMetadata,
 parseTimeValue,
 validateBookingStatusTransition,
 type BookingStatusValue,
} from '@/lib/bookings/validation';

type Context = { params: Promise<{ id: string }> };

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

function canManageBooking(role: string) {
 return MANAGER_ROLES.has(role);
}

async function resolveAssignee(
 profile: { id: string; organization_id: string; role: string },
 value: unknown) {
 const assignedTo = cleanString(value);
 if (!assignedTo) return null;
 if (assignedTo === profile.id) return assignedTo;

 if (!canManageBooking(profile.role)) {
 throw new Error('Tiada akses tugaskan booking kepada pengguna lain');
 }

 const service = await createServiceClient();
 const { data: assignee } = await (service as SupabaseClient)
 .from('profiles')
 .select('id')
 .eq('id', assignedTo)
 .eq('organization_id', profile.organization_id)
 .eq('status', 'ACTIVE')
 .maybeSingle();

 if (!assignee) {
 throw new Error('Pengguna tugasan tidak sah');
 }

 return assignedTo;
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
  .select('id, organization_id, branch_id, created_by, status, confirmed_at, cancelled_at, completed_at')
  .eq('id', id)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();

 if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
 if (!existing) return NextResponse.json({ error: 'Booking tidak dijumpai' }, { status: 404 });

 const existingRow = existing as {
  branch_id: string | null;
  created_by: string | null;
  status: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
 };
 const manager = canManageBooking(profile.role);
 const creatorCanEdit = existingRow.created_by === profile.id && ['PENDING', 'CONFIRMED'].includes(existingRow.status);
 if (!manager && !creatorCanEdit) {
  return NextResponse.json({ error: 'Tiada akses kemaskini booking' }, { status: 403 });
 }

 if (isTerminalBookingStatus(existingRow.status)) {
  return NextResponse.json({ error: 'Booking terminal tidak boleh dikemaskini' }, { status: 403 });
 }

 const nextBranchId = body.branch_id === undefined ? existingRow.branch_id : cleanString(body.branch_id);
 let scope;
 try {
  scope = await resolveScopedBranches(supabase as SupabaseClient, profile, nextBranchId);
 } catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Cawangan tidak sah' }, { status: 403 });
 }

 const update: Record<string, unknown> = {};
 let status: BookingStatusValue | null = null;
 let priority: string | null = null;
 let metadata: Record<string, unknown> | null = null;
 try {
  status = body.status === undefined
   ? null
   : parseEnumValue('status', body.status, BOOKING_STATUS_VALUES);
  priority = body.priority === undefined
   ? null
   : parseEnumValue('priority', body.priority, BOOKING_PRIORITY_VALUES);
  metadata = parseMetadata(body.metadata, null);
 } catch (error) {
  const validation = bookingValidationResponse(error);
  if (validation) return NextResponse.json(validation.body, { status: validation.status });
  return NextResponse.json({ error: 'Input booking tidak sah' }, { status: 400 });
 }

 if (body.branch_id !== undefined) update.branch_id = nextBranchId ?? scope.branchId;
 if (body.assigned_to !== undefined) {
  try {
   update.assigned_to = await resolveAssignee(profile, body.assigned_to);
  } catch (error) {
   return NextResponse.json({ error: error instanceof Error ? error.message : 'Pengguna tugasan tidak sah' }, { status: 403 });
  }
 }
 if (status) update.status = status;
 if (priority) update.priority = priority;
 if (body.title !== undefined) update.title = cleanString(body.title, 180);
 if (body.description !== undefined) update.description = cleanString(body.description, 2000);
 if (body.customer_name !== undefined) update.customer_name = cleanString(body.customer_name);
 if (body.customer_phone !== undefined) update.customer_phone = cleanString(body.customer_phone, 60);
 if (body.customer_email !== undefined) update.customer_email = cleanString(body.customer_email);
 try {
  if (body.scheduled_date !== undefined) update.scheduled_date = parseDateValue('Tarikh booking', body.scheduled_date);
  if (body.scheduled_time !== undefined) update.scheduled_time = parseTimeValue('Masa booking', body.scheduled_time);
  if (body.expected_pax !== undefined) update.expected_pax = parseExpectedPax(body.expected_pax);
 } catch (error) {
  const validation = bookingValidationResponse(error);
  if (validation) return NextResponse.json(validation.body, { status: validation.status });
  return NextResponse.json({ error: 'Input booking tidak sah' }, { status: 400 });
 }
 if (body.notes !== undefined) update.notes = cleanString(body.notes, 2000);
 if (metadata != null) update.metadata = metadata;

 if (update.title === null) return NextResponse.json({ error: 'Tajuk booking tidak boleh kosong' }, { status: 400 });

 const now = new Date().toISOString();
 if (status && status !== existingRow.status) {
  if (!manager) {
   return NextResponse.json({ error: 'Hanya role pengurusan boleh menukar status booking' }, { status: 403 });
  }
  try {
   validateBookingStatusTransition(existingRow.status, status);
  } catch (error) {
   const validation = bookingValidationResponse(error);
   if (validation) return NextResponse.json(validation.body, { status: validation.status });
   return NextResponse.json({ error: 'Status booking tidak sah' }, { status: 400 });
  }
  update.status = status;
  if (status === 'CONFIRMED' && !existingRow.confirmed_at) update.confirmed_at = now;
  if (status === 'CANCELLED' && !existingRow.cancelled_at) update.cancelled_at = now;
  if ((status === 'COMPLETED' || status === 'NO_SHOW') && !existingRow.completed_at) update.completed_at = now;
 }

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
