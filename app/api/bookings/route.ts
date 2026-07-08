import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { applyBranchIdsFilter, resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
 BOOKING_PRIORITY_VALUES,
 BOOKING_STATUS_VALUES,
 BOOKING_TYPE_VALUES,
 bookingValidationResponse,
 cleanString,
 isDuplicateBookingError,
 parseDateValue,
 parseEnumValue,
 parseExpectedPax,
 parseMetadata,
 parseTimeValue,
} from '@/lib/bookings/validation';
const CREATE_ROLES = new Set([
 'SUPER_ADMIN',
 'ADMIN',
 'OPERATION_MANAGER',
 'HR',
 'FINANCE',
 'CEO_FACTORY',
 'MAINTENANCE_MANAGER',
 'AREA_MANAGER',
 'STAFF',
 'SALES_AGENT',
]);
const ASSIGNMENT_MANAGER_ROLES = new Set([
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

type BookingResult = {
 data: Record<string, unknown> | null;
 error: { message: string } | null;
};

function bookingNumber() {
 const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
 const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
 return `BK-${stamp}-${rand}`;
}

async function resolveAssignee(
 profile: { id: string; organization_id: string; role: string },
 value: unknown) {
 const assignedTo = cleanString(value);
 if (!assignedTo) return null;
 if (assignedTo === profile.id) return assignedTo;

 if (!ASSIGNMENT_MANAGER_ROLES.has(profile.role)) {
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

function parseLimit(value: string | null) {
 const parsed = Number(value ?? 50);
 if (!Number.isFinite(parsed)) return 50;
 return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { searchParams } = new URL(request.url);
 const requestedBranchId = cleanString(searchParams.get('branch_id'));
 let status: string | null;
 let fromDate: string | null;
 let toDate: string | null;
 try {
  status = parseEnumValue('status', searchParams.get('status'), BOOKING_STATUS_VALUES, { optional: true });
  fromDate = parseDateValue('from', searchParams.get('from'), { optional: true });
  toDate = parseDateValue('to', searchParams.get('to'), { optional: true });
  if (fromDate && toDate && fromDate > toDate) {
   return NextResponse.json({ error: 'Tarikh from tidak boleh selepas tarikh to' }, { status: 400 });
  }
 } catch (error) {
  const validation = bookingValidationResponse(error);
  if (validation) return NextResponse.json(validation.body, { status: validation.status });
  throw error;
 }

 const supabase = await createClient();
 let scope;
 try {
  scope = await resolveScopedBranches(supabase as SupabaseClient, profile, requestedBranchId);
 } catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Cawangan tidak sah' }, { status: 403 });
 }

 let query = (supabase as SupabaseClient)
  .from('bookings' as never)
  .select(BOOKING_SELECT)
  .eq('organization_id', profile.organization_id)
  .order('scheduled_date', { ascending: false })
  .order('scheduled_time', { ascending: false })
  .limit(parseLimit(searchParams.get('limit')));

 if (status) query = query.eq('status', status);
 if (fromDate) query = query.gte('scheduled_date', fromDate);
 if (toDate) query = query.lte('scheduled_date', toDate);
 if (requestedBranchId) query = applyBranchIdsFilter(query, 'branch_id', scope.branchIds);

 const { data, error } = await query;
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });

 return NextResponse.json({ bookings: data ?? [] });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!CREATE_ROLES.has(profile.role)) {
  return NextResponse.json({ error: 'Tiada akses cipta booking' }, { status: 403 });
 }

 const body = await request.json().catch(() => ({}));
 let title: string | null;
 let scheduledDate: string;
 let scheduledTime: string | null;
 let bookingType: string;
 let status: string;
 let priority: string;
 let expectedPax: number | null;
 let metadata: Record<string, unknown>;
 const requestedBranchId = cleanString(body.branch_id);

 try {
  title = cleanString(body.title, 180);
 scheduledDate = parseDateValue('Tarikh booking', body.scheduled_date);
 scheduledTime = parseTimeValue('Masa booking', body.scheduled_time);
  bookingType = parseEnumValue('booking_type', body.booking_type, BOOKING_TYPE_VALUES, { defaultValue: 'GENERAL' }) ?? 'GENERAL';
  status = parseEnumValue('status', body.status, BOOKING_STATUS_VALUES, { defaultValue: 'PENDING' }) ?? 'PENDING';
  priority = parseEnumValue('priority', body.priority, BOOKING_PRIORITY_VALUES, { defaultValue: 'NORMAL' }) ?? 'NORMAL';
  expectedPax = parseExpectedPax(body.expected_pax);
  metadata = parseMetadata(body.metadata, {}) ?? {};
  if (!title) throw new Error('Tajuk booking wajib diisi');
  if (status !== 'PENDING') {
   return NextResponse.json({ error: 'Booking baharu mesti bermula dengan status PENDING' }, { status: 400 });
  }
 } catch (error) {
  const validation = bookingValidationResponse(error);
  if (validation) return NextResponse.json(validation.body, { status: validation.status });
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Input booking tidak sah' }, { status: 400 });
 }

 const supabase = await createClient();
 let scope;
 try {
 scope = await resolveScopedBranches(supabase as SupabaseClient, profile, requestedBranchId);
 } catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Cawangan tidak sah' }, { status: 403 });
 }
 const branchId = requestedBranchId ?? scope.branchId;
 let assignedTo: string | null;
 try {
  assignedTo = await resolveAssignee(profile, body.assigned_to);
 } catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Pengguna tugasan tidak sah' }, { status: 403 });
 }

 const row = {
  organization_id: profile.organization_id,
  branch_id: branchId,
  created_by: profile.id,
  assigned_to: assignedTo,
  booking_type: bookingType,
  status,
  priority,
  title,
  description: cleanString(body.description, 2000),
  customer_name: cleanString(body.customer_name),
  customer_phone: cleanString(body.customer_phone, 60),
  customer_email: cleanString(body.customer_email),
  scheduled_date: scheduledDate,
  scheduled_time: scheduledTime,
  expected_pax: expectedPax,
  source: cleanString(body.source, 80) ?? 'API',
  notes: cleanString(body.notes, 2000),
  metadata,
 };

 let booking: Record<string, unknown> | null = null;
 let bookingError: { message: string } | null = null;

 const customBookingNumber = cleanString(body.booking_number, 80);
 const attempts = customBookingNumber ? 1 : 5;

 for (let attempt = 0; attempt < attempts; attempt += 1) {
  const result = await (supabase as SupabaseClient)
   .from('bookings' as never)
   .insert({ ...row, booking_number: customBookingNumber ?? bookingNumber() } as never)
   .select(BOOKING_SELECT)
   .single() as BookingResult;

  if (!result.error && result.data) {
   booking = result.data;
   break;
  }

  bookingError = result.error;
  if (customBookingNumber && isDuplicateBookingError(result.error?.message)) {
   return NextResponse.json({ error: 'Nombor booking sudah wujud' }, { status: 409 });
  }
  if (!isDuplicateBookingError(result.error?.message)) break;
 }

 if (!booking) return NextResponse.json({ error: bookingError?.message ?? 'Gagal cipta booking' }, { status: 500 });

 return NextResponse.json({ booking });
}
