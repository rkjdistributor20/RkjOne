'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { Wallet, FileText, Settings, Users, Building2 } from 'lucide-react';
import {
 ModuleLayout,
 ModuleHeader,
 ModuleLoading,
 moduleTabsListClass,
 moduleTabsTriggerClass,
} from '@/components/shared/module-ui';
import {
 fetchPayrollRuns,
 fetchPayrollRules,
 fetchCommissionTiers,
 fetchPayrollStaff,
 generatePayrollRun,
 approvePayrollRun,
 updatePayrollRule,
} from '@/lib/payroll/api';
import { staffPayDisplay } from '@/lib/payroll/staff-pay-rates';
import { WorkerTypeBadge, resolveWorkerType } from '@/components/payroll/worker-type-badge';
import { CompanyPayrollSection } from '@/components/payroll/company-payroll-section';
import { AiPayrollProposalSection } from '@/components/payroll/ai-payroll-proposal';
import type {
 CommissionTier,
 PayrollLineItem,
 PayrollRule,
 PayrollRun,
 PayrollStaffRow,
} from '@/lib/payroll/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowSopPanel } from '@/components/dashboard/workflow-sop-panel';
import { getRoleWorkflow } from '@/lib/dashboard/role-workflows';

function fmt(n: number) {
 return `RM ${Number(n).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`;
}

