'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
 Activity,
 AlertTriangle,
 ArrowRight,
 BarChart3,
 Building2,
 CheckCircle2,
 ClipboardList,
 Clock,
 Download,
 Eye,
 FilePenLine,
 FilePlus2,
 FileText,
 MapPin,
 MoveRight,
 Package,
 RefreshCw,
 Save,
 Search,
 ShieldCheck,
 ShoppingCart,
 SlidersHorizontal,
 Store,
 TrendingUp,
 Trash2,
 UserCheck,
 UserCog,
 Users,
 Wrench,
 X,
} from 'lucide-react';
import type { LegalEntityDocument } from '@/lib/brand/legal-entity-profile';
import { submitAdjustment } from '@/lib/inventory/api';
import { createBranch, deleteBranch, updateBranch, updateStaffMember } from '@/lib/settings/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
 Dialog,
 DialogContent,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
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
import {
 EmptyState,
 formatRM,
 KpiCard,
 KpiGrid,
 ModuleHeader,
 ModuleLayout,
 SectionCard,
} from '@/components/shared/module-ui';
import { DocumentPreviewDialog } from '@/components/shared/document-preview-dialog';
import { cn } from '@/lib/utils';

export type BranchInventoryStatus = 'OK' | 'LOW' | 'CRITICAL' | 'NO_LOCATION';

export type BranchDashboardBranch = {
 id: string;
 region_id: string | null;
 branch_code: string;
 branch_name: string;
 area: string | null;
 region_name: string | null;
 manager_name: string | null;
 status: string;
 sales_today: number;
 sales_week: number;
 sales_month: number;
 transactions_today: number;
 shift_open: boolean;
 staff_count: number;
 staff_clocked_in_today: number;
 inventory_status: BranchInventoryStatus;
 inventory_low_count: number;
 inventory_critical_count: number;
 pending_transfers: number;
 has_kiosk_location: boolean;
 maintenance_open: number;
 maintenance_urgent: number;
 profile_score: number;
};

export type BranchDashboardRegion = {
 id: string;
 code: string;
 name: string;
 manager_name: string | null;
};

export type BranchesDashboardSummary = {
 total: number;
 active: number;
 open_pos: number;
 sales_today: number;
 sales_month: number;
 transactions_today: number;
 staff_total: number;
 inventory_alerts: number;
 pending_transfers: number;
 maintenance_open: number;
};

type BranchOperationSnapshot = {
 location: {
 id: string;
 name: string;
 location_type: string;
 branch_id: string | null;
 } | null;
 balances: BranchStockBalance[];
 staff: BranchStaffRow[];
 documents: LegalEntityDocument[];
 branch_options: BranchStaffBranchOption[];
 permissions: {
 can_adjust_stock: boolean;
 can_manage_staff: boolean;
 can_transfer_staff: boolean;
 can_manage_documents: boolean;
 stock_auto_approve: boolean;
 role: string;
 };
 stock_reasons: string[];
};

type BranchDocumentForm = {
 id: string | null;
 title: string;
 documentType: string;
 issueDate: string;
 expiryDate: string;
 notes: string;
 file: File | null;
};

type BranchStockBalance = {
 id: string;
 location_id: string;
 stock_item_id: string;
 quantity: number;
 unit: string;
 status: 'OK' | 'LOW' | 'CRITICAL';
 stock_item: {
 id: string;
 item_code: string;
 name: string;
 category: string | null;
 base_unit: string;
 };
};

type BranchStaffRow = {
 id: string;
 staff_code: string;
 full_name: string;
 status: string;
 branch_id: string | null;
 region_id: string | null;
 worker_type: 'LOCAL' | 'FOREIGN' | null;
};

type BranchStaffBranchOption = {
 id: string;
 branch_code: string;
 branch_name: string;
 area: string | null;
 region_id: string | null;
 status: string;
};

type FilterMode = 'all' | 'open_pos' | 'stock' | 'maintenance' | 'incomplete';

const BRANCH_DOCUMENT_LABELS: Record<string, string> = {
 SSM: 'SSM / Pendaftaran',
 LICENSE: 'Lesen / Permit',
 HALAL: 'Halal',
 KKM: 'KKM / Kesihatan',
 BRANCH: 'Dokumen Cawangan',
 EQUIPMENT: 'Dokumen & Peralatan',
 OTHER: 'Lain-lain',
};

const BRANCH_DOCUMENT_TYPES = Object.entries(BRANCH_DOCUMENT_LABELS);

function emptyBranchDocumentForm(): BranchDocumentForm {
 return {
 id: null,
 title: '',
 documentType: 'BRANCH',
 issueDate: '',
 expiryDate: '',
 notes: '',
 file: null,
 };
}

function branchDocumentFormFromDoc(doc: LegalEntityDocument): BranchDocumentForm {
 return {
 id: doc.id,
 title: doc.title,
 documentType: doc.documentType,
 issueDate: doc.issueDate ?? '',
 expiryDate: doc.expiryDate ?? '',
 notes: doc.notes ?? '',
 file: null,
 };
}

function documentViewUrl(doc: LegalEntityDocument) {
 return `/api/legal-entities/documents/${doc.id}/download?mode=view`;
}

function documentDownloadUrl(doc: LegalEntityDocument) {
 return doc.downloadUrl ?? `/api/legal-entities/documents/${doc.id}/download`;
}

function formatDocumentDate(value: string | null) {
 if (!value) return '-';
 return new Intl.DateTimeFormat('ms-MY', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 }).format(new Date(value));
}

