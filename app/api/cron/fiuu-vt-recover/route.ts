import { NextResponse } from 'next/server';
import {
 hasValidBearerAuthorization,
 isFiuuReconciliationEnabled,
 recoveryRunResponse,
 runFiuuVtRecovery,
} from '../../../../lib/pos/fiuu-vt-recovery-worker';
import { recordFiuuVtRecoverySuccess } from '../../../../lib/pos/fiuu-vt-recovery-heartbeat';

export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
 if (!isFiuuReconciliationEnabled()) {
  return NextResponse.json(
   { error: 'Fiuu reconciliation worker is disabled' },
   { status: 503, headers: NO_STORE_HEADERS },
  );
 }

 const secret = (process.env.CRON_SECRET ?? '').trim();
 if (secret.length < 32) {
  return NextResponse.json(
   { error: 'Fiuu reconciliation cron is not configured' },
   { status: 503, headers: NO_STORE_HEADERS },
  );
 }
 if (!hasValidBearerAuthorization(request, secret)) {
  return NextResponse.json(
   { error: 'Unauthorized' },
   { status: 401, headers: NO_STORE_HEADERS },
  );
 }

 try {
  const run = await runFiuuVtRecovery();
  if (run.status !== 200) return recoveryRunResponse(run);
  if (!await recordFiuuVtRecoverySuccess()) {
   console.error('[pos-fiuu-vt] recovery_heartbeat_record_failed');
   return NextResponse.json(
    { error: 'Fiuu VT recovery heartbeat could not be recorded' },
    { status: 503, headers: NO_STORE_HEADERS },
   );
  }
  return recoveryRunResponse(run);
 } catch {
  console.error('[pos-fiuu-vt] recovery_cron_failed');
  return NextResponse.json(
   { error: 'Fiuu VT recovery cron failed' },
   { status: 503, headers: NO_STORE_HEADERS },
  );
 }
}
