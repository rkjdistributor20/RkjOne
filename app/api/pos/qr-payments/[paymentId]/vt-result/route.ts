import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 assertActivePosShiftMember,
 assertCanAccessPosBranch,
 posAccessErrorStatus,
} from '@/lib/pos/access';
import { assertOfficialPosDevice } from '@/lib/pos/device-auth';
import { FIUU_CALLBACK_GRACE_MS } from '@/lib/pos/fiuu';
import {
 FIUU_VT_TERMINAL_SETTLE_MS,
 getFiuuVtStatusDisposition,
 isFiuuVtPendingStatus,
 parseFiuuVtResult,
 type FiuuVtResult,
} from '@/lib/pos/fiuu-vt';
import {
 getFiuuVtLateRecoveryMs,
 normalizeFiuuVtBranchCode,
} from '@/lib/pos/fiuu-vt-server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

function jsonRecord(value: Json | null): Record<string, unknown> | null {
 return value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;
}

function sanitizedResult(result: FiuuVtResult): Json {
 return {
  opType: result.opType,
  orderId: result.orderId,
  transactionId: result.transactionId,
  status: result.status,
  amountRm: result.amountRm,
  currency: result.currency,
  channel: result.channel,
  payDate: result.payDate,
 };
}

const TERMINAL_PAYMENT_STATUSES = new Set(['FAILED', 'EXPIRED', 'CANCELLED']);

function isRecentTerminalStatus(status: string, checkedAt: string | null): boolean {
 if (!TERMINAL_PAYMENT_STATUSES.has(status) || !checkedAt) return false;
 const checkedAtMs = new Date(checkedAt).getTime();
 return Number.isFinite(checkedAtMs)
  && Date.now() - checkedAtMs <= FIUU_VT_TERMINAL_SETTLE_MS;
}

async function waitForTerminalSettle(startedAtMs: number): Promise<void> {
 const remainingMs = FIUU_VT_TERMINAL_SETTLE_MS - (Date.now() - startedAtMs);
 if (remainingMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, remainingMs));
 }
}

