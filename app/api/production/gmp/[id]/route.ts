import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const GMP_WRITE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER']);
const BATCH_STATUSES = new Set(['DRAFT', 'IN_PROCESS', 'HOLD', 'RELEASED', 'REJECTED']);

type SupabaseErrorLike = {
 code?: string;
 message?: string;
 details?: string;
 hint?: string;
};

type RouteContext = {
 params: Promise<{ id: string }>;
};

function missingGmpSchema(error: SupabaseErrorLike | null) {
 if (!error) return false;
 const text = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
 return (
  text.includes('factory_gmp_')
  && (text.includes('does not exist')
   || text.includes('not found')
   || text.includes('schema cache')
   || text.includes('could not find'))
 );
}

function asNonNegativeNumber(value: unknown) {
 if (value === undefined || value === null || value === '') return undefined;
 const num = Number(value);
 return Number.isFinite(num) && num >= 0 ? num : null;
}

export async function PATCH(request: Request, context: RouteContext) {
 const profile = await getCurrentProfile();
 if (!profile) {
  return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 if (!GMP_WRITE_ROLES.has(profile.role)) {
  return NextResponse.json({ error: 'Tiada akses kemaskini batch GMP kilang' }, { status: 403 });
 }

 const { id } = await context.params;
 if (!id) {
  return NextResponse.json({ error: 'ID batch diperlukan' }, { status: 400 });
 }

 const body = await request.json().catch(() => null) as {
  status?: string;
  actual_qty?: unknown;
  deviation_notes?: string;
 } | null;

 if (!body) {
  return NextResponse.json({ error: 'Body JSON tidak sah' }, { status: 400 });
 }

 const patch: Record<string, unknown> = {
  updated_by: profile.id,
 };

 if (body.status !== undefined) {
  if (!BATCH_STATUSES.has(body.status)) {
   return NextResponse.json({ error: 'Status batch tidak sah' }, { status: 400 });
  }
  patch.status = body.status;
  patch.released_at = body.status === 'RELEASED' ? new Date().toISOString() : null;
 }

 const actualQty = asNonNegativeNumber(body.actual_qty);
 if (actualQty === null) {
  return NextResponse.json({ error: 'Kuantiti sebenar mesti nombor positif atau kosong' }, { status: 400 });
 }
 if (actualQty !== undefined) {
  patch.actual_qty = actualQty;
 }

 if (body.deviation_notes !== undefined) {
  patch.deviation_notes = body.deviation_notes.trim() || null;
 }

 const supabase = await createClient();
 const db = supabase as SupabaseClient;

 const { data, error } = await db
  .from('factory_gmp_batch_records')
  .update(patch)
  .eq('id', id)
  .eq('organization_id', profile.organization_id)
  .select('id, gmp_product_id, production_date, batch_no, planned_qty, actual_qty, unit, status, raw_material_lots, process_readings, packaging_trace, deviation_notes, released_at, created_at')
  .maybeSingle();

 if (missingGmpSchema(error)) {
  return NextResponse.json({ error: 'Migration Manufacturing GMP belum dijalankan' }, { status: 424 });
 }

 if (error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
 }

 if (!data) {
  return NextResponse.json({ error: 'Batch GMP tidak ditemui' }, { status: 404 });
 }

 return NextResponse.json({ batch: data });
}
