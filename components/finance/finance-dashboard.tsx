'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
 Banknote,
 Landmark,
 ClipboardList,
 BarChart3,
 Plus,
 QrCode,
 CheckCircle2,
 XCircle,
} from 'lucide-react';
import { fetchBranches } from '@/lib/pos/api';
import {
 fetchFinanceSummary,
 fetchCollections,
 fetchBranchSupplyRequests,
 fetchCollectionCashUsages,
 createCollection,
 markCollected,
 fetchBankIns,
 recordBankIn,
 fetchReconciliations,
 submitReconciliation,
 approveReconciliation,
 fetchDailyReports,
 generateDailyReport,
 fetchManualQrPayments,
 updateManualQrPayment,
} from '@/lib/finance/api';
import type {
 BankInRecord,
 BranchSupplyRequest,
 CashReconciliation,
 CollectionCashUsage,
 CollectionType,
 DailyFinancialReport,
 FinanceCollection,
 FinanceSummary,
 ManualQrPayment,
} from '@/lib/finance/types';
import { COLLECTION_TYPE_LABELS } from '@/lib/finance/types';
import { useAuthStore } from '@/stores/auth-store';
import { WorkflowSopPanel } from '@/components/dashboard/workflow-sop-panel';
import { getRoleWorkflow } from '@/lib/dashboard/role-workflows';
import { CashCollectionControl } from '@/components/finance/cash-collection-control';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from '@/components/shared/module-ui';
import { boundSelectValue } from '@/lib/ui/select-utils';

function fmt(n: number) {
 return `RM ${Number(n).toLocaleString('ms-MY', { minimumFractionDigits: 2 })}`;
}

type FinanceBranchOption = {
 id: string;
 branch_code: string;
 branch_name: string;
 area?: string | null;
 region_name?: string | null;
};

const NO_COLLECTION_VALUE = '__NO_COLLECTION__';

function financeBranchLabel(branch: FinanceBranchOption) {
 return [branch.branch_code, branch.branch_name, branch.region_name ?? branch.area]
 .filter(Boolean)
 .join(' - ');
}

