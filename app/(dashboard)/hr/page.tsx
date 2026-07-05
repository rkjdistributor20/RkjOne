import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyHrDashboard } from '@/lib/hr/company-hr';
import { getEmployeeHrSelfServiceDashboard } from '@/lib/hr/employee-self-service';
import { CompanyHrDashboard } from '@/components/hr/company-hr-dashboard';
import { EmployeeHrmisDashboard } from '@/components/hr/employee-hrmis-dashboard';

const HR_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR'] as const;

export default async function HrPage() {
 const profile = await getCurrentProfile();
 if (!profile) redirect('/login');

 const service = await createServiceClient();
 if (!HR_ROLES.includes(profile.role as (typeof HR_ROLES)[number])) {
 const data = await getEmployeeHrSelfServiceDashboard(service, profile);
 return <EmployeeHrmisDashboard data={data} />;
 }

 const data = await getCompanyHrDashboard(service, profile.organization_id);

 return <CompanyHrDashboard data={data} />;
}
