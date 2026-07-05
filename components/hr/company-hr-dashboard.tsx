'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
 ArrowRightLeft,
 Building2,
 CheckCircle2,
 FileText,
 Landmark,
 MoreHorizontal,
 Pencil,
 RefreshCw,
 ShieldCheck,
 Trash2,
 UserCheck,
 UserPlus,
 Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { HrAgentPerson, HrCompanyGroup, HrDashboardData, HrStaffPerson } from '@/lib/hr/company-hr';
import {
 deactivateHrProfile,
 deactivateStaffMember,
 deleteStaffMember,
 fetchHrDashboard,
 updateHrAgentAccess,
} from '@/lib/hr/api';
import { fetchSettingsBranchesGrouped } from '@/lib/settings/api';
import { getCompanyRoleLabel } from '@/lib/auth/role-labels';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { AddStaffDialog } from '@/components/settings/add-staff-dialog';
import { EditStaffDialog } from '@/components/settings/edit-staff-dialog';
import type { AddStaffBranchOption } from '@/components/settings/add-staff-dialog';
import { HrGroupOwnerSection } from '@/components/hr/hr-group-owner-section';
import { HrProfileEditDialog } from '@/components/hr/hr-profile-edit-dialog';
import { HrTransferDialog } from '@/components/hr/hr-transfer-dialog';
import { PayrollOperationsPanel } from '@/components/payroll/payroll-dashboard';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { WorkflowSopPanel } from '@/components/dashboard/workflow-sop-panel';
import { getRoleWorkflow } from '@/lib/dashboard/role-workflows';
import type { LegalEntityCode } from '@/lib/brand/legal-entities';
import {
 KpiCard,
 KpiGrid,
 ModuleHeader,
 ModuleLayout,
 SectionCard,
 formatRM,
 moduleTabsListClass,
 moduleTabsTriggerClass,
} from '@/components/shared/module-ui';
import { useLanguage } from '@/components/i18n/language-provider';

function roleLabel(person: HrStaffPerson) {
 if (person.role === 'STAFF_RECORD') return 'Rekod Staf';
 return getCompanyRoleLabel(person.role, person.legal_entity_code);
}

function payLabel(person: HrStaffPerson) {
 if (person.is_group_owner && person.total_monthly_amount != null) {
 return `${formatRM(Number(person.total_monthly_amount))}/bulan (3 syarikat)`;
 }
 if (person.monthly_amount != null) return `${formatRM(Number(person.monthly_amount))}/bulan`;
 if (person.weekly_amount != null) return `${formatRM(Number(person.weekly_amount))}/minggu`;
 return 'Gaji ikut struktur role';
}

function profileStatus(person: HrStaffPerson) {
 if (!person.profile_id) return { label: 'Tiada portal', tone: 'secondary' as const };
 if (!person.profile_completed_at) return { label: 'Profil belum lengkap', tone: 'outline' as const };
 return { label: 'Profil HR lengkap', tone: 'default' as const };
}

