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

function classifyTargetConfigurationFailure(error: unknown): string {
 if (!(error instanceof Error)) return 'target-unknown';

 const message = error.message;
 if (message.startsWith('Kod cawangan pilot Fiuu OPA')) return 'target-allowlist';
 if (message.startsWith('POS_FIUU_APPLICATIONS_JSON')) return 'target-json';
 if (message.startsWith('Konfigurasi OPA Fiuu')) return 'target-credentials';
 if (message.startsWith('Application Code Fiuu')) return 'target-application-code';
 if (message.startsWith('Store ID Fiuu')) return 'target-store-id';
 if (message.startsWith('Terminal ID Fiuu')) return 'target-terminal-id';
 if (message.startsWith('Versi kelayakan Fiuu')) return 'target-credential-version';
 if (message.startsWith('Persekitaran Fiuu')) return 'target-environment';
 if (message.startsWith('RKJ One hanya membenarkan saluran')) return 'target-channel';
 if (message.startsWith('Endpoint Fiuu')) return 'target-endpoint';
 if (message.startsWith('Kod pemetaan cawangan Fiuu OPA')
  || message.startsWith('Pemetaan cawangan Fiuu OPA berulang')
  || message.startsWith('Pemetaan Fiuu OPA')
  || message.startsWith('Konfigurasi Fiuu ')
  || message.startsWith('Organization ID atau Branch ID Fiuu')) {
  return 'target-mapping';
 }
 return 'target-unknown';
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

 let failureStage = 'environment';
 try {
  if (!isExpectedStagingProject()) {
   return jsonError('Projek staging Fiuu OPA tidak sah', 503);
  }
  if (getPosQrPaymentMode() !== 'fiuu') {
   return jsonError('Fiuu OPA Preview belum dikonfigurasi', 503);
  }

  failureStage = 'target-configuration';
  let targets: ReturnType<typeof getFiuuOpaConfiguredTargets>;
  try {
   targets = getFiuuOpaConfiguredTargets();
  } catch (error) {
   failureStage = classifyTargetConfigurationFailure(error);
   throw error;
  }
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

  failureStage = 'staging-database';
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

  failureStage = 'rollout-readiness';
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

  failureStage = 'fingerprint';
  return NextResponse.json({
   configurationSha256: getFiuuOpaConfigurationFingerprint(config),
   rolloutControlReady: true,
   active,
  }, { headers: NO_STORE_HEADERS });
 } catch {
  console.error(`[fiuu-opa-preflight] failed at ${failureStage}`);
  return jsonError('Preflight Fiuu OPA gagal secara selamat', 503);
 }
}
