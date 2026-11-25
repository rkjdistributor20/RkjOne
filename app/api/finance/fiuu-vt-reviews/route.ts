import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

const REVIEW_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'FINANCE']);
const SENSITIVE_KEY_PATTERN = /(secret|password|token|credential|authorization|signature|api[_-]?key)/i;

function providerEvidenceSummary(value: Json | null | undefined) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const operation = value.opType;
 if (operation !== 'SALE' && operation !== 'STATUS' && operation !== 'VOID') return null;
 const code = value.errorCode;
 const status = value.status;
 return {
  operation,
  error_code: typeof code === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(code) ? code : null,
  status_code: typeof status === 'string' && /^\d{2}$/.test(status) ? status : null,
 };
}

function sanitizeEvidence(value: Json, depth = 0): unknown {
 if (depth > 6) return '[dipendekkan]';
 if (value === null || typeof value !== 'object') return value;
 if (Array.isArray(value)) {
 return value.slice(0, 50).map((item) => sanitizeEvidence(item, depth + 1));
 }

 return Object.fromEntries(
 Object.entries(value)
 .slice(0, 100)
 .map(([key, item]) => [
 key,
 SENSITIVE_KEY_PATTERN.test(key)
 ? '[DILINDUNGI]'
 : sanitizeEvidence(item ?? null, depth + 1),
 ]));
}

export async function GET(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 if (!REVIEW_ROLES.has(profile.role)) {
 return NextResponse.json({ error: 'Tiada akses semakan Fiuu VT' }, { status: 403 });
 }

 const { searchParams } = new URL(request.url);
 const requestedLimit = Number(searchParams.get('limit') ?? 100);
 const limit = Number.isFinite(requestedLimit)
 ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
 : 100;
 const db = createAdminClient();
 const { data, error, count } = await db
 .from('pos_online_payments')
 .select(`
 id,
 amount_rm,
 status,
 provider_order_id,
 created_at,
 fiuu_vt_provider_error_code,
 fiuu_vt_provider_error_count,
 fiuu_vt_provider_error_at,
 fiuu_vt_reconciliation_state,
 fiuu_vt_review_evidence,
 provider_transaction_id,
 provider_result,
 provider_confirmed_at,
 provider_confirmed_by,
 paid_at,
 failed_at,
 transaction_id,
 branch:branches(branch_code, branch_name)
 `, { count: 'exact' })
 .eq('organization_id', profile.organization_id)
 .eq('provider', 'fiuu_vt')
 .eq('status', 'QUARANTINED')
 .eq('fiuu_vt_review_required', true)
 .order('created_at', { ascending: true })
 .limit(limit);

 if (error) {
 return NextResponse.json({ error: 'Gagal memuatkan semakan Fiuu VT' }, { status: 500 });
 }

 const reviews = (data ?? []).map((row) => ({
 id: row.id,
 amount_rm: row.amount_rm,
 status: row.status,
 order_id: row.provider_order_id,
 created_at: row.created_at,
 error_code: row.fiuu_vt_provider_error_code,
 error_count: row.fiuu_vt_provider_error_count,
 error_at: row.fiuu_vt_provider_error_at,
 last_provider_evidence: providerEvidenceSummary(row.provider_result),
 review_state: row.fiuu_vt_reconciliation_state,
 review_evidence: sanitizeEvidence(row.fiuu_vt_review_evidence),
 provider_transaction_id: row.provider_transaction_id,
 provider_confirmed_at: row.provider_confirmed_at,
 provider_confirmed_by: row.provider_confirmed_by,
 paid_at: row.paid_at,
 failed_at: row.failed_at,
 transaction_id: row.transaction_id,
 branch: Array.isArray(row.branch) ? (row.branch[0] ?? null) : row.branch,
 }));

 return NextResponse.json({ reviews, pending_count: count ?? reviews.length }, {
 headers: { 'Cache-Control': 'private, no-store' },
 });
}
