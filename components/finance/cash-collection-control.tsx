'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
 AlertTriangle,
 Banknote,
 CalendarCheck2,
 CheckCircle2,
 ClipboardCheck,
 Fuel,
 Landmark,
 ReceiptText,
 Route,
 ShieldCheck,
 UserRoundCheck,
 Users,
 Wrench,
 type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types/enums';
import type {
 BankInRecord,
 BranchSupplyRequest,
 CashUsageType,
 CollectionCashUsage,
 FinanceCollection,
} from '@/lib/finance/types';
import {
 CASH_USAGE_STATUS_LABELS,
 CASH_USAGE_TYPE_LABELS,
} from '@/lib/finance/types';
import {
 createCollection,
 markCollected,
 recordBankIn,
 recordCollectionCashUsage,
 reviewCollectionCashUsage,
} from '@/lib/finance/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard, formatRM } from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';
import { boundSelectValue } from '@/lib/ui/select-utils';

type BranchOption = {
 id: string;
 branch_code: string;
 branch_name: string;
 area?: string | null;
 region_name?: string | null;
};

type CollectorMode = 'AM' | 'THIRD_PARTY';

type CashCollectionControlProps = {
 role: UserRole;
 profileName?: string | null;
 branches: BranchOption[];
 collections: FinanceCollection[];
 bankIns: BankInRecord[];
 cashUsages: CollectionCashUsage[];
 supplyRequests: BranchSupplyRequest[];
 onRefresh: () => void | Promise<void>;
};

const CASH_TYPES = new Set(['CASH_KIOSK', 'MANAGER', 'THIRD_PARTY']);
const WEEKLY_MINIMUM = 2;
const WEEKLY_BEST = 6;
const USAGE_TYPES: { value: CashUsageType; icon: LucideIcon; hint: string }[] = [
 {
 value: 'BRANCH_NECESSITY',
 icon: ReceiptText,
 hint: 'Wajib pilih request barang cawangan yang sudah diluluskan.',
 },
 {
 value: 'FUEL_DIESEL',
 icon: Fuel,
 hint: 'Untuk petrol/diesel route AM. Wajib ada bukti dan rujukan kenderaan.',
 },
 {
 value: 'TRANSPORT_MAINTENANCE',
 icon: Wrench,
 hint: 'Untuk service/maintenance transport syarikat. Wajib ada bukti.',
 },
];

function weekStartMonday(date = new Date()) {
 const d = new Date(date);
 const day = d.getDay();
 const diff = d.getDate() - day + (day === 0 ? -6 : 1);
 d.setDate(diff);
 d.setHours(0, 0, 0, 0);
 return d;
}

