import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { assertCanAccessPosBranch, posAccessErrorStatus } from '@/lib/pos/access';
import { getPosQrPaymentMode } from '@/lib/pos/fiuu';
import { getFiuuCloudEcrConfig } from '@/lib/pos/fiuu-cloudecr';
import {
 FIUU_CLOUDECR_APP_PACKAGE,
 isFiuuCloudEcrEnabledForBranch,
} from '@/lib/pos/fiuu-cloudecr-server';
import { FIUU_VT_DUITNOW_CHANNEL, FIUU_VT_PACKAGE } from '@/lib/pos/fiuu-vt';
import { isFiuuVtEnabledForBranch } from '@/lib/pos/fiuu-vt-server';
import { getFiuuStaticQrConfig } from '@/lib/pos/fiuu-static';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
 const limited = enforceRateLimit(request, {
  key: 'pos-qr-config',
  limit: 120,
  windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const branchId = new URL(request.url).searchParams.get('branch_id')?.trim();
 if (!branchId) {
  return NextResponse.json({ error: 'Branch required' }, { status: 400 });
 }

 const supabase = await createClient();
 try {
  await assertCanAccessPosBranch(supabase, profile, branchId);
 } catch (error) {
  return NextResponse.json(
   { error: error instanceof Error ? error.message : 'Akses cawangan ditolak' },
   { status: posAccessErrorStatus(error) },
  );
 }

 const { data: branch, error } = await supabase
  .from('branches')
  .select('id, branch_code, branch_name, status')
  .eq('id', branchId)
  .eq('organization_id', profile.organization_id)
  .maybeSingle();

 if (error) return NextResponse.json({ error: error.message }, { status: 400 });
 if (!branch) return NextResponse.json({ error: 'Cawangan tidak dijumpai' }, { status: 404 });

 const staticQr = getFiuuStaticQrConfig(branch.branch_code);
 const paymentMode = getPosQrPaymentMode();
 const dynamic = paymentMode === 'fiuu';
 let vtEnabled = false;
 let cloudEcrEnabled = false;
 try {
  vtEnabled = paymentMode === 'fiuu_vt' && isFiuuVtEnabledForBranch(branch.branch_code);
 } catch (configurationError) {
  console.error('[pos-fiuu-vt] invalid_branch_configuration', {
   reason: configurationError instanceof Error ? configurationError.message : 'unknown',
  });
 }
 try {
  cloudEcrEnabled = paymentMode === 'fiuu_cloudecr'
   && isFiuuCloudEcrEnabledForBranch(branch.branch_code);
  if (cloudEcrEnabled) getFiuuCloudEcrConfig();
 } catch (configurationError) {
  cloudEcrEnabled = false;
  console.error('[pos-fiuu-cloudecr] invalid_branch_configuration', {
   reason: configurationError instanceof Error ? configurationError.message : 'unknown',
  });
 }

 return NextResponse.json(
  {
   mode: dynamic
    ? 'FIUU_DYNAMIC'
    : cloudEcrEnabled
     ? 'FIUU_CLOUDECR'
     : vtEnabled
      ? 'FIUU_VT_APP'
      : 'FIUU_STATIC_MANUAL',
   branch: {
    id: branch.id,
    code: branch.branch_code,
    name: branch.branch_name,
   },
   staticQr,
   vt: vtEnabled ? {
    packageName: FIUU_VT_PACKAGE,
    channel: FIUU_VT_DUITNOW_CHANNEL,
    pilot: true,
   } : null,
   cloudEcr: cloudEcrEnabled ? {
    appPackageName: FIUU_CLOUDECR_APP_PACKAGE,
    pilot: true,
   } : null,
   configured: dynamic || cloudEcrEnabled || vtEnabled || Boolean(staticQr),
  },
  {
   headers: {
    'Cache-Control': paymentMode === 'fiuu_vt' || paymentMode === 'fiuu_cloudecr'
     ? 'private, no-store'
     : 'private, max-age=300, stale-while-revalidate=600',
   },
  },
 );
}
