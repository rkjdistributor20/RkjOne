import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
 getFiuuOpaConfig,
 getFiuuOpaConfigurationFingerprint,
 getPosQrPaymentMode,
} from '@/lib/pos/fiuu';
import {
 getFiuuOpaConfiguredTargets,
} from '@/lib/pos/fiuu-opa-server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
 'Cache-Control': 'private, no-store',
};
const EXPECTED_STAGING_SUPABASE_HOSTNAME = 'lktggxwgaormnzfwcogx.supabase.co';

function jsonError(error: string, status: number) {
 return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

function isExpectedStagingProject(): boolean {
 try {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  return url.protocol === 'https:'
   && url.hostname === EXPECTED_STAGING_SUPABASE_HOSTNAME;
 } catch {
  return false;
 }
}

/**
 * Preview-only operational probe used to bind one reviewed Fiuu OPA
 * configuration generation to the staging rollout gate. It deliberately
 * returns only the non-secret fingerprint; provider identifiers and the
 * Secret Key never leave the server process.
 */
export async function GET() {
 if (process.env.VERCEL_ENV !== 'preview') {
  return jsonError('Not found', 404);
 }

 const profile = await getCurrentProfile();
 if (!profile) return jsonError('Tidak dibenarkan', 401);
 if (profile.role !== 'SUPER_ADMIN') {
  return jsonError('Akses pentadbir utama sahaja', 403);
 }

 try {
  if (!isExpectedStagingProject()) {
   return jsonError('Projek staging Fiuu OPA tidak sah', 503);
  }
  if (getPosQrPaymentMode() !== 'fiuu') {
   return jsonError('Fiuu OPA Preview belum dikonfigurasi', 503);
  }

  const targets = getFiuuOpaConfiguredTargets();
  if (targets.length !== 1 || targets[0]?.branchCode !== 'BR001') {
   return jsonError('Skop Fiuu OPA Preview tidak sah', 503);
  }

  const target = targets[0];
  if (target.organizationId !== profile.organization_id) {
   return jsonError('Skop organisasi tidak dibenarkan', 403);
  }

  const config = getFiuuOpaConfig(target, { requireActiveMode: false });
  if (!config || config.environment !== 'sandbox') {
   return jsonError('Konfigurasi sandbox Fiuu OPA tidak sah', 503);
  }

  const service = createAdminClient();
  const { data: branch, error: branchError } = await service
   .from('branches')
   .select('id, organization_id, branch_code, status')
   .eq('id', target.branchId)
   .eq('organization_id', target.organizationId)
   .maybeSingle();
  if (branchError
   || !branch
   || branch.id !== target.branchId
   || branch.organization_id !== target.organizationId
   || branch.branch_code.trim().toUpperCase() !== 'BR001'
   || branch.status !== 'ACTIVE') {
   return jsonError('Identiti BR001 staging tidak sah', 503);
  }

  const rolloutProbe = service as unknown as {
   rpc: (
    functionName:
     | 'is_pos_fiuu_opa_rollout_control_ready'
     | 'is_pos_fiuu_opa_branch_active',
    args?: Record<string, string>,
   ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const { data: rolloutControlReady, error: readinessError } = await rolloutProbe
   .rpc('is_pos_fiuu_opa_rollout_control_ready');
  if (readinessError || rolloutControlReady !== true) {
   return jsonError('Kawalan rollout Fiuu OPA belum sedia', 503);
  }

  const { data: active, error: activeError } = await rolloutProbe.rpc(
   'is_pos_fiuu_opa_branch_active',
   {
    p_organization_id: target.organizationId,
    p_branch_id: target.branchId,
    p_branch_code: 'BR001',
    p_environment: config.environment,
    p_application_code: config.applicationCode,
    p_store_id: config.storeId,
    p_terminal_id: config.terminalId,
    p_credential_version: config.credentialVersion,
   },
  );
  if (activeError || typeof active !== 'boolean') {
   return jsonError('Status rollout Fiuu OPA tidak dapat disahkan', 503);
  }

  return NextResponse.json({
   configurationSha256: getFiuuOpaConfigurationFingerprint(config),
   rolloutControlReady: true,
   active,
  }, { headers: NO_STORE_HEADERS });
 } catch {
  return jsonError('Preflight Fiuu OPA gagal secara selamat', 503);
 }
}
