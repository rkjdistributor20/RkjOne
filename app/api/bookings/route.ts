import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth/session';
import { applyBranchIdsFilter, resolveScopedBranches } from '@/lib/auth/branch-scope';
import { createClient } from '@/lib/supabase/server';

const BOOKING_TYPES = new Set(['GENERAL', 'CUSTOMER', 'EVENT', 'MAINTENANCE', 'SALES_AGENT', 'DELIVERY', 'OTHER']);
const BOOKING_STATUS = new Set(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']);
const BOOKING_PRIORITY = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
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

function cleanString(value: unknown, max = 255) {
 if (typeof value !== 'string') return null;
 const text = value.trim();
 if (!text) return null;
 return text.slice(0, max);
}

function normalizeEnum(value: unknown, allowed: Set<string>, fallback: string) {
 if (typeof value !== 'string') return fallback;
 const normalized = value.trim().toUpperCase();
 return allowed.has(normalized) ? normalized : fallback;
}

function bookingNumber() {
 const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
 const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
 return `BK-${stamp}-${rand}`;
}

function asMetadata(value: unknown) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
 return value as Record<string, unknown>;
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
 const status = normalizeEnum(searchParams.get('status'), BOOKING_STATUS, '');
 const fromDate = cleanString(searchParams.get('from'), 20);
 const toDate = cleanString(searchParams.get('to'), 20);

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
 const title = cleanString(body.title, 180);
 const scheduledDate = cleanString(body.scheduled_date, 20);
 const requestedBranchId = cleanString(body.branch_id);

 if (!title || !scheduledDate) {
  return NextResponse.json({ error: 'Tajuk dan tarikh booking wajib' }, { status: 400 });
 }

 const supabase = await createClient();
 let scope;
 try {
  scope = await resolveScopedBranches(supabase as SupabaseClient, profile, requestedBranchId);
 } catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Cawangan tidak sah' }, { status: 403 });
 }
 const branchId = requestedBranchId ?? scope.branchId;

 const expectedPax = Number(body.expected_pax);
 const row = {
  organization_id: profile.organization_id,
  branch_id: branchId,
  created_by: profile.id,
  assigned_to: cleanString(body.assigned_to),
  booking_type: normalizeEnum(body.booking_type, BOOKING_TYPES, 'GENERAL'),
  status: normalizeEnum(body.status, BOOKING_STATUS, 'PENDING'),
  priority: normalizeEnum(body.priority, BOOKING_PRIORITY, 'NORMAL'),
  title,
  description: cleanString(body.description, 2000),
  customer_name: cleanString(body.customer_name),
  customer_phone: cleanString(body.customer_phone, 60),
  customer_email: cleanString(body.customer_email),
  scheduled_date: scheduledDate,
  scheduled_time: cleanString(body.scheduled_time, 20),
  expected_pax: Number.isFinite(expectedPax) && expectedPax >= 0 ? Math.trunc(expectedPax) : null,
  source: cleanString(body.source, 80) ?? 'API',
  notes: cleanString(body.notes, 2000),
  metadata: asMetadata(body.metadata),
 };

 let booking: Record<string, unknown> | null = null;
 let bookingError: { message: string } | null = null;

 for (let attempt = 0; attempt < 5; attempt += 1) {
  const result = await (supabase as SupabaseClient)
   .from('bookings' as never)
   .insert({ ...row, booking_number: cleanString(body.booking_number, 80) ?? bookingNumber() } as never)
   .select(BOOKING_SELECT)
   .single() as BookingResult;

  if (!result.error && result.data) {
   booking = result.data;
   break;
  }

  bookingError = result.error;
  if (!result.error?.message.includes('duplicate key')) break;
 }

 if (!booking) return NextResponse.json({ error: bookingError?.message ?? 'Gagal cipta booking' }, { status: 500 });

 return NextResponse.json({ booking });
}
