import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import { getCurrentProfile } from '@/lib/auth/session';
import { isDashboardRouteAllowed } from '@/lib/auth/route-access';
import { createClient } from '@/lib/supabase/server';
import { inventoryCsv, movementCsv, transactionCsv } from './csv';
import { parseReportFilters } from './filters';
import type { InventoryReportRow, MovementReportRow, ReportTransaction } from './types';

type Report = 'scope' | 'overview' | 'sales' | 'branches' | 'products' | 'staff' |
 'inventory' | 'movements' | 'transactions' | 'receipt' | 'payments' | 'fleet';

const noStore = { 'Cache-Control': 'private, no-store' };
const exportLimit = 5000;
const pageKeys = {
 staff: 'staff', transactions: 'transactions', payments: 'payments', inventory: 'items', movements: 'movements',
} as const;
const limits: Partial<Record<Report, number>> = { products: 15, branches: 50, inventory: 100 };

function json(data: unknown, status = 200) {
 return NextResponse.json(data, { status, headers: noStore });
}

export function reportRoute(report: Report) {
 return async (request: Request) => {
  const profile = await getCurrentProfile();
  if (!profile) return json({ error: 'Unauthorized' }, 401);
  if (!isDashboardRouteAllowed('/reports', { role: profile.role })) {
   return json({ error: 'Tiada akses laporan' }, 403);
  }

  let filters: ReturnType<typeof parseReportFilters>;
  try {
   filters = parseReportFilters(new URL(request.url).searchParams);
  } catch (err) {
   return json({ error: (err as Error).message }, 400);
  }
  const { branchId, transactionId, from, to, format, movementType, page } = filters;
  const exporting = format === 'csv';
  if (exporting && report !== 'transactions' && report !== 'inventory' && report !== 'movements') {
   return json({ error: 'Eksport tidak disokong untuk laporan ini' }, 400);
  }
  if (report === 'receipt' && !transactionId) return json({ error: 'Transaksi diperlukan' }, 400);

  const pageKey = pageKeys[report as keyof typeof pageKeys];
  const pageSize = filters.limit ?? limits[report] ?? 50;
  const supabase = await createClient();
  if (branchId && profile.role === 'AREA_MANAGER') {
   try {
    await resolveScopedBranches(supabase, profile, branchId);
   } catch {
    return json({ error: 'Tiada akses kepada laporan atau cawangan ini' }, 403);
   }
  }
  // Report RPC is not yet in the generated database types. Use the user's
  // JWT, not service role; SQL checks current grants for both selected and
  // combined views in the same snapshot as the report rows.
  const { data, error } = await (supabase as SupabaseClient).rpc('read_scoped_report', {
   p_report: report,
   p_from: from,
   p_to: to,
   p_branch_id: branchId,
   p_limit: exporting ? exportLimit + 1 : report === 'receipt' ? 1 : pageSize + (pageKey ? 1 : 0),
   p_offset: !exporting && pageKey ? (page - 1) * pageSize : 0,
   p_movement_type: movementType,
   p_transaction_id: transactionId,
  });
  if (error) {
   if (error.code === '42501') return json({ error: 'Tiada akses kepada laporan atau cawangan ini' }, 403);
   if (error.code === '22023') return json({ error: 'Penapis laporan tidak sah' }, 400);
   console.error('Report read failed', { report, code: error.code });
   return json({ error: 'Laporan tidak dapat dimuatkan' }, 500);
  }
  if (report === 'receipt' && !data?.receipt) return json({ error: 'Transaksi tidak dijumpai' }, 404);
  if (!pageKey) return json(data);

  const rows = data?.[pageKey];
  if (!Array.isArray(rows)) return json({ error: 'Respons laporan tidak sah' }, 500);
  if (!exporting) return json({ [pageKey]: rows.slice(0, pageSize), has_more: rows.length > pageSize });
  if (rows.length > exportLimit) {
   return json({ error: 'Eksport melebihi 5,000 baris. Pilih cawangan, jenis pergerakan atau julat yang lebih kecil.' }, 422);
  }

  const csv = report === 'transactions' ? transactionCsv(rows as ReportTransaction[])
   : report === 'movements' ? movementCsv(rows as MovementReportRow[]) : inventoryCsv(rows as InventoryReportRow[]);
  const suffix = report === 'inventory' ? to : `${from}_${to}`;
  return new NextResponse(csv, {
   headers: {
    ...noStore,
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="rkj-${report}-${suffix}.csv"`,
    'X-Content-Type-Options': 'nosniff',
   },
  });
 };
}