function PersonRow({
 person,
 onTransfer,
 onEdit,
 onDelete,
}: {
 person: HrStaffPerson;
 onTransfer: (person: HrStaffPerson) => void;
 onEdit: (person: HrStaffPerson) => void;
 onDelete: (person: HrStaffPerson) => void;
}) {
 const status = profileStatus(person);
 const isProtected = person.role === 'SUPER_ADMIN' || person.is_group_owner;

 return (
 <div className="grid gap-3 rounded-lg border bg-background px-3 py-3 text-sm md:grid-cols-[minmax(180px,1.35fr)_minmax(150px,1fr)_minmax(130px,0.8fr)_minmax(150px,0.8fr)_auto] md:items-center">
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <p className="font-semibold leading-tight text-foreground">{person.full_name}</p>
 {person.status !== 'ACTIVE' && <Badge variant="secondary">{person.status}</Badge>}
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 {person.staff_code} - {roleLabel(person)}
 </p>
 </div>
 <div className="text-xs text-muted-foreground">
 <p className="font-medium text-foreground">{person.branch_name ?? 'HQ / Syarikat'}</p>
 <p>{person.branch_code ?? person.region_name ?? 'Pentadbiran'}</p>
 </div>
 <div className="flex flex-wrap gap-1.5">
 {person.worker_type && (
 <Badge variant="outline">{person.worker_type === 'LOCAL' ? 'Tempatan' : 'Pekerja asing'}</Badge>)}
 <Badge variant={status.tone}>{status.label}</Badge>
 {person.must_change_password && <Badge variant="secondary">Perlu tukar password</Badge>}
 </div>
 <div className="text-xs text-muted-foreground md:text-right">
 <p className="font-medium text-foreground">{payLabel(person)}</p>
 <p>{person.email ?? 'Email portal belum ada'}</p>
 </div>
 <div className="flex justify-end">
 <DropdownMenu>
 <DropdownMenuTrigger
 className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-8 w-8 shrink-0')}
 >
 <MoreHorizontal className="h-4 w-4" />
 <span className="sr-only">Tindakan HR</span>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end">
 <DropdownMenuItem onClick={() => onTransfer(person)}>
 <ArrowRightLeft className="mr-2 h-4 w-4" />
 Pindah syarikat
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => onEdit(person)}>
 <Pencil className="mr-2 h-4 w-4" />
 Edit
 </DropdownMenuItem>
 {!isProtected && (
 <>
 <DropdownMenuSeparator />
 <DropdownMenuItem
 className="text-destructive focus:text-destructive"
 onClick={() => onDelete(person)}
 >
 <Trash2 className="mr-2 h-4 w-4" />
 {person.source === 'staff' ? 'Padam / nonaktifkan' : 'Nonaktifkan'}
 </DropdownMenuItem>
 </>)}
 {person.is_group_owner && (
 <DropdownMenuItem disabled className="text-xs text-muted-foreground">
 Profil gabungan 3 syarikat - lihat seksyen Pemilik Kumpulan
 </DropdownMenuItem>)}
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </div>);
}

function RoleAuditRow({
 person,
 company,
 onTransfer,
 onEdit,
}: {
 person: HrStaffPerson;
 company: HrCompanyGroup | null;
 onTransfer: (person: HrStaffPerson) => void;
 onEdit: (person: HrStaffPerson) => void;
}) {
 return (
 <div className="grid gap-3 border-b px-3 py-3 text-sm last:border-b-0 lg:grid-cols-[1.25fr_1fr_0.9fr_1fr_0.8fr_auto] lg:items-center">
 <div className="min-w-0">
 <p className="font-semibold text-foreground">{person.full_name}</p>
 <p className="text-xs text-muted-foreground">{person.staff_code}</p>
 </div>
 <div className="min-w-0">
 <p className="truncate text-xs font-medium text-foreground">
 {company?.legal_name ?? 'Belum ditetapkan'}
 </p>
 <p className="text-xs text-muted-foreground">{company?.code ?? '-'}</p>
 </div>
 <div>
 <Badge variant={person.source === 'profile' ? 'default' : 'outline'}>
 {roleLabel(person)}
 </Badge>
 {person.worker_type && (
 <p className="mt-1 text-xs text-muted-foreground">
 {person.worker_type === 'LOCAL' ? 'Tempatan' : 'Pekerja asing'}
 </p>)}
 </div>
 <div className="text-xs text-muted-foreground">
 <p className="font-medium text-foreground">{person.branch_name ?? 'HQ / Syarikat'}</p>
 <p>{person.branch_code ?? person.region_name ?? 'Pentadbiran'}</p>
 </div>
 <div className="flex flex-wrap gap-1.5">
 <Badge variant={person.status === 'ACTIVE' ? 'outline' : 'secondary'}>{person.status}</Badge>
 {person.profile_id ? (
 <Badge variant="secondary">Portal</Badge>) : (
 <Badge variant="outline">Rekod sahaja</Badge>)}
 </div>
 <div className="flex justify-end gap-2">
 <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onTransfer(person)}>
 <ArrowRightLeft className="h-3.5 w-3.5" />
 Syarikat
 </Button>
 <Button size="sm" className="gap-1.5" onClick={() => onEdit(person)}>
 <Pencil className="h-3.5 w-3.5" />
 Edit
 </Button>
 </div>
 </div>);
}

