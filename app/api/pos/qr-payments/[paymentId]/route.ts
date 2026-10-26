import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import {
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import { isFiuuReconciliationExpired } from '@/lib/pos/fiuu';
import {
 buildFiuuCloudEcrReferenceId,
 type FiuuCloudEcrResponse,
} from '@/lib/pos/fiuu-cloudecr';
import { reconcileFiuuCloudEcrLast } from '@/lib/pos/fiuu-cloudecr-runtime';
import type { Json } from '@/types/database';

export const maxDuration = 100;

function sanitizedCloudEcrResult(result: FiuuCloudEcrResponse): Json {
 return {
  transType: result.transType,
  posId: result.posId,
  deviceId: result.deviceId,
  referenceId: result.referenceId,
  statusCode: result.statusCode,
  responseCode: result.responseCode,
  responseText: result.responseText,
  softwareVersion: result.softwareVersion,
  terminalSn: result.terminalSn,
  apiVersion: result.apiVersion,
  transData: result.transData ? { ...result.transData } : null,
  signature: result.signature,
  verified_payload: result.verifiedPayload as unknown as Json,
 };
}

export async function GET(
 _request: Request,
 context: { params: Promise<{ paymentId: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { paymentId } = await context.params;
 const service = createAdminClient();
 const paymentSelect =
  'id, branch_id, shift_id, amount_rm, status, provider, gateway_ref, paid_at, transaction_id, expires_at, provider_result, provider_order_id, provider_status_checked_at' as const;
 const initial = await service.from('pos_online_payments').select(paymentSelect)
  .eq('id', paymentId).eq('organization_id', profile.organization_id).maybeSingle();

 if (initial.error) return NextResponse.json({ error: initial.error.message }, { status: 400 });
 let data = initial.data;
 if (!data) return NextResponse.json({ error: 'QR payment tidak dijumpai' }, { status: 404 });

 try {
  await assertCanAccessPosBranch(service, profile, data.branch_id);
 } catch (err) {
  return NextResponse.json(
   { error: err instanceof Error ? err.message : 'Akses cawangan ditolak' },
   { status: posAccessErrorStatus(err) });
 }

 if (data.provider === 'fiuu' && data.status === 'REPORTED' && data.gateway_ref) {
  const { error: fulfillError } = await service.rpc('fulfill_pos_fiuu_payment', {
   p_payment_id: data.id,
   p_gateway_ref: data.gateway_ref,
   p_amount: Number(data.amount_rm),
   p_currency: 'MYR',
   p_channel_id: '24',
  });
  if (fulfillError) {
   console.error('[pos-fiuu] reported_fulfillment_retry_failed', {
    paymentId: data.id,
    reason: fulfillError.message.slice(0, 160),
   });
  }

  const refreshed = await service.from('pos_online_payments').select(paymentSelect)
   .eq('id', paymentId).eq('organization_id', profile.organization_id).maybeSingle();
  if (!refreshed.error && refreshed.data) data = refreshed.data;
 }

 if (data.provider === 'fiuu_cloudecr') {
  if (data.status === 'REPORTED') {
   const { error: fulfillError } = await service.rpc('fulfill_pos_fiuu_cloudecr_payment', {
    p_payment_id: data.id,
   });
   if (fulfillError) {
    console.error('[pos-fiuu-cloudecr] reported_fulfillment_retry_failed', {
     paymentId: data.id,
     reason: fulfillError.message.slice(0, 160),
    });
   }
  }

  if (data.status === 'PENDING'
   && data.provider_order_id
   && (!data.expires_at || !isFiuuReconciliationExpired(data.expires_at))) {
   const queryReferenceId = buildFiuuCloudEcrReferenceId(
    `${data.id}:getLast:${randomUUID()}`,
   );
   const { data: claimed, error: claimError } = await service.rpc(
    'claim_pos_fiuu_cloudecr_reconciliation',
    {
     p_payment_id: data.id,
     p_query_reference_id: queryReferenceId,
     p_min_interval_seconds: 180,
    },
   );
   if (claimError) {
    console.error('[pos-fiuu-cloudecr] reconcile_claim_failed', {
     paymentId: data.id,
     reason: claimError.message.slice(0, 160),
    });
   } else if (claimed) {
    try {
     const providerResult = await reconcileFiuuCloudEcrLast({
      queryReferenceId,
      originalReferenceId: data.provider_order_id,
      amountRm: Number(data.amount_rm),
     });
     const safeResult = sanitizedCloudEcrResult(providerResult);
     const checkedAt = new Date().toISOString();
     if (providerResult.statusCode === '00' && providerResult.responseCode === '00') {
      const { error: reportError } = await service.rpc(
       'report_pos_fiuu_cloudecr_payment',
       { p_payment_id: data.id, p_provider_result: safeResult },
      );
      if (reportError) {
       console.error('[pos-fiuu-cloudecr] reconcile_report_failed', {
        paymentId: data.id,
        reason: reportError.message.slice(0, 160),
       });
      } else {
       const { error: fulfillError } = await service.rpc(
        'fulfill_pos_fiuu_cloudecr_payment',
        { p_payment_id: data.id },
       );
       if (fulfillError) {
        console.error('[pos-fiuu-cloudecr] reconcile_fulfillment_failed', {
         paymentId: data.id,
         reason: fulfillError.message.slice(0, 160),
        });
       }
      }
     } else {
      const { data: statusUpdatedPayment, error: statusUpdateError } = await service.from('pos_online_payments').update({
       provider_result: safeResult,
       provider_status_checked_at: checkedAt,
       updated_at: checkedAt,
      })
       .eq('id', data.id)
       .eq('provider', 'fiuu_cloudecr')
       .eq('status', 'PENDING')
       .eq('provider_reconcile_reference_id', queryReferenceId)
       .select('id').maybeSingle();
      if (statusUpdateError || !statusUpdatedPayment) {
       console.error('[pos-fiuu-cloudecr] reconcile_status_update_failed', {
        paymentId: data.id,
        reason: statusUpdateError?.message.slice(0, 160) ?? 'conditional update changed no row',
       });
      }
     }
    } catch (reconcileError) {
     console.error('[pos-fiuu-cloudecr] reconcile_unknown', {
      paymentId: data.id,
      reason: reconcileError instanceof Error ? reconcileError.message.slice(0, 160) : 'unknown',
     });
    }
   }
  }

  const refreshed = await service.from('pos_online_payments').select(paymentSelect)
   .eq('id', paymentId).eq('organization_id', profile.organization_id).maybeSingle();
  if (!refreshed.error && refreshed.data) data = refreshed.data;
 }

 const providerResult = data.provider_result && typeof data.provider_result === 'object'
  && !Array.isArray(data.provider_result)
  ? data.provider_result as Record<string, unknown>
  : null;
 const vtReported = data.provider === 'fiuu_vt'
  && data.status === 'PENDING'
  && providerResult?.opType === 'STATUS'
  && providerResult?.status === '00';
 const payment = vtReported
  ? { ...data, status: 'REPORTED' }
  : data.provider !== 'fiuu'
  && data.status === 'PENDING'
  && data.expires_at
  && isFiuuReconciliationExpired(data.expires_at)
  ? { ...data, status: 'EXPIRED' }
  : data;

 let result = null;
 if (payment.status === 'PAID' && payment.transaction_id) {
  const { data: receipt } = await service
   .from('pos_receipts')
   .select('receipt_data')
   .eq('transaction_id', payment.transaction_id)
   .maybeSingle();
  result = receipt?.receipt_data ?? null;
 }

 return NextResponse.json({
  payment: {
   id: payment.id,
   branch_id: payment.branch_id,
   shift_id: payment.shift_id,
   amount_rm: payment.amount_rm,
   status: payment.status,
   gateway_ref: payment.gateway_ref,
   paid_at: payment.paid_at,
   transaction_id: payment.transaction_id,
   expires_at: payment.expires_at,
  },
  result,
 });
}
