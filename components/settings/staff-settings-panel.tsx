'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Plus, Trash2, Users, Store, Pencil } from 'lucide-react';
import { fetchStaffGrouped } from '@/lib/staff/api';
import { deleteStaffMember } from '@/lib/settings/api';
import { inferWorkerType, staffPayDisplay } from '@/lib/payroll/staff-pay-rates';
import { WorkerTypeBadge } from '@/components/payroll/worker-type-badge';
import { AddStaffDialog } from '@/components/settings/add-staff-dialog';
import { EditStaffDialog } from '@/components/settings/edit-staff-dialog';
import type { SettingsBranchGroup } from '@/lib/settings/types';
import type { StaffCompanyGroup, StaffMemberRow, StaffRegionGroup } from '@/lib/staff/types';
import { BranchScopeSelect } from '@/components/shared/branch-scope-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth-store';
import { isAreaManager, needsBranchPicker } from '@/lib/auth/branch-scope';

interface StaffSettingsPanelProps {
 branchGroups: SettingsBranchGroup[];
 canManage: boolean;
 onRefresh?: () => Promise<void>;
}

function staffPayLabel(s: StaffMemberRow) {
 return staffPayDisplay(s);
}

function StaffMiniCard({
 staff,
 canManage,
 onEdit,
 onDelete,
}: {
 staff: StaffMemberRow;
 canManage: boolean;
 onEdit: (id: string) => void;
 onDelete: (staff: StaffMemberRow) => void;
}) {
 const pay = staffPayLabel(staff);

 return (
 <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
 <div className="min-w-0">
 <span className="font-medium">{staff.full_name}</span>
 <span className="ml-1 text-xs text-muted-foreground">
 {staff.staff_code}
 </span>
 {staff.job_title && (
 <p className="mt-0.5 truncate text-xs font-medium text-slate-700">
 {staff.job_title}
 </p>)}
 <div className="mt-0.5 flex flex-wrap items-center gap-1">
 {staff.department && (
 <Badge variant="secondary" className="text-[10px] font-normal">
 {staff.department}
 </Badge>)}
 <WorkerTypeBadge
 workerType={inferWorkerType(staff)}
 className="text-[10px]"
 />
 {pay && (
 <span className="text-[10px] tabular-nums text-muted-foreground">
 {pay}
 </span>)}
 </div>
 </div>
 <div className="flex shrink-0 items-center gap-1">
 {staff.status !== 'ACTIVE' && (
 <Badge variant="secondary" className="text-[10px]">
 {staff.status}
 </Badge>)}
 {canManage && (
 <>
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7"
 onClick={() => onEdit(staff.id)}
 title="Edit staf"
 >
 <Pencil className="h-3.5 w-3.5" />
 </Button>
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7 text-destructive"
 onClick={() => onDelete(staff)}
 title="Padam staf"
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </>)}
 </div>
 </div>);
}

function BranchStaffSections({
 regions,
 canManage,
 onEdit,
 onDelete,
}: {
 regions: StaffRegionGroup[];
 canManage: boolean;
 onEdit: (id: string) => void;
 onDelete: (staff: StaffMemberRow) => void;
}) {
 return (
 <div className="space-y-3">
 {regions.map((group) => (
 <div key={group.region_id} className="rounded-lg border bg-muted/20 p-3">
 <div className="mb-3 flex flex-wrap items-center gap-2">
 <Users className="h-4 w-4 text-primary" />
 <p className="text-sm font-semibold">{group.region_name}</p>
 {group.manager_name && (
 <Badge variant="secondary" className="font-normal">
 AM: {group.manager_name}
 </Badge>)}
 <Badge variant="outline" className="font-normal tabular-nums">
 {group.staff_count} staf
 </Badge>
 </div>
 <div className="space-y-3">
 {group.branches.map((branch) => (
 <div key={branch.branch_id} className="rounded-lg border bg-background/70 p-3">
 <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
 <Store className="h-3.5 w-3.5 text-muted-foreground" />
 {branch.branch_code} - {branch.branch_name}
 </p>
 {branch.staff.length === 0 ? (
 <p className="text-xs text-muted-foreground">Tiada staf</p>) : (
 <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
 {branch.staff.map((staff) => (
 <StaffMiniCard
 key={staff.id}
 staff={staff}
 canManage={canManage}
 onEdit={onEdit}
 onDelete={onDelete}
 />))}
 </div>)}
 </div>))}
 </div>
 </div>))}
 </div>);
}