function RoleAuditPanel({
 data,
 selectedCompanyKey,
 onSelectCompany,
 onTransfer,
 onEdit,
 onAgentAccessChange,
 savingAgentId,
}: {
 data: HrDashboardData;
 selectedCompanyKey: string;
 onSelectCompany: (key: string) => void;
 onTransfer: (person: HrStaffPerson) => void;
 onEdit: (person: HrStaffPerson) => void;
 onAgentAccessChange: (agent: HrAgentPerson, priceGroupId: string | null) => void;
 savingAgentId: string | null;
}) {
 const selectedCompany =
 selectedCompanyKey === 'unassigned'
 ? null
 : data.companies.find((company) => company.id === selectedCompanyKey) ?? data.companies[0] ?? null;
 const rows =
 selectedCompanyKey === 'unassigned'
 ? data.unassigned.map((person) => ({ company: null, person }))
 : (selectedCompany?.people ?? []).map((person) => ({ company: selectedCompany, person }));
 const agentRows = selectedCompany?.code === 'RKJ_DIST' ? selectedCompany.agents : [];

 return (
 <SectionCard
 title="Senarai Peranan Staf Mengikut Syarikat"
 description="Pilih syarikat dahulu. Untuk RKJ Distributor, staf syarikat dan ejen diasingkan supaya tahap akses tidak bercampur."
 action={
 <div className="flex flex-wrap gap-2">
 <Badge variant="outline">{rows.length} staf / pengguna</Badge>
 {agentRows.length > 0 && <Badge variant="secondary">{agentRows.length} ejen</Badge>}
 </div>
 }
 >
 <CompanyPicker
 data={data}
 selectedCompanyKey={selectedCompanyKey}
 onSelectCompany={onSelectCompany}
 />
 <div className="mb-4 rounded-xl border bg-muted/20 p-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <p className="text-sm font-semibold text-foreground">
 {selectedCompany?.code === 'RKJ_DIST' ? 'Staf Syarikat RKJ Distributor' : 'Staf Syarikat'}
 </p>
 <p className="text-xs text-muted-foreground">
 Rekod ini ialah pekerja dalaman syarikat, bukan ejen jualan.
 </p>
 </div>
 <Badge variant="outline">{rows.length} staf</Badge>
 </div>
 </div>
 <div className="overflow-hidden rounded-xl border bg-background">
 <div className="hidden border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid lg:grid-cols-[1.25fr_1fr_0.9fr_1fr_0.8fr_auto]">
 <span>Nama</span>
 <span>Syarikat</span>
 <span>Role / Jawatan</span>
 <span>Lokasi</span>
 <span>Status</span>
 <span className="text-right">Tindakan</span>
 </div>
 {rows.length === 0 ? (
 <p className="px-4 py-10 text-center text-sm text-muted-foreground">
 Tiada staf atau pengguna dalam pilihan ini.
 </p>) : (
 rows.map(({ company, person }) => (
 <RoleAuditRow
 key={`${company?.id ?? 'unassigned'}-${person.source}-${person.id}`}
 company={company}
 person={person}
 onTransfer={onTransfer}
 onEdit={onEdit}
 />)))}
 </div>
 {selectedCompany?.code === 'RKJ_DIST' && (
 <AgentAccessSection
 company={selectedCompany}
 agents={agentRows}
 onAgentAccessChange={onAgentAccessChange}
 savingAgentId={savingAgentId}
 />)}
 </SectionCard>);
}