export function PayrollOperationsPanel() {
 const [runs, setRuns] = useState<PayrollRun[]>([]);
 const [rules, setRules] = useState<PayrollRule[]>([]);
 const [tiers, setTiers] = useState<CommissionTier[]>([]);
 const [staff, setStaff] = useState<PayrollStaffRow[]>([]);
 const [loading, setLoading] = useState(true);
 const [expandedRun, setExpandedRun] = useState<string | null>(null);
 const [periodStart, setPeriodStart] = useState(() => {
 const d = new Date();
 d.setDate(1);
 return d.toISOString().slice(0, 10);
 });
 const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
 const [generating, setGenerating] = useState(false);
 const [editRates, setEditRates] = useState<Record<string, string>>({});

 const loadData = useCallback(async () => {
 setLoading(true);
 try {
 const [r, ru, t, st] = await Promise.all([
 fetchPayrollRuns(),
 fetchPayrollRules(),
 fetchCommissionTiers(),
 fetchPayrollStaff(),
 ]);
 setRuns(r.runs as PayrollRun[]);
 setRules(ru.rules);
 setTiers(t.tiers);
 setStaff(st.staff);
 const rates: Record<string, string> = {};
 ru.rules.forEach((rule) => {
 if (rule.rate != null) rates[rule.id] = String(rule.rate);
 });
 setEditRates(rates);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan gaji');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 loadData();
 }, [loadData]);

 async function handleGenerate() {
 setGenerating(true);
 try {
 await generatePayrollRun({ period_start: periodStart, period_end: periodEnd });
 toast.success('Payroll run generated');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Generation failed');
 } finally {
 setGenerating(false);
 }
 }

 async function handleApprove(runId: string) {
 try {
 await approvePayrollRun(runId);
 toast.success('Payroll approved');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Approval failed');
 }
 }

 async function handleSaveRule(ruleId: string) {
 const rate = Number(editRates[ruleId]);
 if (Number.isNaN(rate)) {
 toast.error('Invalid rate');
 return;
 }
 try {
 await updatePayrollRule(ruleId, rate);
 toast.success('Rule updated');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Update failed');
 }
 }

 const foreignStaff = staff.filter((s) => resolveWorkerType(s) === 'FOREIGN');
 const localStaff = staff.filter((s) => resolveWorkerType(s) === 'LOCAL');
 const foreignRules = rules.filter((r) => r.worker_type === 'FOREIGN');
 const localRules = rules.filter((r) => r.worker_type === 'LOCAL');

 return (
 <>
 <div className="flex flex-wrap gap-2">
 <Badge className="border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-50">
 {foreignStaff.length} pekerja asing
 </Badge>
 <Badge className="border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-50">
 {localStaff.length} staf tempatan
 </Badge>
 <Badge variant="outline">{runs.length} payroll run</Badge>
 </div>

 {loading ? (
 <ModuleLoading />) : (
 <Tabs defaultValue="runs" className="space-y-4">
 <TabsList className={moduleTabsListClass}>
 <TabsTrigger value="companies" className={moduleTabsTriggerClass}>
 <Building2 className="h-4 w-4" /> 3 Syarikat
 </TabsTrigger>
 <TabsTrigger value="runs" className={moduleTabsTriggerClass}>
 <FileText className="h-4 w-4" /> Jana Gaji
 </TabsTrigger>
 <TabsTrigger value="rules" className={moduleTabsTriggerClass}>
 <Settings className="h-4 w-4" /> Peraturan
 </TabsTrigger>
 <TabsTrigger value="commission" className={moduleTabsTriggerClass}>
 <Wallet className="h-4 w-4" /> Komisyen
 </TabsTrigger>
 <TabsTrigger value="staff" className={moduleTabsTriggerClass}>
 <Users className="h-4 w-4" /> Staf
 </TabsTrigger>
 </TabsList>

 <TabsContent value="companies" className="mt-4 space-y-4">
 <AiPayrollProposalSection />
 <CompanyPayrollSection />
 </TabsContent>

 <TabsContent value="runs" className="mt-4 space-y-4">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-base">Generate Payroll Run</CardTitle>
 </CardHeader>
 <CardContent className="flex flex-wrap items-end gap-3">
 <div className="space-y-1">
 <Label>Period Start</Label>
 <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
 </div>
 <div className="space-y-1">
 <Label>Period End</Label>
 <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
 </div>
 <Button
 className="bg-amber-500 hover:bg-amber-600"
 onClick={handleGenerate}
 disabled={generating}
 >
 {generating ? 'Generating...' : 'Generate Run'}
 </Button>
 </CardContent>
 </Card>

 {runs.length === 0 ? (
 <p className="text-sm text-muted-foreground">No payroll runs yet</p>) : (
 runs.map((run) => (
 <Card key={run.id}>
 <CardHeader className="pb-2">
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div>
 <CardTitle className="text-base">{run.run_number}</CardTitle>
 <p className="text-xs text-muted-foreground">
 {run.period_start} hingga {run.period_end}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant={run.status === 'APPROVED' ? 'outline' : 'secondary'}>
 {run.status}
 </Badge>
 {run.status === 'PENDING' && (
 <Button size="sm" variant="outline" onClick={() => handleApprove(run.id)}>
 Approve
 </Button>)}
 <Button
 size="sm"
 variant="ghost"
 onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
 >
 {expandedRun === run.id ? 'Hide' : 'Details'}
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-3 gap-2 text-sm">
 <div>Gross: <strong>{fmt(run.total_gross)}</strong></div>
 <div>Deductions: <strong>{fmt(run.total_deductions)}</strong></div>
 <div>Net: <strong className="text-green-700">{fmt(run.total_net)}</strong></div>
 </div>
 {expandedRun === run.id && run.payroll_line_items && (
 <div className="mt-4 overflow-x-auto">
 <table className="w-full text-xs">
 <thead>
 <tr className="border-b text-left text-muted-foreground">
 <th className="p-2">Staff</th>
 <th className="p-2">Type</th>
 <th className="p-2">Shift</th>
 <th className="p-2">OT</th>
 <th className="p-2">Basic</th>
 <th className="p-2">Comm.</th>
 <th className="p-2">Gross</th>
 <th className="p-2">Potong Kiosk</th>
 <th className="p-2">Net</th>
 </tr>
 </thead>
 <tbody>
 {(run.payroll_line_items as PayrollLineItem[]).map((line) => (
 <tr
 key={line.id}
 className={
 line.worker_type === 'FOREIGN'
 ? 'border-b bg-orange-50/40'
 : 'border-b bg-sky-50/40'
 }
 >
 <td className="p-2">{line.staff.full_name}</td>
 <td className="p-2">
 <WorkerTypeBadge workerType={line.worker_type} />
 </td>
 <td className="p-2">{fmt(line.shift_pay)}</td>
 <td className="p-2">{fmt(line.ot_pay)}</td>
 <td className="p-2">{fmt(line.basic_salary + line.attendance_allowance)}</td>
 <td className="p-2">{fmt(line.commission)}</td>
 <td className="p-2">{fmt(line.gross_pay)}</td>
 <td className="p-2">
 {line.kiosk_deduction && line.kiosk_deduction > 0 ? (
 <div>
 <div className="font-medium text-red-700">{fmt(line.kiosk_deduction)}</div>
 <div className="text-[11px] text-muted-foreground">
 {Math.round(Number(line.kiosk_excess_minutes ?? 0))} min
 </div>
 </div>
 ) : (
 fmt(0)
 )}
 </td>
 <td className="p-2 font-medium">{fmt(line.net_pay)}</td>
 </tr>))}
 </tbody>
 </table>
 </div>)}
 </CardContent>
 </Card>)))}
 </TabsContent>

 <TabsContent value="rules" className="mt-4 space-y-6">
 <div className="space-y-2">
 <h3 className="flex items-center gap-2 text-sm font-semibold text-orange-900">
 <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
 Pekerja Asing - Gaji Mingguan (shift)
 </h3>
 {foreignRules.map((rule) => (
 <RuleRow
 key={rule.id}
 rule={rule}
 editRates={editRates}
 setEditRates={setEditRates}
 onSave={handleSaveRule}
 accent="foreign"
 />))}
 </div>
 <div className="space-y-2">
 <h3 className="flex items-center gap-2 text-sm font-semibold text-sky-900">
 <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400" />
 Staf Tempatan - Gaji Bulanan + Komisyen
 </h3>
 {localRules.map((rule) => (
 <RuleRow
 key={rule.id}
 rule={rule}
 editRates={editRates}
 setEditRates={setEditRates}
 onSave={handleSaveRule}
 accent="local"
 />))}
 </div>
 </TabsContent>

 <TabsContent value="commission" className="mt-4">
 <div className="overflow-x-auto rounded-lg border">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b bg-muted/50 text-left">
 <th className="p-3">Sales From</th>
 <th className="p-3">Sales To</th>
 <th className="p-3">Commission</th>
 <th className="p-3">Formula</th>
 </tr>
 </thead>
 <tbody>
 {tiers.map((tier) => (
 <tr key={tier.id} className="border-b">
 <td className="p-3">{fmt(tier.tier_from)}</td>
 <td className="p-3">{tier.tier_to ? fmt(tier.tier_to) : 'Infinity'}</td>
 <td className="p-3 font-medium">{fmt(tier.commission_amount)}</td>
 <td className="p-3 text-xs text-muted-foreground">{tier.formula_description}</td>
 </tr>))}
 </tbody>
 </table>
 </div>
 </TabsContent>

 <TabsContent value="staff" className="mt-4 space-y-6">
 <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950">
 Semua staf kiosk berdaftar ialah <strong>pekerja asing</strong> - gaji
 dikira mengikut kadar shift mingguan.
 </p>

 <StaffTypeSection
 title="Pekerja Asing"
 subtitle="Gaji mingguan - bayaran shift + OT"
 accent="foreign"
 count={foreignStaff.length}
 staff={foreignStaff}
 />

 {localStaff.length > 0 && (
 <StaffTypeSection
 title="Staf Tempatan"
 subtitle="Gaji bulanan + komisyen + EPF/SOCSO/EIS"
 accent="local"
 count={localStaff.length}
 staff={localStaff}
 />)}
 </TabsContent>
 </Tabs>)}
 </>);
}

export function PayrollDashboard() {
 const workflow = getRoleWorkflow({ role: 'HR' });

 return (
 <ModuleLayout>
 <ModuleHeader
 title="Gaji & Komisyen"
 description="Pecahan 3 syarikat legal - gaji auto ikut peraturan - laporan mingguan pekerja asing"
 icon={Wallet}
 />

 <WorkflowSopPanel workflow={workflow} />

 <PayrollOperationsPanel />
 </ModuleLayout>);
}

function StaffTypeSection({
 title,
 subtitle,
 accent,
 count,
 staff: staffRows,
}: {
 title: string;
 subtitle: string;
 accent: 'foreign' | 'local';
 count: number;
 staff: PayrollStaffRow[];
}) {
 const isForeign = accent === 'foreign';
 return (
 <Card className={isForeign ? 'border-orange-200' : 'border-sky-200'}>
 <CardHeader className="pb-2">
 <CardTitle className="flex flex-wrap items-center gap-2 text-base">
 <span
 className={`inline-block h-2.5 w-2.5 rounded-full ${isForeign ? 'bg-orange-400' : 'bg-sky-400'}`}
 />
 {title}
 <Badge
 variant="outline"
 className={
 isForeign
 ? 'border-orange-300 bg-orange-50 font-normal text-orange-900'
 : 'border-sky-300 bg-sky-50 font-normal text-sky-900'
 }
 >
 {count} staf
 </Badge>
 </CardTitle>
 <p className="text-xs text-muted-foreground">{subtitle}</p>
 </CardHeader>
 <CardContent>
 {staffRows.length === 0 ? (
 <p className="text-sm text-muted-foreground">Tiada staf dalam kategori ini.</p>) : (
 <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
 {staffRows.map((s) => {
 const type = resolveWorkerType(s);
 const pay = staffPayDisplay(s);
 return (
 <div
 key={s.id}
 className={`rounded-lg border p-3 text-sm ${isForeign ? 'border-orange-100 bg-orange-50/30' : 'border-sky-100 bg-sky-50/30'}`}
 >
 <p className="font-medium">{s.full_name}</p>
 <p className="text-xs text-muted-foreground">
 {s.staff_code} - {s.branch?.branch_name ?? ' - '}
 </p>
 <div className="mt-2 flex flex-wrap items-center gap-1.5">
 <WorkerTypeBadge workerType={type} />
 {pay && (
 <span className="text-xs tabular-nums text-muted-foreground">{pay}</span>)}
 </div>
 </div>);
 })}
 </div>)}
 </CardContent>
 </Card>);
}

function RuleRow({
 rule,
 editRates,
 setEditRates,
 onSave,
 accent,
}: {
 rule: PayrollRule;
 editRates: Record<string, string>;
 setEditRates: Dispatch<SetStateAction<Record<string, string>>>;
 onSave: (id: string) => void;
 accent: 'foreign' | 'local';
}) {
 const isForeign = accent === 'foreign';
 return (
 <div
 className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${isForeign ? 'border-orange-100 bg-orange-50/20' : 'border-sky-100 bg-sky-50/20'}`}
 >
 <div>
 <span className="font-medium">{rule.rule_code}</span>
 <span className="mx-2 text-muted-foreground"> - </span>
 {rule.component}
 <WorkerTypeBadge workerType={rule.worker_type} showPeriod={false} className="ml-2" />
 <Badge variant="outline" className="ml-1 font-normal">
 {rule.period}
 </Badge>
 {rule.shift_hours && (
 <span className="ml-2 text-xs text-muted-foreground">{rule.shift_hours}j</span>)}
 </div>
 {rule.rate != null ? (
 <div className="flex items-center gap-2">
 <Input
 type="number"
 className="h-8 w-24"
 value={editRates[rule.id] ?? ''}
 onChange={(e) => setEditRates({...editRates, [rule.id]: e.target.value })}
 />
 <Button size="sm" variant="outline" onClick={() => onSave(rule.id)}>
 Simpan
 </Button>
 </div>) : (
 <span className="text-xs text-muted-foreground">{rule.notes ?? 'Manual'}</span>)}
 </div>);
}

