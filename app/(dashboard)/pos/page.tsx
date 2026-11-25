import { redirect } from 'next/navigation';
import { PosTerminal } from '@/components/pos/pos-terminal';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { agentHasPosAccess } from '@/lib/sales-agent/service';
import { getReleaseMetadata } from '@/lib/pwa/release-metadata';
import { getFiuuVtCashierReleaseBranches, isFiuuVtCashierReleaseEnabledForBranch } from '@/lib/pos/fiuu-vt-server';

export default async function PosPage() {
 const profile = await getCurrentProfile();
 if (!profile) {
 redirect('/login?redirect=%2Fpos');
 }

 if (profile?.role === 'SALES_AGENT') {
 const service = await createServiceClient();
 const allowed = await agentHasPosAccess(service, profile.id);
 if (!allowed) {
 redirect('/sales-agent?pos=locked');
 }
 }
 let draftRecoveryBranches: string[] = [];
 try {
  draftRecoveryBranches = [...getFiuuVtCashierReleaseBranches()].filter(isFiuuVtCashierReleaseEnabledForBranch);
 } catch {
  // An invalid pilot configuration must not stop normal POS from opening.
 }
 return <PosTerminal webCommit={getReleaseMetadata().commitSha} draftRecoveryBranches={draftRecoveryBranches} />;
}