function AgentAccessSection({
 company,
 agents,
 onAgentAccessChange,
 savingAgentId,
}: {
 company: HrCompanyGroup;
 agents: HrAgentPerson[];
 onAgentAccessChange: (agent: HrAgentPerson, priceGroupId: string | null) => void;
 savingAgentId: string | null;
}) {
 return (
 <div className="mt-5 space-y-3">
 <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <p className="text-sm font-semibold text-amber-950">Ejen / Agent Access RKJ Distributor</p>
 <p className="text-xs text-amber-900/80">
 Ejen diasingkan daripada staf syarikat. Tukar jenis ejen untuk kawal access portal, harga, POS dan status tanpa bayaran.
 </p>
 </div>
 <Badge variant="secondary">{agents.length} ejen aktif</Badge>
 </div>
 </div>
 <div className="overflow-hidden rounded-xl border bg-background">
 <div className="hidden border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid lg:grid-cols-[1.25fr_1fr_1fr_0.8fr_auto]">
 <span>Ejen</span>
 <span>PIC / Contact</span>
 <span>Jenis Ejen / Access</span>
 <span>Status</span>
 <span className="text-right">Tindakan</span>
 </div>
 {agents.length === 0 ? (
 <p className="px-4 py-10 text-center text-sm text-muted-foreground">
 Tiada ejen aktif bawah RKJ Distributor.
 </p>) : (
 agents.map((agent) => (
 <div
 key={agent.id}
 className="grid gap-3 border-b px-3 py-3 text-sm last:border-b-0 lg:grid-cols-[1.25fr_1fr_1fr_0.8fr_auto] lg:items-center"
 >
 <div className="min-w-0">
 <p className="font-semibold text-foreground">{agent.company_name}</p>
 <p className="text-xs text-muted-foreground">{agent.registration_no ?? 'No. SSM / rujukan belum diisi'}</p>
 </div>
 <div className="min-w-0 text-xs text-muted-foreground">
 <p className="truncate font-medium text-foreground">{agent.contact_person ?? 'PIC belum diisi'}</p>
 <p className="truncate">{agent.contact_email ?? agent.contact_phone ?? 'Contact belum diisi'}</p>
 </div>
 <div className="space-y-2">
 <select
 className="h-9 w-full rounded-md border bg-background px-2 text-sm"
 value={agent.assigned_price_group_id ?? 'DEFAULT'}
 disabled={savingAgentId === agent.id}
 onChange={(event) =>
 onAgentAccessChange(agent, event.target.value === 'DEFAULT' ? null : event.target.value)
 }
 >
 <option value="DEFAULT">Ejen Biasa - Default sistem</option>
 {company.agent_price_groups.map((group) => (
 <option key={group.id} value={group.id}>
 {group.payment_exempt ? 'Ejen Khas Syarikat - ' : 'Ejen Biasa - '}
 {group.name}
 </option>))}
 </select>
 <Badge variant={agent.payment_exempt ? 'default' : 'outline'}>
 {agent.agent_type_label}
 </Badge>
 </div>
 <div className="flex flex-wrap gap-1.5">
 <Badge variant={agent.status === 'ACTIVE' ? 'outline' : 'secondary'}>{agent.status}</Badge>
 {agent.payment_exempt ? <Badge variant="secondary">Tanpa bayaran</Badge> : <Badge variant="outline">Ikut rate</Badge>}
 </div>
 <div className="flex justify-end">
 <Link href="/sales-agent" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
 Urus Ejen
 </Link>
 </div>
 </div>)))}
 </div>
 </div>);
}

