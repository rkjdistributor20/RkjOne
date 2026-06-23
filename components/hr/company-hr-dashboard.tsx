'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  FileText,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { HrCompanyGroup, HrDashboardData, HrStaffPerson } from '@/lib/hr/company-hr';
import {
  deactivateHrProfile,
  deactivateStaffMember,
  deleteStaffMember,
  fetchHrDashboard,
} from '@/lib/hr/api';
import { fetchSettingsBranchesGrouped } from '@/lib/settings/api';
import { ROLE_LABELS } from '@/types/enums';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { EditStaffDialog } from '@/components/settings/edit-staff-dialog';
import type { AddStaffBranchOption } from '@/components/settings/add-staff-dialog';
import { HrGroupOwnerSection } from '@/components/hr/hr-group-owner-section';
import { HrProfileEditDialog } from '@/components/hr/hr-profile-edit-dialog';
import { HrTransferDialog } from '@/components/hr/hr-transfer-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  KpiCard,
  KpiGrid,
  ModuleHeader,
  ModuleLayout,
  SectionCard,
  formatRM,
} from '@/components/shared/module-ui';

function roleLabel(role: HrStaffPerson['role']) {
  if (role === 'STAFF_RECORD') return 'Rekod Staf';
  return ROLE_LABELS[role] ?? role;
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
          {person.staff_code} · {roleLabel(person.role)}
        </p>
      </div>
      <div className="text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{person.branch_name ?? 'HQ / Syarikat'}</p>
        <p>{person.branch_code ?? person.region_name ?? 'Pentadbiran'}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {person.worker_type && (
          <Badge variant="outline">{person.worker_type === 'LOCAL' ? 'Tempatan' : 'Pekerja asing'}</Badge>
        )}
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
              </>
            )}
            {person.is_group_owner && (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                Profil gabungan 3 syarikat — lihat seksyen Pemilik Kumpulan
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
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
              : 'border-amber-200 bg-amber-50 text-amber-950'
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {check.label}
        </div>
      ))}
    </div>
  );
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
            </p>
          ) : (
            company.people.map((person) => (
              <PersonRow
                key={`${person.source}-${person.id}`}
                person={person}
                onTransfer={onTransfer}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export function CompanyHrDashboard({ data: initialData }: { data: HrDashboardData }) {
  const [data, setData] = useState(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [branches, setBranches] = useState<AddStaffBranchOption[]>([]);

  const [transferPerson, setTransferPerson] = useState<HrStaffPerson | null>(null);
  const [editStaffId, setEditStaffId] = useState<string | null>(null);
  const [editProfilePerson, setEditProfilePerson] = useState<HrStaffPerson | null>(null);

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
    fetchSettingsBranchesGrouped()
      .then(({ groups }) => {
        setBranches(
          groups.flatMap((g) =>
            g.branches.map((b) => ({
              id: b.id,
              branch_code: b.branch_code,
              branch_name: b.branch_name,
              region_name: g.region_name,
            }))
          )
        );
      })
      .catch(() => setBranches([]));
  }, []);

  const branchOptions = useMemo(() => branches, [branches]);

  function handleEdit(person: HrStaffPerson) {
    if (person.source === 'staff' && person.staff_id) {
      setEditStaffId(person.staff_id);
      return;
    }
    if (person.profile_id) {
      setEditProfilePerson(person);
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

  return (
    <ModuleLayout>
      <ModuleHeader
        title="HR Syarikat"
        description="Urus staf mengikut entiti undang-undang: pindah syarikat, edit maklumat, dan nonaktifkan rekod."
        icon={Users}
        actions={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            Muat semula
          </Button>
        }
        badges={
          <>
            <Badge variant="secondary">{data.summary.total_companies} syarikat legal</Badge>
            <Badge variant="outline">{data.summary.total_people} rekod HR</Badge>
          </>
        }
      />

      <KpiGrid cols={5}>
        <KpiCard title="Syarikat" value={data.summary.total_companies} icon={Building2} />
        <KpiCard title="Jumlah Rekod HR" value={data.summary.total_people} icon={Users} />
        <KpiCard title="Staf Operasi" value={data.summary.branch_staff} icon={UserCheck} />
        <KpiCard title="Pengurusan" value={data.summary.management_people} icon={ShieldCheck} />
        <KpiCard title="Profil Lengkap" value={data.summary.profile_complete} icon={FileText} />
      </KpiGrid>

      <SectionCard
        title="Tindakan HR"
        description="Pindah staf antara Roti Kaya Junus, RKJ Distributor, dan RKJ Manufacturing. Edit maklumat pekerja atau nonaktifkan rekod."
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

      <div className="space-y-5">
        {data.companies.map((company) => (
          <CompanyHrCard
            key={company.id}
            company={company}
            onTransfer={setTransferPerson}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {data.unassigned.length > 0 && (
        <SectionCard
          title="Rekod Belum Diletakkan Dalam Syarikat"
          description="Rekod ini perlu disemak supaya semua staf berada di bawah syarikat legal yang betul."
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
              />
            ))}
          </div>
        </SectionCard>
      )}

      <HrTransferDialog
        person={transferPerson}
        open={transferPerson != null}
        onOpenChange={(open) => {
          if (!open) setTransferPerson(null);
        }}
        onSuccess={refresh}
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
    </ModuleLayout>
  );
}
