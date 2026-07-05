'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, CalendarRange, Users } from 'lucide-react';
import {
 fetchCompanyPayroll,
 generateWeeklyForeignReport,
} from '@/lib/payroll/api';
import type { CompanyPayrollDashboard, CompanyPayrollGroup } from '@/lib/payroll/company-payroll';
import { getPreviousCompleteWeek } from '@/lib/payroll/weekly-report';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { WorkerTypeBadge } from '@/components/payroll/worker-type-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KpiCard, KpiGrid, formatRM } from '@/components/shared/module-ui';

function CompanyPayrollCard({ company }: { company: CompanyPayrollGroup }) {
 return (
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <LegalEntityLogo size={24} />
 {company.legal_name}
 <Badge variant="outline">{company.code}</Badge>
 </CardTitle>
 <p className="text-xs text-muted-foreground">{company.scope}</p>
 </CardHeader>
 <CardContent className="space-y-4">
 <KpiGrid cols={4}>
 <KpiCard title="Staf" value={company.staff.length} icon={Users} />
 <KpiCard title="Pekerja Asing" value={company.foreign_count} variant="warning" />
 <KpiCard title="Gaji Mingguan" value={formatRM(company.weekly_payroll_total)} />
 <KpiCard title="Gaji Bulanan" value={formatRM(company.monthly_payroll_total)} />
 </KpiGrid>

 <div className="overflow-x-auto rounded-lg border">
 <table className="w-full text-xs">
 <thead>
 <tr className="border-b bg-muted/50 text-left text-muted-foreground">
 <th className="p-2">Staf</th>
 <th className="p-2">Cawangan</th>
 <th className="p-2">Jenis</th>
 <th className="p-2">Gaji (auto)</th>
 </tr>
 </thead>
 <tbody>
 {company.staff.map((s) => (
 <tr key={s.id} className="border-b">
 <td className="p-2">
 <p className="font-medium">{s.full_name}</p>
 <p className="text-muted-foreground">{s.staff_code}</p>
 </td>
 <td className="p-2">{s.branch_name ?? ' - '}</td>
 <td className="p-2">
 <WorkerTypeBadge workerType={s.worker_type} />
 </td>
 <td className="p-2 font-medium tabular-nums">{s.pay_label ?? ' - '}</td>
 </tr>))}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>);
}

export function CompanyPayrollSection() {
 const [data, setData] = useState<CompanyPayrollDashboard | null>(null);
 const [loading, setLoading] = useState(true);
 const [generating, setGenerating] = useState(false);
 const [lastReport, setLastReport] = useState<{
 week: string;
 workers: number;
 } | null>(null);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetchCompanyPayroll();
 setData(res);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal muat gaji syarikat');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 load();
 }, [load]);

 async function handleWeeklyReport() {
 setGenerating(true);
 try {
 const week = getPreviousCompleteWeek();
 const res = await generateWeeklyForeignReport(week);
 setLastReport({ week: week.label, workers: res.foreign_workers });
 toast.success(`Laporan mingguan dijana - ${res.foreign_workers} pekerja asing`);
 load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal jana laporan');
 } finally {
 setGenerating(false);
 }
 }

 if (loading || !data) {
 return <p className="text-sm text-muted-foreground">Memuatkan pecahan syarikat...</p>;
 }

 const week = getPreviousCompleteWeek();

 return (
 <div className="space-y-4">
 <Card className="border-orange-200 bg-orange-50/40">
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <CalendarRange className="h-4 w-4" />
 Laporan Mingguan Pekerja Asing (Auto)
 </CardTitle>
 <p className="text-xs text-muted-foreground">
 RKJ: pekerja asing (mingguan) + staf jualan tempatan (peraturan PR). RKJ_DIST & RKJ_MFG: gaji bulanan rekod HR.
 </p>
 </CardHeader>
 <CardContent className="flex flex-wrap items-center gap-3">
 <Button
 className="bg-orange-500 hover:bg-orange-600"
 onClick={handleWeeklyReport}
 disabled={generating}
 >
 {generating ? 'Menjana...' : 'Jana Laporan Mingguan'}
 </Button>
 {lastReport && (
 <Badge variant="outline">
 {lastReport.week} - {lastReport.workers} pekerja
 </Badge>)}
 </CardContent>
 </Card>

 <KpiGrid cols={4}>
 <KpiCard title="Jumlah Staf" value={data.summary.total_staff} icon={Users} />
 <KpiCard title="Pekerja Asing" value={data.summary.foreign_staff} variant="warning" />
 <KpiCard title="Jumlah Mingguan" value={formatRM(data.summary.weekly_total)} />
 <KpiCard title="Jumlah Bulanan" value={formatRM(data.summary.monthly_total)} />
 </KpiGrid>

 <Tabs defaultValue={data.companies[0]?.code ?? 'RKJ'}>
 <TabsList>
 {data.companies.map((c) => (
 <TabsTrigger key={c.code} value={c.code} className="gap-1.5">
 <Building2 className="h-3.5 w-3.5" />
 {c.code}
 </TabsTrigger>))}
 </TabsList>
 {data.companies.map((company) => (
 <TabsContent key={company.code} value={company.code} className="mt-4">
 <CompanyPayrollCard company={company} />
 </TabsContent>))}
 </Tabs>
 </div>);
}