function CompanyPicker({
 data,
 selectedCompanyKey,
 onSelectCompany,
}: {
 data: HrDashboardData;
 selectedCompanyKey: string;
 onSelectCompany: (key: string) => void;
}) {
 return (
 <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
 {data.companies.map((company) => {
 const selected = selectedCompanyKey === company.id;
 return (
 <button
 key={company.id}
 type="button"
 onClick={() => onSelectCompany(company.id)}
 className={cn(
 'rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm',
 selected ? 'border-primary bg-primary/10 shadow-sm' : 'bg-background')}
 >
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold text-foreground">{company.legal_name}</p>
 <p className="text-xs text-muted-foreground">{company.code}</p>
 </div>
 <Badge variant={selected ? 'default' : 'outline'}>{company.summary.total}</Badge>
 </div>
 <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{company.scope ?? company.name}</p>
 {company.code === 'RKJ_DIST' && (
 <p className="mt-2 text-xs font-medium text-amber-700">
 {company.summary.total} staf syarikat - {company.agents.length} ejen
 </p>)}
 </button>);
 })}
 {data.unassigned.length > 0 && (
 <button
 type="button"
 onClick={() => onSelectCompany('unassigned')}
 className={cn(
 'rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-sm',
 selectedCompanyKey === 'unassigned' ? 'border-amber-500 bg-amber-50 shadow-sm' : 'bg-background')}
 >
 <div className="flex items-start justify-between gap-2">
 <div>
 <p className="text-sm font-semibold text-foreground">Belum Tetap</p>
 <p className="text-xs text-muted-foreground">Perlu semak syarikat</p>
 </div>
 <Badge variant="secondary">{data.unassigned.length}</Badge>
 </div>
 </button>)}
 </div>);
}

function ComplianceStrip({ company }: { company: HrCompanyGroup }) {
 const checks = [
 { label: 'Entiti legal aktif', ok: company.status === 'ACTIVE' },
 { label: 'Staf dikelaskan', ok: company.summary.total > 0 },
 {
 label: 'Portal staf tersedia',
 ok: company.summary.portal_ready === company.summary.total && company.summary.total > 0,
 },
 {
 label: 'Profil HR lengkap',
 ok: company.summary.profile_complete === company.summary.total && company.summary.total > 0,
 },
 ];

 return (
 <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
 {checks.map((check) => (
 <div
 key={check.label}
 className={cn(
 'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium',
 check.ok
 ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
 : 'border-amber-200 bg-amber-50 text-amber-950')}
 >
 <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
 {check.label}
 </div>))}
 </div>);
}

function CompanyHrCard({
 company,
 onTransfer,
 onEdit,
 onDelete,
}: {
 company: HrCompanyGroup;
 onTransfer: (person: HrStaffPerson) => void;
 onEdit: (person: HrStaffPerson) => void;
 onDelete: (person: HrStaffPerson) => void;
}) {
 return (
 <SectionCard
 title={
 <span className="flex items-center gap-2">
 <LegalEntityLogo size={24} />
 {company.legal_name}
 </span>
 }
 description={company.scope ?? company.name}
 action={<Badge variant="outline">{company.code}</Badge>}
 >
 <div className="space-y-4">
 <KpiGrid cols={5}>
 <KpiCard title="Jumlah HR" value={company.summary.total} icon={Users} />
 <KpiCard title="Aktif" value={company.summary.active} icon={UserCheck} variant="success" />
 <KpiCard title="Staf Operasi" value={company.summary.branch_staff} icon={Building2} />
 <KpiCard title="Pengurusan" value={company.summary.management} icon={ShieldCheck} />
 <KpiCard title="Profil Lengkap" value={`${company.summary.profile_complete}/${company.summary.total}`} icon={FileText} />
 </KpiGrid>

 <ComplianceStrip company={company} />

 <div className="grid gap-2">
 {company.people.length === 0 ? (
 <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
 Tiada staf atau pengguna didaftarkan bawah syarikat ini.
 </p>) : (
 company.people.map((person) => (
 <PersonRow
 key={`${person.source}-${person.id}`}
 person={person}
 onTransfer={onTransfer}
 onEdit={onEdit}
 onDelete={onDelete}
 />)))}
 </div>
 </div>
 </SectionCard>);
}

