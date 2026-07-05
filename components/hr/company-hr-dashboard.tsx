'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
 AlertTriangle,
 ArrowRightLeft,
 Building2,
 CalendarDays,
 CheckCircle2,
 ClipboardCheck,
 FileText,
 Gauge,
 Inbox,
 Landmark,
 MoreHorizontal,
 Pencil,
 RefreshCw,
 Search,
 ShieldCheck,
 Sparkles,
 Trash2,
 UserCheck,
 UserCog,
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
 updateHrLeaveBalance,
 updateHrServiceRequestStatus,
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
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { formatLeaveType, HR_LEAVE_TYPES } from '@/lib/hr/leave-balances';
import type { HrLeaveType, HrServiceRequestStatus } from '@/types/database';
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

type ServiceRequestRow = HrDashboardData['service_requests'][number];
type LeaveBalanceEditorState = {
 person: HrStaffPerson;
 leaveType: HrLeaveType;
 leaveYear: string;
 entitlementDays: string;
 carriedForwardDays: string;
 usedDays: string;
 pendingDays: string;
 adjustmentDays: string;
 notes: string;
};

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

function leaveBalanceFor(person: HrStaffPerson, leaveType: HrLeaveType, year = new Date().getFullYear()) {
 return (
 person.leave_balances?.find((balance) => balance.leave_year === year && balance.leave_type === leaveType) ??
 person.leave_balances?.find((balance) => balance.leave_type === leaveType) ??
 null
 );
}

function annualLeaveLabel(person: HrStaffPerson) {
 if (person.worker_type !== 'LOCAL') return 'Cuti tidak terpakai';
 const annual = leaveBalanceFor(person, 'ANNUAL');
 if (!annual) return 'Baki cuti belum ditetap';
 return `Cuti tahunan: ${Number(annual.remaining).toFixed(1)} hari`;
}

function leaveNumber(value: unknown, fallback = 0) {
 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : fallback;
}

function leaveInput(value: unknown) {
 return String(leaveNumber(value).toFixed(1)).replace(/\.0$/, '');
}

function parseLeaveInput(label: string, value: string, allowNegative = false) {
 const parsed = Number(value);
 if (!Number.isFinite(parsed)) throw new Error(`${label} mesti nombor yang sah.`);
 if (!allowNegative && parsed < 0) throw new Error(`${label} tidak boleh negatif.`);
 return Math.round(parsed * 100) / 100;
}

