import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyHrDashboard } from '@/lib/hr/company-hr';
import { CompanyHrDashboard } from '@/components/hr/company-hr-dashboard';

const HR_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR'] as const;

export default async function HrPage() {
 const profile = await getCurrentProfile();
 if (!profile) redirect('/login');

 if (!HR_ROLES.includes(profile.role as (typeof HR_ROLES)[number])) {
 redirect('/dashboard');
 }

 const service = await createServiceClient();
 const data = await getCompanyHrDashboard(service, profile.organization_id);

 return <CompanyHrDashboard data={data} />;
}