export async function POST(
 request: Request,
 context: { params: Promise<{ paymentId: string }> },
) {
 const limited = enforceRateLimit(request, {
  key: 'pos-fiuu-vt-result',
  limit: 60,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const body: unknown = await request.json().catch(() => null);
 let result: FiuuVtResult;
 try {
  result = parseFiuuVtResult(
   body && typeof body === 'object' && !Array.isArray(body)
    ? Reflect.get(body, 'result')
    : null,
  );
 } catch (error) {
  return NextResponse.json(
   { error: error instanceof Error ? error.message : 'Keputusan Fiuu VT tidak sah' },
   { status: 400 },
  );
 }

 const { paymentId } = await context.params;
 const admin = createAdminClient();
 const { data: payment, error } = await admin
  .from('pos_online_payments')
  .select('id, organization_id, branch_id, shift_id, created_by, provider, status, amount_rm, expires_at, sale_payload, provider_order_id, provider_transaction_id, provider_result, provider_sale_reported_at, provider_status_checked_at')
  .eq('id', paymentId)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();
 if (error) return NextResponse.json({ error: 'Percubaan Fiuu VT tidak dapat dibaca' }, { status: 400 });
 if (!payment || payment.provider !== 'fiuu_vt') {
  return NextResponse.json({ error: 'Percubaan Fiuu VT tidak dijumpai' }, { status: 404 });
 }

 try {
  await assertCanAccessPosBranch(admin, profile, payment.branch_id);
  const device = await assertOfficialPosDevice(profile, payment.branch_id);
  await assertActivePosShiftMember(admin, profile, payment.shift_id, payment.branch_id);
  const salePayload = jsonRecord(payment.sale_payload);
  const deviceBranchCode = normalizeFiuuVtBranchCode(device.branchCode);
  const paymentBranchCode = normalizeFiuuVtBranchCode(salePayload?.fiuu_branch_code);
  if (payment.created_by !== profile.id
   || salePayload?.fiuu_device_id !== device.id
   || salePayload?.fiuu_device_code !== device.deviceCode
   || Number(salePayload?.fiuu_enrollment_generation) !== device.enrollmentGeneration
   || !deviceBranchCode
   || paymentBranchCode !== deviceBranchCode) {
   return NextResponse.json({ error: 'Percubaan Fiuu VT bukan milik sesi tablet ini' }, { status: 403 });
  }
 } catch (accessError) {
  return NextResponse.json(
   { error: accessError instanceof Error ? accessError.message : 'Akses Fiuu VT ditolak' },
   { status: posAccessErrorStatus(accessError) },
  );
 }

 if (payment.status === 'PAID') {
  return NextResponse.json({ payment: { id: payment.id, status: 'PAID' }, next_action: 'COMPLETE' });
 }
 const canRecoverConcurrentSuccess = result.opType === 'STATUS'
  && result.status === '00'
  && isRecentTerminalStatus(payment.status, payment.provider_status_checked_at);
 if (payment.status !== 'PENDING' && payment.status !== 'REPORTED'
  && !canRecoverConcurrentSuccess) {
  return NextResponse.json(
   { error: 'Percubaan Fiuu VT sudah ditutup', mode: 'FIUU_ATTEMPT_TERMINAL' },
   { status: 409 },
  );
 }
 const expiresAtMs = payment.expires_at ? new Date(payment.expires_at).getTime() : Number.NaN;
 const normalReconciliationDeadline = expiresAtMs + FIUU_CALLBACK_GRACE_MS;
 const lateRecoveryDeadline = normalReconciliationDeadline + getFiuuVtLateRecoveryMs();
 const normalGraceExpired = payment.status === 'PENDING'
  && Number.isFinite(normalReconciliationDeadline)
  && Date.now() > normalReconciliationDeadline;
 const previewLateSaleRecovery = normalGraceExpired
  && Date.now() <= lateRecoveryDeadline
  && result.opType === 'SALE'
  && result.status === '00'
  && !payment.provider_sale_reported_at
  && !payment.provider_transaction_id;
 const previewLateStatusRecovery = normalGraceExpired
  && Date.now() <= lateRecoveryDeadline
  && result.opType === 'STATUS'
  && Boolean(payment.provider_sale_reported_at)
  && payment.provider_transaction_id === result.transactionId;
 if (normalGraceExpired && !previewLateSaleRecovery && !previewLateStatusRecovery) {
  return NextResponse.json(
   { error: 'Tempoh rekonsiliasi Fiuu VT telah tamat', mode: 'FIUU_ATTEMPT_TERMINAL' },
   { status: 409 },
  );
 }
 if (payment.provider_order_id !== result.orderId
  || Math.round(Number(payment.amount_rm) * 100) !== Math.round(result.amountRm * 100)) {
  return NextResponse.json({ error: 'Keputusan Fiuu VT tidak sepadan dengan jualan' }, { status: 409 });
 }
 const checkedAtMs = Date.now();
 const checkedAt = new Date(checkedAtMs).toISOString();
 const safeResult = sanitizedResult(result);
 if (result.opType === 'SALE') {
  // The mobile SALE callback is not signed. Record it as evidence, but require
  // a fresh provider STATUS result before any failed/cancelled/expired outcome
  // is allowed to release the cashier or mutate fulfilment state.
  if (payment.provider_sale_reported_at || payment.provider_transaction_id) {
   if (payment.provider_transaction_id !== result.transactionId) {
    return NextResponse.json({ error: 'Transaction ID SALE Fiuu VT tidak sepadan' }, { status: 409 });
   }
   if (payment.status === 'REPORTED') {
    return NextResponse.json({
     payment: { id: payment.id, status: 'REPORTED' },
     next_action: 'AUTO_CONFIRMATION',
     warning: 'Bayaran berjaya telah dilaporkan. RKJ One akan memuktamadkan jualan secara automatik.',
    });
   }
   return NextResponse.json({
    payment: { id: payment.id, status: 'PENDING' },
    next_action: 'CHECK_STATUS',
   });
  }
  const { data: updatedSale, error: updateError } = await admin
   .from('pos_online_payments')
   .update({
    provider_result: safeResult,
    provider_transaction_id: result.transactionId,
    provider_sale_reported_at: checkedAt,
    provider_status_checked_at: null,
    updated_at: checkedAt,
   })
   .eq('id', payment.id)
   .eq('status', 'PENDING')
   .is('provider_sale_reported_at', null)
   .is('provider_transaction_id', null)
   .select('id')
   .maybeSingle();
  if (updateError) return NextResponse.json({ error: 'Laporan SALE Fiuu VT gagal disimpan' }, { status: 400 });
  if (!updatedSale) {
   return NextResponse.json({ error: 'Laporan SALE Fiuu VT bertindih. Jalankan semakan STATUS semula.' }, { status: 409 });
  }
  return NextResponse.json({
   payment: { id: payment.id, status: 'PENDING' },
   next_action: 'CHECK_STATUS',
  });
 }

 if (!payment.provider_sale_reported_at || !payment.provider_transaction_id) {
  return NextResponse.json(
   { error: 'Laporan SALE Fiuu VT diperlukan sebelum semakan STATUS', mode: 'FIUU_VT_SALE_REQUIRED' },
   { status: 409 },
  );
 }
 if (payment.provider_transaction_id !== result.transactionId) {
  return NextResponse.json({ error: 'Semakan STATUS tidak sepadan dengan transaksi SALE Fiuu VT' }, { status: 409 });
 }

 // Once STATUS=00 is stored, a later non-success callback must never replace
 // that evidence. The automatic fulfilment RPC relies on this exact result.
 if (payment.status === 'REPORTED') {
  if (result.status !== '00') {
   return NextResponse.json(
    {
     error: 'Keputusan Fiuu VT bercanggah dengan kejayaan terdahulu. Jangan sahkan atau jana SALE baharu; hubungi HQ untuk rekonsiliasi.',
     mode: 'FIUU_VT_RECONCILIATION_REQUIRED',
    },
    { status: 409 },
   );
  }
  return NextResponse.json({
   payment: { id: payment.id, status: 'REPORTED' },
   next_action: 'AUTO_CONFIRMATION',
   warning: 'Bayaran berjaya telah dilaporkan. RKJ One akan memuktamadkan jualan secara automatik.',
  });
 }

 // A STATUS=55/11/44 response and STATUS=00 can cross in flight. Give the
 // matching success a very short, compare-and-swap recovery window before a
 // cashier is allowed to create another charge for the same cart.
 if (canRecoverConcurrentSuccess && payment.provider_status_checked_at) {
  const { data: recoveredSuccess, error: recoveryError } = await admin
   .from('pos_online_payments')
   .update({
    status: 'REPORTED',
    provider_result: safeResult,
    provider_status_checked_at: checkedAt,
    failed_at: null,
    updated_at: checkedAt,
   })
   .eq('id', payment.id)
   .eq('status', payment.status)
   .eq('provider_transaction_id', result.transactionId)
   .eq('provider_status_checked_at', payment.provider_status_checked_at)
   .not('provider_sale_reported_at', 'is', null)
   .select('id')
   .maybeSingle();
  if (recoveryError) {
   return NextResponse.json({ error: 'Kejayaan Fiuu VT lewat gagal dikunci' }, { status: 400 });
  }
  if (!recoveredSuccess) {
   const { data: refreshed } = await admin
    .from('pos_online_payments')
    .select('status')
    .eq('id', payment.id)
    .maybeSingle();
   if (refreshed?.status === 'PAID') {
    return NextResponse.json({ payment: { id: payment.id, status: 'PAID' }, next_action: 'COMPLETE' });
   }
   if (refreshed?.status !== 'REPORTED') {
    return NextResponse.json({ error: 'Status percubaan Fiuu VT berubah. Semak semula transaksi.' }, { status: 409 });
   }
  }
  return NextResponse.json({
   payment: { id: payment.id, status: 'REPORTED' },
   next_action: 'AUTO_CONFIRMATION',
   warning: 'STATUS Fiuu VT berjaya diterima. RKJ One sedang memuktamadkan jualan secara automatik.',
  });
 }

 const disposition = getFiuuVtStatusDisposition(result.status);
 const terminalStatus = disposition === 'FAILED'
  || disposition === 'CANCELLED'
  || disposition === 'EXPIRED'
  ? disposition
  : null;
 const nextStatus = disposition === 'REPORTED'
  ? 'REPORTED'
  : terminalStatus;
 const update = {
  provider_result: safeResult,
  provider_status_checked_at: checkedAt,
  updated_at: checkedAt,
  ...(nextStatus ? {
   status: nextStatus,
   ...(terminalStatus ? { failed_at: checkedAt } : {}),
  } : {}),
 };
 const { data: updatedStatus, error: updateError } = await admin
  .from('pos_online_payments')
  .update(update)
  .eq('id', payment.id)
  .eq('status', 'PENDING')
  .eq('provider_transaction_id', result.transactionId)
  .not('provider_sale_reported_at', 'is', null)
  .select('id')
  .maybeSingle();
 if (updateError) {
  return NextResponse.json({ error: 'Keputusan STATUS Fiuu VT gagal disimpan' }, { status: 400 });
 }
 if (!updatedStatus) {
  const { data: refreshed, error: refreshError } = await admin
   .from('pos_online_payments')
   .select('status, provider_status_checked_at')
   .eq('id', payment.id)
   .maybeSingle();
  if (refreshError || !refreshed) {
   return NextResponse.json({ error: 'Status percubaan Fiuu VT berubah. Semak semula transaksi.' }, { status: 409 });
  }
  if (refreshed.status === 'PAID') {
   return NextResponse.json({ payment: { id: payment.id, status: 'PAID' }, next_action: 'COMPLETE' });
  }
  if (refreshed.status === 'REPORTED') {
   return NextResponse.json({
    payment: { id: payment.id, status: 'REPORTED' },
    next_action: 'AUTO_CONFIRMATION',
   });
  }
  if (result.status === '00'
   && isRecentTerminalStatus(refreshed.status, refreshed.provider_status_checked_at)
   && refreshed.provider_status_checked_at) {
   const { data: recoveredSuccess, error: recoveryError } = await admin
    .from('pos_online_payments')
    .update({
     status: 'REPORTED',
     provider_result: safeResult,
     provider_status_checked_at: checkedAt,
     failed_at: null,
     updated_at: checkedAt,
    })
    .eq('id', payment.id)
    .eq('status', refreshed.status)
    .eq('provider_transaction_id', result.transactionId)
    .eq('provider_status_checked_at', refreshed.provider_status_checked_at)
    .not('provider_sale_reported_at', 'is', null)
    .select('id')
    .maybeSingle();
   if (recoveryError) {
    return NextResponse.json({ error: 'Kejayaan Fiuu VT serentak gagal dikunci' }, { status: 400 });
   }
   if (recoveredSuccess) {
    return NextResponse.json({
     payment: { id: payment.id, status: 'REPORTED' },
     next_action: 'AUTO_CONFIRMATION',
     warning: 'STATUS Fiuu VT berjaya diterima. RKJ One sedang memuktamadkan jualan secara automatik.',
    });
   }
  }
  if (TERMINAL_PAYMENT_STATUSES.has(refreshed.status) && result.status !== '00') {
   return NextResponse.json({
    payment: { id: payment.id, status: refreshed.status },
    next_action: 'COMPLETE',
   });
  }
  return NextResponse.json({ error: 'Status percubaan Fiuu VT berubah. Semak semula transaksi.' }, { status: 409 });
 }

 if (result.status === '00') {
  return NextResponse.json({
   payment: { id: payment.id, status: 'REPORTED' },
   next_action: 'AUTO_CONFIRMATION',
   warning: 'STATUS Fiuu VT berjaya diterima. RKJ One sedang memuktamadkan jualan secara automatik.',
  });
 }
 if (terminalStatus) {
  await waitForTerminalSettle(checkedAtMs);
  const { data: settled, error: settleError } = await admin
   .from('pos_online_payments')
   .select('status')
   .eq('id', payment.id)
   .maybeSingle();
  if (settleError || !settled) {
   return NextResponse.json({ error: 'Status akhir Fiuu VT tidak dapat disahkan' }, { status: 400 });
  }
  if (settled.status === 'PAID') {
   return NextResponse.json({ payment: { id: payment.id, status: 'PAID' }, next_action: 'COMPLETE' });
  }
  if (settled.status === 'REPORTED') {
   return NextResponse.json({
    payment: { id: payment.id, status: 'REPORTED' },
    next_action: 'AUTO_CONFIRMATION',
   });
  }
 }
 if (result.status === '55') {
  return NextResponse.json({
   payment: { id: payment.id, status: 'EXPIRED' },
   next_action: 'COMPLETE',
   warning: 'Kod QR Fiuu VT telah tamat tempoh. Troli dikekalkan dan staf boleh cuba bayaran baharu.',
  });
 }
 if (isFiuuVtPendingStatus(result.status)) {
  return NextResponse.json({
   payment: { id: payment.id, status: 'PENDING' },
   next_action: 'CHECK_STATUS_LATER',
  });
 }
 return NextResponse.json({
  payment: { id: payment.id, status: terminalStatus ?? 'FAILED' },
  next_action: 'COMPLETE',
 });
}