function documentFileSize(bytes: number | null) {
 if (!bytes) return null;
 if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
 return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BranchesDashboard({
 branches,
 regions,
 summary,
 canManageBranches,
 userRole,
}: {
 branches: BranchDashboardBranch[];
 regions: BranchDashboardRegion[];
 summary: BranchesDashboardSummary;
 canManageBranches: boolean;
 userRole: string;
}) {
 const router = useRouter();
 const [search, setSearch] = useState('');
 const [filter, setFilter] = useState<FilterMode>('all');
 const [selectedId, setSelectedId] = useState(branches[0]?.id ?? '');
 const [formOpen, setFormOpen] = useState(false);
 const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
 const [formBranch, setFormBranch] = useState<BranchDashboardBranch | null>(null);
 const [saving, setSaving] = useState(false);

 const filteredBranches = useMemo(() => {
 const q = search.trim().toLowerCase();

 return branches.filter((branch) => {
 const matchesSearch =
 !q ||
 branch.branch_code.toLowerCase().includes(q) ||
 branch.branch_name.toLowerCase().includes(q) ||
 (branch.area ?? '').toLowerCase().includes(q) ||
 (branch.region_name ?? '').toLowerCase().includes(q) ||
 (branch.manager_name ?? '').toLowerCase().includes(q);

 if (!matchesSearch) return false;
 if (filter === 'open_pos') return branch.shift_open;
 if (filter === 'stock') {
 return (
 branch.inventory_status === 'LOW' ||
 branch.inventory_status === 'CRITICAL' ||
 branch.inventory_status === 'NO_LOCATION' ||
 branch.pending_transfers > 0
 );
 }
 if (filter === 'maintenance') return branch.maintenance_open > 0;
 if (filter === 'incomplete') return branch.profile_score < 80;
 return true;
 });
 }, [branches, filter, search]);

 const selectedBranch =
 branches.find((branch) => branch.id === selectedId) ??
 filteredBranches[0] ??
 branches[0];

 const filters: Array<{ id: FilterMode; label: string; count: number }> = [
 { id: 'all', label: 'Semua', count: branches.length },
 { id: 'open_pos', label: 'POS buka', count: summary.open_pos },
 { id: 'stock', label: 'Stok isu', count: summary.inventory_alerts + summary.pending_transfers },
 { id: 'maintenance', label: 'Maintenance', count: summary.maintenance_open },
 { id: 'incomplete', label: 'Profil belum lengkap', count: branches.filter((b) => b.profile_score < 80).length },
 ];

 function openAdd() {
 setFormMode('add');
 setFormBranch(null);
 setFormOpen(true);
 }

 function openEdit(branch: BranchDashboardBranch) {
 setFormMode('edit');
 setFormBranch(branch);
 setFormOpen(true);
 }

 async function handleDelete(branch: BranchDashboardBranch) {
 if (!confirm(`Padam cawangan "${branch.branch_code} - ${branch.branch_name}"? Hanya dibenarkan jika tiada rekod jualan/staf berkaitan.`)) {
 return;
 }

 setSaving(true);
 try {
 await deleteBranch(branch.id);
 toast.success('Cawangan dipadam');
 setSelectedId(branches.find((item) => item.id !== branch.id)?.id ?? '');
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal padam cawangan');
 } finally {
 setSaving(false);
 }
 }

 return (
 <ModuleLayout>
 <ModuleHeader
 title="Pusat Cawangan Roti Kaya Junus"
 description="Pantau profil cawangan, POS, syif, staf, stok kiosk dan isu operasi dalam satu tempat."
 icon={Building2}
 badges={
 <>
 <Badge variant="secondary">{summary.total} cawangan dalam skop</Badge>
 <Badge variant="outline">Role: {roleLabel(userRole)}</Badge>
 </>
 }
 actions={
 canManageBranches ? (
 <Button
 type="button"
 className="bg-amber-500 hover:bg-amber-600"
 onClick={openAdd}
 >
 <FilePenLine className="h-4 w-4" />
 Tambah Cawangan
 </Button>) : null
 }
 />

 <KpiGrid cols={5}>
 <KpiCard title="Cawangan Aktif" value={`${summary.active}/${summary.total}`} icon={Store} />
 <KpiCard
 title="POS Buka"
 value={summary.open_pos}
 description={`${summary.transactions_today} transaksi hari ini`}
 icon={ShoppingCart}
 variant={summary.open_pos > 0 ? 'success' : 'warning'}
 />
 <KpiCard title="Jualan Hari Ini" value={formatRM(summary.sales_today)} icon={BarChart3} />
 <KpiCard
 title="Isu Stok"
 value={summary.inventory_alerts}
 description={`${summary.pending_transfers} pindahan menunggu`}
 icon={Package}
 variant={summary.inventory_alerts > 0 ? 'warning' : 'success'}
 />
 <KpiCard
 title="Maintenance"
 value={summary.maintenance_open}
 icon={Wrench}
 variant={summary.maintenance_open > 0 ? 'danger' : 'success'}
 />
 </KpiGrid>

 <BranchControlStrip
 summary={summary}
 selectedBranch={selectedBranch}
 />

 {branches.length === 0 ? (
 <EmptyState
 icon={Building2}
 title="Tiada cawangan dalam skop akses"
 description="Hubungi Pentadbir Utama untuk tetapkan cawangan, region atau tahap akses pengguna."
 action={
 canManageBranches ? (
 <Button
 type="button"
 className="bg-amber-500 hover:bg-amber-600"
 onClick={openAdd}
 >
 Tambah Cawangan
 </Button>) : null
 }
 />
 ) : (
 <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.45fr)]">
 <SectionCard
 title="Senarai Cawangan"
 description="Pilih cawangan untuk lihat profil operasi penuh."
 action={<Badge variant="outline">{filteredBranches.length} dipaparkan</Badge>}
 >
 <div className="space-y-3">
 <div className="relative">
 <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
 <Input
 value={search}
 onChange={(event) => setSearch(event.target.value)}
 placeholder="Cari kod, nama, area atau pengurus..."
 className="pl-9"
 />
 </div>
 <div className="flex flex-wrap gap-1.5">
 {filters.map((item) => (
 <Button
 key={item.id}
 type="button"
 size="sm"
 variant={filter === item.id ? 'default' : 'outline'}
 onClick={() => setFilter(item.id)}
 className="h-8"
 >
 {item.label}
 {item.count > 0 ? <span className="ml-1 tabular-nums">({item.count})</span> : null}
 </Button>))}
 </div>
 <div className="max-h-[760px] space-y-2 overflow-y-auto pr-1">
 {filteredBranches.map((branch) => (
 <BranchListButton
 key={branch.id}
 branch={branch}
 active={selectedBranch?.id === branch.id}
 onClick={() => setSelectedId(branch.id)}
 />))}
 {filteredBranches.length === 0 ? (
 <EmptyState
 icon={Search}
 title="Tiada cawangan sepadan"
 description="Cuba tukar carian atau tapisan."
 />
 ) : null}
 </div>
 </div>
 </SectionCard>

 {selectedBranch ? (
 <BranchProfilePanel
 branch={selectedBranch}
 canManageBranches={canManageBranches}
 userRole={userRole}
 saving={saving}
 onEdit={() => openEdit(selectedBranch)}
 onDelete={() => handleDelete(selectedBranch)}
 />
 ) : null}
 </div>)}
 {canManageBranches ? (
 <BranchCrudDialog
 open={formOpen}
 mode={formMode}
 branch={formBranch}
 regions={regions}
 saving={saving}
 setSaving={setSaving}
 onOpenChange={setFormOpen}
 onSaved={() => router.refresh()}
 />
 ) : null}
 </ModuleLayout>);
}

function BranchControlStrip({
 summary,
 selectedBranch,
}: {
 summary: BranchesDashboardSummary;
 selectedBranch?: BranchDashboardBranch;
}) {
 const activeRate = summary.total > 0 ? Math.round((summary.active / summary.total) * 100) : 0;
 const posRate = summary.active > 0 ? Math.round((summary.open_pos / summary.active) * 100) : 0;
 const attentionCount = summary.inventory_alerts + summary.maintenance_open;

 return (
 <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
 <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
 <div className="border-b p-5 lg:border-b-0 lg:border-r md:p-6">
 <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
 <div className="min-w-0">
 <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700">
 <Activity className="h-4 w-4" />
 Ringkasan Kawalan Operasi
 </p>
 <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#141414]">
 {summary.total} cawangan dipantau dalam satu dashboard
 </h2>
 <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
 Fokus harian: buka POS, pantau stok kiosk, semak staf hadir dan selesaikan maintenance sebelum operasi cawangan terganggu.
 </p>
 </div>
 </div>
 <div className="mt-5 grid gap-3 sm:grid-cols-3">
 <ControlMetric label="Aktif" value={`${activeRate}%`} detail={`${summary.active}/${summary.total} cawangan`} tone="success" />
 <ControlMetric label="POS berjalan" value={`${posRate}%`} detail={`${summary.open_pos} POS buka`} tone={posRate > 0 ? 'success' : 'warning'} />
 <ControlMetric label="Perlu perhatian" value={attentionCount} detail="stok / maintenance" tone={attentionCount > 0 ? 'danger' : 'success'} />
 </div>
 </div>
 <div className="bg-gradient-to-br from-amber-50/70 via-white to-emerald-50/50 p-5 md:p-6">
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cawangan Dipilih</p>
 <h3 className="mt-1 text-xl font-bold text-[#141414]">
 {selectedBranch ? selectedBranch.branch_code : 'Tiada pilihan'}
 </h3>
 </div>
 {selectedBranch ? <BranchHealthBadge branch={selectedBranch} /> : null}
 </div>
 {selectedBranch ? (
 <div className="mt-5 space-y-3">
 <div className="flex items-start gap-3 rounded-xl border bg-white/80 p-3 shadow-sm">
 <Store className="mt-0.5 h-5 w-5 text-amber-700" />
 <div className="min-w-0">
 <p className="font-semibold text-[#141414]">{selectedBranch.branch_name}</p>
 <p className="text-sm text-muted-foreground">
 {selectedBranch.region_name ?? 'Region belum ditetapkan'}
 {selectedBranch.manager_name ? ` - ${selectedBranch.manager_name}` : ''}
 </p>
 </div>
 </div>
 <div className="grid grid-cols-3 gap-2">
 <MiniStatus label="Jualan" value={formatRM(selectedBranch.sales_today)} />
 <MiniStatus label="Staf" value={`${selectedBranch.staff_clocked_in_today}/${selectedBranch.staff_count}`} />
 <MiniStatus label="Profil" value={`${selectedBranch.profile_score}%`} />
 </div>
 </div>
 ) : (
 <p className="mt-4 rounded-xl border bg-white/80 p-4 text-sm text-muted-foreground">
 Pilih cawangan daripada senarai untuk melihat profile operasi penuh.
 </p>)}
 </div>
 </div>
 </div>);
}

function ControlMetric({
 label,
 value,
 detail,
 tone,
}: {
 label: string;
 value: string | number;
 detail: string;
 tone: 'success' | 'warning' | 'danger';
}) {
 const toneClass = {
 success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
 warning: 'border-amber-200 bg-amber-50 text-amber-800',
 danger: 'border-red-200 bg-red-50 text-red-800',
 }[tone];

 return (
 <div className={cn('rounded-xl border p-3', toneClass)}>
 <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
 <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
 <p className="text-xs opacity-80">{detail}</p>
 </div>);
}

function MiniStatus({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-lg border bg-white/80 px-3 py-2">
 <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
 <p className="mt-0.5 truncate text-sm font-semibold text-[#141414]">{value}</p>
 </div>);
}

function BranchHealthBadge({ branch }: { branch: BranchDashboardBranch }) {
 const health = branchHealth(branch);
 if (health.tone === 'danger') {
 return (
 <Badge variant="destructive" className="gap-1">
 <AlertTriangle className="h-3.5 w-3.5" />
 Tindakan
 </Badge>);
 }
 if (health.tone === 'warning') {
 return (
 <Badge className="gap-1 bg-amber-500 hover:bg-amber-500">
 <AlertTriangle className="h-3.5 w-3.5" />
 Perhatian
 </Badge>);
 }
 return (
 <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
 <ShieldCheck className="h-3.5 w-3.5" />
 Stabil
 </Badge>);
}