export function CompanyHrDashboard({ data: initialData }: { data: HrDashboardData }) {
 const { t } = useLanguage();
 const [data, setData] = useState(initialData);
 const workflow = getRoleWorkflow({ role: 'HR' });
 const [refreshing, setRefreshing] = useState(false);
 const [branches, setBranches] = useState<AddStaffBranchOption[]>([]);
 const [addStaffOpen, setAddStaffOpen] = useState(false);
 const [selectedCompanyKey, setSelectedCompanyKey] = useState(
 initialData.companies[0]?.id ?? (initialData.unassigned.length > 0 ? 'unassigned' : ''));

 const [transferPerson, setTransferPerson] = useState<HrStaffPerson | null>(null);
 const [editStaffId, setEditStaffId] = useState<string | null>(null);
 const [editProfilePerson, setEditProfilePerson] = useState<HrStaffPerson | null>(null);
 const [savingAgentId, setSavingAgentId] = useState<string | null>(null);

 const refresh = useCallback(async () => {
 setRefreshing(true);
 try {
 const next = await fetchHrDashboard();
 setData(next);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal muat semula data HR');
 } finally {
 setRefreshing(false);
 }
 }, []);

 useEffect(() => {
 fetchSettingsBranchesGrouped().then(({ groups }) => {
 setBranches(
 groups.flatMap((g) =>
 g.branches.map((b) => ({
 id: b.id,
 branch_code: b.branch_code,
 branch_name: b.branch_name,
 region_name: g.region_name,
 }))));
 }).catch(() => setBranches([]));
 }, []);

 const branchOptions = useMemo(() => branches, [branches]);
 const existingStaffCodes = useMemo(() => {
 const codes = new Set<string>();
 for (const company of data.companies) {
 for (const person of company.people) {
 if (person.staff_code) codes.add(person.staff_code);
 }
 }
 for (const person of data.unassigned) {
 if (person.staff_code) codes.add(person.staff_code);
 }
 for (const owner of data.group_owners) {
 if (owner.staff_code) codes.add(owner.staff_code);
 for (const employment of owner.employments ?? []) {
 if (employment.staff_code) codes.add(employment.staff_code);
 }
 }
 return [...codes];
 }, [data]);
 const selectedCompany =
 selectedCompanyKey === 'unassigned'
 ? null
 : data.companies.find((company) => company.id === selectedCompanyKey) ?? data.companies[0] ?? null;

 useEffect(() => {
 const valid =
 data.companies.some((company) => company.id === selectedCompanyKey) ||
 (selectedCompanyKey === 'unassigned' && data.unassigned.length > 0);
 if (!valid) {
 setSelectedCompanyKey(data.companies[0]?.id ?? (data.unassigned.length > 0 ? 'unassigned' : ''));
 }
 }, [data, selectedCompanyKey]);

 function handleEdit(person: HrStaffPerson) {
 if (person.profile_id) {
 setEditProfilePerson(person);
 return;
 }
 if (person.source === 'staff' && person.staff_id) {
 setEditStaffId(person.staff_id);
 return;
 }
 }

 async function handleDelete(person: HrStaffPerson) {
 const actionLabel =
 person.source === 'staff'
 ? `Padam atau nonaktifkan staf "${person.full_name}"?`
 : `Nonaktifkan pengguna "${person.full_name}"?`;

 if (!confirm(`${actionLabel}\n\nJika staf ada rekod syif, sistem akan cuba nonaktifkan.`)) {
 return;
 }

 try {
 if (person.source === 'staff' && person.staff_id) {
 try {
 await deleteStaffMember(person.staff_id);
 toast.success('Staf dipadam');
 } catch (err) {
 const message = err instanceof Error ? err.message : '';
 if (message.includes('rekod syif')) {
 await deactivateStaffMember(person.staff_id);
 toast.success('Staf dinonaktifkan (ada rekod syif)');
 } else {
 throw err;
 }
 }
 } else if (person.profile_id) {
 await deactivateHrProfile(person.profile_id);
 toast.success('Pengguna dinonaktifkan');
 }
 await refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memproses permintaan');
 }
 }

 async function handleAgentAccessChange(agent: HrAgentPerson, priceGroupId: string | null) {
 setSavingAgentId(agent.id);
 try {
 await updateHrAgentAccess(agent.id, priceGroupId);
 toast.success('Jenis ejen dan tahap access dikemaskini');
 await refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemaskini access ejen');
 } finally {
 setSavingAgentId(null);
 }
 }

 async function handleAddStaffSuccess() {
 await refresh();
 }

 return (
 <ModuleLayout>
 <ModuleHeader
 title={t('module.hr.title')}
 description={t('module.hr.description')}
 icon={Users}
 actions={
 <div className="flex flex-wrap gap-2">
 <Button
 size="sm"
 className="gap-1.5 bg-amber-500 hover:bg-amber-600"
 onClick={() => setAddStaffOpen(true)}
 >
 <UserPlus className="h-4 w-4" />
 {t('module.hr.addStaff')}
 </Button>
 <Button size="sm" variant="outline" className="gap-1.5" onClick={refresh} disabled={refreshing}>
 <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
 {t('common.refresh')}
 </Button>
 </div>
 }
 badges={
 <>
 <Badge variant="secondary">{data.summary.total_companies} syarikat legal</Badge>
 <Badge variant="outline">{data.summary.total_people} rekod HR</Badge>
 </>
 }
 />

 <WorkflowSopPanel workflow={workflow} />

 <KpiGrid cols={5}>
 <KpiCard title={t('module.hr.company')} value={data.summary.total_companies} icon={Building2} />
 <KpiCard title={t('module.hr.totalHr')} value={data.summary.total_people} icon={Users} />
 <KpiCard title={t('module.hr.operationsStaff')} value={data.summary.branch_staff} icon={UserCheck} />
 <KpiCard title={t('module.hr.management')} value={data.summary.management_people} icon={ShieldCheck} />
 <KpiCard title={t('module.hr.profileComplete')} value={data.summary.profile_complete} icon={FileText} />
 </KpiGrid>

 <Tabs defaultValue="roles" className="space-y-4">
 <TabsList className={moduleTabsListClass}>
 <TabsTrigger value="roles" className={moduleTabsTriggerClass}>
 <ShieldCheck className="h-4 w-4" /> {t('module.hr.rolesByCompany')}
 </TabsTrigger>
 <TabsTrigger value="hr" className={moduleTabsTriggerClass}>
 <Users className="h-4 w-4" /> {t('module.hr.companyHr')}
 </TabsTrigger>
 <TabsTrigger value="payroll" className={moduleTabsTriggerClass}>
 <Landmark className="h-4 w-4" /> {t('module.hr.payroll')}
 </TabsTrigger>
 </TabsList>

 <TabsContent value="roles" className="space-y-5">
 <RoleAuditPanel
 data={data}
 selectedCompanyKey={selectedCompanyKey}
 onSelectCompany={setSelectedCompanyKey}
 onTransfer={setTransferPerson}
 onEdit={handleEdit}
 onAgentAccessChange={handleAgentAccessChange}
 savingAgentId={savingAgentId}
 />
 </TabsContent>

 <TabsContent value="hr" className="space-y-5">
 <SectionCard
 title={t('module.hr.addStaff')}
 description={t('module.hr.addStaffDesc')}
 action={
 <Button
 size="sm"
 className="gap-1.5 bg-amber-500 hover:bg-amber-600"
 onClick={() => setAddStaffOpen(true)}
 >
 <UserPlus className="h-4 w-4" />
 {t('module.hr.addStaff')}
 </Button>
 }
 >
 <div className="grid gap-3 md:grid-cols-3">
 <div className="rounded-lg border bg-muted/20 p-3 text-sm">
 <p className="font-semibold">1. Pilih Cawangan</p>
 <p className="mt-1 text-xs text-muted-foreground">Staf boleh diletakkan bawah cawangan kiosk atau lokasi yang dibenarkan.</p>
 </div>
 <div className="rounded-lg border bg-muted/20 p-3 text-sm">
 <p className="font-semibold">2. Pilih Syarikat Majikan</p>
 <p className="mt-1 text-xs text-muted-foreground">Roti Kaya Junus, RKJ Distributor atau RKJ Manufacturing.</p>
 </div>
 <div className="rounded-lg border bg-muted/20 p-3 text-sm">
 <p className="font-semibold">3. Auto Login & Gaji</p>
 <p className="mt-1 text-xs text-muted-foreground">Kod staf, gaji asas dan kredensial portal dijana terus.</p>
 </div>
 </div>
 </SectionCard>

 <SectionCard
 title={t('module.hr.hrActions')}
 description={t('module.hr.hrActionsDesc')}
 >
 <div className="grid gap-3 md:grid-cols-3">
 <div className="rounded-lg border bg-muted/20 p-3 text-sm">
 <p className="font-semibold">Pindah Syarikat</p>
 <p className="mt-1 text-xs text-muted-foreground">Tukar majikan legal staf atau pengguna pengurusan.</p>
 </div>
 <div className="rounded-lg border bg-muted/20 p-3 text-sm">
 <p className="font-semibold">Edit Rekod</p>
 <p className="mt-1 text-xs text-muted-foreground">Kemaskini profil staf operasi atau pengguna HQ/pengurusan.</p>
 </div>
 <div className="rounded-lg border bg-muted/20 p-3 text-sm">
 <p className="font-semibold">Padam / Nonaktif</p>
 <p className="mt-1 text-xs text-muted-foreground">Padam staf tanpa syif; rekod dengan syif akan dinonaktifkan.</p>
 </div>
 </div>
 </SectionCard>

 <HrGroupOwnerSection owners={data.group_owners} />

 <SectionCard
 title={t('module.hr.chooseCompany')}
 description={t('module.hr.chooseCompanyDesc')}
 >
 <CompanyPicker
 data={data}
 selectedCompanyKey={selectedCompanyKey}
 onSelectCompany={setSelectedCompanyKey}
 />
 </SectionCard>

 <div className="space-y-5">
 {selectedCompany ? (
 <CompanyHrCard
 key={selectedCompany.id}
 company={selectedCompany}
 onTransfer={setTransferPerson}
 onEdit={handleEdit}
 onDelete={handleDelete}
 />) : data.unassigned.length > 0 ? (
 <SectionCard
 title={t('module.hr.unassignedRecords')}
 description={t('module.hr.unassignedRecordsDesc')}
 action={<Badge variant="secondary">{data.unassigned.length} rekod</Badge>}
 >
 <div className="grid gap-2">
 {data.unassigned.map((person) => (
 <PersonRow
 key={`${person.source}-${person.id}`}
 person={person}
 onTransfer={setTransferPerson}
 onEdit={handleEdit}
 onDelete={handleDelete}
 />))}
 </div>
 </SectionCard>) : null}
 </div>

 </TabsContent>

 <TabsContent value="payroll" className="space-y-4">
 <SectionCard
 title={t('module.hr.payroll')}
 description="Jana gaji, semak peraturan, komisyen, staf tempatan/asing dan pecahan gaji mengikut syarikat."
 >
 <PayrollOperationsPanel />
 </SectionCard>
 </TabsContent>
 </Tabs>

 <HrTransferDialog
 person={transferPerson}
 open={transferPerson != null}
 onOpenChange={(open) => {
 if (!open) setTransferPerson(null);
 }}
 onSuccess={refresh}
 />

 <AddStaffDialog
 open={addStaffOpen}
 onOpenChange={setAddStaffOpen}
 branches={branchOptions}
 existingStaffCodes={existingStaffCodes}
 defaultLegalEntityCode={selectedCompany?.code as LegalEntityCode | undefined}
 onSuccess={handleAddStaffSuccess}
 />

 <EditStaffDialog
 staffId={editStaffId}
 open={editStaffId != null}
 onOpenChange={(open) => {
 if (!open) setEditStaffId(null);
 }}
 branches={branchOptions}
 onSuccess={refresh}
 />

 <HrProfileEditDialog
 person={editProfilePerson}
 open={editProfilePerson != null}
 onOpenChange={(open) => {
 if (!open) setEditProfilePerson(null);
 }}
 onSuccess={refresh}
 />
 </ModuleLayout>);
}


