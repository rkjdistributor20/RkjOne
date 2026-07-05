'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Building2, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, Users } from 'lucide-react';
import {
 applyDashboardAdviceAll,
 createUser,
 deleteUser,
 fetchDashboardAdvice,
 updateUser,
} from '@/lib/settings/api';
import type { SettingsBranchGroup, SettingsUser } from '@/lib/settings/types';
import type { DashboardProfileId } from '@/lib/settings/dashboard-advisor';
import { DASHBOARD_HOME } from '@/lib/settings/dashboard-advisor';
import { LEGAL_ENTITIES } from '@/lib/brand/legal-entities';
import { ROLE_LABELS, USER_ROLES, type UserRole } from '@/types/enums';
import { useAuthStore } from '@/stores/auth-store';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const NO_BRANCH = '__none__';

const DASHBOARD_OPTIONS: { id: DashboardProfileId; label: string }[] = [
 { id: 'OWNER_GROUP', label: 'Pemilik Kumpulan (3 Syarikat)' },
 { id: 'HQ_OPERATIONS', label: 'Operasi HQ' },
 { id: 'HR_COMPANY', label: 'HR Syarikat' },
 { id: 'FINANCE', label: 'Kewangan' },
 { id: 'AREA_MANAGER', label: 'Pengurus Kawasan' },
 { id: 'STAFF_KIOSK', label: 'Staf Kiosk Jualan' },
 { id: 'DIST_OPERATIONS', label: 'Operasi Pengedaran' },
 { id: 'FACTORY_STAFF', label: 'Kilang & Pengeluaran' },
 { id: 'LOGISTICS', label: 'Logistik & Pemandu' },
 { id: 'MAINTENANCE', label: 'Maintenance' },
];

function groupByCompany(users: SettingsUser[]) {
 const groups = new Map<string, SettingsUser[]>();
 for (const code of [...LEGAL_ENTITIES.map((e) => e.code), 'HQ']) {
 groups.set(code, []);
 }
 for (const u of users) {
 const key = u.legal_entity_code ?? 'HQ';
 if (!groups.has(key)) groups.set(key, []);
 groups.get(key)!.push(u);
 }
 return [...groups.entries()].filter(([, list]) => list.length > 0).map(([code, list]) => ({
 code,
 name:
 LEGAL_ENTITIES.find((e) => e.code === code)?.legalName ??
 (code === 'HQ' ? 'Pusat / HQ' : code),
 users: list.sort((a, b) => a.full_name.localeCompare(b.full_name)),
 }));
}

type Props = {
 users: SettingsUser[];
 staffTotal?: number;
 loginTotal?: number;
 loading?: boolean;
 loadError?: string | null;
 branchGroups: SettingsBranchGroup[];
 creatableRoles: UserRole[];
 onRefresh: () => Promise<void>;
};

function userRowKey(u: SettingsUser) {
 return `${u.staff_code ?? 'none'}-${u.legal_entity_code ?? 'HQ'}-${u.id}`;
}

