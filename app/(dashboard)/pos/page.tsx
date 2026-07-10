import { redirect } from 'next/navigation';
import { PosTerminal } from '@/components/pos/pos-terminal';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { agentHasPosAccess } from '@/lib/sales-agent/service';

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
 return <PosTerminal />;
}