export function StaffSettingsPanel({
 branchGroups,
 canManage,
 onRefresh,
}: StaffSettingsPanelProps) {
 const profile = useAuthStore((s) => s.profile);
 const [branchId, setBranchId] = useState('');
 const [groups, setGroups] = useState<StaffRegionGroup[]>([]);
 const [companies, setCompanies] = useState<StaffCompanyGroup[]>([]);
 const [loading, setLoading] = useState(true);
 const [addOpen, setAddOpen] = useState(false);
 const [editStaffId, setEditStaffId] = useState<string | null>(null);

 const pickerVisible = profile ? needsBranchPicker(profile) : false;
 const areaManagerMode = profile ? isAreaManager(profile.role) : false;

 const allBranches = useMemo(
 () =>
 branchGroups.flatMap((g) =>
 g.branches.map((b) => ({
 id: b.id,
 branch_code: b.branch_code,
 branch_name: b.branch_name,
 region_name: g.region_name,
 }))),
 [branchGroups]);

 const existingStaffCodes = useMemo(
 () => {
 const companyCodes = companies.flatMap((company) => [
 ...company.hq_staff.map((staff) => staff.staff_code),
 ...company.regions.flatMap((region) =>
 region.branches.flatMap((branch) => branch.staff.map((staff) => staff.staff_code))),
 ]);
 if (companyCodes.length > 0) return companyCodes;
 return groups.flatMap((g) =>
 g.branches.flatMap((b) => b.staff.map((s) => s.staff_code)));
 },
 [companies, groups]);

 const defaultBranchForAdd = branchId || profile?.branch_id || undefined;
 const hasCompanyView = companies.length > 0;
 const totalCompanyStaff = companies.reduce((sum, company) => sum + company.staff_count, 0);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const data = await fetchStaffGrouped(branchId || undefined);
 setGroups(data.groups);
 setCompanies(data.companies ?? []);
 } catch {
 setGroups([]);
 setCompanies([]);
 } finally {
 setLoading(false);
 }
 }, [branchId]);

 useEffect(() => {
 load();
 }, [load]);

 async function handleDelete(id: string, name: string) {
 if (!confirm(`Padam staf "${name}"?`)) return;
 try {
 await deleteStaffMember(id);
 toast.success('Staf dipadam');
 await load();
 await onRefresh?.();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal padam staf');
 }
 }

 async function handleAddSuccess() {
 await load();
 await onRefresh?.();
 }

 if (loading) {
 return <Skeleton className="h-64 w-full" />;
 }

 return (
 <div className="space-y-4">
 <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
 Ini ialah <strong>rekod pekerja sebenar</strong>: kod staf, syarikat majikan,
 cawangan, jawatan, jenis pekerja dan kadar gaji. Akaun portal staf boleh dijana
 daripada rekod ini; kawalan role admin/HQ berada di tab <strong>Login &amp; Role</strong>.
 </p>

 <div className="flex flex-wrap items-center justify-between gap-2">
 {pickerVisible && (
 <BranchScopeSelect
 value={branchId}
 onChange={setBranchId}
 allowAll={areaManagerMode}
 allLabel="Semua cawangan kawasan saya"
 />)}
 {canManage && (
 <Button
 size="sm"
 className="ml-auto gap-1.5 bg-amber-500 hover:bg-amber-600"
 onClick={() => setAddOpen(true)}
 >
 <Plus className="h-4 w-4" />
 Tambah Staf
 </Button>)}
 </div>

 <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950">
 {areaManagerMode ? (
 <>
 AM hanya boleh tambah <strong>Staf Jualan / POS</strong> untuk cawangan dalam
 kawasan sendiri. Jawatan cawangan lain perlu diurus oleh HQ/Admin.
 </>) : (
 <>
 Staf cawangan boleh direkod sebagai staf jualan/POS, PIC cawangan, pembantu stok,
 runner operasi atau sokongan kebersihan. Sistem auto-cipta <strong>username (email)</strong>{' '}
 &amp; <strong>kata laluan</strong> - staf mesti tukar password pada log masuk pertama.
 Pengurus hanya boleh urus staf dalam skop cawangan masing-masing.
 </>)}
 </p>

 {hasCompanyView ? (
 <div className="space-y-4">
 <div className="grid gap-3 md:grid-cols-3">
 {companies.map((company) => (
 <div key={company.legal_entity_code} className="rounded-lg border bg-white px-3 py-2">
 <div className="flex items-start justify-between gap-2">
 <div>
 <p className="text-sm font-semibold">{company.legal_entity_name}</p>
 <p className="mt-0.5 text-xs text-muted-foreground">
 {company.legal_entity_scope ?? 'Syarikat dalam RKJ One'}
 </p>
 </div>
 <Badge variant="outline">{company.legal_entity_code}</Badge>
 </div>
 <div className="mt-3 flex flex-wrap gap-2 text-xs">
 <Badge variant="secondary" className="font-normal tabular-nums">
 {company.staff_count} staf
 </Badge>
 <Badge variant="outline" className="font-normal tabular-nums">
 {company.branch_staff_count} cawangan
 </Badge>
 <Badge variant="outline" className="font-normal tabular-nums">
 {company.hq_staff_count} syarikat/HQ
 </Badge>
 </div>
 </div>))}
 </div>

 {totalCompanyStaff === 0 ? (
 <p className="text-sm text-muted-foreground">Tiada staf dijumpai</p>) : (
 companies.map((company) => (
 <Card key={company.legal_entity_code}>
 <CardHeader className="pb-2">
 <CardTitle className="flex flex-wrap items-center gap-2 text-base">
 <Building2 className="h-4 w-4 text-primary" />
 {company.legal_entity_name}
 <Badge variant="outline">{company.legal_entity_code}</Badge>
 <Badge variant="secondary" className="font-normal tabular-nums">
 {company.staff_count} staf
 </Badge>
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 {company.hq_staff.length > 0 && (
 <div className="rounded-lg border bg-muted/20 p-3">
 <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
 <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
 Staf syarikat / HQ
 </p>
 <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
 {company.hq_staff.map((staff) => (
 <StaffMiniCard
 key={staff.id}
 staff={staff}
 canManage={canManage}
 onEdit={setEditStaffId}
 onDelete={(row) => void handleDelete(row.id, row.full_name)}
 />))}
 </div>
 </div>)}
 {company.regions.length > 0 && (
 <BranchStaffSections
 regions={company.regions}
 canManage={canManage}
 onEdit={setEditStaffId}
 onDelete={(row) => void handleDelete(row.id, row.full_name)}
 />)}
 {company.hq_staff.length === 0 && company.regions.length === 0 && (
 <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
 Tiada staf direkod bawah syarikat ini.
 </p>)}
 </CardContent>
 </Card>)))}
 </div>) : groups.length === 0 ? (
 <p className="text-sm text-muted-foreground">Tiada staf dijumpai</p>) : (
 groups.map((group) => (
 <Card key={group.region_id}>
 <CardHeader className="pb-2">
 <CardTitle className="flex flex-wrap items-center gap-2 text-base">
 <Users className="h-4 w-4 text-primary" />
 {group.region_name}
 {group.manager_name && (
 <Badge variant="secondary" className="font-normal">
 AM: {group.manager_name}
 </Badge>)}
 <Badge variant="outline" className="font-normal tabular-nums">
 {group.staff_count} staf
 </Badge>
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 {group.branches.map((branch) => (
 <div key={branch.branch_id} className="rounded-lg border bg-muted/20 p-3">
 <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
 <Store className="h-3.5 w-3.5 text-muted-foreground" />
 {branch.branch_code} - {branch.branch_name}
 </p>
 {branch.staff.length === 0 ? (
 <p className="text-xs text-muted-foreground">Tiada staf</p>) : (
 <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
 {branch.staff.map((staff) => (
 <StaffMiniCard
 key={staff.id}
 staff={staff}
 canManage={canManage}
 onEdit={setEditStaffId}
 onDelete={(row) => void handleDelete(row.id, row.full_name)}
 />))}
 </div>)}
 </div>))}
 </CardContent>
 </Card>)))}

 {canManage && (
 <>
 <AddStaffDialog
 open={addOpen}
 onOpenChange={setAddOpen}
 branches={allBranches}
 existingStaffCodes={existingStaffCodes}
 defaultBranchId={defaultBranchForAdd}
 isAreaManagerMode={areaManagerMode}
 onSuccess={handleAddSuccess}
 />
 <EditStaffDialog
 staffId={editStaffId}
 open={Boolean(editStaffId)}
 onOpenChange={(open) => !open && setEditStaffId(null)}
 branches={allBranches}
 onSuccess={handleAddSuccess}
 />
 </>)}
 </div>);
}
