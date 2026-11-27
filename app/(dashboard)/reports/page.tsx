import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OperationalReportWorkspace } from '@/components/reports/operational-report-workspace';
import { mytToday, readSelection, workspaceUrl, type ReportQuery } from '@/components/reports/operations/model';
import { ReportsDashboard } from '@/components/reports/reports-dashboard';
import { isAreaManagerRole } from '@/lib/auth/area-manager-access';
import { isAdminRole } from '@/lib/auth/permissions';
import { getCurrentProfile } from '@/lib/auth/session';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportQuery> }) {
 const profile = await getCurrentProfile();
 if (!profile) redirect('/login');

 const admin = isAdminRole(profile.role);
 const area = isAreaManagerRole(profile.role);
 if (!admin && !area) return <ReportsDashboard />;

 const query = await searchParams;
 const today = mytToday();
 const selection = readSelection(query, today, admin);
 if (query.mode === 'legacy') {
  return <>
   <div className="rkj-dashboard-shell pb-0">
    <Link href={workspaceUrl(selection)} className="text-sm font-medium underline underline-offset-4">Kembali ke Laporan Operasi</Link>
   </div>
   <ReportsDashboard supplemental initialFilters={{
    from: selection.filters.from, to: selection.filters.to, branchId: selection.filters.branchId,
   }} />
  </>;
 }

 // Owner is stored as SUPER_ADMIN; there is no separate OWNER auth role.
 const scope = profile.role === 'SUPER_ADMIN' ? 'owner' : admin ? 'admin' : 'area';
 return <OperationalReportWorkspace initial={selection} today={today} scope={scope} />;
}