function daysSince(dateIso?: string | null) {
 if (!dateIso) return null;
 const date = new Date(dateIso);
 if (Number.isNaN(date.getTime())) return null;
 return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function collectionTime(collection: FinanceCollection) {
 return collection.collected_at ?? collection.created_at;
}

function branchDisplay(branch: BranchOption | null | undefined) {
 if (!branch) return 'Cawangan';
 return `${branch.branch_code} - ${branch.branch_name}`;
}

function dateTime(value?: string | null) {
 if (!value) return '-';
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return '-';
 return date.toLocaleString('ms-MY', {
 day: '2-digit',
 month: 'short',
 hour: '2-digit',
 minute: '2-digit',
 });
}

function supplyRequestLabel(request: BranchSupplyRequest) {
 const itemCount = Array.isArray(request.items) ? request.items.length : 0;
 const branch = request.branch ? `${request.branch.branch_code} - ${request.branch.branch_name}` : 'Cawangan';
 return `${branch} | ${request.status} | ${itemCount} item`;
}

function usageStatusClass(status: CollectionCashUsage['status']) {
 if (status === 'ACCEPTED') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
 if (status === 'REJECTED') return 'border-red-200 bg-red-50 text-red-900';
 return 'border-amber-200 bg-amber-50 text-amber-900';
}

export function CashCollectionControl({
 role,
 profileName,
 branches,
 collections,
 bankIns,
 cashUsages,
 supplyRequests,
 onRefresh,
}: CashCollectionControlProps) {
 const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
 const [amount, setAmount] = useState('');
 const [collectorMode, setCollectorMode] = useState<CollectorMode>('AM');
 const [thirdPartyName, setThirdPartyName] = useState('');
 const [notes, setNotes] = useState('');
 const [usageCollectionId, setUsageCollectionId] = useState('');
 const [usageType, setUsageType] = useState<CashUsageType>('BRANCH_NECESSITY');
 const [usageAmount, setUsageAmount] = useState('');
 const [usageDescription, setUsageDescription] = useState('');
 const [usageProofUrl, setUsageProofUrl] = useState('');
 const [usageReceiptNumber, setUsageReceiptNumber] = useState('');
 const [usageSupplyRequestId, setUsageSupplyRequestId] = useState('');
 const [usageVehicleReference, setUsageVehicleReference] = useState('');
 const [usageVendorName, setUsageVendorName] = useState('');
 const [bankInCollectionId, setBankInCollectionId] = useState('');
 const [bankInAmount, setBankInAmount] = useState('');
 const [bankName, setBankName] = useState('Maybank');
 const [bankReference, setBankReference] = useState('');
 const [bankSlipUrl, setBankSlipUrl] = useState('');
 const [submitting, setSubmitting] = useState(false);

 const weekStart = useMemo(() => weekStartMonday(), []);
 const cashCollections = useMemo(
 () => collections.filter((item) => CASH_TYPES.has(item.collection_type)),
 [collections]);

 const usageTotalsByCollection = useMemo(() => {
 const totals = new Map<string, number>();
 for (const usage of cashUsages) {
 if (usage.status === 'REJECTED') continue;
 totals.set(usage.collection_id, (totals.get(usage.collection_id) ?? 0) + Number(usage.amount));
 }
 return totals;
 }, [cashUsages]);

 const bankedTotalsByCollection = useMemo(() => {
 const totals = new Map<string, number>();
 for (const bankIn of bankIns) {
 if (!bankIn.collection_id) continue;
 totals.set(bankIn.collection_id, (totals.get(bankIn.collection_id) ?? 0) + Number(bankIn.amount));
 }
 return totals;
 }, [bankIns]);

 function usageTotal(collectionId: string) {
 return usageTotalsByCollection.get(collectionId) ?? 0;
 }

 function bankedTotal(collectionId: string) {
 return bankedTotalsByCollection.get(collectionId) ?? 0;
 }

 function remainingForCollection(collection: FinanceCollection) {
 return Math.max(0, Number(collection.amount) - usageTotal(collection.id) - bankedTotal(collection.id));
 }

 const bankableCollections = cashCollections.filter(
 (item) =>
 (item.status === 'PENDING' || item.status === 'COLLECTED') &&
 remainingForCollection(item) > 0.009);

 const branchSelectValues = useMemo(() => branches.map((branch) => branch.id), [branches]);
 const selectedBranchId =
 boundSelectValue(branchId || branches[0]?.id || '', branchSelectValues) ?? '';
 const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
 const bankableCollectionValues = useMemo(
 () => bankableCollections.map((collection) => collection.id),
 [bankableCollections]);
 const safeBankInCollectionId =
 boundSelectValue(bankInCollectionId, bankableCollectionValues) ?? '';
 const selectedBankCollection = cashCollections.find((item) => item.id === safeBankInCollectionId);
 const safeUsageCollectionId =
 boundSelectValue(usageCollectionId, bankableCollectionValues) ?? bankableCollections[0]?.id ?? '';
 const selectedUsageCollection =
 cashCollections.find((item) => item.id === safeUsageCollectionId) ?? null;
 const selectedUsageRemaining = selectedUsageCollection ? remainingForCollection(selectedUsageCollection) : 0;
 const availableRequestsForUsage = supplyRequests.filter(
 (request) =>
 selectedUsageCollection?.branch_id &&
 request.branch_id === selectedUsageCollection.branch_id &&
 (request.status === 'APPROVED' || request.status === 'FULFILLED'));
 const availableRequestValues = useMemo(
 () => availableRequestsForUsage.map((request) => request.id),
 [availableRequestsForUsage]);
 const safeUsageSupplyRequestId =
 boundSelectValue(usageSupplyRequestId, availableRequestValues) ?? '';

 const branchRows = useMemo(() => {
 return branches.map((branch) => {
 const branchCollections = cashCollections.filter((item) => item.branch_id === branch.id);
 const weeklyCollections = branchCollections.filter(
 (item) => new Date(collectionTime(item)).getTime() >= weekStart.getTime());
 const openAmount = branchCollections
 .filter((item) => item.status === 'PENDING' || item.status === 'COLLECTED')
 .reduce((sum, item) => sum + remainingForCollection(item), 0);
 const last = branchCollections[0] ?? null;
 const lastDays = daysSince(last ? collectionTime(last) : null);
 const tone =
 weeklyCollections.length >= WEEKLY_BEST
 ? 'success'
 : weeklyCollections.length >= WEEKLY_MINIMUM
 ? 'watch'
 : 'danger';

 return {
 branch,
 weeklyCount: weeklyCollections.length,
 openAmount,
 last,
 lastDays,
 tone,
 };
 });
 // remainingForCollection reads memoized maps and must recalculate with their changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [branches, cashCollections, weekStart, usageTotalsByCollection, bankedTotalsByCollection]);

 const summary = useMemo(() => {
 const minimumMet = branchRows.filter((row) => row.weeklyCount >= WEEKLY_MINIMUM).length;
 const bestMet = branchRows.filter((row) => row.weeklyCount >= WEEKLY_BEST).length;
 const overdue = branchRows.filter((row) => row.weeklyCount < WEEKLY_MINIMUM || (row.lastDays ?? 99) >= 4).length;
 const outstanding = branchRows.reduce((sum, row) => sum + row.openAmount, 0);
 const pendingUsage = cashUsages.filter((usage) => usage.status === 'PENDING_REVIEW').length;
 return { minimumMet, bestMet, overdue, outstanding, pendingUsage };
 }, [branchRows, cashUsages]);

 async function refreshAfterAction(message: string) {
 toast.success(message);
 await onRefresh();
 }

 async function handleCreateCollection() {
 if (!selectedBranch) {
 toast.error('Pilih cawangan dahulu');
 return;
 }
 const amountNum = Number(amount);
 if (!amountNum || amountNum <= 0) {
 toast.error('Masukkan jumlah kutipan tunai');
 return;
 }
 if (collectorMode === 'THIRD_PARTY' && !thirdPartyName.trim()) {
 toast.error('Masukkan nama third party yang ditugaskan');
 return;
 }

 setSubmitting(true);
 try {
 const assignmentNote =
 collectorMode === 'THIRD_PARTY'
 ? `Third party ditugaskan: ${thirdPartyName.trim()}`
 : `Kutipan AM: ${profileName ?? 'Area Manager'}`;
 await createCollection({
 collection_type: collectorMode === 'THIRD_PARTY' ? 'THIRD_PARTY' : 'MANAGER',
 amount: amountNum,
 branch_id: selectedBranch.id,
 collected_from: branchDisplay(selectedBranch),
 notes: [assignmentNote, notes.trim()].filter(Boolean).join(' | '),
 });
 setAmount('');
 setThirdPartyName('');
 setNotes('');
 await refreshAfterAction('Rekod kutipan tunai disimpan');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan rekod kutipan');
 } finally {
 setSubmitting(false);
 }
 }

 async function handleMarkCollected(collection: FinanceCollection) {
 setSubmitting(true);
 try {
 const thirdPartyCollector = collection.third_party_name ?? (thirdPartyName.trim() || undefined);
 await markCollected(collection.id, {
 collector_name: profileName ?? undefined,
 third_party_name: collection.collection_type === 'THIRD_PARTY' ? thirdPartyCollector : undefined,
 });
 await refreshAfterAction('Kutipan ditanda sudah dikutip');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemas kini kutipan');
 } finally {
 setSubmitting(false);
 }
 }

 async function handleCreateUsage() {
 const collection = selectedUsageCollection;
 if (!collection) {
 toast.error('Pilih cash collection dahulu');
 return;
 }
 const amountNum = Number(usageAmount);
 if (!amountNum || amountNum <= 0) {
 toast.error('Masukkan jumlah penggunaan cash');
 return;
 }
 if (amountNum > remainingForCollection(collection)) {
 toast.error('Jumlah penggunaan melebihi baki cash collection');
 return;
 }
 if (!usageDescription.trim()) {
 toast.error('Masukkan catatan tujuan penggunaan');
 return;
 }
 if (!usageProofUrl.trim() && !usageReceiptNumber.trim()) {
 toast.error('Masukkan link bukti/resit atau nombor resit');
 return;
 }
 if (usageType === 'BRANCH_NECESSITY' && !usageSupplyRequestId) {
 toast.error('Pilih request barang cawangan yang sudah diluluskan');
 return;
 }
 if (usageType !== 'BRANCH_NECESSITY' && !usageVehicleReference.trim()) {
 toast.error('Masukkan rujukan kenderaan/transport');
 return;
 }

 setSubmitting(true);
 try {
 await recordCollectionCashUsage({
 collection_id: collection.id,
 usage_type: usageType,
 amount: amountNum,
 description: usageDescription.trim(),
 proof_url: usageProofUrl.trim() || undefined,
 receipt_number: usageReceiptNumber.trim() || undefined,
 supply_request_id: usageType === 'BRANCH_NECESSITY' ? usageSupplyRequestId : undefined,
 vehicle_reference: usageType !== 'BRANCH_NECESSITY' ? usageVehicleReference.trim() : undefined,
 vendor_name: usageVendorName.trim() || undefined,
 });
 setUsageAmount('');
 setUsageDescription('');
 setUsageProofUrl('');
 setUsageReceiptNumber('');
 setUsageSupplyRequestId('');
 setUsageVehicleReference('');
 setUsageVendorName('');
 await refreshAfterAction('Voucher penggunaan cash disimpan untuk semakan');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan voucher penggunaan cash');
 } finally {
 setSubmitting(false);
 }
 }

 async function handleReviewUsage(usage: CollectionCashUsage, status: 'ACCEPTED' | 'REJECTED') {
 setSubmitting(true);
 try {
 await reviewCollectionCashUsage({
 usage_id: usage.id,
 status,
 review_notes:
 status === 'ACCEPTED'
 ? 'Bukti diterima oleh OM/Admin/Finance'
 : 'Bukti ditolak - perlu pembetulan atau bank-in semula',
 });
 await refreshAfterAction(status === 'ACCEPTED' ? 'Voucher diterima' : 'Voucher ditolak');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal semak voucher');
 } finally {
 setSubmitting(false);
 }
 }

 async function handleBankIn() {
 const collection = selectedBankCollection;
 if (!collection) {
 toast.error('Pilih rekod kutipan untuk bank-in');
 return;
 }
 const remaining = remainingForCollection(collection);
 const amountNum = Number(bankInAmount || remaining);
 if (!amountNum || amountNum <= 0) {
 toast.error('Masukkan jumlah bank-in');
 return;
 }
 if (amountNum > remaining) {
 toast.error('Jumlah bank-in melebihi baki selepas penggunaan cash');
 return;
 }
 if (!bankReference.trim() && !bankSlipUrl.trim()) {
 toast.error('Masukkan rujukan bank atau link gambar/slip bank-in');
 return;
 }

 setSubmitting(true);
 try {
 await recordBankIn({
 amount: amountNum,
 collection_id: collection.id,
 bank_name: bankName.trim() || undefined,
 reference_number: bankReference.trim(),
 slip_url: bankSlipUrl.trim() || undefined,
 notes: `Bank-in baki cash collection ${collection.collection_number} selepas voucher penggunaan`,
 });
 setBankInCollectionId('');
 setBankInAmount('');
 setBankReference('');
 setBankSlipUrl('');
 await refreshAfterAction('Bank-in tunai direkod');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal rekod bank-in');
 } finally {
 setSubmitting(false);
 }
 }

 const isAreaManager = role === 'AREA_MANAGER';
 const canReviewUsage = ['SUPER_ADMIN', 'ADMIN', 'FINANCE', 'OPERATION_MANAGER'].includes(role);
 const roleLabel = isAreaManager ? 'AM kawasan sendiri' : 'OM/Admin/Finance audit skop dibenarkan';

 return (
 <SectionCard
 title="Kawalan Kutipan Tunai AM"
 description={`SOP kutipan tunai: minimum ${WEEKLY_MINIMUM} kali seminggu, sasaran terbaik ${WEEKLY_BEST} kali seminggu - ${roleLabel}.`}
 action={
 <Badge variant={summary.overdue > 0 ? 'destructive' : 'secondary'} className="shrink-0">
 {summary.overdue} overdue
 </Badge>
 }
 >
 <div className="space-y-5">
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
 <Metric label="Cawangan capai minimum" value={`${summary.minimumMet}/${branches.length}`} icon={CalendarCheck2} tone="success" />
 <Metric label="Cawangan capai terbaik" value={`${summary.bestMet}/${branches.length}`} icon={CheckCircle2} tone="success" />
 <Metric label="Perlu dikejar" value={String(summary.overdue)} icon={AlertTriangle} tone={summary.overdue > 0 ? 'danger' : 'success'} />
 <Metric label="Baki perlu bank-in" value={formatRM(summary.outstanding)} icon={Banknote} tone={summary.outstanding > 0 ? 'watch' : 'success'} />
 <Metric label="Voucher perlu semak" value={String(summary.pendingUsage)} icon={ReceiptText} tone={summary.pendingUsage > 0 ? 'watch' : 'success'} />
 </div>

 <div className="rounded-2xl border bg-amber-50/70 p-4 text-sm text-amber-950">
 <div className="flex items-start gap-3">
 <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
 <div>
 <p className="font-semibold">Arahan kerja penggunaan cash collection</p>
 <p className="mt-1 leading-relaxed">
 AM boleh guna cash collection hanya untuk barang keperluan cawangan yang berpunca daripada request staf yang sudah diluluskan, petrol/diesel route, atau service maintenance transport syarikat. Setiap penggunaan wajib ada bukti/resit. Sistem kira automatik baki bersih yang masih perlu bank-in.
 </p>
 </div>
 </div>
 </div>

 <div className="grid gap-4 xl:grid-cols-3">
 <div className="rounded-2xl border bg-background p-4">
 <div className="mb-3 flex items-center gap-2">
 <Users className="h-4 w-4 text-primary" />
 <h3 className="font-semibold">1. Rekod / Assign Kutipan</h3>
 </div>
 <div className="grid gap-3">
 <div className="space-y-1.5">
 <Label>Cawangan</Label>
 <Select value={selectedBranchId} onValueChange={(value) => value && setBranchId(value)}>
 <SelectTrigger>
 <SelectValue placeholder="Pilih cawangan">
 {selectedBranch ? branchDisplay(selectedBranch) : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {branches.map((branch) => (
 <SelectItem key={branch.id} value={branch.id}>{branchDisplay(branch)}</SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label>Jumlah cash</Label>
 <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
 </div>
 <div className="space-y-1.5">
 <Label>Kaedah</Label>
 <Select value={collectorMode} onValueChange={(value) => value && setCollectorMode(value as CollectorMode)}>
 <SelectTrigger><SelectValue /></SelectTrigger>
 <SelectContent>
 <SelectItem value="AM">AM sendiri</SelectItem>
 <SelectItem value="THIRD_PARTY">Pihak ketiga</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 {collectorMode === 'THIRD_PARTY' && (
 <div className="space-y-1.5">
 <Label>Nama third party</Label>
 <Input value={thirdPartyName} onChange={(e) => setThirdPartyName(e.target.value)} placeholder="Contoh: security / runner bank-in" />
 </div>)}
 <div className="space-y-1.5">
 <Label>Nota</Label>
 <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: kutipan Isnin/Rabu, duit diambil jam 3 petang" />
 </div>
 <Button onClick={handleCreateCollection} disabled={submitting} className="bg-amber-500 text-black hover:bg-amber-600">
 <UserRoundCheck className="mr-2 h-4 w-4" />
 Simpan Rekod Kutipan
 </Button>
 </div>
 </div>

 <div className="rounded-2xl border bg-background p-4">
 <div className="mb-3 flex items-center gap-2">
 <ReceiptText className="h-4 w-4 text-primary" />
 <h3 className="font-semibold">2. Voucher Guna Cash</h3>
 </div>
 <div className="grid gap-3">
 <div className="space-y-1.5">
 <Label>Cash collection</Label>
 <Select
 value={safeUsageCollectionId}
 onValueChange={(value) => {
 if (!value) return;
 setUsageCollectionId(value);
 setUsageSupplyRequestId('');
 }}
 >
 <SelectTrigger>
 <SelectValue placeholder="Pilih kutipan cash">
 {selectedUsageCollection
 ? `${selectedUsageCollection.collection_number} - ${selectedUsageCollection.branch?.branch_code ?? 'HQ'} - baki ${formatRM(selectedUsageRemaining)}`
 : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {bankableCollections.map((collection) => (
 <SelectItem key={collection.id} value={collection.id}>
 {collection.collection_number} - {collection.branch?.branch_code ?? 'HQ'} - baki {formatRM(remainingForCollection(collection))}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label>Jenis penggunaan</Label>
 <Select value={usageType} onValueChange={(value) => value && setUsageType(value as CashUsageType)}>
 <SelectTrigger><SelectValue /></SelectTrigger>
 <SelectContent>
 {USAGE_TYPES.map((item) => (
 <SelectItem key={item.value} value={item.value}>{CASH_USAGE_TYPE_LABELS[item.value]}</SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1.5">
 <Label>Jumlah guna</Label>
 <Input type="number" value={usageAmount} onChange={(e) => setUsageAmount(e.target.value)} placeholder="0.00" />
 </div>
 </div>
 <p className="rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
 {USAGE_TYPES.find((item) => item.value === usageType)?.hint}
 </p>
 {usageType === 'BRANCH_NECESSITY' && (
 <div className="space-y-1.5">
 <Label>Request staf cawangan yang diluluskan</Label>
 <Select value={safeUsageSupplyRequestId} onValueChange={(value) => value && setUsageSupplyRequestId(value)}>
 <SelectTrigger>
 <SelectValue placeholder="Pilih request approved">
 {availableRequestsForUsage.find((request) => request.id === safeUsageSupplyRequestId)
 ? supplyRequestLabel(availableRequestsForUsage.find((request) => request.id === safeUsageSupplyRequestId)!)
 : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {availableRequestsForUsage.map((request) => (
 <SelectItem key={request.id} value={request.id}>{supplyRequestLabel(request)}</SelectItem>))}
 </SelectContent>
 </Select>
 {availableRequestsForUsage.length === 0 && (
 <p className="text-xs text-red-600">
 Tiada request approved untuk cawangan ini. Minta staf buat request atau luluskan dahulu di Kelulusan.
 </p>)}
 </div>)}
 {usageType !== 'BRANCH_NECESSITY' && (
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label>Rujukan kenderaan</Label>
 <Input value={usageVehicleReference} onChange={(e) => setUsageVehicleReference(e.target.value)} placeholder="Contoh: VAN AM / WXX 1234" />
 </div>
 <div className="space-y-1.5">
 <Label>Vendor / stesen</Label>
 <Input value={usageVendorName} onChange={(e) => setUsageVendorName(e.target.value)} placeholder="Contoh: Petronas / bengkel" />
 </div>
 </div>)}
 <div className="space-y-1.5">
 <Label>Catatan tujuan</Label>
 <Textarea value={usageDescription} onChange={(e) => setUsageDescription(e.target.value)} placeholder="Contoh: beli plastik S untuk BR011 berdasarkan request staf" />
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label>Link bukti/resit</Label>
 <Input value={usageProofUrl} onChange={(e) => setUsageProofUrl(e.target.value)} placeholder="URL gambar/resit" />
 </div>
 <div className="space-y-1.5">
 <Label>No. resit</Label>
 <Input value={usageReceiptNumber} onChange={(e) => setUsageReceiptNumber(e.target.value)} placeholder="No. resit jika ada" />
 </div>
 </div>
 <div className="rounded-xl border bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
 Baki collection terpilih: <b>{formatRM(selectedUsageRemaining)}</b>. Selepas voucher ini, baki perlu bank-in akan ditolak automatik jika belum ditolak.
 </div>
 <Button onClick={handleCreateUsage} disabled={submitting || !selectedUsageCollection} variant="outline">
 <ReceiptText className="mr-2 h-4 w-4" />
 Simpan Voucher Penggunaan
 </Button>
 </div>
 </div>

 <div className="rounded-2xl border bg-background p-4">
 <div className="mb-3 flex items-center gap-2">
 <Landmark className="h-4 w-4 text-primary" />
 <h3 className="font-semibold">3. Bank-in Baki Bersih</h3>
 </div>
 <div className="grid gap-3">
 <div className="space-y-1.5">
 <Label>Rekod kutipan</Label>
 <Select
 value={safeBankInCollectionId}
 onValueChange={(value) => {
 if (!value) return;
 setBankInCollectionId(value);
 const collection = cashCollections.find((item) => item.id === value);
 setBankInAmount(collection ? String(remainingForCollection(collection).toFixed(2)) : '');
 }}
 >
 <SelectTrigger>
 <SelectValue placeholder="Pilih kutipan belum selesai">
 {selectedBankCollection
 ? `${selectedBankCollection.collection_number} - ${selectedBankCollection.branch?.branch_code ?? selectedBankCollection.collected_from ?? 'HQ'} - baki ${formatRM(remainingForCollection(selectedBankCollection))}`
 : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {bankableCollections.map((collection) => (
 <SelectItem key={collection.id} value={collection.id}>
 {collection.collection_number} - {collection.branch?.branch_code ?? collection.collected_from ?? 'HQ'} - baki {formatRM(remainingForCollection(collection))}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 {selectedBankCollection && (
 <div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-700">
 <b>Formula:</b> {formatRM(Number(selectedBankCollection.amount))} kutipan - {formatRM(usageTotal(selectedBankCollection.id))} voucher - {formatRM(bankedTotal(selectedBankCollection.id))} bank-in = <b>{formatRM(remainingForCollection(selectedBankCollection))}</b> baki.
 </div>)}
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label>Jumlah bank-in</Label>
 <Input type="number" value={bankInAmount} onChange={(e) => setBankInAmount(e.target.value)} placeholder="0.00" />
 </div>
 <div className="space-y-1.5">
 <Label>Bank</Label>
 <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Maybank" />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label>Rujukan bank</Label>
 <Input value={bankReference} onChange={(e) => setBankReference(e.target.value)} placeholder="No. slip / reference bank" />
 </div>
 <div className="space-y-1.5">
 <Label>Link gambar/slip</Label>
 <Input value={bankSlipUrl} onChange={(e) => setBankSlipUrl(e.target.value)} placeholder="URL bukti bank-in jika ada" />
 </div>
 <Button onClick={handleBankIn} disabled={submitting || bankableCollections.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
 <Landmark className="mr-2 h-4 w-4" />
 Rekod Bank-in Baki
 </Button>
 </div>
 </div>
 </div>

 <div className="space-y-2">
 <div className="flex items-center gap-2 text-sm font-semibold">
 <Route className="h-4 w-4 text-primary" />
 Status Cawangan Minggu Ini
 </div>
 <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
 {branchRows.map((row) => (
 <div
 key={row.branch.id}
 className={cn(
 'rounded-2xl border p-3 text-sm',
 row.tone === 'success' && 'border-emerald-200 bg-emerald-50/70',
 row.tone === 'watch' && 'border-amber-200 bg-amber-50/70',
 row.tone === 'danger' && 'border-red-200 bg-red-50/70')}
 >
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="truncate font-semibold">{branchDisplay(row.branch)}</p>
 <p className="text-xs text-muted-foreground">{row.branch.region_name ?? row.branch.area ?? 'Kawasan'}</p>
 </div>
 <Badge variant={row.tone === 'danger' ? 'destructive' : 'outline'} className="shrink-0">
 {row.weeklyCount}/{WEEKLY_BEST}
 </Badge>
 </div>
 <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
 <div className="rounded-lg bg-background/70 p-2">
 <p className="text-muted-foreground">Terakhir</p>
 <p className="font-semibold">{row.lastDays == null ? 'Tiada rekod' : `${row.lastDays} hari lepas`}</p>
 </div>
 <div className="rounded-lg bg-background/70 p-2">
 <p className="text-muted-foreground">Baki bank-in</p>
 <p className="font-semibold">{formatRM(row.openAmount)}</p>
 </div>
 </div>
 {row.last?.status === 'PENDING' && (
 <Button
 size="sm"
 variant="outline"
 disabled={submitting}
 className="mt-3 w-full bg-background/70"
 onClick={() => handleMarkCollected(row.last!)}
 >
 Tanda sudah dikutip
 </Button>)}
 </div>))}
 </div>
 </div>

 {cashUsages.length > 0 && (
 <div className="rounded-2xl border bg-muted/20 p-4">
 <div className="mb-3 flex items-center justify-between gap-3">
 <p className="text-sm font-semibold">Voucher penggunaan cash terkini</p>
 <Badge variant="outline">{cashUsages.length} rekod</Badge>
 </div>
 <div className="grid gap-2 lg:grid-cols-2">
 {cashUsages.slice(0, 8).map((usage) => (
 <div key={usage.id} className="rounded-xl border bg-background p-3 text-sm">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <p className="font-semibold">{usage.usage_number}</p>
 <span className={cn('rounded-full border px-2 py-0.5 text-[11px]', usageStatusClass(usage.status))}>
 {CASH_USAGE_STATUS_LABELS[usage.status]}
 </span>
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 {CASH_USAGE_TYPE_LABELS[usage.usage_type]} - {usage.branch ? `${usage.branch.branch_code} - ${usage.branch.branch_name}` : 'Cawangan'}
 </p>
 <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{usage.description}</p>
 <p className="mt-1 text-[11px] text-muted-foreground">
 Bukti: {usage.proof_url ? 'link disimpan' : usage.receipt_number ?? 'tiada'} | {dateTime(usage.spent_at)}
 </p>
 </div>
 <p className="shrink-0 font-bold">{formatRM(Number(usage.amount))}</p>
 </div>
 {canReviewUsage && usage.status === 'PENDING_REVIEW' && (
 <div className="mt-3 flex flex-wrap gap-2">
 <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting} onClick={() => handleReviewUsage(usage, 'ACCEPTED')}>
 <ClipboardCheck className="mr-1.5 h-4 w-4" />
 Terima
 </Button>
 <Button size="sm" variant="outline" className="text-red-600" disabled={submitting} onClick={() => handleReviewUsage(usage, 'REJECTED')}>
 Tolak
 </Button>
 </div>)}
 </div>))}
 </div>
 </div>)}

 {bankIns.length > 0 && (
 <div className="rounded-2xl border bg-muted/20 p-4">
 <p className="mb-2 text-sm font-semibold">Bank-in terkini</p>
 <div className="grid gap-2 md:grid-cols-2">
 {bankIns.slice(0, 4).map((record) => (
 <div key={record.id} className="rounded-xl border bg-background p-3 text-sm">
 <div className="flex justify-between gap-3">
 <div>
 <p className="font-semibold">{record.bank_in_number}</p>
 <p className="text-xs text-muted-foreground">
 {record.collection?.branch?.branch_code ?? 'HQ'} - {record.reference_number ?? 'Tiada rujukan'}
 </p>
 {record.slip_url && (
 <p className="mt-1 text-[11px] text-emerald-700">Bukti slip disimpan</p>)}
 </div>
 <p className="font-bold">{formatRM(Number(record.amount))}</p>
 </div>
 </div>))}
 </div>
 </div>)}
 </div>
 </SectionCard>);
}

function Metric({
 label,
 value,
 icon: Icon,
 tone,
}: {
 label: string;
 value: string;
 icon: LucideIcon;
 tone: 'success' | 'watch' | 'danger';
}) {
 return (
 <div
 className={cn(
 'rounded-2xl border p-4',
 tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-950',
 tone === 'watch' && 'border-amber-200 bg-amber-50 text-amber-950',
 tone === 'danger' && 'border-red-200 bg-red-50 text-red-950')}
 >
 <div className="flex items-center justify-between gap-3">
 <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
 <Icon className="h-5 w-5 opacity-80" />
 </div>
 <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
 </div>);
}