function BranchCrudDialog({
 open,
 mode,
 branch,
 regions,
 saving,
 setSaving,
 onOpenChange,
 onSaved,
}: {
 open: boolean;
 mode: 'add' | 'edit';
 branch: BranchDashboardBranch | null;
 regions: BranchDashboardRegion[];
 saving: boolean;
 setSaving: (value: boolean) => void;
 onOpenChange: (value: boolean) => void;
 onSaved: () => void;
}) {
 const [regionId, setRegionId] = useState('');
 const [branchCode, setBranchCode] = useState('');
 const [branchName, setBranchName] = useState('');
 const [area, setArea] = useState('');
 const [managerName, setManagerName] = useState('');
 const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
 const selectedRegion = regions.find((region) => region.id === regionId) ?? null;

 useEffect(() => {
 if (!open) return;
 if (mode === 'edit' && branch) {
 setRegionId(branch.region_id ?? regions[0]?.id ?? '');
 setBranchCode(branch.branch_code);
 setBranchName(branch.branch_name);
 setArea(branch.area ?? '');
 setManagerName(branch.manager_name ?? '');
 setStatus(branch.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
 return;
 }

 setRegionId(regions[0]?.id ?? '');
 setBranchCode('');
 setBranchName('');
 setArea('');
 setManagerName('');
 setStatus('ACTIVE');
 }, [branch, mode, open, regions]);

 async function handleSave() {
 if (!regionId || !branchName.trim() || (mode === 'add' && !branchCode.trim())) {
 toast.error('Lengkapkan region, kod cawangan dan nama cawangan');
 return;
 }

 setSaving(true);
 try {
 if (mode === 'add') {
 await createBranch({
 region_id: regionId,
 branch_code: branchCode.trim().toUpperCase(),
 branch_name: branchName.trim(),
 area: area.trim() || undefined,
 manager_name: managerName.trim() || undefined,
 });
 toast.success('Cawangan baharu ditambah');
 } else if (branch) {
 await updateBranch(branch.id, {
 region_id: regionId,
 branch_name: branchName.trim(),
 area: area.trim() || null,
 manager_name: managerName.trim() || null,
 status,
 });
 toast.success('Cawangan dikemaskini');
 }

 onOpenChange(false);
 onSaved();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan cawangan');
 } finally {
 setSaving(false);
 }
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>{mode === 'add' ? 'Tambah Cawangan Baharu' : 'Kemaskini Cawangan'}</DialogTitle>
 </DialogHeader>
 <div className="grid gap-4 md:grid-cols-2">
 <div className="space-y-2">
 <Label>Kod Cawangan</Label>
 <Input
 value={branchCode}
 onChange={(event) => setBranchCode(event.target.value.toUpperCase())}
 disabled={mode === 'edit'}
 placeholder="Contoh: BR037"
 />
 {mode === 'edit' ? (
 <p className="text-xs text-muted-foreground">Kod cawangan dikunci untuk elak rekod POS lama bercampur.</p>
 ) : null}
 </div>
 <div className="space-y-2">
 <Label>Nama Cawangan</Label>
 <Input
 value={branchName}
 onChange={(event) => setBranchName(event.target.value)}
 placeholder="Nama lokasi kiosk"
 />
 </div>
 <div className="space-y-2">
 <Label>Region / Kawasan</Label>
 <Select value={regionId} onValueChange={(value) => value && setRegionId(value)}>
 <SelectTrigger className="w-full min-w-0">
 <SelectValue placeholder="Pilih region">
 {selectedRegion ? formatRegionOption(selectedRegion) : null}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {regions.map((region) => (
 <SelectItem key={region.id} value={region.id}>
 {region.name} {region.manager_name ? ` - ${region.manager_name}` : ''}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>Area / Zon</Label>
 <Input
 value={area}
 onChange={(event) => setArea(event.target.value)}
 placeholder="Contoh: Utara"
 />
 </div>
 <div className="space-y-2">
 <Label>Pengurus / AM</Label>
 <Input
 value={managerName}
 onChange={(event) => setManagerName(event.target.value)}
 placeholder="Nama pengurus cawangan atau AM"
 />
 </div>
 <div className="space-y-2">
 <Label>Status Kedai</Label>
 <Select value={status} onValueChange={(value) => setStatus(value === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE')}>
 <SelectTrigger className="w-full min-w-0">
 <SelectValue>{status === 'ACTIVE' ? 'Aktif' : 'Tidak Aktif'}</SelectValue>
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ACTIVE">Aktif</SelectItem>
 <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="rounded-xl border bg-amber-50/40 p-3 text-sm text-muted-foreground">
 Perubahan cawangan akan terus digunakan oleh POS, Inventori, Syif, Laporan dan profile cawangan selepas halaman refresh.
 </div>
 <DialogFooter>
 <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
 Batal
 </Button>
 <Button type="button" className="bg-amber-500 hover:bg-amber-600" disabled={saving} onClick={handleSave}>
 {saving ? 'Menyimpan...' : mode === 'add' ? 'Tambah Cawangan' : 'Simpan Kemaskini'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}

function formatRegionOption(region: BranchDashboardRegion) {
 return region.manager_name ? `${region.name} - ${region.manager_name}` : region.name;
}

function BranchListButton({
 branch,
 active,
 onClick,
}: {
 branch: BranchDashboardBranch;
 active: boolean;
 onClick: () => void;
}) {
 const health = branchHealth(branch);

 return (
 <button
 type="button"
 onClick={onClick}
 className={cn(
 'group relative w-full overflow-hidden rounded-xl border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/40 hover:shadow-md',
 active && 'border-amber-400 bg-amber-50 shadow-md')}
 >
 <span className={cn('absolute inset-y-0 left-0 w-1', health.bar)} aria-hidden />
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="truncate text-sm font-bold text-[#141414]">
 {branch.branch_code} - {branch.branch_name}
 </p>
 <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
 <MapPin className="h-3.5 w-3.5" />
 <span className="truncate">{branch.area ?? branch.region_name ?? 'Area belum ditetapkan'}</span>
 </p>
 </div>
 <BranchHealthBadge branch={branch} />
 </div>
 <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
 <StatusBadge status={branch.status} />
 <OperationBadge
 active={branch.shift_open}
 activeLabel="POS buka"
 inactiveLabel="POS tutup"
 />
 <InventoryBadge branch={branch} />
 {branch.maintenance_open > 0 ? (
 <Badge variant="destructive">{branch.maintenance_open} maintenance</Badge>
 ) : (
 <Badge variant="outline" className="border-emerald-200 text-emerald-700">
 Tiada maintenance
 </Badge>
 )}
 </div>
 <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
 <MiniStat label="Jualan" value={formatRM(branch.sales_today)} icon={TrendingUp} />
 <MiniStat label="Staf" value={`${branch.staff_clocked_in_today}/${branch.staff_count}`} icon={UserCheck} />
 <MiniStat label="Profil" value={`${branch.profile_score}%`} icon={ShieldCheck} />
 </div>
 </button>);
}

function BranchProfilePanel({
 branch,
 canManageBranches,
 userRole,
 saving,
 onEdit,
 onDelete,
}: {
 branch: BranchDashboardBranch;
 canManageBranches: boolean;
 userRole: string;
 saving: boolean;
 onEdit: () => void;
 onDelete: () => void;
}) {
 const suggestions = branchSuggestions(branch);

 return (
 <div className="space-y-4">
 <BranchProfileHero
 branch={branch}
 canManageBranches={canManageBranches}
 saving={saving}
 onEdit={onEdit}
 onDelete={onDelete}
 />

 <div className="grid gap-4 lg:grid-cols-2">
 <SectionCard title="Operasi Hari Ini" description="Ringkasan POS, jualan dan kehadiran staf.">
 <div className="grid gap-3 sm:grid-cols-2">
 <MetricBox icon={ShoppingCart} label="Status POS" value={branch.shift_open ? 'Buka' : 'Tutup'} tone={branch.shift_open ? 'success' : 'warning'} />
 <MetricBox icon={BarChart3} label="Jualan Hari Ini" value={formatRM(branch.sales_today)} />
 <MetricBox icon={Clock} label="Transaksi Hari Ini" value={branch.transactions_today.toString()} />
 <MetricBox icon={Users} label="Staf Hadir" value={`${branch.staff_clocked_in_today}/${branch.staff_count}`} />
 </div>
 <div className="mt-4 rounded-xl border bg-muted/20 p-3 text-sm">
 <p className="font-semibold">Prestasi bulan ini</p>
 <p className="mt-1 text-muted-foreground">
 {formatRM(branch.sales_month)} jualan bulanan dan {branch.sales_week > 0 ? formatRM(branch.sales_week) : formatRM(0)} minggu ini.
 </p>
 </div>
 </SectionCard>

 <SectionCard title="Stok, Pickup dan Maintenance" description="Isu operasi yang perlu dipantau sebelum cawangan terganggu.">
 <div className="space-y-3">
 <StatusLine
 icon={Package}
 label="Inventori Kiosk"
 value={inventoryStatusText(branch)}
 tone={branch.inventory_status === 'CRITICAL' ? 'danger' : branch.inventory_status === 'LOW' || branch.inventory_status === 'NO_LOCATION' ? 'warning' : 'success'}
 />
 <StatusLine
 icon={ArrowRight}
 label="Pindahan stok"
 value={`${branch.pending_transfers} menunggu terima`}
 tone={branch.pending_transfers > 0 ? 'warning' : 'success'}
 />
 <StatusLine
 icon={Wrench}
 label="Maintenance terbuka"
 value={`${branch.maintenance_open} tiket${branch.maintenance_urgent > 0 ? `, ${branch.maintenance_urgent} segera` : ''}`}
 tone={branch.maintenance_urgent > 0 ? 'danger' : branch.maintenance_open > 0 ? 'warning' : 'success'}
 />
 <StatusLine
 icon={MapPin}
 label="Lokasi kiosk"
 value={branch.has_kiosk_location ? 'Lokasi inventory aktif' : 'Belum ada lokasi kiosk'}
 tone={branch.has_kiosk_location ? 'success' : 'warning'}
 />
 </div>
 </SectionCard>
 </div>

 <BranchOperationsPanel branch={branch} userRole={userRole} />

 <SectionCard title="Cadangan Sistem" description="Tindakan proaktif berdasarkan keadaan cawangan ini.">
 <div className="grid gap-3 md:grid-cols-3">
 {suggestions.map((item) => (
 <div key={item.title} className="rounded-xl border bg-muted/20 p-4">
 <div className={cn('mb-3 inline-flex rounded-lg p-2', item.tone)}>
 <item.icon className="h-4 w-4" />
 </div>
 <p className="font-semibold">{item.title}</p>
 <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
 <Link
 href={item.href}
 className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:text-amber-800"
 >
 Buka modul
 <ArrowRight className="h-4 w-4" />
 </Link>
 </div>))}
 </div>
 </SectionCard>

 <SectionCard title="Tindakan Cepat" description="Pintu masuk terus ke modul yang berkaitan cawangan ini.">
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
 <ActionTile href={`/pos?branch_id=${branch.id}`} icon={ShoppingCart} label="POS" description="Jualan dan QR payment" />
 <ActionTile href={`/inventory?branch_id=${branch.id}`} icon={Package} label="Inventori" description="Stok kiosk dan transfer" />
 <ActionTile href={`/shifts?branch_id=${branch.id}`} icon={Clock} label="Syif" description="Roster dan attendance" />
 <ActionTile href={`/maintenance?branch_id=${branch.id}`} icon={Wrench} label="Maintenance" description="Report dan tindakan" />
 <ActionTile href={`/reports?branch_id=${branch.id}`} icon={BarChart3} label="Laporan" description="Prestasi cawangan" />
 </div>
 </SectionCard>
 </div>);
}

function BranchOperationsPanel({
 branch,
 userRole,
}: {
 branch: BranchDashboardBranch;
 userRole: string;
}) {
 const router = useRouter();
 const [snapshot, setSnapshot] = useState<BranchOperationSnapshot | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [stockDialogOpen, setStockDialogOpen] = useState(false);
 const [staffDialogOpen, setStaffDialogOpen] = useState(false);
 const [selectedStaff, setSelectedStaff] = useState<BranchStaffRow | null>(null);

 async function loadSnapshot() {
 setLoading(true);
 setError(null);
 try {
 const res = await fetch(`/api/branches/${encodeURIComponent(branch.id)}/operations`, {
 cache: 'no-store',
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? 'Gagal baca operasi cawangan');
 setSnapshot(data);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Gagal baca operasi cawangan');
 } finally {
 setLoading(false);
 }
 }

 useEffect(() => {
 void loadSnapshot();
 }, [branch.id]);

 const stockAlerts = snapshot?.balances.filter((item) => item.status !== 'OK').length ?? 0;
 const activeStaff = snapshot?.staff.filter((staff) => staff.status === 'ACTIVE').length ?? 0;
 const stockRows = snapshot?.balances.slice(0, 7) ?? [];

 function openStaff(staff: BranchStaffRow) {
 setSelectedStaff(staff);
 setStaffDialogOpen(true);
 }

 function afterSaved(message: string) {
 toast.success(message);
 void loadSnapshot();
 router.refresh();
 }

 return (
 <SectionCard
 title="Stok & Staf Cawangan"
 description="Kemaskini stok semasa, semak staf bertugas dan pindah staf mengikut skop akses."
 action={
 <Button type="button" size="sm" variant="outline" onClick={() => void loadSnapshot()}>
 <RefreshCw className="h-4 w-4" />
 Refresh
 </Button>
 }
 >
 {loading ? (
 <div className="rounded-xl border bg-muted/20 p-5 text-sm text-muted-foreground">
 Membaca data operasi cawangan...
 </div>
 ) : error ? (
 <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
 {error}
 </div>
 ) : snapshot ? (
 <div className="space-y-4">
 <div className="grid gap-3 md:grid-cols-3">
 <OperationSummaryCard
 icon={Package}
 label="Lokasi Stok"
 value={snapshot.location?.name ?? 'Belum didaftarkan'}
 description={snapshot.location ? 'Kiosk inventory aktif' : 'Daftar lokasi kiosk dahulu'}
 tone={snapshot.location ? 'success' : 'warning'}
 />
 <OperationSummaryCard
 icon={ClipboardList}
 label="Stok Perlu Semak"
 value={stockAlerts.toString()}
 description={snapshot.permissions.can_adjust_stock ? 'Boleh kemaskini dengan reason' : 'Paparan sahaja'}
 tone={stockAlerts > 0 ? 'warning' : 'success'}
 />
 <OperationSummaryCard
 icon={Users}
 label="Staf Aktif"
 value={`${activeStaff}/${snapshot.staff.length}`}
 description={snapshot.permissions.can_manage_staff ? 'Boleh edit dan pindah staf' : 'Paparan sahaja'}
 tone={activeStaff > 0 ? 'success' : 'warning'}
 />
 </div>

 <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
 <div className="rounded-2xl border bg-card p-4 shadow-sm">
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <p className="text-sm font-bold">Stok Semasa Cawangan</p>
 <p className="text-xs text-muted-foreground">
 Sebarang perubahan wajib pilih sebab untuk laporan audit.
 </p>
 </div>
 <Button
 type="button"
 size="sm"
 className="bg-amber-500 hover:bg-amber-600"
 disabled={!snapshot.location || !snapshot.permissions.can_adjust_stock}
 onClick={() => setStockDialogOpen(true)}
 >
 <Save className="h-4 w-4" />
 Kemaskini Stok
 </Button>
 </div>
 <div className="mt-4 space-y-2">
 {stockRows.length > 0 ? (
 stockRows.map((item) => (
 <div key={item.stock_item_id} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/10 p-3">
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold">
 {item.stock_item.item_code} - {item.stock_item.name}
 </p>
 <p className="text-xs text-muted-foreground">Unit: {item.unit}</p>
 </div>
 <div className="text-right">
 <p className="text-lg font-bold tabular-nums">{Number(item.quantity).toLocaleString('ms-MY')}</p>
 <StockStatusBadge status={item.status} />
 </div>
 </div>))
 ) : (
 <p className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
 Tiada rekod stok untuk cawangan ini.
 </p>)}
 </div>
 {!snapshot.permissions.can_adjust_stock ? (
 <p className="mt-3 rounded-xl border bg-amber-50/50 p-3 text-xs text-muted-foreground">
 {roleLabel(userRole)} boleh melihat stok tetapi tidak boleh membuat pelarasan dari dashboard ini.
 </p>
 ) : null}
 </div>

 <div className="rounded-2xl border bg-card p-4 shadow-sm">
 <div className="flex items-start justify-between gap-3">
 <div>
 <p className="text-sm font-bold">Staf Cawangan</p>
 <p className="text-xs text-muted-foreground">
 Edit status dan pindah staf ke cawangan yang dibenarkan.
 </p>
 </div>
 <Badge variant="outline">{snapshot.staff.length} staf</Badge>
 </div>
 <div className="mt-4 space-y-2">
 {snapshot.staff.length > 0 ? (
 snapshot.staff.map((staff) => (
 <div key={staff.id} className="rounded-xl border bg-muted/10 p-3">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold">{staff.full_name}</p>
 <p className="text-xs text-muted-foreground">
 {staff.staff_code} {staff.worker_type ? `- ${workerTypeLabel(staff.worker_type)}` : ''}
 </p>
 </div>
 <Badge variant={staff.status === 'ACTIVE' ? 'default' : 'secondary'}>
 {staff.status === 'ACTIVE' ? 'Aktif' : 'Tidak Aktif'}
 </Badge>
 </div>
 <div className="mt-3 flex justify-end">
 <Button
 type="button"
 size="sm"
 variant="outline"
 disabled={!snapshot.permissions.can_manage_staff}
 onClick={() => openStaff(staff)}
 >
 <UserCog className="h-4 w-4" />
 Edit / Pindah
 </Button>
 </div>
 </div>))
 ) : (
 <p className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
 Tiada staf dipautkan kepada cawangan ini.
 </p>)}
 </div>
 {!snapshot.permissions.can_manage_staff ? (
 <p className="mt-3 rounded-xl border bg-amber-50/50 p-3 text-xs text-muted-foreground">
 Staf hanya boleh dikemaskini oleh Pentadbir, HR, OM atau Area Manager dalam skop kawasan.
 </p>
 ) : null}
 </div>
 </div>

 <BranchDocumentsPanel
 branch={branch}
 documents={snapshot.documents ?? []}
 canManageDocuments={snapshot.permissions.can_manage_documents}
 onChanged={() => afterSaved('Dokumen cawangan dikemaskini')}
 />

 <StockAdjustmentDialog
 open={stockDialogOpen}
 onOpenChange={setStockDialogOpen}
 snapshot={snapshot}
 onSaved={() =>
 afterSaved(
 snapshot.permissions.stock_auto_approve
 ? 'Stok cawangan dikemaskini'
 : 'Pelarasan stok dihantar untuk kelulusan HQ')}
 />
 <StaffEditDialog
 open={staffDialogOpen}
 onOpenChange={setStaffDialogOpen}
 staff={selectedStaff}
 branchOptions={snapshot.branch_options}
 canTransfer={snapshot.permissions.can_transfer_staff}
 onSaved={() => afterSaved('Maklumat staf dikemaskini')}
 />
 </div>
 ) : null}
 </SectionCard>);
}

function BranchDocumentsPanel({
 branch,
 documents,
 canManageDocuments,
 onChanged,
}: {
 branch: BranchDashboardBranch;
 documents: LegalEntityDocument[];
 canManageDocuments: boolean;
 onChanged: () => void;
}) {
 const [docForm, setDocForm] = useState<BranchDocumentForm | null>(null);
 const [docSaving, setDocSaving] = useState(false);
 const [previewDoc, setPreviewDoc] = useState<LegalEntityDocument | null>(null);
 const sortedDocuments = useMemo(() => {
 return [...documents].sort((a, b) => {
 const aExpiry = a.expiryDate ?? '9999-12-31';
 const bExpiry = b.expiryDate ?? '9999-12-31';
 return aExpiry.localeCompare(bExpiry) || a.title.localeCompare(b.title);
 });
 }, [documents]);
 const categoryCount = useMemo(() => {
 return documents.reduce<Record<string, number>>((acc, doc) => {
 acc[doc.documentType] = (acc[doc.documentType] ?? 0) + 1;
 return acc;
 }, {});
 }, [documents]);

 function updateDocForm(key: keyof BranchDocumentForm, value: string | File | null) {
 setDocForm((current) => (current ? {...current, [key]: value } : current));
 }

 async function saveDocument() {
 if (!docForm) return;
 if (!docForm.title.trim() && !docForm.file) {
 toast.error('Tajuk atau fail dokumen diperlukan');
 return;
 }

 setDocSaving(true);
 try {
 const payload = new FormData();
 if (docForm.id) payload.set('id', docForm.id);
 payload.set('code', 'RKJ');
 payload.set('title', docForm.title.trim());
 payload.set('documentType', docForm.documentType);
 payload.set('branchName', branch.branch_name);
 payload.set('issueDate', docForm.issueDate);
 payload.set('expiryDate', docForm.expiryDate);
 payload.set('notes', docForm.notes);
 if (docForm.file) payload.set('file', docForm.file);

 const res = await fetch('/api/legal-entities/documents', {
 method: 'POST',
 body: payload,
 });
 const body = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(body.error ?? 'Gagal simpan dokumen cawangan');
 setDocForm(null);
 onChanged();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan dokumen cawangan');
 } finally {
 setDocSaving(false);
 }
 }

 async function archiveDocument(doc: LegalEntityDocument) {
 if (!confirm(`Arkibkan dokumen "${doc.title}" untuk ${branch.branch_code}?`)) return;
 setDocSaving(true);
 try {
 const res = await fetch(`/api/legal-entities/documents?id=${doc.id}`, { method: 'DELETE' });
 const body = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(body.error ?? 'Gagal arkib dokumen');
 onChanged();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal arkib dokumen');
 } finally {
 setDocSaving(false);
 }
 }

 return (
 <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
 <div className="flex flex-col gap-3 border-b bg-gradient-to-br from-sky-50 via-white to-amber-50/60 p-4 sm:flex-row sm:items-start sm:justify-between">
 <div className="min-w-0">
 <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-800">
 <FileText className="h-4 w-4" />
 Profil & Dokumen Cawangan
 </div>
 <h3 className="mt-2 text-lg font-bold text-[#141414]">
 {branch.branch_code} - {branch.branch_name}
 </h3>
 <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
 Semua lesen, permit, dokumen operasi dan rujukan cawangan duduk di sini supaya pengguna tidak perlu cari di Tetapan.
 </p>
 </div>
 <div className="flex flex-wrap gap-2">
 <Badge variant="outline">{documents.length} dokumen</Badge>
 {canManageDocuments ? (
 <Button
 type="button"
 size="sm"
 className="bg-amber-500 hover:bg-amber-600"
 onClick={() => setDocForm(emptyBranchDocumentForm())}
 >
 <FilePlus2 className="h-4 w-4" />
 Tambah Dokumen
 </Button>
 ) : null}
 </div>
 </div>

 <div className="grid gap-4 p-4 xl:grid-cols-[240px_minmax(0,1fr)]">
 <div className="space-y-2">
 {BRANCH_DOCUMENT_TYPES.map(([type, label]) => (
 <div key={type} className="flex items-center justify-between rounded-xl border bg-muted/10 px-3 py-2 text-sm">
 <span className="truncate text-muted-foreground">{label}</span>
 <span className="font-semibold tabular-nums">{categoryCount[type] ?? 0}</span>
 </div>))}
 {!canManageDocuments ? (
 <div className="rounded-xl border bg-amber-50/50 p-3 text-xs text-muted-foreground">
 Akaun ini boleh melihat dokumen cawangan. Kemaskini dokumen hanya untuk Pentadbir, OM, AM atau Branch Manager yang diberi skop.
 </div>
 ) : null}
 </div>

 <div className="space-y-3">
 {docForm ? (
 <div className="rounded-2xl border bg-background p-4 shadow-sm">
 <div className="mb-3 flex items-start justify-between gap-3">
 <div>
 <p className="font-semibold">{docForm.id ? 'Edit Dokumen Cawangan' : 'Tambah Dokumen Cawangan'}</p>
 <p className="text-xs text-muted-foreground">
 Dokumen ini akan dipautkan terus kepada {branch.branch_code} sebagai rujukan rasmi cawangan.
 </p>
 </div>
 <Button type="button" size="sm" variant="ghost" onClick={() => setDocForm(null)}>
 <X className="h-4 w-4" />
 </Button>
 </div>
 <div className="grid gap-3 lg:grid-cols-2">
 <div className="space-y-2">
 <Label>Tajuk dokumen</Label>
 <Input
 value={docForm.title}
 onChange={(event) => updateDocForm('title', event.target.value)}
 placeholder="Contoh: Lesen premis / LOO / Permit operasi"
 />
 </div>
 <div className="space-y-2">
 <Label>Kategori</Label>
 <Select value={docForm.documentType} onValueChange={(value) => updateDocForm('documentType', value)}>
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Pilih kategori" />
 </SelectTrigger>
 <SelectContent>
 {BRANCH_DOCUMENT_TYPES.map(([type, label]) => (
 <SelectItem key={type} value={type}>
 {label}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>Tarikh mula / isu</Label>
 <Input type="date" value={docForm.issueDate} onChange={(event) => updateDocForm('issueDate', event.target.value)} />
 </div>
 <div className="space-y-2">
 <Label>Tarikh tamat</Label>
 <Input type="date" value={docForm.expiryDate} onChange={(event) => updateDocForm('expiryDate', event.target.value)} />
 </div>
 <div className="space-y-2 lg:col-span-2">
 <Label>Fail dokumen</Label>
 <Input
 type="file"
 accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg"
 onChange={(event) => updateDocForm('file', event.target.files?.[0] ?? null)}
 />
 <p className="text-xs text-muted-foreground">PDF/gambar boleh View terus; Excel akan disediakan sebagai download.</p>
 </div>
 <div className="space-y-2 lg:col-span-2">
 <Label>Nota rujukan</Label>
 <Textarea
 value={docForm.notes}
 onChange={(event) => updateDocForm('notes', event.target.value)}
 placeholder="Contoh: dokumen sah untuk operasi kiosk, perlu semak semula sebelum tamat tempoh."
 />
 </div>
 </div>
 <div className="mt-4 flex justify-end gap-2">
 <Button type="button" variant="outline" disabled={docSaving} onClick={() => setDocForm(null)}>
 Batal
 </Button>
 <Button type="button" className="bg-amber-500 hover:bg-amber-600" disabled={docSaving} onClick={saveDocument}>
 <Save className="h-4 w-4" />
 {docSaving ? 'Menyimpan...' : 'Simpan Dokumen'}
 </Button>
 </div>
 </div>
 ) : null}

 {sortedDocuments.length > 0 ? (
 <div className="overflow-hidden rounded-2xl border">
 <div className="hidden grid-cols-[1.25fr_0.8fr_0.8fr_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
 <span>Dokumen</span>
 <span>Kategori</span>
 <span>Tempoh</span>
 <span className="text-right">Tindakan</span>
 </div>
 {sortedDocuments.map((doc) => (
 <div key={doc.id} className="grid gap-3 border-b px-3 py-3 text-sm last:border-b-0 lg:grid-cols-[1.25fr_0.8fr_0.8fr_auto] lg:items-center">
 <div className="min-w-0">
 <p className="font-semibold text-foreground">{doc.title}</p>
 <p className="truncate text-xs text-muted-foreground">
 {doc.fileName}
 {documentFileSize(doc.fileSize) ? ` - ${documentFileSize(doc.fileSize)}` : ''}
 </p>
 {doc.notes ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{doc.notes}</p> : null}
 </div>
 <div>
 <Badge variant="secondary">{BRANCH_DOCUMENT_LABELS[doc.documentType] ?? doc.documentType}</Badge>
 </div>
 <div className="text-xs text-muted-foreground">
 <p>Mula: {formatDocumentDate(doc.issueDate)}</p>
 <p>Tamat: {formatDocumentDate(doc.expiryDate)}</p>
 </div>
 <div className="flex justify-end gap-1.5">
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="gap-1.5"
 disabled={!doc.storagePath}
 onClick={() => setPreviewDoc(doc)}
 >
 <Eye className="h-3.5 w-3.5" />
 View
 </Button>
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="gap-1.5"
 disabled={!doc.storagePath}
 onClick={() => window.open(documentDownloadUrl(doc), '_blank', 'noopener,noreferrer')}
 >
 <Download className="h-3.5 w-3.5" />
 Download
 </Button>
 {canManageDocuments ? (
 <>
 <Button type="button" size="sm" variant="ghost" onClick={() => setDocForm(branchDocumentFormFromDoc(doc))}>
 <FilePenLine className="h-3.5 w-3.5" />
 </Button>
 <Button
 type="button"
 size="sm"
 variant="ghost"
 className="text-destructive hover:text-destructive"
 disabled={docSaving}
 onClick={() => archiveDocument(doc)}
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </>
 ) : null}
 </div>
 </div>))}
 </div>
 ) : (
 <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
 <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
 <p className="mt-3 font-semibold">Belum ada dokumen cawangan</p>
 <p className="mt-1 text-sm text-muted-foreground">
 Tambah lesen, LOO, permit, senarai peralatan atau dokumen rujukan operasi untuk {branch.branch_code}.
 </p>
 </div>
 )}
 </div>
 </div>

 {previewDoc ? (
 <DocumentPreviewDialog
 open={Boolean(previewDoc)}
 title={previewDoc.title}
 fileName={previewDoc.fileName}
 mimeType={previewDoc.mimeType}
 viewUrl={documentViewUrl(previewDoc)}
 downloadUrl={documentDownloadUrl(previewDoc)}
 onClose={() => setPreviewDoc(null)}
 />
 ) : null}
 </div>);
}

function OperationSummaryCard({
 icon: Icon,
 label,
 value,
 description,
 tone,
}: {
 icon: typeof Package;
 label: string;
 value: string;
 description: string;
 tone: 'success' | 'warning';
}) {
 const toneClass =
 tone === 'success'
 ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
 : 'border-amber-200 bg-amber-50 text-amber-800';
 return (
 <div className={cn('rounded-xl border p-4', toneClass)}>
 <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
 <Icon className="h-4 w-4" />
 {label}
 </div>
 <p className="mt-2 truncate text-xl font-bold">{value}</p>
 <p className="mt-1 text-xs opacity-80">{description}</p>
 </div>);
}

function StockAdjustmentDialog({
 open,
 onOpenChange,
 snapshot,
 onSaved,
}: {
 open: boolean;
 onOpenChange: (value: boolean) => void;
 snapshot: BranchOperationSnapshot;
 onSaved: () => void;
}) {
 const [stockItemId, setStockItemId] = useState('');
 const [quantityAfter, setQuantityAfter] = useState('');
 const [reason, setReason] = useState('');
 const [note, setNote] = useState('');
 const [saving, setSaving] = useState(false);

 const selected = snapshot.balances.find((item) => item.stock_item_id === stockItemId) ?? null;

 useEffect(() => {
 if (!open) return;
 const first = snapshot.balances[0];
 setStockItemId(first?.stock_item_id ?? '');
 setQuantityAfter(first ? String(first.quantity) : '');
 setReason(snapshot.stock_reasons[0] ?? '');
 setNote('');
 }, [open, snapshot]);

 useEffect(() => {
 if (!selected || !open) return;
 setQuantityAfter(String(selected.quantity));
 }, [selected?.stock_item_id, open]);

 async function handleSave() {
 if (!snapshot.location) {
 toast.error('Lokasi stok cawangan belum didaftarkan');
 return;
 }
 if (!selected) {
 toast.error('Pilih item stok');
 return;
 }
 const qty = Number(quantityAfter);
 if (!Number.isFinite(qty) || qty < 0) {
 toast.error('Masukkan kuantiti stok sebenar yang sah');
 return;
 }
 if (!reason.trim()) {
 toast.error('Sebab pelarasan stok wajib dipilih');
 return;
 }

 setSaving(true);
 try {
 const finalReason = note.trim() ? `${reason} - ${note.trim()}` : reason;
 await submitAdjustment(snapshot.location.id, finalReason, [
 {
 stock_item_id: selected.stock_item_id,
 quantity_after: qty,
 unit: selected.unit,
 },
 ]);
 onOpenChange(false);
 onSaved();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemaskini stok');
 } finally {
 setSaving(false);
 }
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>Kemaskini Stok Semasa Cawangan</DialogTitle>
 </DialogHeader>
 <div className="space-y-4">
 <div className="rounded-xl border bg-amber-50/50 p-3 text-sm text-muted-foreground">
 Pilih item, masukkan kuantiti fizikal sebenar dan pilih sebab. AM akan dihantar untuk kelulusan HQ, OM/HQ akan terus disahkan.
 </div>
 <div className="grid gap-4 md:grid-cols-2">
 <div className="space-y-2">
 <Label>Item Stok</Label>
 <Select value={stockItemId} onValueChange={(value) => value && setStockItemId(value)}>
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Pilih item">
 {selected ? formatStockSelectLabel(selected) : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {snapshot.balances.map((item) => (
 <SelectItem key={item.stock_item_id} value={item.stock_item_id}>
 {item.stock_item.item_code} - {item.stock_item.name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>Stok Semasa Dalam Sistem</Label>
 <Input value={selected ? `${selected.quantity} ${selected.unit}` : '-'} disabled />
 </div>
 <div className="space-y-2">
 <Label>Kuantiti Fizikal Sebenar</Label>
 <Input
 type="number"
 min="0"
 step="1"
 value={quantityAfter}
 onChange={(event) => setQuantityAfter(event.target.value)}
 placeholder="Contoh: 120"
 />
 </div>
 <div className="space-y-2">
 <Label>Sebab Pelarasan</Label>
 <Select value={reason} onValueChange={(value) => value && setReason(value)}>
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Pilih sebab wajib">
 {reason || undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {snapshot.stock_reasons.map((item) => (
 <SelectItem key={item} value={item}>
 {item}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="space-y-2">
 <Label>Catatan Tambahan</Label>
 <Textarea
 value={note}
 onChange={(event) => setNote(event.target.value)}
 placeholder="Contoh: kiraan fizikal selepas closing, disahkan oleh AM."
 />
 </div>
 </div>
 <DialogFooter>
 <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
 Batal
 </Button>
 <Button type="button" className="bg-amber-500 hover:bg-amber-600" disabled={saving} onClick={handleSave}>
 {saving ? 'Menyimpan...' : 'Simpan Stok'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}

function StaffEditDialog({
 open,
 onOpenChange,
 staff,
 branchOptions,
 canTransfer,
 onSaved,
}: {
 open: boolean;
 onOpenChange: (value: boolean) => void;
 staff: BranchStaffRow | null;
 branchOptions: BranchStaffBranchOption[];
 canTransfer: boolean;
 onSaved: () => void;
}) {
 const [fullName, setFullName] = useState('');
 const [status, setStatus] = useState('ACTIVE');
 const [branchId, setBranchId] = useState('');
 const [saving, setSaving] = useState(false);
 const selectedBranchOption = branchOptions.find((branch) => branch.id === branchId) ?? null;

 useEffect(() => {
 if (!open || !staff) return;
 setFullName(staff.full_name);
 setStatus(staff.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
 setBranchId(staff.branch_id ?? branchOptions[0]?.id ?? '');
 }, [branchOptions, open, staff]);

 async function handleSave() {
 if (!staff) return;
 if (!fullName.trim()) {
 toast.error('Nama staf wajib diisi');
 return;
 }
 if (!branchId) {
 toast.error('Pilih cawangan staf');
 return;
 }

 setSaving(true);
 try {
 await updateStaffMember(staff.id, {
 full_name: fullName.trim(),
 status,
 branch_id: branchId,
 });
 onOpenChange(false);
 onSaved();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemaskini staf');
 } finally {
 setSaving(false);
 }
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-w-xl">
 <DialogHeader>
 <DialogTitle>Edit / Pindah Staf Cawangan</DialogTitle>
 </DialogHeader>
 {staff ? (
 <div className="space-y-4">
 <div className="rounded-xl border bg-muted/20 p-3 text-sm">
 <p className="font-semibold">{staff.staff_code}</p>
 <p className="text-muted-foreground">
 Pindahan staf terhad kepada cawangan dalam skop akses pengguna semasa.
 </p>
 </div>
 <div className="space-y-2">
 <Label>Nama Staf</Label>
 <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
 </div>
 <div className="grid gap-4 md:grid-cols-2">
 <div className="space-y-2">
 <Label>Status</Label>
 <Select value={status} onValueChange={(value) => value && setStatus(value)}>
 <SelectTrigger className="w-full">
 <SelectValue>{status === 'ACTIVE' ? 'Aktif' : 'Tidak Aktif'}</SelectValue>
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ACTIVE">Aktif</SelectItem>
 <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>Cawangan Bertugas</Label>
 <Select value={branchId} onValueChange={(value) => value && setBranchId(value)} disabled={!canTransfer}>
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Pilih cawangan">
 {selectedBranchOption ? formatBranchOptionLabel(selectedBranchOption) : undefined}
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 {branchOptions.map((branch) => (
 <SelectItem key={branch.id} value={branch.id}>
 {branch.branch_code} - {branch.branch_name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="flex items-center gap-2 rounded-xl border bg-amber-50/40 p-3 text-sm text-muted-foreground">
 <MoveRight className="h-4 w-4 text-amber-700" />
 Jika staf dipindahkan, dashboard staf dan syif akan ikut cawangan baru selepas refresh/login semula.
 </div>
 </div>
 ) : null}
 <DialogFooter>
 <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
 Batal
 </Button>
 <Button type="button" className="bg-amber-500 hover:bg-amber-600" disabled={saving} onClick={handleSave}>
 {saving ? 'Menyimpan...' : 'Simpan Staf'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}

function StockStatusBadge({ status }: { status: 'OK' | 'LOW' | 'CRITICAL' }) {
 if (status === 'CRITICAL') return <Badge variant="destructive">Kritikal</Badge>;
 if (status === 'LOW') return <Badge className="bg-amber-500 hover:bg-amber-500">Rendah</Badge>;
 return <Badge variant="outline" className="border-emerald-200 text-emerald-700">OK</Badge>;
}

function formatStockSelectLabel(item: BranchStockBalance) {
 return `${item.stock_item.item_code} - ${item.stock_item.name}`;
}

function formatBranchOptionLabel(branch: BranchStaffBranchOption) {
 return `${branch.branch_code} - ${branch.branch_name}`;
}

function workerTypeLabel(value: 'LOCAL' | 'FOREIGN') {
 return value === 'FOREIGN' ? 'Pekerja asing' : 'Pekerja tempatan';
}

function BranchProfileHero({
 branch,
 canManageBranches,
 saving,
 onEdit,
 onDelete,
}: {
 branch: BranchDashboardBranch;
 canManageBranches: boolean;
 saving: boolean;
 onEdit: () => void;
 onDelete: () => void;
}) {
 return (
 <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
 <div className="border-b bg-gradient-to-br from-[#141414] via-[#242018] to-[#5c3b05] p-5 text-white md:p-6">
 <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <Badge className="bg-white/15 text-white hover:bg-white/20">{branch.branch_code}</Badge>
 <BranchHealthBadge branch={branch} />
 <StatusBadge status={branch.status} />
 </div>
 <h2 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">
 {branch.branch_name}
 </h2>
 <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
 Profile operasi lengkap untuk pantau kedai, staf, POS, inventory kiosk dan isu harian cawangan ini.
 </p>
 </div>
 {canManageBranches ? (
 <div className="flex flex-wrap gap-2">
 <Button type="button" variant="outline" className="bg-white text-[#141414] hover:bg-amber-50" onClick={onEdit}>
 <SlidersHorizontal className="h-4 w-4" />
 Kemaskini
 </Button>
 <Button type="button" variant="destructive" disabled={saving} onClick={onDelete}>
 Delete
 </Button>
 </div>
 ) : null}
 </div>
 <div className="mt-5 grid gap-3 sm:grid-cols-3">
 <BranchHeroMetric icon={MapPin} label="Region / Area" value={`${branch.region_name ?? '-'} / ${branch.area ?? '-'}`} />
 <BranchHeroMetric icon={Users} label="Pengurus / AM" value={branch.manager_name ?? 'Belum ditetapkan'} />
 <BranchHeroMetric icon={ShoppingCart} label="POS Hari Ini" value={branch.shift_open ? 'Buka' : 'Tutup'} />
 </div>
 </div>
 <div className="grid gap-4 p-5 md:grid-cols-[1fr_260px] md:p-6">
 <div className="grid gap-3 sm:grid-cols-2">
 <InfoRow label="Nama Cawangan" value={branch.branch_name} />
 <InfoRow label="Kod Cawangan" value={branch.branch_code} />
 <InfoRow label="Area / Zon" value={branch.area ?? 'Belum ditetapkan'} />
 <InfoRow label="Region" value={branch.region_name ?? 'Belum ditetapkan'} />
 <InfoRow label="Pengurus / AM" value={branch.manager_name ?? 'Belum ditetapkan'} />
 <InfoRow label="Status Kedai" value={branch.status === 'ACTIVE' ? 'Aktif' : 'Tidak Aktif'} />
 </div>
 <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-white p-4">
 <div className="flex items-center justify-between">
 <p className="text-sm font-semibold">Kelengkapan Profil</p>
 <span className="text-2xl font-bold tabular-nums text-[#141414]">{branch.profile_score}%</span>
 </div>
 <div className="mt-3 h-2.5 rounded-full bg-white ring-1 ring-border">
 <div
 className={cn(
 'h-2.5 rounded-full',
 branch.profile_score >= 80 ? 'bg-emerald-500' : branch.profile_score >= 60 ? 'bg-amber-500' : 'bg-red-500')}
 style={{ width: `${Math.max(8, branch.profile_score)}%` }}
 />
 </div>
 <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
 Sasaran: kod, nama, area, region, pengurus dan lokasi kiosk lengkap.
 </p>
 <div className="mt-4 rounded-lg bg-white/80 p-3 text-xs text-muted-foreground">
 {branch.has_kiosk_location ? 'Lokasi inventory kiosk sudah aktif.' : 'Lokasi inventory kiosk belum lengkap.'}
 </div>
 </div>
 </div>
 </div>);
}

function BranchHeroMetric({
 icon: Icon,
 label,
 value,
}: {
 icon: typeof MapPin;
 label: string;
 value: string;
}) {
 return (
 <div className="rounded-xl border border-white/10 bg-white/10 p-3">
 <div className="flex items-center gap-2 text-white/65">
 <Icon className="h-4 w-4" />
 <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
 </div>
 <p className="mt-2 truncate font-semibold">{value}</p>
 </div>);
}

function InfoRow({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-xl border bg-muted/20 p-3 transition-colors hover:bg-muted/30">
 <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
 <p className="mt-1 font-semibold text-[#141414]">{value}</p>
 </div>);
}

function MetricBox({
 icon: Icon,
 label,
 value,
 tone = 'default',
}: {
 icon: typeof ShoppingCart;
 label: string;
 value: string;
 tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
 const toneClass = {
 default: 'bg-primary/10 text-primary',
 success: 'bg-emerald-50 text-emerald-700',
 warning: 'bg-amber-50 text-amber-700',
 danger: 'bg-red-50 text-red-700',
 }[tone];

 return (
 <div className="rounded-xl border bg-card p-3">
 <div className="flex items-center gap-2">
 <span className={cn('rounded-lg p-2', toneClass)}>
 <Icon className="h-4 w-4" />
 </span>
 <p className="text-xs font-medium text-muted-foreground">{label}</p>
 </div>
 <p className="mt-3 text-xl font-bold tabular-nums text-[#141414]">{value}</p>
 </div>);
}

function StatusLine({
 icon: Icon,
 label,
 value,
 tone,
}: {
 icon: typeof Package;
 label: string;
 value: string;
 tone: 'success' | 'warning' | 'danger';
}) {
 const toneClass = {
 success: 'text-emerald-700 bg-emerald-50',
 warning: 'text-amber-700 bg-amber-50',
 danger: 'text-red-700 bg-red-50',
 }[tone];

 return (
 <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
 <span className={cn('rounded-lg p-2', toneClass)}>
 <Icon className="h-4 w-4" />
 </span>
 <div className="min-w-0">
 <p className="text-xs font-medium text-muted-foreground">{label}</p>
 <p className="truncate text-sm font-semibold">{value}</p>
 </div>
 </div>);
}

function ActionTile({
 href,
 icon: Icon,
 label,
 description,
}: {
 href: string;
 icon: typeof ShoppingCart;
 label: string;
 description: string;
}) {
 return (
 <Link
 href={href}
 className="group rounded-xl border bg-card p-4 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/40"
 >
 <div className="flex items-start justify-between gap-2">
 <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
 <Icon className="h-4 w-4" />
 </span>
 <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-amber-700" />
 </div>
 <p className="mt-3 font-semibold">{label}</p>
 <p className="mt-1 text-xs text-muted-foreground">{description}</p>
 </Link>);
}

function MiniStat({
 label,
 value,
 icon: Icon,
}: {
 label: string;
 value: string;
 icon?: typeof TrendingUp;
}) {
 return (
 <div className="rounded-lg bg-white/70 px-2 py-1.5 ring-1 ring-border/70">
 <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
 {Icon ? <Icon className="h-3 w-3" /> : null}
 {label}
 </p>
 <p className="truncate font-semibold tabular-nums">{value}</p>
 </div>);
}

function StatusBadge({ status }: { status: string }) {
 if (status === 'ACTIVE') {
 return <Badge className="bg-emerald-600 hover:bg-emerald-600">Aktif</Badge>;
 }
 return <Badge variant="secondary">Tidak Aktif</Badge>;
}

function OperationBadge({
 active,
 activeLabel,
 inactiveLabel,
}: {
 active: boolean;
 activeLabel: string;
 inactiveLabel: string;
}) {
 return active ? (
 <Badge className="bg-emerald-600 hover:bg-emerald-600">{activeLabel}</Badge>
 ) : (
 <Badge variant="outline">{inactiveLabel}</Badge>
 );
}

function InventoryBadge({ branch }: { branch: BranchDashboardBranch }) {
 if (branch.inventory_status === 'CRITICAL') {
 return <Badge variant="destructive">{branch.inventory_critical_count} kritikal</Badge>;
 }
 if (branch.inventory_status === 'LOW') {
 return <Badge className="bg-amber-500 hover:bg-amber-500">{branch.inventory_low_count} rendah</Badge>;
 }
 if (branch.inventory_status === 'NO_LOCATION') {
 return <Badge variant="secondary">Tiada lokasi stok</Badge>;
 }
 return (
 <Badge variant="outline" className="border-emerald-200 text-emerald-700">
 Stok OK
 </Badge>);
}

function inventoryStatusText(branch: BranchDashboardBranch) {
 if (branch.inventory_status === 'NO_LOCATION') return 'Lokasi inventory kiosk belum didaftarkan';
 if (branch.inventory_status === 'CRITICAL') return `${branch.inventory_critical_count} item kritikal`;
 if (branch.inventory_status === 'LOW') return `${branch.inventory_low_count} item rendah`;
 return 'Stok kiosk stabil';
}

function branchHealth(branch: BranchDashboardBranch) {
 if (
 branch.inventory_status === 'CRITICAL' ||
 branch.maintenance_urgent > 0 ||
 branch.profile_score < 60
 ) {
 return { tone: 'danger' as const, bar: 'bg-red-500' };
 }

 if (
 branch.inventory_status === 'LOW' ||
 branch.inventory_status === 'NO_LOCATION' ||
 branch.maintenance_open > 0 ||
 !branch.shift_open ||
 branch.profile_score < 80
 ) {
 return { tone: 'warning' as const, bar: 'bg-amber-500' };
 }

 return { tone: 'success' as const, bar: 'bg-emerald-500' };
}

function branchSuggestions(branch: BranchDashboardBranch) {
 if (branch.inventory_status === 'CRITICAL' || branch.inventory_status === 'LOW') {
 return [
 {
 title: 'Pulihkan stok kiosk',
 description: 'Semak item rendah atau kritikal dan buat pindahan stok sebelum waktu puncak.',
 href: `/inventory?branch_id=${branch.id}`,
 icon: Package,
 tone: 'bg-amber-50 text-amber-700',
 },
 {
 title: 'Sahkan penerimaan',
 description: 'Jika ada pindahan menunggu, pastikan staf cawangan confirm stok diterima.',
 href: `/inventory?branch_id=${branch.id}`,
 icon: ArrowRight,
 tone: 'bg-violet-50 text-violet-700',
 },
 {
 title: 'Pantau jualan',
 description: 'Bandingkan jualan hari ini dengan trend mingguan selepas stok dipulihkan.',
 href: `/reports?branch_id=${branch.id}`,
 icon: BarChart3,
 tone: 'bg-blue-50 text-blue-700',
 },
 ];
 }

 if (!branch.shift_open) {
 return [
 {
 title: 'Semak pembukaan POS',
 description: 'POS belum dibuka. Pastikan staf buka syif dan terminal sebelum jualan bermula.',
 href: `/pos?branch_id=${branch.id}`,
 icon: ShoppingCart,
 tone: 'bg-amber-50 text-amber-700',
 },
 {
 title: 'Sahkan kehadiran staf',
 description: 'Jika staf belum hadir, susun pengganti atau maklumkan pengurus kawasan.',
 href: `/shifts?branch_id=${branch.id}`,
 icon: Users,
 tone: 'bg-blue-50 text-blue-700',
 },
 {
 title: 'Report isu operasi',
 description: 'Jika cawangan tidak boleh beroperasi, buka report maintenance atau staffing.',
 href: `/maintenance?branch_id=${branch.id}`,
 icon: Wrench,
 tone: 'bg-red-50 text-red-700',
 },
 ];
 }

 if (branch.maintenance_open > 0) {
 return [
 {
 title: 'Tutup isu maintenance',
 description: 'Semak tiket terbuka dan pastikan status dikemaskini sehingga selesai.',
 href: `/maintenance?branch_id=${branch.id}`,
 icon: Wrench,
 tone: 'bg-red-50 text-red-700',
 },
 {
 title: 'Pantau kesan jualan',
 description: 'Semak sama ada isu maintenance memberi kesan kepada transaksi dan jualan.',
 href: `/reports?branch_id=${branch.id}`,
 icon: BarChart3,
 tone: 'bg-blue-50 text-blue-700',
 },
 {
 title: 'Semak syif backup',
 description: 'Jika isu operasi perlukan staf ganti, semak roster cawangan.',
 href: `/shifts?branch_id=${branch.id}`,
 icon: Clock,
 tone: 'bg-amber-50 text-amber-700',
 },
 ];
 }

 return [
 {
 title: 'Operasi stabil',
 description: 'POS, stok dan maintenance berada dalam keadaan terkawal. Fokus kepada jualan dan servis.',
 href: `/reports?branch_id=${branch.id}`,
 icon: CheckCircle2,
 tone: 'bg-emerald-50 text-emerald-700',
 },
 {
 title: 'Pantau stok harian',
 description: 'Terus semak stok kiosk sebelum tutup syif supaya order esok lebih tepat.',
 href: `/inventory?branch_id=${branch.id}`,
 icon: Package,
 tone: 'bg-amber-50 text-amber-700',
 },
 {
 title: 'Kawal staf dan syif',
 description: 'Pastikan attendance, shift close dan closing cash disahkan.',
 href: `/shifts?branch_id=${branch.id}`,
 icon: Users,
 tone: 'bg-blue-50 text-blue-700',
 },
 ];
}

function roleLabel(role: string) {
 const labels: Record<string, string> = {
 SUPER_ADMIN: 'Pentadbir Utama',
 ADMIN: 'Pentadbir',
 OPERATION_MANAGER: 'Pengurus Operasi',
 AREA_MANAGER: 'Pengurus Kawasan',
 BRANCH_MANAGER: 'Branch Manager',
 STAFF: 'Staf',
 FINANCE: 'Kewangan',
 };

 return labels[role] ?? role;
}