function leaveEditorRemaining(editor: LeaveBalanceEditorState | null) {
 if (!editor) return 0;
 return (
 leaveNumber(editor.entitlementDays) +
 leaveNumber(editor.carriedForwardDays) +
 leaveNumber(editor.adjustmentDays) -
 leaveNumber(editor.usedDays) -
 leaveNumber(editor.pendingDays)
 );
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
 <p className={cn('mt-1', person.worker_type === 'LOCAL' ? 'text-emerald-700' : 'text-muted-foreground')}>
 {annualLeaveLabel(person)}
 </p>
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
 onTransfer,
 onEdit,
 onAgentAccessChange,
 savingAgentId,
}: {
 data: HrDashboardData;
 selectedCompanyKey: string;
 onTransfer: (person: HrStaffPerson) => void;
 onEdit: (person: HrStaffPerson) => void;
 onAgentAccessChange: (agent: HrAgentPerson, priceGroupId: string | null) => void;
 savingAgentId: string | null;
}) {
 const [search, setSearch] = useState('');
 const selectedCompany =
 selectedCompanyKey === 'unassigned'
 ? null
 : data.companies.find((company) => company.id === selectedCompanyKey) ?? data.companies[0] ?? null;
 const rows =
 selectedCompanyKey === 'unassigned'
 ? data.unassigned.map((person) => ({ company: null, person }))
 : (selectedCompany?.people ?? []).map((person) => ({ company: selectedCompany, person }));
 const agentRows = selectedCompany?.code === 'RKJ_DIST' ? selectedCompany.agents : [];
 const query = search.trim().toLowerCase();
 const filteredRows = query
 ? rows.filter(({ company, person }) =>
 [
 person.full_name,
 person.staff_code,
 person.email,
 roleLabel(person),
 company?.code,
 person.branch_code,
 person.branch_name,
 person.region_name,
 person.worker_type,
 person.status,
 ]
 .filter(Boolean)
 .some((value) => String(value).toLowerCase().includes(query)))
 : rows;

 return (
 <SectionCard
 title="Senarai Peranan Staf Mengikut Syarikat"
 description="Pilih syarikat dahulu. Untuk RKJ Distributor, staf syarikat dan ejen diasingkan supaya tahap akses tidak bercampur."
 action={
 <div className="flex flex-wrap gap-2">
 <Badge variant="outline">{filteredRows.length} staf / pengguna</Badge>
 {agentRows.length > 0 && <Badge variant="secondary">{agentRows.length} ejen</Badge>}
 </div>
 }
 >
 <div className="mb-4 rounded-xl border bg-muted/20 p-3">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <p className="text-sm font-semibold text-foreground">
 {selectedCompany?.code === 'RKJ_DIST' ? 'Staf Syarikat RKJ Distributor' : 'Staf Syarikat'}
 </p>
 <p className="text-xs text-muted-foreground">
 Rekod ini ialah pekerja dalaman syarikat, bukan ejen jualan.
 </p>
 </div>
 <div className="relative w-full sm:w-80">
 <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 value={search}
 onChange={(event) => setSearch(event.target.value)}
 placeholder="Cari nama, kod staf, role atau cawangan..."
 className="pl-9"
 />
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
 {filteredRows.length === 0 ? (
 <p className="px-4 py-10 text-center text-sm text-muted-foreground">
 Tiada staf atau pengguna sepadan dengan pilihan ini.
 </p>) : (
 filteredRows.map(({ company, person }) => (
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

function CompanyFocusPanel({
 data,
 selectedCompanyKey,
 selectedCompany,
 onSelectCompany,
}: {
 data: HrDashboardData;
 selectedCompanyKey: string;
 selectedCompany: HrCompanyGroup | null;
 onSelectCompany: (key: string) => void;
}) {
 const companyLocal = selectedCompany?.summary.local ?? 0;
 const companyForeign = selectedCompany?.summary.foreign ?? 0;
 const companyAgents = selectedCompany?.agents.length ?? 0;
 const companyPendingRequests = selectedCompany
 ? data.service_requests.filter((request) =>
 request.legal_entity_code === selectedCompany.code &&
 ['SUBMITTED', 'IN_REVIEW'].includes(request.status)).length
 : data.service_requests.filter((request) => !request.legal_entity_code).length;
 const companyLeavePending = selectedCompany
 ? selectedCompany.people.reduce(
 (sum, person) =>
 sum + (person.leave_balances ?? []).reduce((n, balance) => n + Number(balance.pending_days ?? 0), 0),
 0,
 )
 : 0;

 return (
 <SectionCard
 title="Profil Syarikat & Staf"
 description="Pilih satu syarikat dahulu. Semua maklumat staf, cuti, permohonan HR, ejen dan tindakan akan ditapis mengikut syarikat pilihan ini."
 action={
 <Badge variant="outline">
 {selectedCompany ? selectedCompany.code : selectedCompanyKey === 'unassigned' ? 'BELUM TETAP' : 'SEMUA'}
 </Badge>
 }
 >
 <CompanyPicker data={data} selectedCompanyKey={selectedCompanyKey} onSelectCompany={onSelectCompany} />

 {selectedCompany ? (
 <div className="grid gap-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-4 lg:grid-cols-[1.2fr_1fr]">
 <div className="space-y-3">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Syarikat aktif</p>
 <h3 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{selectedCompany.legal_name}</h3>
 <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{selectedCompany.scope ?? selectedCompany.name}</p>
 </div>
 <Badge variant={selectedCompany.status === 'ACTIVE' ? 'default' : 'secondary'}>{selectedCompany.status}</Badge>
 </div>
 <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
 <div className="rounded-xl border bg-white/70 p-3">
 <p className="text-xs text-muted-foreground">Jumlah staf</p>
 <p className="mt-1 text-2xl font-semibold">{selectedCompany.summary.total}</p>
 </div>
 <div className="rounded-xl border bg-white/70 p-3">
 <p className="text-xs text-muted-foreground">Local / asing</p>
 <p className="mt-1 text-2xl font-semibold">{companyLocal}/{companyForeign}</p>
 </div>
 <div className="rounded-xl border bg-white/70 p-3">
 <p className="text-xs text-muted-foreground">Portal siap</p>
 <p className="mt-1 text-2xl font-semibold">{selectedCompany.summary.portal_ready}</p>
 </div>
 <div className="rounded-xl border bg-white/70 p-3">
 <p className="text-xs text-muted-foreground">Ejen</p>
 <p className="mt-1 text-2xl font-semibold">{companyAgents}</p>
 </div>
 </div>
 </div>
 <div className="grid gap-2 sm:grid-cols-2">
 <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
 <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Permohonan HR</p>
 <p className="mt-2 text-2xl font-semibold text-emerald-950">{companyPendingRequests}</p>
 <p className="text-xs text-emerald-800">aktif untuk syarikat ini</p>
 </div>
 <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
 <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Cuti pending</p>
 <p className="mt-2 text-2xl font-semibold text-sky-950">{companyLeavePending.toFixed(1)}</p>
 <p className="text-xs text-sky-800">hari menunggu tindakan HR</p>
 </div>
 <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
 <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Pengurusan</p>
 <p className="mt-2 text-2xl font-semibold text-violet-950">{selectedCompany.summary.management}</p>
 <p className="text-xs text-violet-800">profile HQ / pengurusan</p>
 </div>
 <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
 <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Operasi</p>
 <p className="mt-2 text-2xl font-semibold text-amber-950">{selectedCompany.summary.branch_staff}</p>
 <p className="text-xs text-amber-800">staf operasi / cawangan</p>
 </div>
 </div>
 </div>
 ) : (
 <div className="rounded-xl border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
 Pilihan ini hanya memaparkan rekod yang belum mempunyai syarikat majikan. Tetapkan syarikat dahulu supaya data HR, payroll dan akses tidak bercampur.
 </div>
 )}
 </SectionCard>
 );
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

function fmtRequestDate(value: string | null | undefined) {
 if (!value) return '-';
 return new Date(value).toLocaleString('ms-MY', {
 day: '2-digit',
 month: 'short',
 hour: '2-digit',
 minute: '2-digit',
 });
}

function serviceStatusClass(status: string) {
 if (status === 'APPROVED' || status === 'COMPLETED') {
 return 'border-emerald-200 bg-emerald-50 text-emerald-800';
 }
 if (status === 'REJECTED' || status === 'CANCELLED') {
 return 'border-red-200 bg-red-50 text-red-700';
 }
 if (status === 'IN_REVIEW') return 'border-sky-200 bg-sky-50 text-sky-800';
 return 'border-amber-200 bg-amber-50 text-amber-900';
}

function serviceTypeLabel(type: string) {
 const labels: Record<string, string> = {
 LEAVE: 'Cuti / Pelepasan',
 PROFILE_UPDATE: 'Kemaskini Profil',
 DOCUMENT: 'Dokumen HR',
 PAYROLL: 'Gaji / Elaun',
 TRANSFER: 'Pertukaran',
 ATTENDANCE: 'Kehadiran',
 UNIFORM_EQUIPMENT: 'Uniform / Peralatan',
 OVERTIME: 'OT / Lebih Masa',
 CLAIM: 'Claim / Tuntutan',
 TRAINING: 'Latihan / Kursus',
 RESIGNATION: 'Berhenti Kerja',
 DISCIPLINE: 'Disiplin / Kaunseling',
 ASSET: 'Aset Syarikat',
 LOAN_ADVANCE: 'Advance / Pinjaman',
 HR_HELP: 'Bantuan HR',
 };
 return labels[type] ?? type;
}

function serviceStatusLabel(status: string) {
 const labels: Record<string, string> = {
 SUBMITTED: 'Baharu',
 IN_REVIEW: 'Sedang disemak',
 APPROVED: 'Diluluskan',
 REJECTED: 'Ditolak',
 CANCELLED: 'Dibatalkan',
 COMPLETED: 'Selesai',
 };
 return labels[status] ?? status.replace('_', ' ');
}

function HrCommandCenter({
 data,
 onAddStaff,
 onRefresh,
 refreshing,
}: {
 data: HrDashboardData;
 onAddStaff: () => void;
 onRefresh: () => void;
 refreshing: boolean;
}) {
 const activeRequests = data.service_requests.filter((request) =>
 ['SUBMITTED', 'IN_REVIEW'].includes(request.status));
 const urgentRequests = activeRequests.filter((request) => request.priority === 'HIGH');
 const incompleteProfiles = data.companies.reduce(
 (total, company) => total + Math.max(0, company.summary.total - company.summary.profile_complete),
 0,
 );
 const portalMissing = data.companies.reduce(
 (total, company) => total + Math.max(0, company.summary.total - company.summary.portal_ready),
 0,
 );
 const activeCompanies = data.companies.filter((company) => company.status === 'ACTIVE').length;
 const signals = [
 {
 label: 'Permohonan aktif',
 value: activeRequests.length,
 detail: urgentRequests.length ? `${urgentRequests.length} segera` : 'Tiada permohonan segera',
 icon: ClipboardCheck,
 tone: activeRequests.length ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
 },
 {
 label: 'Profil belum lengkap',
 value: incompleteProfiles,
 detail: 'Perlu lengkap untuk payroll dan audit',
 icon: UserCog,
 tone: incompleteProfiles ? 'border-sky-200 bg-sky-50 text-sky-950' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
 },
 {
 label: 'Portal belum tersedia',
 value: portalMissing,
 detail: 'Akaun pekerja belum bersambung',
 icon: ShieldCheck,
 tone: portalMissing ? 'border-violet-200 bg-violet-50 text-violet-950' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
 },
 {
 label: 'Belum tetapkan syarikat',
 value: data.unassigned.length,
 detail: 'Perlu asing ikut entiti legal',
 icon: AlertTriangle,
 tone: data.unassigned.length ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
 },
 ];
 const topAction =
 urgentRequests.length > 0
 ? 'Semak permohonan segera dahulu, kemudian lengkapkan profil pekerja yang belum siap.'
 : incompleteProfiles > 0
 ? 'Lengkapkan profil HR pekerja supaya payroll, dokumen dan akses staf lebih kemas.'
 : data.unassigned.length > 0
 ? 'Tetapkan syarikat majikan bagi rekod yang belum diasingkan.'
 : 'HR kelihatan stabil. Teruskan pemantauan harian dan semak permohonan baharu.';

 return (
 <SectionCard className="border-amber-200 bg-gradient-to-br from-stone-950 via-stone-900 to-emerald-950 text-white">
 <div className="grid gap-5 xl:grid-cols-[1fr_1.35fr]">
 <div className="space-y-4">
 <div className="flex items-start gap-3">
 <div className="rounded-xl border border-amber-300/40 bg-amber-400 p-3 text-stone-950 shadow-lg">
 <Sparkles className="h-6 w-6" />
 </div>
 <div>
 <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
 HRMIS Command Centre
 </p>
 <h2 className="mt-1 text-2xl font-semibold tracking-tight">
 Kawalan pekerja, gaji dan servis HR
 </h2>
 <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-300">
 Paparan ini memecahkan staf mengikut syarikat legal, memantau permohonan pekerja dan menjaga rekod HR supaya operasi tidak bercampur.
 </p>
 </div>
 </div>
 <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
 <div className="flex items-start gap-3">
 <div className="rounded-lg bg-white/10 p-2 text-amber-200">
 <Gauge className="h-5 w-5" />
 </div>
 <div>
 <p className="text-sm font-semibold text-white">Tindakan disaran sekarang</p>
 <p className="mt-1 text-sm text-stone-300">{topAction}</p>
 </div>
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button className="gap-2 bg-amber-400 text-stone-950 hover:bg-amber-300" onClick={onAddStaff}>
 <UserPlus className="h-4 w-4" />
 Tambah staf
 </Button>
 <Button
 variant="outline"
 className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20"
 onClick={onRefresh}
 disabled={refreshing}
 >
 <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
 Muat semula
 </Button>
 </div>
 </div>

 <div className="grid gap-3 sm:grid-cols-2">
 <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
 <div className="flex items-center justify-between gap-3">
 <p className="text-sm font-medium text-stone-300">Entiti aktif</p>
 <Badge className="bg-white text-stone-950 hover:bg-white">{activeCompanies}/{data.summary.total_companies}</Badge>
 </div>
 <p className="mt-2 text-3xl font-semibold">{data.summary.total_people}</p>
 <p className="mt-1 text-sm text-stone-300">rekod HR merentas 3 syarikat</p>
 </div>
 <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
 <div className="flex items-center justify-between gap-3">
 <p className="text-sm font-medium text-stone-300">Profil siap</p>
 <Badge className="bg-emerald-400 text-stone-950 hover:bg-emerald-400">
 {data.summary.profile_complete}
 </Badge>
 </div>
 <p className="mt-2 text-3xl font-semibold">{Math.max(0, data.summary.total_people - incompleteProfiles)}</p>
 <p className="mt-1 text-sm text-stone-300">boleh diproses lebih lancar</p>
 </div>
 {signals.map((signal) => (
 <div key={signal.label} className={cn('rounded-2xl border p-4 shadow-sm', signal.tone)}>
 <div className="flex items-start justify-between gap-3">
 <div>
 <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{signal.label}</p>
 <p className="mt-2 text-2xl font-semibold">{signal.value}</p>
 <p className="mt-1 text-xs opacity-80">{signal.detail}</p>
 </div>
 <div className="rounded-xl border border-current/10 bg-white/60 p-2">
 <signal.icon className="h-5 w-5" />
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </SectionCard>
 );
}

function CompanyServiceRequestContent({
 requests,
 onStatusChange,
}: {
 requests: ServiceRequestRow[];
 onStatusChange: (request: ServiceRequestRow, status: Exclude<HrServiceRequestStatus, 'SUBMITTED'>) => void;
}) {
 if (requests.length === 0) {
 return (
 <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
 Belum ada permohonan HR kendiri untuk pilihan syarikat ini.
 </div>);
 }

 return (
 <div className="grid gap-3">
 {requests.slice(0, 8).map((request) => (
 <div
 key={request.id}
 className="grid gap-3 rounded-xl border bg-background p-4 text-sm shadow-sm transition hover:border-amber-200 hover:shadow-md lg:grid-cols-[1.2fr_0.85fr_0.75fr_auto] lg:items-center"
 >
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant="outline">{serviceTypeLabel(request.request_type)}</Badge>
 <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', serviceStatusClass(request.status))}>
 {serviceStatusLabel(request.status)}
 </span>
 {request.priority === 'HIGH' && <Badge variant="destructive">Segera</Badge>}
 </div>
 <p className="mt-2 font-semibold text-foreground">{request.title}</p>
 <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{request.description}</p>
 <div className="mt-3 h-1.5 rounded-full bg-muted">
 <div
 className={cn(
 'h-full rounded-full',
 request.status === 'REJECTED' || request.status === 'CANCELLED'
 ? 'bg-red-400'
 : request.status === 'COMPLETED'
 ? 'bg-emerald-500'
 : 'bg-amber-500',
 )}
 style={{
 width:
 request.status === 'SUBMITTED'
 ? '25%'
 : request.status === 'IN_REVIEW'
 ? '50%'
 : request.status === 'APPROVED'
 ? '75%'
 : '100%',
 }}
 />
 </div>
 </div>
 <div className="text-xs text-muted-foreground">
 <p className="font-medium text-foreground">{request.requester_name ?? 'Pekerja'}</p>
 <p>{request.staff_code ?? request.request_number}</p>
 <p>{fmtRequestDate(request.created_at)}</p>
 </div>
 <div className="text-xs text-muted-foreground">
 <p className="font-medium text-foreground">{request.legal_entity_code ?? 'Syarikat'}</p>
 <p>{request.branch_code ? `${request.branch_code} ${request.branch_name ?? ''}` : 'HQ / tanpa cawangan'}</p>
 {(request.start_date || request.end_date) && (
 <p>{request.start_date ?? '-'} {request.end_date ? `- ${request.end_date}` : ''}</p>)}
 </div>
 <div className="flex flex-wrap justify-end gap-2">
 {request.status === 'SUBMITTED' && (
 <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onStatusChange(request, 'IN_REVIEW')}>
 <Inbox className="h-3.5 w-3.5" />
 Ambil
 </Button>)}
 {['SUBMITTED', 'IN_REVIEW'].includes(request.status) && (
 <>
 <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => onStatusChange(request, 'APPROVED')}>
 Lulus
 </Button>
 <Button size="sm" variant="destructive" onClick={() => onStatusChange(request, 'REJECTED')}>
 Tolak
 </Button>
 </>)}
 {request.status === 'APPROVED' && (
 <Button size="sm" variant="outline" onClick={() => onStatusChange(request, 'COMPLETED')}>
 Selesai
 </Button>)}
 </div>
 </div>))}
 </div>);
}

function HrServiceRequestPanel({
 requests,
 company,
 onStatusChange,
}: {
 requests: ServiceRequestRow[];
 company: HrCompanyGroup | null;
 onStatusChange: (request: ServiceRequestRow, status: Exclude<HrServiceRequestStatus, 'SUBMITTED'>) => void;
}) {
 const activeCount = requests.filter((request) =>
 ['SUBMITTED', 'IN_REVIEW'].includes(request.status)).length;
 const scopeLabel = company ? company.legal_name : 'rekod belum ditetapkan';

 return (
 <SectionCard
 title={`Kaunter Permohonan HR - ${company?.code ?? 'Belum Tetap'}`}
 description={`Permohonan kendiri pekerja ditapis untuk ${scopeLabel}. HR boleh proses tanpa bercampur dengan syarikat lain.`}
 action={
 <div className="flex flex-wrap gap-2">
 <Badge variant={activeCount > 0 ? 'default' : 'secondary'}>{activeCount} aktif</Badge>
 <Badge variant="outline">{requests.length} rekod terkini</Badge>
 </div>
 }
 >
 <CompanyServiceRequestContent requests={requests} onStatusChange={onStatusChange} />
 </SectionCard>);
}

function CompanyLeaveBalanceContent({
 company,
 onEditBalance,
}: {
 company: HrCompanyGroup | null;
 onEditBalance: (person: HrStaffPerson, leaveType: HrLeaveType) => void;
}) {
 const currentYear = new Date().getFullYear();
 const localPeople = company
 ? company.people
 .filter((person) => person.worker_type === 'LOCAL' && person.staff_id)
 .map((person) => ({ company, person }))
 : [];
 const pendingTotal = localPeople.reduce((sum, { person }) => {
 return sum + (person.leave_balances ?? []).reduce((n, balance) => n + Number(balance.pending_days ?? 0), 0);
 }, 0);

 return (
 <>
 <div className="grid gap-3 md:grid-cols-3">
 <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Dilihat staf</p>
 <p className="mt-1 text-sm text-emerald-950">
 Baki cuti dipaparkan terus di dashboard HRMIS pekerja local.
 </p>
 </div>
 <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Ditetapkan HR</p>
 <p className="mt-1 text-sm text-amber-950">
 Klik kad cuti staf untuk kemaskini entitlement, carry forward, cuti digunakan, pending dan adjustment.
 </p>
 </div>
 <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Audit automatik</p>
 <p className="mt-1 text-sm text-sky-950">
 Setiap perubahan direkod dalam ledger cuti untuk semakan syarikat.
 </p>
 </div>
 </div>

 <div className="mt-4 space-y-3">
 {localPeople.length === 0 ? (
 <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
 Tiada pekerja local untuk ditetapkan baki cuti dalam pilihan syarikat ini.
 </p>) : (
 localPeople.map(({ company, person }) => {
 const annual = leaveBalanceFor(person, 'ANNUAL', currentYear);
 const sick = leaveBalanceFor(person, 'SICK', currentYear);
 const balances = HR_LEAVE_TYPES.map((type) => ({ type, balance: leaveBalanceFor(person, type, currentYear) }));
 return (
 <div key={`${company.id}-${person.staff_id}`} className="rounded-xl border bg-background p-4 shadow-sm">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <p className="font-semibold text-foreground">{person.full_name}</p>
 <Badge variant="outline">{company.code}</Badge>
 <Badge variant="secondary">{person.staff_code}</Badge>
 </div>
 <p className="mt-1 text-xs text-muted-foreground">
 {person.branch_code ? `${person.branch_code} ${person.branch_name ?? ''}` : 'HQ / Syarikat'} - {person.email ?? 'email portal belum ada'}
 </p>
 </div>
 <div className="text-right text-sm">
 <p className="font-semibold text-emerald-700">{annual ? `${Number(annual.remaining).toFixed(1)} hari cuti tahunan` : 'Belum ada rekod cuti'}</p>
 <p className="text-xs text-muted-foreground">
 Cuti sakit: {sick ? `${Number(sick.remaining).toFixed(1)} hari` : '-'}
 </p>
 </div>
 </div>

 <div className="mt-4 grid gap-2 md:grid-cols-5">
 {balances.map(({ type, balance }) => (
 <button
 key={type}
 type="button"
 onClick={() => onEditBalance(person, type)}
 className={cn(
 'rounded-lg border px-3 py-2 text-left text-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/60',
 balance ? 'bg-white' : 'border-dashed bg-muted/20',
 )}
 >
 <div className="flex items-center justify-between gap-2">
 <p className="text-xs font-semibold text-muted-foreground">{formatLeaveType(type, 'ms')}</p>
 <Pencil className="h-3.5 w-3.5 text-amber-600" />
 </div>
 <p className="mt-1 text-lg font-semibold text-foreground">
 {balance ? `${Number(balance.remaining).toFixed(1)} hari` : 'Set'}
 </p>
 <p className="mt-1 text-[11px] text-muted-foreground">
 Guna {Number(balance?.used_days ?? 0).toFixed(1)} - Pending {Number(balance?.pending_days ?? 0).toFixed(1)}
 </p>
 <p className="mt-2 text-[11px] font-semibold text-amber-700">Kemaskini</p>
 </button>
 ))}
 </div>
 </div>
 );
 }))}
 </div>
 </>);
}

function HrLeaveBalancePanel({
 company,
 onEditBalance,
}: {
 company: HrCompanyGroup | null;
 onEditBalance: (person: HrStaffPerson, leaveType: HrLeaveType) => void;
}) {
 const currentYear = new Date().getFullYear();
 const localPeople = company
 ? company.people
 .filter((person) => person.worker_type === 'LOCAL' && person.staff_id)
 .map((person) => ({ company, person }))
 : [];
 const pendingTotal = localPeople.reduce((sum, { person }) => {
 return sum + (person.leave_balances ?? []).reduce((n, balance) => n + Number(balance.pending_days ?? 0), 0);
 }, 0);

 return (
 <SectionCard
 title={`Kawalan Baki Cuti - ${company?.code ?? 'Pilih Syarikat'}`}
 description="Admin HR boleh lihat, tetapkan dan audit baki cuti pekerja tempatan untuk syarikat aktif sahaja. Staf pula nampak baki cuti mereka di HRMIS kendiri."
 action={
 <div className="flex flex-wrap gap-2">
 <Badge variant="outline">{localPeople.length} pekerja local</Badge>
 <Badge variant={pendingTotal > 0 ? 'default' : 'secondary'}>{pendingTotal.toFixed(1)} hari pending</Badge>
 </div>
 }
 >
 <CompanyLeaveBalanceContent company={company} onEditBalance={onEditBalance} />
 </SectionCard>
 );
}

function CompanyPayrollSnapshot({
 company,
}: {
 company: HrCompanyGroup | null;
}) {
 if (!company) {
 return (
 <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
 Pilih syarikat aktif untuk melihat ringkasan gaji staf.
 </div>);
 }

 const payrollPeople = company.people.filter((person) => person.status === 'ACTIVE');
 const monthlyTotal = payrollPeople.reduce((sum, person) => sum + Number(person.monthly_amount ?? 0), 0);
 const weeklyTotal = payrollPeople.reduce((sum, person) => sum + Number(person.weekly_amount ?? 0), 0);
 const localCount = payrollPeople.filter((person) => person.worker_type === 'LOCAL').length;
 const foreignCount = payrollPeople.filter((person) => person.worker_type === 'FOREIGN').length;

 return (
 <div className="space-y-4">
 <div className="grid gap-3 md:grid-cols-4">
 <div className="rounded-xl border bg-emerald-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Gaji bulanan</p>
 <p className="mt-2 text-2xl font-semibold text-emerald-950">{formatRM(monthlyTotal)}</p>
 </div>
 <div className="rounded-xl border bg-amber-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Gaji mingguan</p>
 <p className="mt-2 text-2xl font-semibold text-amber-950">{formatRM(weeklyTotal)}</p>
 </div>
 <div className="rounded-xl border bg-sky-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Staf tempatan</p>
 <p className="mt-2 text-2xl font-semibold text-sky-950">{localCount}</p>
 </div>
 <div className="rounded-xl border bg-violet-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Pekerja asing</p>
 <p className="mt-2 text-2xl font-semibold text-violet-950">{foreignCount}</p>
 </div>
 </div>
 <div className="overflow-hidden rounded-xl border bg-background">
 <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr] border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 <span>Staf</span>
 <span>Jenis / Lokasi</span>
 <span className="text-right">Struktur gaji</span>
 </div>
 {payrollPeople.length === 0 ? (
 <p className="px-4 py-8 text-center text-sm text-muted-foreground">Tiada staf aktif untuk payroll syarikat ini.</p>) : (
 payrollPeople.slice(0, 12).map((person) => (
 <div key={`${person.source}-${person.id}-payroll`} className="grid gap-3 border-b px-4 py-3 text-sm last:border-b-0 md:grid-cols-[1.1fr_0.9fr_0.9fr] md:items-center">
 <div>
 <p className="font-semibold text-foreground">{person.full_name}</p>
 <p className="text-xs text-muted-foreground">{person.staff_code ?? 'Kod belum ada'}</p>
 </div>
 <div className="text-xs text-muted-foreground">
 <p>{person.worker_type === 'LOCAL' ? 'Staf tempatan' : 'Pekerja asing'}</p>
 <p>{person.branch_code ? `${person.branch_code} ${person.branch_name ?? ''}` : 'HQ / Syarikat'}</p>
 </div>
 <p className="text-right text-sm font-semibold text-foreground">{payLabel(person)}</p>
 </div>)))}
 </div>
 </div>);
}

function CompanyAccessContent({
 company,
 onAgentAccessChange,
 savingAgentId,
}: {
 company: HrCompanyGroup | null;
 onAgentAccessChange: (agent: HrAgentPerson, priceGroupId: string | null) => void;
 savingAgentId: string | null;
}) {
 if (!company) {
 return (
 <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
 Pilih syarikat aktif untuk melihat kawalan akses.
 </div>);
 }

 const portalReady = company.people.filter((person) => person.profile_id && person.email).length;
 const portalMissing = company.people.filter((person) => !person.profile_id || !person.email);
 const management = company.people.filter((person) => person.source === 'profile' || person.role !== 'STAFF_RECORD').length;

 return (
 <div className="space-y-4">
 <div className="grid gap-3 md:grid-cols-3">
 <div className="rounded-xl border bg-emerald-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Portal aktif</p>
 <p className="mt-2 text-2xl font-semibold text-emerald-950">{portalReady}/{company.summary.total}</p>
 </div>
 <div className="rounded-xl border bg-amber-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Perlu semakan</p>
 <p className="mt-2 text-2xl font-semibold text-amber-950">{portalMissing.length}</p>
 </div>
 <div className="rounded-xl border bg-sky-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Role pengurusan</p>
 <p className="mt-2 text-2xl font-semibold text-sky-950">{management}</p>
 </div>
 </div>

 <div className="rounded-xl border bg-background p-4">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <p className="font-semibold text-foreground">Akses staf perlu disemak</p>
 <p className="text-xs text-muted-foreground">Rekod tanpa email atau portal perlu dilengkapkan supaya dashboard staf aktif.</p>
 </div>
 <Badge variant={portalMissing.length ? 'outline' : 'secondary'}>{portalMissing.length} rekod</Badge>
 </div>
 <div className="mt-3 grid gap-2">
 {portalMissing.length === 0 ? (
 <p className="rounded-lg border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
 Semua rekod staf syarikat ini mempunyai akses asas.
 </p>) : (
 portalMissing.slice(0, 8).map((person) => (
 <div key={`${person.source}-${person.id}-access`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
 <div>
 <p className="font-medium text-foreground">{person.full_name}</p>
 <p className="text-xs text-muted-foreground">{roleLabel(person)} - {person.email ?? 'email belum ada'}</p>
 </div>
 <Badge variant="outline">{person.branch_code ?? 'HQ'}</Badge>
 </div>)))}
 </div>
 </div>

 {company.code === 'RKJ_DIST' && (
 <AgentAccessSection
 company={company}
 agents={company.agents}
 onAgentAccessChange={onAgentAccessChange}
 savingAgentId={savingAgentId}
 />)}
 </div>);
}

function CompanyDocumentGuide({ company }: { company: HrCompanyGroup | null }) {
 const documents = [
 'Profil pekerja dan maklumat waris',
 'Kad pengenalan / passport / permit kerja',
 'Maklumat bank, EPF, SOCSO dan LHDN',
 'Surat tawaran, kontrak kerja dan perubahan gaji',
 'Dokumen disiplin, amaran, latihan dan aset syarikat',
 ];

 return (
 <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
 <div className="rounded-xl border bg-background p-4">
 <p className="font-semibold text-foreground">Pusat dokumen HR {company ? company.code : ''}</p>
 <p className="mt-1 text-sm text-muted-foreground">
 Dokumen staf perlu disimpan mengikut syarikat majikan dan dikaitkan pada profil staf. Ini menjadikan audit HR, payroll dan access lebih mudah.
 </p>
 <div className="mt-4 grid gap-2">
 {documents.map((document) => (
 <div key={document} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
 <FileText className="h-4 w-4 text-amber-600" />
 <span>{document}</span>
 </div>))}
 </div>
 </div>
 <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
 <p className="text-sm font-semibold text-amber-950">Cadangan susunan</p>
 <p className="mt-2 text-sm leading-relaxed text-amber-900">
 Letakkan dokumen di bawah profil staf atau profil syarikat, bukan bercampur dalam Tetapan. Untuk staf cawangan, dokumen juga boleh dirujuk melalui profile cawangan.
 </p>
 <div className="mt-4 rounded-lg bg-white/70 p-3 text-xs text-amber-900">
 Struktur: Syarikat {'>'} Staf {'>'} Dokumen {'>'} Audit kemaskini.
 </div>
 </div>
 </div>);
}

function CompanyHrWorkspace({
 data,
 selectedCompany,
 selectedCompanyKey,
 serviceRequests,
 onAddStaff,
 onTransfer,
 onEdit,
 onDelete,
 onStatusChange,
 onEditBalance,
 onAgentAccessChange,
 savingAgentId,
}: {
 data: HrDashboardData;
 selectedCompany: HrCompanyGroup | null;
 selectedCompanyKey: string;
 serviceRequests: ServiceRequestRow[];
 onAddStaff: () => void;
 onTransfer: (person: HrStaffPerson) => void;
 onEdit: (person: HrStaffPerson) => void;
 onDelete: (person: HrStaffPerson) => void;
 onStatusChange: (request: ServiceRequestRow, status: Exclude<HrServiceRequestStatus, 'SUBMITTED'>) => void;
 onEditBalance: (person: HrStaffPerson, leaveType: HrLeaveType) => void;
 onAgentAccessChange: (agent: HrAgentPerson, priceGroupId: string | null) => void;
 savingAgentId: string | null;
}) {
 const [staffSearch, setStaffSearch] = useState('');
 const people = selectedCompany ? selectedCompany.people : selectedCompanyKey === 'unassigned' ? data.unassigned : [];
 const query = staffSearch.trim().toLowerCase();
 const filteredPeople = query
 ? people.filter((person) =>
 [
 person.full_name,
 person.staff_code,
 person.email,
 roleLabel(person),
 person.branch_code,
 person.branch_name,
 person.region_name,
 person.worker_type,
 person.status,
 ]
 .filter(Boolean)
 .some((value) => String(value).toLowerCase().includes(query)))
 : people;
 const pendingRequests = serviceRequests.filter((request) => ['SUBMITTED', 'IN_REVIEW'].includes(request.status)).length;
 const localLeaveCount = selectedCompany?.people.filter((person) => person.worker_type === 'LOCAL' && person.staff_id).length ?? 0;
 const title = selectedCompany ? selectedCompany.legal_name : 'Rekod Belum Tetap Syarikat';
 const description = selectedCompany
 ? 'Semua operasi HR untuk syarikat ini disatukan di sini: staf, cuti, permohonan, gaji, akses dan dokumen.'
 : 'Rekod ini belum mempunyai syarikat majikan. Lengkapkan syarikat dahulu sebelum payroll, cuti dan akses diproses.';

 return (
 <SectionCard
 title={`Workspace HR Syarikat - ${selectedCompany?.code ?? 'BELUM TETAP'}`}
 description={description}
 action={
 <div className="flex flex-wrap gap-2">
 <Badge variant="outline">{people.length} staf</Badge>
 <Badge variant={pendingRequests > 0 ? 'default' : 'secondary'}>{pendingRequests} permohonan aktif</Badge>
 </div>
 }
 >
 <div className="mb-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-sky-50 p-4">
 <div className="flex flex-wrap items-start justify-between gap-4">
 <div>
 <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Profil aktif</p>
 <h3 className="mt-1 text-xl font-semibold text-foreground">{title}</h3>
 <p className="mt-1 text-sm text-muted-foreground">{selectedCompany?.scope ?? 'Sila tetapkan syarikat untuk rekod ini.'}</p>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button size="sm" className="gap-1.5 bg-amber-500 hover:bg-amber-600" onClick={onAddStaff}>
 <UserPlus className="h-4 w-4" />
 Tambah staf
 </Button>
 <Badge variant={selectedCompany?.status === 'ACTIVE' ? 'default' : 'secondary'}>{selectedCompany?.status ?? 'UNASSIGNED'}</Badge>
 </div>
 </div>
 </div>

 <Tabs defaultValue="staf" className="space-y-4">
 <TabsList className={cn(moduleTabsListClass, 'grid w-full grid-cols-2 md:grid-cols-6')}>
 <TabsTrigger value="staf" className={moduleTabsTriggerClass}><Users className="h-4 w-4" /> Staf</TabsTrigger>
 <TabsTrigger value="cuti" className={moduleTabsTriggerClass}><CalendarDays className="h-4 w-4" /> Cuti</TabsTrigger>
 <TabsTrigger value="permohonan" className={moduleTabsTriggerClass}><Inbox className="h-4 w-4" /> Permohonan</TabsTrigger>
 <TabsTrigger value="gaji" className={moduleTabsTriggerClass}><Landmark className="h-4 w-4" /> Gaji</TabsTrigger>
 <TabsTrigger value="akses" className={moduleTabsTriggerClass}><ShieldCheck className="h-4 w-4" /> Akses</TabsTrigger>
 <TabsTrigger value="dokumen" className={moduleTabsTriggerClass}><FileText className="h-4 w-4" /> Dokumen</TabsTrigger>
 </TabsList>

 <TabsContent value="staf" className="space-y-4">
 <div className="grid gap-3 md:grid-cols-4">
 <div className="rounded-xl border bg-emerald-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Aktif</p>
 <p className="mt-2 text-2xl font-semibold text-emerald-950">{people.filter((person) => person.status === 'ACTIVE').length}</p>
 </div>
 <div className="rounded-xl border bg-sky-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Tempatan</p>
 <p className="mt-2 text-2xl font-semibold text-sky-950">{people.filter((person) => person.worker_type === 'LOCAL').length}</p>
 </div>
 <div className="rounded-xl border bg-violet-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Pekerja asing</p>
 <p className="mt-2 text-2xl font-semibold text-violet-950">{people.filter((person) => person.worker_type === 'FOREIGN').length}</p>
 </div>
 <div className="rounded-xl border bg-amber-50/70 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Portal siap</p>
 <p className="mt-2 text-2xl font-semibold text-amber-950">{people.filter((person) => person.email || person.profile_id).length}</p>
 </div>
 </div>
 <div className="relative">
 <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 value={staffSearch}
 onChange={(event) => setStaffSearch(event.target.value)}
 placeholder="Cari staf dalam syarikat ini..."
 className="pl-9"
 />
 </div>
 <div className="grid gap-2">
 {filteredPeople.length === 0 ? (
 <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
 Tiada staf sepadan dalam pilihan ini.
 </p>) : (
 filteredPeople.map((person) => (
 <PersonRow
 key={`${person.source}-${person.id}-workspace`}
 person={person}
 onTransfer={onTransfer}
 onEdit={onEdit}
 onDelete={onDelete}
 />)))}
 </div>
 </TabsContent>

 <TabsContent value="cuti" className="space-y-4">
 <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 p-3 text-sm">
 <span>{localLeaveCount} pekerja local layak dikawal baki cuti.</span>
 <Badge variant="outline">HRMIS pekerja auto papar baki</Badge>
 </div>
 <CompanyLeaveBalanceContent company={selectedCompany} onEditBalance={onEditBalance} />
 </TabsContent>

 <TabsContent value="permohonan" className="space-y-4">
 <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 p-3 text-sm">
 <span>Permohonan HR pekerja untuk syarikat aktif sahaja.</span>
 <Badge variant={pendingRequests > 0 ? 'default' : 'secondary'}>{pendingRequests} aktif</Badge>
 </div>
 <CompanyServiceRequestContent requests={serviceRequests} onStatusChange={onStatusChange} />
 </TabsContent>

 <TabsContent value="gaji">
 <CompanyPayrollSnapshot company={selectedCompany} />
 </TabsContent>

 <TabsContent value="akses">
 <CompanyAccessContent
 company={selectedCompany}
 onAgentAccessChange={onAgentAccessChange}
 savingAgentId={savingAgentId}
 />
 </TabsContent>

 <TabsContent value="dokumen">
 <CompanyDocumentGuide company={selectedCompany} />
 </TabsContent>
 </Tabs>
 </SectionCard>);
}

function LeaveBalanceEditorDialog({
 editor,
 saving,
 onChange,
 onClose,
 onSave,
}: {
 editor: LeaveBalanceEditorState | null;
 saving: boolean;
 onChange: (patch: Partial<LeaveBalanceEditorState>) => void;
 onClose: () => void;
 onSave: () => void;
}) {
 const person = editor?.person;
 const remaining = leaveEditorRemaining(editor);
 const isNegative = remaining < 0;

 return (
 <Dialog open={editor != null} onOpenChange={(open) => {
 if (!open && !saving) onClose();
 }}>
 <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
 <DialogHeader>
 <DialogTitle>Kemaskini Baki Cuti Staf</DialogTitle>
 <DialogDescription>
 Tetapkan baki cuti rasmi pekerja local. Perubahan ini masuk ke rekod audit HR dan terus dipaparkan kepada staf di HRMIS kendiri.
 </DialogDescription>
 </DialogHeader>

 {editor && person && (
 <form
 className="space-y-4"
 onSubmit={(event) => {
 event.preventDefault();
 onSave();
 }}
 >
 <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Staf</p>
 <p className="mt-1 text-lg font-semibold text-foreground">{person.full_name}</p>
 <p className="text-sm text-muted-foreground">
 {person.staff_code} - {person.branch_code ? `${person.branch_code} ${person.branch_name ?? ''}` : 'HQ / Syarikat'}
 </p>
 </div>
 <div className="text-right">
 <Badge variant="outline">{formatLeaveType(editor.leaveType, 'ms')}</Badge>
 <p className={cn('mt-2 text-2xl font-bold', isNegative ? 'text-destructive' : 'text-emerald-700')}>
 {remaining.toFixed(1)} hari
 </p>
 <p className="text-xs text-muted-foreground">Baki selepas kemaskini</p>
 </div>
 </div>
 </div>

 <div className="grid gap-3 md:grid-cols-2">
 <div className="space-y-2">
 <Label htmlFor="leave-year">Tahun cuti</Label>
 <Input
 id="leave-year"
 type="number"
 inputMode="numeric"
 value={editor.leaveYear}
 onChange={(event) => onChange({ leaveYear: event.target.value })}
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="entitlement-days">Kelayakan tahunan / entitlement</Label>
 <Input
 id="entitlement-days"
 type="number"
 inputMode="decimal"
 min="0"
 step="0.5"
 value={editor.entitlementDays}
 onChange={(event) => onChange({ entitlementDays: event.target.value })}
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="carry-days">Baki bawa hadapan</Label>
 <Input
 id="carry-days"
 type="number"
 inputMode="decimal"
 min="0"
 step="0.5"
 value={editor.carriedForwardDays}
 onChange={(event) => onChange({ carriedForwardDays: event.target.value })}
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="used-days">Cuti sudah digunakan</Label>
 <Input
 id="used-days"
 type="number"
 inputMode="decimal"
 min="0"
 step="0.5"
 value={editor.usedDays}
 onChange={(event) => onChange({ usedDays: event.target.value })}
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="pending-days">Cuti sedang menunggu kelulusan</Label>
 <Input
 id="pending-days"
 type="number"
 inputMode="decimal"
 min="0"
 step="0.5"
 value={editor.pendingDays}
 onChange={(event) => onChange({ pendingDays: event.target.value })}
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="adjustment-days">Adjustment manual (+/-)</Label>
 <Input
 id="adjustment-days"
 type="number"
 inputMode="decimal"
 step="0.5"
 value={editor.adjustmentDays}
 onChange={(event) => onChange({ adjustmentDays: event.target.value })}
 />
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="leave-notes">Nota HR</Label>
 <Textarea
 id="leave-notes"
 rows={3}
 value={editor.notes}
 placeholder="Contoh: Kemas kini entitlement 2026 mengikut polisi syarikat."
 onChange={(event) => onChange({ notes: event.target.value })}
 />
 </div>

 <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
 Formula: entitlement + bawa hadapan + adjustment - digunakan - pending = baki rasmi staf.
 </div>

 <DialogFooter>
 <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
 Batal
 </Button>
 <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={saving}>
 {saving ? 'Menyimpan...' : 'Simpan Baki Cuti'}
 </Button>
 </DialogFooter>
 </form>
 )}
 </DialogContent>
 </Dialog>
 );
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
 const [leaveEditor, setLeaveEditor] = useState<LeaveBalanceEditorState | null>(null);
 const [savingLeaveBalance, setSavingLeaveBalance] = useState(false);

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
 const selectedServiceRequests = useMemo(() => {
 if (selectedCompanyKey === 'unassigned') {
 return data.service_requests.filter((request) => !request.legal_entity_code);
 }
 if (!selectedCompany) return data.service_requests;
 return data.service_requests.filter((request) => request.legal_entity_code === selectedCompany.code);
 }, [data.service_requests, selectedCompany, selectedCompanyKey]);

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

 async function handleServiceRequestStatus(
 request: ServiceRequestRow,
 status: Exclude<HrServiceRequestStatus, 'SUBMITTED'>,
 ) {
 let reviewerNote: string | null = null;
 if (status === 'REJECTED') {
 reviewerNote = prompt(`Sebab tolak permohonan ${request.request_number}:`)?.trim() ?? null;
 if (!reviewerNote) {
 toast.error('Sila isi sebab ringkas sebelum tolak permohonan.');
 return;
 }
 } else if (status === 'COMPLETED') {
 reviewerNote = prompt(`Nota selesai untuk ${request.request_number} (pilihan):`)?.trim() ?? null;
 }

 try {
 await updateHrServiceRequestStatus(request.id, { status, reviewer_note: reviewerNote });
 toast.success('Status permohonan HR dikemaskini');
 await refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemaskini permohonan HR');
 }
 }

 function handleLeaveBalanceEdit(person: HrStaffPerson, leaveType: HrLeaveType) {
 if (!person.staff_id) {
 toast.error('Rekod staf tidak lengkap untuk kemaskini cuti.');
 return;
 }
 if (person.worker_type !== 'LOCAL') {
 toast.error('Baki cuti hanya terpakai untuk pekerja local.');
 return;
 }

 const year = new Date().getFullYear();
 const current = leaveBalanceFor(person, leaveType, year);
 setLeaveEditor({
 person,
 leaveType,
 leaveYear: String(current?.leave_year ?? year),
 entitlementDays: leaveInput(current?.entitlement_days ?? 0),
 carriedForwardDays: leaveInput(current?.carried_forward_days ?? 0),
 usedDays: leaveInput(current?.used_days ?? 0),
 pendingDays: leaveInput(current?.pending_days ?? 0),
 adjustmentDays: leaveInput(current?.adjustment_days ?? 0),
 notes: current?.notes ?? 'Kemaskini baki cuti oleh HR.',
 });
 }

 async function handleLeaveBalanceSave() {
 if (!leaveEditor) return;
 if (!leaveEditor.person.staff_id) {
 toast.error('Rekod staf tidak lengkap untuk kemaskini cuti.');
 return;
 }

 let payload: Parameters<typeof updateHrLeaveBalance>[1];
 try {
 const leaveYear = Number(leaveEditor.leaveYear);
 if (!Number.isInteger(leaveYear) || leaveYear < 2020 || leaveYear > 2100) {
 throw new Error('Tahun cuti tidak sah.');
 }
 payload = {
 leave_type: leaveEditor.leaveType,
 leave_year: leaveYear,
 entitlement_days: parseLeaveInput('Entitlement', leaveEditor.entitlementDays),
 carried_forward_days: parseLeaveInput('Baki bawa hadapan', leaveEditor.carriedForwardDays),
 used_days: parseLeaveInput('Cuti digunakan', leaveEditor.usedDays),
 pending_days: parseLeaveInput('Cuti pending', leaveEditor.pendingDays),
 adjustment_days: parseLeaveInput('Adjustment', leaveEditor.adjustmentDays, true),
 notes: leaveEditor.notes.trim() || null,
 };
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Nilai cuti tidak sah.');
 return;
 }

 setSavingLeaveBalance(true);
 try {
 await updateHrLeaveBalance(leaveEditor.person.staff_id, payload);
 toast.success('Baki cuti staf dikemaskini.');
 setLeaveEditor(null);
 await refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemaskini baki cuti.');
 } finally {
 setSavingLeaveBalance(false);
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

 <HrCommandCenter
 data={data}
 onAddStaff={() => setAddStaffOpen(true)}
 onRefresh={refresh}
 refreshing={refreshing}
 />

 <CompanyFocusPanel
 data={data}
 selectedCompanyKey={selectedCompanyKey}
 selectedCompany={selectedCompany}
 onSelectCompany={setSelectedCompanyKey}
 />

 <WorkflowSopPanel workflow={workflow} />

 <KpiGrid cols={5}>
 <KpiCard title={t('module.hr.company')} value={data.summary.total_companies} icon={Building2} />
 <KpiCard title={t('module.hr.totalHr')} value={data.summary.total_people} icon={Users} />
 <KpiCard title={t('module.hr.operationsStaff')} value={data.summary.branch_staff} icon={UserCheck} />
 <KpiCard title={t('module.hr.management')} value={data.summary.management_people} icon={ShieldCheck} />
 <KpiCard title={t('module.hr.profileComplete')} value={data.summary.profile_complete} icon={FileText} />
 <KpiCard title="Rekod Baki Cuti" value={data.summary.leave_balances} icon={CalendarDays} />
 </KpiGrid>

 <CompanyHrWorkspace
 data={data}
 selectedCompany={selectedCompany}
 selectedCompanyKey={selectedCompanyKey}
 serviceRequests={selectedServiceRequests}
 onAddStaff={() => setAddStaffOpen(true)}
 onTransfer={setTransferPerson}
 onEdit={handleEdit}
 onDelete={handleDelete}
 onStatusChange={handleServiceRequestStatus}
 onEditBalance={handleLeaveBalanceEdit}
 onAgentAccessChange={handleAgentAccessChange}
 savingAgentId={savingAgentId}
 />

 <LeaveBalanceEditorDialog
 editor={leaveEditor}
 saving={savingLeaveBalance}
 onChange={(patch) => setLeaveEditor((current) => (current ? { ...current, ...patch } : current))}
 onClose={() => setLeaveEditor(null)}
 onSave={handleLeaveBalanceSave}
 />

 <SectionCard
 title="Operasi Payroll 3 Syarikat"
 description="Jana gaji, semak peraturan, komisyen, staf tempatan/asing dan pecahan gaji mengikut syarikat legal."
 >
 <PayrollOperationsPanel />
 </SectionCard>

 <HrGroupOwnerSection owners={data.group_owners} />

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