export function FinanceDashboard() {
 const profile = useAuthStore((s) => s.profile);
 const branchId = profile?.branch_id ?? '';
 const role = profile?.role ?? 'FINANCE';
 const workflow = getRoleWorkflow({
 role,
 legalEntityCode: profile?.legal_entity?.code ?? null,
 dashboardLabel: role === 'AREA_MANAGER' ? 'Kewangan Kawasan AM' : undefined,
 });

 const [summary, setSummary] = useState<FinanceSummary | null>(null);
 const [collections, setCollections] = useState<FinanceCollection[]>([]);
 const [bankIns, setBankIns] = useState<BankInRecord[]>([]);
 const [cashUsages, setCashUsages] = useState<CollectionCashUsage[]>([]);
 const [supplyRequests, setSupplyRequests] = useState<BranchSupplyRequest[]>([]);
 const [reconciliations, setReconciliations] = useState<CashReconciliation[]>([]);
 const [reports, setReports] = useState<DailyFinancialReport[]>([]);
 const [manualQrPayments, setManualQrPayments] = useState<ManualQrPayment[]>([]);
 const [branches, setBranches] = useState<FinanceBranchOption[]>([]);
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
 slip_url: '',
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
 const [sum, col, bi, usage, req, rec, rep, br, qr] = await Promise.all([
 fetchFinanceSummary(),
 fetchCollections(),
 fetchBankIns(),
 fetchCollectionCashUsages(),
 fetchBranchSupplyRequests(),
 fetchReconciliations(),
 fetchDailyReports(),
 fetchBranches(),
 fetchManualQrPayments(),
 ]);
 setSummary(sum.summary);
 setCollections(col.collections);
 setBankIns(bi.records);
 setCashUsages(usage.usages);
 setSupplyRequests(req.requests);
 setReconciliations(rec.reconciliations);
 setReports(rep.reports);
 setManualQrPayments(qr.payments);
 setBranches(br.branches);
 if (br.branches[0]) {
 setNewCollection((c) => ({...c, branch_id: branchId || br.branches[0].id }));
 setReconForm((r) => ({...r, branch_id: branchId || br.branches[0].id }));
 }
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan kewangan');
 } finally {
 setLoading(false);
 }
 }, [branchId]);

 useEffect(() => {
 // eslint-disable-next-line react-hooks/set-state-in-effect
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
 setNewCollection((c) => ({...c, amount: '', collected_from: '' }));
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Failed to create collection');
 }
 }

 async function handleBankIn() {
 try {
 if (!bankInForm.reference_number.trim() && !bankInForm.slip_url.trim()) {
 toast.error('Masukkan rujukan bank atau link bukti/slip bank-in');
 return;
 }
 await recordBankIn({
 amount: Number(bankInForm.amount),
 collection_id: bankInForm.collection_id || undefined,
 bank_name: bankInForm.bank_name || undefined,
 reference_number: bankInForm.reference_number || undefined,
 slip_url: bankInForm.slip_url || undefined,
 });
 toast.success('Bank-in recorded');
 setBankInForm({ amount: '', bank_name: '', reference_number: '', slip_url: '', collection_id: '' });
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
 setReconForm((r) => ({...r, expected_cash: '', actual_cash: '' }));
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Reconciliation failed');
 }
 }

 async function handleManualQrUpdate(paymentId: string, status: 'PAID' | 'FAILED' | 'CANCELLED') {
 const notes =
 status === 'PAID'
 ? 'Disahkan manual oleh kewangan'
 : window.prompt('Catatan sebab bayaran QR tidak diterima / dibatalkan') ?? '';

 try {
 await updateManualQrPayment({ payment_id: paymentId, status, notes });
 toast.success(status === 'PAID' ? 'QR manual disahkan' : 'Status QR manual dikemas kini');
 loadData();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemas kini QR manual');
 }
 }

 const branchSelectValues = useMemo(() => branches.map((branch) => branch.id), [branches]);
 const safeNewCollectionBranchId =
 boundSelectValue(newCollection.branch_id, branchSelectValues) ?? '';
 const safeReconBranchId = boundSelectValue(reconForm.branch_id, branchSelectValues) ?? '';
 const selectedNewCollectionBranch =
 branches.find((branch) => branch.id === safeNewCollectionBranchId) ?? null;
 const selectedReconBranch = branches.find((branch) => branch.id === safeReconBranchId) ?? null;
 const pendingCollections = collections.filter((c) => c.status === 'PENDING');
 const bankInCollectionValues = useMemo(
 () => [NO_COLLECTION_VALUE,...pendingCollections.map((collection) => collection.id)],
 [pendingCollections]);
 const safeBankInCollectionValue =
 boundSelectValue(bankInForm.collection_id || NO_COLLECTION_VALUE, bankInCollectionValues) ??
 NO_COLLECTION_VALUE;
 const selectedBankInCollection =
 pendingCollections.find((collection) => collection.id === safeBankInCollectionValue) ?? null;
 const pendingManualQr = manualQrPayments.filter((p) => p.status === 'PENDING');

 return (
 <ModuleLayout>
 <ModuleHeader
 title="Kewangan"
 description="Kutipan tunai kiosk, bank masuk, penyelarasan, dan laporan harian"
 icon={Banknote}
 badges={
 <>
 {pendingCollections.length > 0 && (
 <Badge variant="destructive">{pendingCollections.length} kutipan menunggu</Badge>)}
 {pendingManualQr.length > 0 && (
 <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
 {pendingManualQr.length} QR manual perlu sahkan
 </Badge>)}
 </>
 }
 />

 <WorkflowSopPanel workflow={workflow} />

 {loading ? (
 <ModuleLoading />) : (
 <>
 <KpiGrid cols={5}>
 <KpiCard title="Menunggu" value={summary?.pending_collections ?? 0} icon={ClipboardList} />
 <KpiCard title="Dikutip Hari Ini" value={fmt(summary?.collected_today ?? 0)} icon={Banknote} />
 <KpiCard title="Bank Masuk" value={fmt(summary?.banked_today ?? 0)} icon={Landmark} />
 <KpiCard title="Penyelarasan" value={summary?.pending_reconciliations ?? 0} icon={BarChart3} variant="warning" />
 <KpiCard title="Tertunggak" value={fmt(summary?.outstanding_cash ?? 0)} icon={Banknote} variant="warning" />
 </KpiGrid>

 <CashCollectionControl
 role={role}
 profileName={profile?.full_name}
 branches={branches}
 collections={collections}
 bankIns={bankIns}
 cashUsages={cashUsages}
 supplyRequests={supplyRequests}
 onRefresh={loadData}
 />

 <Tabs defaultValue="collections" className="space-y-4">
 <TabsList className={moduleTabsListClass}>
 <TabsTrigger value="collections" className={moduleTabsTriggerClass}>
 <Banknote className="h-4 w-4" /> Kutipan
 </TabsTrigger>
 <TabsTrigger value="manualqr" className={moduleTabsTriggerClass}>
 <QrCode className="h-4 w-4" /> QR Manual
 {pendingManualQr.length > 0 && (
 <Badge className="ml-1 bg-amber-500 px-1.5 py-0 text-[10px] text-white">
 {pendingManualQr.length}
 </Badge>)}
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
 onValueChange={(v) => v && setNewCollection({...newCollection, collection_type: v as CollectionType })}
 >
 <SelectTrigger><SelectValue /></SelectTrigger>
 <SelectContent>
 {(Object.keys(COLLECTION_TYPE_LABELS) as CollectionType[]).map((t) => (
 <SelectItem key={t} value={t}>{COLLECTION_TYPE_LABELS[t]}</SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label>Branch</Label>
 <Select
 value={safeNewCollectionBranchId}
 onValueChange={(v) => v && setNewCollection({...newCollection, branch_id: v })}
 >
 <SelectTrigger>
 <SelectValue placeholder="Pilih cawangan">
 {selectedNewCollectionBranch ? financeBranchLabel(selectedNewCollectionBranch) : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {branches.map((b) => (
 <SelectItem key={b.id} value={b.id}>{financeBranchLabel(b)}</SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label>Amount</Label>
 <Input
 type="number"
 value={newCollection.amount}
 onChange={(e) => setNewCollection({...newCollection, amount: e.target.value })}
 />
 </div>
 <div className="space-y-1">
 <Label>From</Label>
 <Input
 value={newCollection.collected_from}
 onChange={(e) => setNewCollection({...newCollection, collected_from: e.target.value })}
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
 {COLLECTION_TYPE_LABELS[c.collection_type]} - {c.branch?.branch_name ?? ' - '}
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
 </Button>)}
 </div>
 </div>))}
 </div>
 </TabsContent>

 <TabsContent value="manualqr" className="mt-4 space-y-4">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <QrCode className="h-4 w-4 text-amber-600" />
 Pengesahan QR Manual POS
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3 text-sm">
 <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
 QR/online gateway belum diaktifkan. Transaksi QR dari POS direkod sebagai jualan, tetapi kewangan perlu
 sahkan manual berdasarkan bukti bayaran sebelum dianggap selesai.
 </div>

 {manualQrPayments.length === 0 ? (
 <p className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
 Tiada rekod QR manual.
 </p>) : (
 <div className="space-y-2">
 {manualQrPayments.map((payment) => {
 const isPending = payment.status === 'PENDING';
 const verifiedBy = payment.sale_payload?.manual_verified_by_name;
 return (
 <div key={payment.id} className="rounded-xl border p-3">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="space-y-1">
 <div className="flex flex-wrap items-center gap-2">
 <p className="font-semibold">
 {payment.branch?.branch_code} - {payment.branch?.branch_name}
 </p>
 <Badge variant={isPending ? 'default' : 'outline'} className={isPending ? 'bg-amber-500' : ''}>
 {payment.status}
 </Badge>
 </div>
 <p className="text-xs text-muted-foreground">
 {payment.transaction?.transaction_number ?? payment.gateway_ref ?? payment.id} -{' '}
 {new Date(payment.created_at).toLocaleString('ms-MY')}
 </p>
 {typeof verifiedBy === 'string' && (
 <p className="text-xs text-muted-foreground">Disemak oleh {verifiedBy}</p>)}
 </div>
 <div className="text-right">
 <p className="text-lg font-bold tabular-nums">{fmt(Number(payment.amount_rm))}</p>
 <p className="text-xs text-muted-foreground">Provider: manual</p>
 </div>
 </div>
 {isPending && (
 <div className="mt-3 flex flex-wrap gap-2">
 <Button
 size="sm"
 className="bg-emerald-600 hover:bg-emerald-700"
 onClick={() => handleManualQrUpdate(payment.id, 'PAID')}
 >
 <CheckCircle2 className="mr-1.5 h-4 w-4" />
 Sahkan Bayaran
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="text-red-600"
 onClick={() => handleManualQrUpdate(payment.id, 'FAILED')}
 >
 <XCircle className="mr-1.5 h-4 w-4" />
 Tolak
 </Button>
 </div>)}
 </div>);
 })}
 </div>)}
 </CardContent>
 </Card>
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
 onChange={(e) => setBankInForm({...bankInForm, amount: e.target.value })}
 />
 </div>
 <div className="space-y-1">
 <Label>Bank</Label>
 <Input
 value={bankInForm.bank_name}
 onChange={(e) => setBankInForm({...bankInForm, bank_name: e.target.value })}
 />
 </div>
 <div className="space-y-1">
 <Label>Reference / No. slip</Label>
 <Input
 value={bankInForm.reference_number}
 onChange={(e) => setBankInForm({...bankInForm, reference_number: e.target.value })}
 />
 </div>
 <div className="space-y-1">
 <Label>Link bukti/slip</Label>
 <Input
 value={bankInForm.slip_url}
 onChange={(e) => setBankInForm({...bankInForm, slip_url: e.target.value })}
 placeholder="URL gambar/slip jika ada"
 />
 </div>
 <div className="space-y-1">
 <Label>Link Collection (optional)</Label>
 <Select
 value={safeBankInCollectionValue}
 onValueChange={(v) =>
 setBankInForm({ ...bankInForm, collection_id: v === NO_COLLECTION_VALUE ? '' : v ?? '' })
 }
 >
 <SelectTrigger>
 <SelectValue placeholder="Tiada">
 {selectedBankInCollection
 ? `${selectedBankInCollection.collection_number} - ${fmt(selectedBankInCollection.amount)}`
 : 'Tiada'}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 <SelectItem value={NO_COLLECTION_VALUE}>Tiada</SelectItem>
 {pendingCollections.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.collection_number} - {fmt(c.amount)}
 </SelectItem>))}
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
 {b.bank_name} - {b.reference_number ?? ' - '}
 </p>
 {b.slip_url && (
 <p className="mt-1 text-[11px] text-emerald-700">Bukti slip disimpan</p>)}
 </div>
 <div className="text-right">
 <p className="font-medium">{fmt(b.amount)}</p>
 <p className="text-xs text-muted-foreground">
 {new Date(b.banked_at).toLocaleString('ms-MY')}
 </p>
 </div>
 </div>))}
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
 value={safeReconBranchId}
 onValueChange={(v) => v && setReconForm({...reconForm, branch_id: v })}
 >
 <SelectTrigger>
 <SelectValue placeholder="Pilih cawangan">
 {selectedReconBranch ? financeBranchLabel(selectedReconBranch) : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {branches.map((b) => (
 <SelectItem key={b.id} value={b.id}>{financeBranchLabel(b)}</SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label>Date</Label>
 <Input
 type="date"
 value={reconForm.reconciliation_date}
 onChange={(e) => setReconForm({...reconForm, reconciliation_date: e.target.value })}
 />
 </div>
 <div className="space-y-1">
 <Label>Expected Cash</Label>
 <Input
 type="number"
 value={reconForm.expected_cash}
 onChange={(e) => setReconForm({...reconForm, expected_cash: e.target.value })}
 />
 </div>
 <div className="space-y-1">
 <Label>Actual Cash</Label>
 <Input
 type="number"
 value={reconForm.actual_cash}
 onChange={(e) => setReconForm({...reconForm, actual_cash: e.target.value })}
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
 {r.branch.branch_name} - {r.reconciliation_date}
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
 </Button>)}
 </div>
 </div>))}
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
 </div>))}
 </div>
 </TabsContent>
 </Tabs>
 </>)}
 </ModuleLayout>);
}

