import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { reconcileFiuuOpaPayment } from '@/lib/pos/fiuu-opa-reconciliation';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 180;

const WORKER_BATCH_SIZE = 1;
const INQUIRY_INTERVAL_MS = 10_000;
const MAX_INQUIRY_ATTEMPTS = 6;

function delay(milliseconds: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function configuredWorkerSecret(): string {
 return (process.env.FIUU_RECONCILIATION_SECRET ?? '').trim();
}

function hasValidWorkerAuthorization(request: Request, secret: string): boolean {
 if (secret.length < 32) return false;
 const authorization = request.headers.get('authorization') ?? '';
 if (!authorization.startsWith('Bearer ')) return false;
 const provided = authorization.slice('Bearer '.length).trim();
 const providedBuffer = Buffer.from(provided, 'utf8');
 const secretBuffer = Buffer.from(secret, 'utf8');
 return providedBuffer.length === secretBuffer.length
  && timingSafeEqual(providedBuffer, secretBuffer);
}

async function deferReportedPayment(
 service: ReturnType<typeof createAdminClient>,
 paymentId: string,
): Promise<void> {
 const checkedAt = new Date().toISOString();
 const { error } = await service
  .from('pos_online_payments')
  .update({ provider_status_checked_at: checkedAt, updated_at: checkedAt })
  .eq('id', paymentId)
  .eq('provider', 'fiuu')
  .eq('status', 'REPORTED');
 if (error) {
  console.error('[pos-fiuu] reported_queue_defer_failed', {
   paymentId,
   reason: error.message.slice(0, 160),
  });
 }
}

/**
 * Service-only BR001 worker. It is deliberately not connected to a Production
 * schedule by this change; scheduling is enabled only after sandbox UAT.
 */
export async function POST(request: Request) {
 if (process.env.FIUU_RECONCILIATION_ENABLED?.trim().toLowerCase() !== 'true') {
  return NextResponse.json(
   { error: 'Fiuu reconciliation worker is disabled' },
   { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
 }
 const secret = configuredWorkerSecret();
 if (secret.length < 32) {
  return NextResponse.json(
   { error: 'Fiuu reconciliation worker is not configured' },
   { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
 }
 if (!hasValidWorkerAuthorization(request, secret)) {
  return NextResponse.json(
   { error: 'Unauthorized' },
   { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
 }

 const service = createAdminClient();
 const now = new Date().toISOString();
 const { data: reported, error: reportedError } = await service
  .from('pos_online_payments')
		.select('id, gateway_ref, amount_rm, provider_status_checked_at')
  .eq('provider', 'fiuu')
  .eq('status', 'REPORTED')
  .eq('sale_payload->>fiuu_branch_code', 'BR001')
		.order('provider_status_checked_at', { ascending: true, nullsFirst: true })
  .order('created_at', { ascending: true })
  .limit(5);
 if (reportedError) {
  console.error('[pos-fiuu] reported_queue_failed', {
   reason: reportedError.message.slice(0, 160),
  });
  return NextResponse.json(
   { error: 'Fiuu reported-payment queue unavailable' },
   { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
 }

 const { data, error } = await service
  .from('pos_online_payments')
  .select('id')
  .eq('provider', 'fiuu')
  .eq('status', 'PENDING')
  .eq('sale_payload->>fiuu_branch_code', 'BR001')
  .or([
   'fiuu_opa_reconcile_state.is.null',
   `fiuu_opa_reconcile_next_at.lte.${now}`,
   `and(fiuu_opa_reconcile_state.eq.INQUIRING,fiuu_opa_reconcile_lease_expires_at.lte.${now})`,
  ].join(','))
  .order('created_at', { ascending: true })
  .limit(WORKER_BATCH_SIZE);
 if (error) {
  console.error('[pos-fiuu] reconciliation_queue_failed', {
   reason: error.message.slice(0, 160),
  });
  return NextResponse.json(
   { error: 'Fiuu reconciliation queue unavailable' },
   { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
 }

 const counts: Record<string, number> = {};
 for (const row of reported ?? []) {
  const gatewayRef = row.gateway_ref?.trim() ?? '';
  const amountRm = Number(row.amount_rm);
  if (!gatewayRef || !Number.isFinite(amountRm) || amountRm <= 0) {
   counts.recorded_unknown = (counts.recorded_unknown ?? 0) + 1;
			await deferReportedPayment(service, row.id);
   continue;
  }
  const { error: fulfillError } = await service.rpc('fulfill_pos_fiuu_payment', {
   p_payment_id: row.id,
   p_gateway_ref: gatewayRef,
   p_amount: amountRm,
   p_currency: 'MYR',
   p_channel_id: '24',
  });
  const result = fulfillError ? 'recorded_unknown' : 'terminal';
  counts[result] = (counts[result] ?? 0) + 1;
		if (fulfillError) await deferReportedPayment(service, row.id);
 }
 for (const row of data ?? []) {
  for (let attempt = 0; attempt < MAX_INQUIRY_ATTEMPTS; attempt += 1) {
   const result = await reconcileFiuuOpaPayment({
    service,
    paymentId: row.id,
   });
   counts[result] = (counts[result] ?? 0) + 1;
   if (result !== 'pending') break;
   if (attempt < MAX_INQUIRY_ATTEMPTS - 1) await delay(INQUIRY_INTERVAL_MS);
  }
 }

 return NextResponse.json({
  ok: true,
  branch: 'BR001',
  examined: (reported?.length ?? 0) + (data?.length ?? 0),
  results: counts,
 }, { headers: { 'Cache-Control': 'no-store' } });
}
