'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Banknote,
  Landmark,
  ClipboardList,
  BarChart3,
  Plus,
} from 'lucide-react';
import { fetchBranches } from '@/lib/pos/api';
import {
  fetchFinanceSummary,
  fetchCollections,
  createCollection,
  markCollected,
  fetchBankIns,
  recordBankIn,
  fetchReconciliations,
  submitReconciliation,
  approveReconciliation,
  fetchDailyReports,
  generateDailyReport,
} from '@/lib/finance/api';
import type {
  BankInRecord,
  CashReconciliation,
  CollectionType,
  DailyFinancialReport,
  FinanceCollection,
  FinanceSummary,
} from '@/lib/finance/types';
import { COLLECTION_TYPE_LABELS } from '@/lib/finance/types';
import { useAuthStore } from '@/stores/auth-store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ModuleLayout,
  ModuleHeader,
  ModuleLoading,
  KpiGrid,
  KpiCard,
  moduleTabsListClass,
  moduleTabsTriggerClass,
  formatRM,
} from '@/components/shared/module-ui';

function fmt(n: number) {
  return `RM ${Number(n).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`;
}

export function FinanceDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const branchId = profile?.branch_id ?? '';

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [collections, setCollections] = useState<FinanceCollection[]>([]);
  const [bankIns, setBankIns] = useState<BankInRecord[]>([]);
  const [reconciliations, setReconciliations] = useState<CashReconciliation[]>([]);
  const [reports, setReports] = useState<DailyFinancialReport[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; branch_name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [newCollection, setNewCollection] = useState({
    collection_type: 'CASH_KIOSK' as CollectionType,
    amount: '',
    branch_id: '',
    collected_from: '',
  });
  const [bankInForm, setBankInForm] = useState({
    amount: '',
    bank_name: '',
    reference_number: '',
    collection_id: '',
  });
  const [reconForm, setReconForm] = useState({
    branch_id: '',
    reconciliation_date: new Date().toISOString().slice(0, 10),
    expected_cash: '',
    actual_cash: '',
  });
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, col, bi, rec, rep, br] = await Promise.all([
        fetchFinanceSummary(),
        fetchCollections(),
        fetchBankIns(),
        fetchReconciliations(),
        fetchDailyReports(),
        fetchBranches(),
      ]);
      setSummary(sum.summary);
      setCollections(col.collections);
      setBankIns(bi.records);
      setReconciliations(rec.reconciliations);
      setReports(rep.reports);
      setBranches(br.branches);
      if (br.branches[0]) {
        setNewCollection((c) => ({ ...c, branch_id: branchId || br.branches[0].id }));
        setReconForm((r) => ({ ...r, branch_id: branchId || br.branches[0].id }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan kewangan');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateCollection() {
    try {
      await createCollection({
        collection_type: newCollection.collection_type,
        amount: Number(newCollection.amount),
        branch_id: newCollection.branch_id || undefined,
        collected_from: newCollection.collected_from || undefined,
      });
      toast.success('Collection created');
      setNewCollection((c) => ({ ...c, amount: '', collected_from: '' }));
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create collection');
    }
  }

  async function handleBankIn() {
    try {
      await recordBankIn({
        amount: Number(bankInForm.amount),
        collection_id: bankInForm.collection_id || undefined,
        bank_name: bankInForm.bank_name || undefined,
        reference_number: bankInForm.reference_number || undefined,
      });
      toast.success('Bank-in recorded');
      setBankInForm({ amount: '', bank_name: '', reference_number: '', collection_id: '' });
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bank-in failed');
    }
  }

  async function handleReconciliation() {
    try {
      await submitReconciliation({
        branch_id: reconForm.branch_id,
        reconciliation_date: reconForm.reconciliation_date,
        expected_cash: Number(reconForm.expected_cash),
        actual_cash: Number(reconForm.actual_cash),
      });
      toast.success('Reconciliation submitted');
      setReconForm((r) => ({ ...r, expected_cash: '', actual_cash: '' }));
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reconciliation failed');
    }
  }

  const pendingCollections = collections.filter((c) => c.status === 'PENDING');

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Kewangan"
        description="Kutipan tunai kiosk, bank masuk, penyelarasan, dan laporan harian"
        icon={Banknote}
        badges={
          pendingCollections.length > 0 ? (
            <Badge variant="destructive">{pendingCollections.length} kutipan menunggu</Badge>
          ) : undefined
        }
      />

      {loading ? (
        <ModuleLoading />
      ) : (
        <>
          <KpiGrid cols={5}>
            <KpiCard title="Menunggu" value={summary?.pending_collections ?? 0} icon={ClipboardList} />
            <KpiCard title="Dikutip Hari Ini" value={fmt(summary?.collected_today ?? 0)} icon={Banknote} />
            <KpiCard title="Bank Masuk" value={fmt(summary?.banked_today ?? 0)} icon={Landmark} />
            <KpiCard title="Penyelarasan" value={summary?.pending_reconciliations ?? 0} icon={BarChart3} variant="warning" />
            <KpiCard title="Tertunggak" value={fmt(summary?.outstanding_cash ?? 0)} icon={Banknote} variant="warning" />
          </KpiGrid>

          <Tabs defaultValue="collections" className="space-y-4">
            <TabsList className={moduleTabsListClass}>
              <TabsTrigger value="collections" className={moduleTabsTriggerClass}>
                <Banknote className="h-4 w-4" /> Kutipan
              </TabsTrigger>
              <TabsTrigger value="bankin" className={moduleTabsTriggerClass}>
                <Landmark className="h-4 w-4" /> Bank Masuk
              </TabsTrigger>
              <TabsTrigger value="recon" className={moduleTabsTriggerClass}>
                <ClipboardList className="h-4 w-4" /> Penyelarasan
              </TabsTrigger>
              <TabsTrigger value="reports" className={moduleTabsTriggerClass}>
                <BarChart3 className="h-4 w-4" /> Laporan
              </TabsTrigger>
            </TabsList>

            <TabsContent value="collections" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plus className="h-4 w-4" /> New Collection
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select
                      value={newCollection.collection_type}
                      onValueChange={(v) => v && setNewCollection({ ...newCollection, collection_type: v as CollectionType })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(COLLECTION_TYPE_LABELS) as CollectionType[]).map((t) => (
                          <SelectItem key={t} value={t}>{COLLECTION_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Branch</Label>
                    <Select
                      value={newCollection.branch_id}
                      onValueChange={(v) => v && setNewCollection({ ...newCollection, branch_id: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.branch_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      value={newCollection.amount}
                      onChange={(e) => setNewCollection({ ...newCollection, amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>From</Label>
                    <Input
                      value={newCollection.collected_from}
                      onChange={(e) => setNewCollection({ ...newCollection, collected_from: e.target.value })}
                      placeholder="Staff / source"
                    />
                  </div>
                  <Button className="bg-amber-500 hover:bg-amber-600 sm:col-span-2" onClick={handleCreateCollection}>
                    Create Collection
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {collections.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">{c.collection_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {COLLECTION_TYPE_LABELS[c.collection_type]} · {c.branch?.branch_name ?? '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fmt(c.amount)}</span>
                      <Badge variant="outline">{c.status}</Badge>
                      {c.status === 'PENDING' && (
                        <Button size="sm" variant="outline" onClick={async () => {
                          await markCollected(c.id, { collector_name: profile?.full_name ?? undefined });
                          toast.success('Marked collected');
                          loadData();
                        }}>
                          Collect
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="bankin" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Record Bank In</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      value={bankInForm.amount}
                      onChange={(e) => setBankInForm({ ...bankInForm, amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Bank</Label>
                    <Input
                      value={bankInForm.bank_name}
                      onChange={(e) => setBankInForm({ ...bankInForm, bank_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Reference</Label>
                    <Input
                      value={bankInForm.reference_number}
                      onChange={(e) => setBankInForm({ ...bankInForm, reference_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Link Collection (optional)</Label>
                    <Select
                      value={bankInForm.collection_id}
                      onValueChange={(v) => setBankInForm({ ...bankInForm, collection_id: v ?? '' })}
                    >
                      <SelectTrigger><SelectValue placeholder="Tiada" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Tiada</SelectItem>
                        {pendingCollections.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.collection_number} — {fmt(c.amount)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="bg-amber-500 hover:bg-amber-600" onClick={handleBankIn}>
                    Record Bank In
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {bankIns.map((b) => (
                  <div key={b.id} className="flex justify-between rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">{b.bank_in_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.bank_name} · {b.reference_number ?? '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{fmt(b.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(b.banked_at).toLocaleString('ms-MY')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="recon" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Cash Reconciliation</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>Branch</Label>
                    <Select
                      value={reconForm.branch_id}
                      onValueChange={(v) => v && setReconForm({ ...reconForm, branch_id: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.branch_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={reconForm.reconciliation_date}
                      onChange={(e) => setReconForm({ ...reconForm, reconciliation_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Expected Cash</Label>
                    <Input
                      type="number"
                      value={reconForm.expected_cash}
                      onChange={(e) => setReconForm({ ...reconForm, expected_cash: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Actual Cash</Label>
                    <Input
                      type="number"
                      value={reconForm.actual_cash}
                      onChange={(e) => setReconForm({ ...reconForm, actual_cash: e.target.value })}
                    />
                  </div>
                  <Button className="bg-amber-500 hover:bg-amber-600" onClick={handleReconciliation}>
                    Submit Reconciliation
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {reconciliations.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">{r.reconciliation_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.branch.branch_name} · {r.reconciliation_date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={Number(r.variance) !== 0 ? 'text-orange-600' : 'text-green-600'}>
                        Var: {fmt(Number(r.variance))}
                      </span>
                      <Badge variant="outline">{r.status}</Badge>
                      {r.status === 'PENDING' && (
                        <Button size="sm" variant="outline" onClick={async () => {
                          await approveReconciliation(r.id);
                          toast.success('Approved');
                          loadData();
                        }}>
                          Approve
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="reports" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label>Report Date</Label>
                  <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                </div>
                <Button
                  className="bg-amber-500 hover:bg-amber-600"
                  onClick={async () => {
                    try {
                      await generateDailyReport(reportDate);
                      toast.success('Report generated');
                      loadData();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed');
                    }
                  }}
                >
                  Generate Report
                </Button>
              </div>

              <div className="space-y-2">
                {reports.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{r.report_date}</span>
                      <span className="text-muted-foreground">{r.branch?.branch_name ?? 'Org-wide'}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div>QR: {fmt(r.total_qr)}</div>
                      <div>Cash: {fmt(r.total_cash_collected)}</div>
                      <div>Banked: {fmt(r.total_banked)}</div>
                      <div>Outstanding: {fmt(r.outstanding_cash)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </ModuleLayout>
  );
}
