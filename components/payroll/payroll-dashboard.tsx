'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Wallet, FileText, Settings, Users } from 'lucide-react';
import {
  ModuleLayout,
  ModuleHeader,
  ModuleLoading,
  KpiGrid,
  KpiCard,
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

function fmt(n: number) {
  return `RM ${Number(n).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`;
}

export function PayrollDashboard() {
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

  const foreignCount = staff.filter((s) => s.worker_type === 'FOREIGN').length;
  const localCount = staff.filter((s) => s.worker_type === 'LOCAL').length;

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Gaji & Komisyen"
        description="Gaji shift asing · gaji tempatan + komisyen · EPF/SOCSO/EIS"
        icon={Wallet}
        badges={
          <>
            <Badge variant="secondary">{foreignCount} asing</Badge>
            <Badge variant="outline">{localCount} tempatan</Badge>
          </>
        }
      />

      {loading ? (
        <ModuleLoading />
      ) : (
        <Tabs defaultValue="runs" className="space-y-4">
          <TabsList className={moduleTabsListClass}>
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
                  {generating ? 'Generating…' : 'Generate Run'}
                </Button>
              </CardContent>
            </Card>

            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payroll runs yet</p>
            ) : (
              runs.map((run) => (
                <Card key={run.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{run.run_number}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {run.period_start} → {run.period_end}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={run.status === 'APPROVED' ? 'outline' : 'secondary'}>
                          {run.status}
                        </Badge>
                        {run.status === 'PENDING' && (
                          <Button size="sm" variant="outline" onClick={() => handleApprove(run.id)}>
                            Approve
                          </Button>
                        )}
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
                              <th className="p-2">Net</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(run.payroll_line_items as PayrollLineItem[]).map((line) => (
                              <tr key={line.id} className="border-b">
                                <td className="p-2">{line.staff.full_name}</td>
                                <td className="p-2">{line.worker_type}</td>
                                <td className="p-2">{fmt(line.shift_pay)}</td>
                                <td className="p-2">{fmt(line.ot_pay)}</td>
                                <td className="p-2">{fmt(line.basic_salary + line.attendance_allowance)}</td>
                                <td className="p-2">{fmt(line.commission)}</td>
                                <td className="p-2">{fmt(line.gross_pay)}</td>
                                <td className="p-2 font-medium">{fmt(line.net_pay)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="rules" className="mt-4 space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <span className="font-medium">{rule.rule_code}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  {rule.component}
                  <Badge variant="outline" className="ml-2">{rule.worker_type}</Badge>
                  <Badge variant="outline" className="ml-1">{rule.period}</Badge>
                  {rule.shift_hours && (
                    <span className="ml-2 text-xs text-muted-foreground">{rule.shift_hours}h</span>
                  )}
                </div>
                {rule.rate != null ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="h-8 w-24"
                      value={editRates[rule.id] ?? ''}
                      onChange={(e) => setEditRates({ ...editRates, [rule.id]: e.target.value })}
                    />
                    <Button size="sm" variant="outline" onClick={() => handleSaveRule(rule.id)}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">{rule.notes ?? 'Manual'}</span>
                )}
              </div>
            ))}
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
                      <td className="p-3">{tier.tier_to ? fmt(tier.tier_to) : '∞'}</td>
                      <td className="p-3 font-medium">{fmt(tier.commission_amount)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{tier.formula_description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <div className="mb-3 flex gap-4 text-sm">
              <span>Foreign: <strong>{foreignCount}</strong></span>
              <span>Local: <strong>{localCount}</strong></span>
              <span>Total: <strong>{staff.length}</strong></span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {staff.map((s) => (
                <div key={s.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{s.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.staff_code} · {s.branch?.branch_name ?? '—'}
                  </p>
                  <Badge variant="outline" className="mt-1">{s.worker_type ?? '—'}</Badge>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </ModuleLayout>
  );
}
