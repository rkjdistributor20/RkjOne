import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GMP_RECORD_STAGES } from '@/lib/manufacturing/gmp';

const GMP_WRITE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'CEO_FACTORY', 'OPERATION_MANAGER']);
const BATCH_STATUSES = new Set(['DRAFT', 'IN_PROCESS', 'HOLD', 'RELEASED', 'REJECTED']);

type SupabaseErrorLike = {
 code?: string;
 message?: string;
 details?: string;
 hint?: string;
};

type FactoryGmpProductRow = {
 id: string;
 legal_entity_id: string | null;
 product_code: string;
 product_name: string;
 batch_prefix: string;
 stock_item_codes: string[];
 pos_categories: string[];
 gmp_spec: Record<string, unknown>;
 status: string;
};

type FactoryGmpBatchRow = {
 id: string;
 gmp_product_id: string;
 production_date: string;
 batch_no: string;
 planned_qty: number | string;
 actual_qty: number | string;
 unit: string;
 status: string;
 raw_material_lots: unknown;
 process_readings: unknown;
 packaging_trace: unknown;
 deviation_notes: string | null;
 released_at: string | null;
 created_at: string;
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

function setupPendingResponse(message?: string) {
 return NextResponse.json({
  migration_ready: false,
  setup_message: message ?? 'Migration Manufacturing GMP belum dijalankan.',
  products: [],
  batches: [],
  record_stages: GMP_RECORD_STAGES,
  summary: {
   product_count: 0,
   recent_batch_count: 0,
   released_count: 0,
   hold_count: 0,
   open_count: 0,
   latest_batch_date: null,
  },
 });
}

function isIsoDate(value: unknown): value is string {
 return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function asNonNegativeNumber(value: unknown, fallback = 0) {
 if (value === undefined || value === null || value === '') return fallback;
 const num = Number(value);
 return Number.isFinite(num) && num >= 0 ? num : null;
}

async function nextBatchNo(
 db: SupabaseClient,
 organizationId: string,
 batchPrefix: string,
 productionDate: string) {
 const dateKey = productionDate.replaceAll('-', '');
 const prefix = `${batchPrefix}-${dateKey}`;
 const { count, error } = await db
  .from('factory_gmp_batch_records')
  .select('id', { count: 'exact', head: true })
  .eq('organization_id', organizationId)
  .like('batch_no', `${prefix}-%`);

 if (error) throw error;
 return `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

export async function GET() {
 const profile = await getCurrentProfile();
 if (!profile) {
  return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 const supabase = await createClient();
 const db = supabase as SupabaseClient;

 const { data: products, error: productError } = await db
  .from('factory_gmp_products')
  .select('id, legal_entity_id, product_code, product_name, batch_prefix, stock_item_codes, pos_categories, gmp_spec, status')
  .eq('organization_id', profile.organization_id)
  .eq('status', 'ACTIVE')
  .order('product_code');

 if (missingGmpSchema(productError)) {
  return setupPendingResponse(productError?.message);
 }

 if (productError) {
  return NextResponse.json({ error: productError.message }, { status: 500 });
 }

 const { data: batches, error: batchError } = await db
  .from('factory_gmp_batch_records')
  .select('id, gmp_product_id, production_date, batch_no, planned_qty, actual_qty, unit, status, raw_material_lots, process_readings, packaging_trace, deviation_notes, released_at, created_at')
  .eq('organization_id', profile.organization_id)
  .order('production_date', { ascending: false })
  .order('created_at', { ascending: false })
  .limit(40);

 if (missingGmpSchema(batchError)) {
  return setupPendingResponse(batchError?.message);
 }

 if (batchError) {
  return NextResponse.json({ error: batchError.message }, { status: 500 });
 }

 const productRows = (products ?? []) as FactoryGmpProductRow[];
 const batchRows = (batches ?? []) as FactoryGmpBatchRow[];
 const released = batchRows.filter((batch) => batch.status === 'RELEASED').length;
 const hold = batchRows.filter((batch) => batch.status === 'HOLD').length;
 const open = batchRows.filter((batch) => ['DRAFT', 'IN_PROCESS'].includes(batch.status)).length;

 return NextResponse.json({
  migration_ready: true,
  setup_message: null,
  products: productRows,
  batches: batchRows,
  record_stages: GMP_RECORD_STAGES,
  summary: {
   product_count: productRows.length,
   recent_batch_count: batchRows.length,
   released_count: released,
   hold_count: hold,
   open_count: open,
   latest_batch_date: batchRows[0]?.production_date ?? null,
  },
 });
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
  return NextResponse.json({ error: 'Tidak dibenarkan' }, { status: 401 });
 }

 if (!GMP_WRITE_ROLES.has(profile.role)) {
  return NextResponse.json({ error: 'Tiada akses cipta batch GMP kilang' }, { status: 403 });
 }

 const body = await request.json().catch(() => null) as {
  product_code?: string;
  production_date?: string;
  planned_qty?: unknown;
  actual_qty?: unknown;
  unit?: string;
  status?: string;
  batch_no?: string;
  raw_material_lots?: unknown;
  process_readings?: unknown;
  packaging_trace?: unknown;
  deviation_notes?: string;
 } | null;

 if (!body) {
  return NextResponse.json({ error: 'Body JSON tidak sah' }, { status: 400 });
 }

 if (!body.product_code?.trim()) {
  return NextResponse.json({ error: 'Pilih produk GMP dahulu' }, { status: 400 });
 }

 if (!isIsoDate(body.production_date)) {
  return NextResponse.json({ error: 'Tarikh production tidak sah' }, { status: 400 });
 }
 const productionDate = body.production_date;

 const plannedQty = asNonNegativeNumber(body.planned_qty);
 const actualQty = asNonNegativeNumber(body.actual_qty);
 if (plannedQty === null || actualQty === null) {
  return NextResponse.json({ error: 'Kuantiti mesti nombor positif atau kosong' }, { status: 400 });
 }

 const status = body.status && BATCH_STATUSES.has(body.status) ? body.status : 'DRAFT';
 const supabase = await createClient();
 const db = supabase as SupabaseClient;

 const { data: product, error: productError } = await db
  .from('factory_gmp_products')
  .select('id, legal_entity_id, product_code, product_name, batch_prefix')
  .eq('organization_id', profile.organization_id)
  .eq('product_code', body.product_code.trim())
  .eq('status', 'ACTIVE')
  .maybeSingle();

 if (missingGmpSchema(productError)) {
  return NextResponse.json({ error: 'Migration Manufacturing GMP belum dijalankan' }, { status: 424 });
 }

 if (productError) {
  return NextResponse.json({ error: productError.message }, { status: 500 });
 }

 const productRow = product as Pick<FactoryGmpProductRow, 'id' | 'legal_entity_id' | 'product_code' | 'product_name' | 'batch_prefix'> | null;
 if (!productRow) {
  return NextResponse.json({ error: 'Produk GMP tidak ditemui' }, { status: 404 });
 }

 let batchNo = body.batch_no?.trim();
 if (!batchNo) {
  try {
   batchNo = await nextBatchNo(db, profile.organization_id, productRow.batch_prefix, productionDate);
  } catch (err) {
   const error = err as SupabaseErrorLike;
   if (missingGmpSchema(error)) {
    return NextResponse.json({ error: 'Migration Manufacturing GMP belum dijalankan' }, { status: 424 });
   }
   return NextResponse.json({ error: error.message ?? 'Gagal jana nombor batch' }, { status: 500 });
  }
 }

 const { data, error } = await db
  .from('factory_gmp_batch_records')
  .insert({
   organization_id: profile.organization_id,
   legal_entity_id: productRow.legal_entity_id,
   gmp_product_id: productRow.id,
   production_date: productionDate,
   batch_no: batchNo,
   planned_qty: plannedQty,
   actual_qty: actualQty,
   unit: body.unit?.trim() || 'PCS',
   status,
   raw_material_lots: body.raw_material_lots ?? [],
   process_readings: body.process_readings ?? {},
   packaging_trace: body.packaging_trace ?? {},
   deviation_notes: body.deviation_notes?.trim() || null,
   released_at: status === 'RELEASED' ? new Date().toISOString() : null,
   created_by: profile.id,
   updated_by: profile.id,
  })
  .select('id, gmp_product_id, production_date, batch_no, planned_qty, actual_qty, unit, status, raw_material_lots, process_readings, packaging_trace, deviation_notes, released_at, created_at')
  .single();

 if (missingGmpSchema(error)) {
  return NextResponse.json({ error: 'Migration Manufacturing GMP belum dijalankan' }, { status: 424 });
 }

 if (error) {
  const statusCode = error.code === '23505' ? 409 : 400;
  return NextResponse.json({ error: error.message }, { status: statusCode });
 }

 return NextResponse.json({ batch: data });
}