export function UsersAdminPanel({
 users,
 staffTotal,
 loginTotal,
 loading,
 loadError,
 branchGroups,
 creatableRoles,
 onRefresh,
}: Props) {
 const currentProfile = useAuthStore((s) => s.profile);
 const [addOpen, setAddOpen] = useState(false);
 const [editUser, setEditUser] = useState<SettingsUser | null>(null);
 const [aiLoading, setAiLoading] = useState(false);
 const [bulkAiLoading, setBulkAiLoading] = useState(false);
 const [saving, setSaving] = useState(false);

 const [fullName, setFullName] = useState('');
 const [email, setEmail] = useState('');
 const [role, setRole] = useState<UserRole>(creatableRoles[0] ?? 'STAFF');
 const [branchId, setBranchId] = useState('');
 const [status, setStatus] = useState('ACTIVE');
 const [dashboardProfile, setDashboardProfile] = useState<DashboardProfileId>('STAFF_KIOSK');
 const [dashboardReason, setDashboardReason] = useState('');
 const [search, setSearch] = useState('');

 const allBranches = branchGroups.flatMap((g) =>
 g.branches.map((b) => ({...b, region_name: g.region_name })));

 const filteredUsers = useMemo(() => {
 const q = search.trim().toLowerCase();
 if (!q) return users;
 return users.filter((u) => {
 const hay = [
 u.full_name,
 u.email,
 u.staff_code,
 u.role,
 u.legal_entity_code,
 u.branch?.branch_code,
 u.branch?.branch_name,
 ].filter(Boolean).join(' ').toLowerCase();
 return hay.includes(q);
 });
 }, [users, search]);

 const companies = useMemo(() => groupByCompany(filteredUsers), [filteredUsers]);

 function openEdit(u: SettingsUser) {
 if (u.has_login === false || u.id.startsWith('staff:')) {
 toast.error('Staf ini belum ada akaun login - cipta dari tab Staf');
 return;
 }
 setEditUser(u);
 setFullName(u.full_name);
 setEmail(u.email);
 setRole(u.role as UserRole);
 setBranchId(u.branch_id ?? '');
 setStatus(u.status);
 setDashboardProfile((u.dashboard_profile as DashboardProfileId) ?? 'STAFF_KIOSK');
 setDashboardReason(u.dashboard_ai_reason ?? '');
 }

 async function handleAiSuggest(userId?: string) {
 setAiLoading(true);
 try {
 const res = await fetchDashboardAdvice(userId);
 const row = res.results[0];
 if (!row) {
 toast.error('Cadangan AI tidak dijumpai');
 return;
 }
 setDashboardProfile(row.advice.profile_id as DashboardProfileId);
 setDashboardReason(row.advice.reason);
 toast.success('Cadangan AI dimuatkan');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal jana cadangan');
 } finally {
 setAiLoading(false);
 }
 }

 async function handleBulkAi() {
 setBulkAiLoading(true);
 try {
 const res = await applyDashboardAdviceAll();
 toast.success(`Dashboard AI digunakan untuk ${res.count} pengguna`);
 await onRefresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal apply AI');
 } finally {
 setBulkAiLoading(false);
 }
 }

 async function handleAdd() {
 if (!fullName.trim() || !email.trim()) {
 toast.error('Nama dan e-mel diperlukan');
 return;
 }
 setSaving(true);
 try {
 const result = await createUser({
 full_name: fullName.trim(),
 email: email.trim(),
 role,
 branch_id: branchId || undefined,
 });
 toast.success(
 result.temporary_password
 ? `Pengguna ditambah. Password sementara: ${result.temporary_password}`
 : 'Pengguna ditambah');
 setAddOpen(false);
 await onRefresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal tambah');
 } finally {
 setSaving(false);
 }
 }

 async function handleSaveEdit() {
 if (!editUser) return;
 setSaving(true);
 try {
 const label = DASHBOARD_OPTIONS.find((d) => d.id === dashboardProfile)?.label;
 await updateUser(editUser.id, {
 full_name: fullName.trim(),
 role,
 status,
 branch_id: branchId || null,
 dashboard_profile: dashboardProfile,
 dashboard_label: label,
 dashboard_home: DASHBOARD_HOME[dashboardProfile],
 dashboard_ai_reason: dashboardReason || 'Diset oleh pentadbir',
 });
 toast.success('Pengguna dikemaskini');
 setEditUser(null);
 await onRefresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan');
 } finally {
 setSaving(false);
 }
 }

 async function handleDelete(id: string, name: string) {
 if (id === currentProfile?.id) {
 toast.error('Tidak boleh padam akaun sendiri');
 return;
 }
 if (!confirm(`Padam pengguna "${name}"?`)) return;
 try {
 await deleteUser(id);
 toast.success('Pengguna dipadam');
 await onRefresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal padam');
 }
 }

 return (
 <div className="space-y-4">
 <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 text-sm text-violet-950">
 <Bot className="mr-1.5 inline h-4 w-4" />
 AI menilai peranan & syarikat (RKJ / RKJ_DIST / RKJ_MFG) untuk tentukan dashboard sesuai.
 Edit manual sebelum simpan.
 </div>

 {loadError && (
 <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
 Gagal muat senarai: {loadError}. Klik Muat Semula.
 </div>)}

 <div className="flex flex-wrap items-center gap-2">
 <Badge variant="outline" className="gap-1 tabular-nums">
 <Users className="h-3.5 w-3.5" />
 {staffTotal ?? users.length} rekod staf
 {loginTotal != null && loginTotal !== (staffTotal ?? users.length)
 ? ` - ${loginTotal} akaun login`
 : ''}
 </Badge>
 <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
 <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
 <Input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Cari kod, nama, e-mel..."
 className="h-8 pl-8 text-sm"
 />
 </div>
 <Button
 size="sm"
 variant="outline"
 className="gap-1.5"
 disabled={loading}
 onClick={() => void onRefresh()}
 >
 <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
 Muat Semula
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="gap-1.5"
 disabled={bulkAiLoading}
 onClick={handleBulkAi}
 >
 <Sparkles className="h-3.5 w-3.5" />
 {bulkAiLoading ? 'Menjana...' : 'Cadangan AI Semua'}
 </Button>
 <Button
 size="sm"
 className="ml-auto gap-1.5 bg-amber-500 hover:bg-amber-600"
 onClick={() => {
 setFullName('');
 setEmail('');
 setRole(creatableRoles[0] ?? 'STAFF');
 setBranchId('');
 setAddOpen(true);
 }}
 >
 <Plus className="h-4 w-4" />
 Tambah Pengguna
 </Button>
 </div>

 {companies.length === 0 && !loading && (
 <p className="text-sm text-muted-foreground">
 {search ? 'Tiada padanan carian.' : loadError ? 'Senarai tidak dimuat.' : 'Tiada rekod staf.'}
 </p>)}

 {loading && users.length === 0 && (
 <p className="text-sm text-muted-foreground">Memuatkan senarai staf...</p>)}

 {companies.map((company) => (
 <Card key={company.code}>
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <LegalEntityLogo size={22} />
 {company.name}
 <Badge variant="outline">{company.code}</Badge>
 <Badge variant="secondary" className="font-normal">
 {company.users.length}
 </Badge>
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto rounded-lg border">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
 <th className="p-2">Kod</th>
 <th className="p-2">Nama</th>
 <th className="p-2">Peranan</th>
 <th className="p-2">Dashboard AI</th>
 <th className="w-24 p-2" />
 </tr>
 </thead>
 <tbody>
 {company.users.map((u) => (
 <tr key={userRowKey(u)} className="border-b last:border-0">
 <td className="p-2 font-mono text-xs text-muted-foreground">
 {u.staff_code ?? ' - '}
 </td>
 <td className="p-2">
 <p className="font-medium">{u.full_name}</p>
 <p className="text-xs text-muted-foreground">
 {u.email || (u.has_login === false ? 'Belum ada login' : ' - ')}
 </p>
 {u.branch?.branch_code && (
 <p className="text-[10px] text-muted-foreground">
 {u.branch.branch_code} - {u.branch.branch_name}
 </p>)}
 </td>
 <td className="p-2">
 <Badge variant="outline" className="font-normal">
 {ROLE_LABELS[u.role as UserRole] ?? u.role}
 </Badge>
 </td>
 <td className="p-2">
 <p className="text-xs font-medium">
 {u.dashboard_label ?? ' - belum ditetapkan - '}
 </p>
 {u.dashboard_ai_reason && (
 <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
 {u.dashboard_ai_reason}
 </p>)}
 </td>
 <td className="p-2">
 <div className="flex gap-1">
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7"
 disabled={u.has_login === false || u.id.startsWith('staff:')}
 onClick={() => openEdit(u)}
 >
 <Pencil className="h-3.5 w-3.5" />
 </Button>
 {u.id !== currentProfile?.id &&
 u.has_login !== false &&
 !u.id.startsWith('staff:') && (
 <Button
 size="icon"
 variant="ghost"
 className="h-7 w-7 text-destructive"
 onClick={() => handleDelete(u.id, u.full_name)}
 >
 <Trash2 className="h-3.5 w-3.5" />
 </Button>)}
 </div>
 </td>
 </tr>))}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>))}

 <Dialog open={addOpen} onOpenChange={setAddOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>Tambah Pengguna</DialogTitle>
 </DialogHeader>
 <div className="space-y-3">
 <div className="space-y-1">
 <Label>Nama</Label>
 <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
 </div>
 <div className="space-y-1">
 <Label>E-mel</Label>
 <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
 </div>
 <div className="space-y-1">
 <Label>Peranan</Label>
 <Select value={role} onValueChange={(v) => v && setRole(v as UserRole)}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {creatableRoles.map((r) => (
 <SelectItem key={r} value={r}>
 {ROLE_LABELS[r]}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label>Cawangan (pilihan)</Label>
 <Select
 value={branchId || NO_BRANCH}
 onValueChange={(v) => setBranchId(v === NO_BRANCH ? '' : (v ?? ''))}
 >
 <SelectTrigger>
 <SelectValue placeholder="Tiada" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value={NO_BRANCH}>Tiada / HQ</SelectItem>
 {allBranches.map((b) => (
 <SelectItem key={b.id} value={b.id}>
 {b.branch_code} - {b.branch_name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setAddOpen(false)}>
 Batal
 </Button>
 <Button disabled={saving} onClick={handleAdd}>
 {saving ? 'Menyimpan...' : 'Simpan'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>Edit Pengguna</DialogTitle>
 </DialogHeader>
 <div className="space-y-3">
 <div className="space-y-1">
 <Label>Nama</Label>
 <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
 </div>
 <div className="space-y-1">
 <Label>E-mel</Label>
 <Input value={email} disabled className="bg-muted" />
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1">
 <Label>Peranan</Label>
 <Select value={role} onValueChange={(v) => v && setRole(v as UserRole)}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {USER_ROLES.map((r) => (
 <SelectItem key={r} value={r}>
 {ROLE_LABELS[r]}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-1">
 <Label>Status</Label>
 <Select value={status} onValueChange={(v) => v && setStatus(v)}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ACTIVE">Aktif</SelectItem>
 <SelectItem value="INACTIVE">Tidak aktif</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="space-y-1">
 <Label>Cawangan</Label>
 <Select
 value={branchId || NO_BRANCH}
 onValueChange={(v) => setBranchId(v === NO_BRANCH ? '' : (v ?? ''))}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value={NO_BRANCH}>Tiada / HQ</SelectItem>
 {allBranches.map((b) => (
 <SelectItem key={b.id} value={b.id}>
 {b.branch_code} - {b.branch_name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>

 <div className="rounded-lg border border-dashed p-3">
 <div className="mb-2 flex items-center justify-between gap-2">
 <Label className="flex items-center gap-1.5">
 <Building2 className="h-3.5 w-3.5" />
 Dashboard (AI)
 </Label>
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="h-7 gap-1 text-xs"
 disabled={aiLoading}
 onClick={() => editUser && handleAiSuggest(editUser.id)}
 >
 <Sparkles className="h-3 w-3" />
 Cadangan AI
 </Button>
 </div>
 <Select
 value={dashboardProfile}
 onValueChange={(v) => v && setDashboardProfile(v as DashboardProfileId)}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {DASHBOARD_OPTIONS.map((d) => (
 <SelectItem key={d.id} value={d.id}>
 {d.label}
 </SelectItem>))}
 </SelectContent>
 </Select>
 {dashboardReason && (
 <p className="mt-2 text-xs text-muted-foreground">{dashboardReason}</p>)}
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setEditUser(null)}>
 Batal
 </Button>
 <Button disabled={saving} onClick={handleSaveEdit}>
 {saving ? 'Menyimpan...' : 'Simpan'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>);
}
