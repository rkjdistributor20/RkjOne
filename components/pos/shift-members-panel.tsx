'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Clock3,
  LogOut,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import {
  approvePosShiftMember,
  endPosShiftMember,
  fetchShiftMembers,
  joinPosShiftMember,
  rejectPosShiftMember,
} from '@/lib/pos/api';
import type {
  PosShiftAvailableStaff,
  PosShiftMemberRole,
  PosShiftStaffMember,
} from '@/lib/pos/types';
import { useAuthStore } from '@/stores/auth-store';
import { usePosStore } from '@/stores/pos-store';
import { canApprovePosShiftStaff } from '@/lib/pos/access';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { boundSelectValue } from '@/lib/ui/select-utils';

const ROLE_LABELS: Record<PosShiftMemberRole, string> = {
  PIC: 'PIC Syif',
  JUALAN: 'Staf Jualan',
  PEMBANTU: 'Pembantu',
  GANTI: 'Staf Ganti',
};

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('ms-MY', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function durationText(startedAt: string, endedAt?: string | null) {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '-';
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours <= 0) return `${remain} min`;
  return `${hours}j ${remain}m`;
}

function staffOptionValue(staff: PosShiftAvailableStaff) {
  if (staff.profile_id) return `profile:${staff.profile_id}`;
  if (staff.staff_id) return `staff:${staff.staff_id}`;
  return `staff-name:${staff.full_name}`;
}

function staffOptionLabel(staff: PosShiftAvailableStaff) {
  return `${staff.staff_code ? `${staff.staff_code} - ` : ''}${staff.full_name}`;
}

function roleVariant(role: PosShiftMemberRole): 'default' | 'secondary' | 'outline' {
  if (role === 'PIC') return 'default';
  if (role === 'GANTI') return 'secondary';
  return 'outline';
}

function isOpenMember(member: PosShiftStaffMember) {
  return member.status === 'ACTIVE' || member.status === 'PENDING_APPROVAL';
}

export function ShiftMembersPanel() {
  const profile = useAuthStore((s) => s.profile);
  const branchId = usePosStore((s) => s.branchId);
  const shift = usePosStore((s) => s.shift);

  const [members, setMembers] = useState<PosShiftStaffMember[]>([]);
  const [availableStaff, setAvailableStaff] = useState<PosShiftAvailableStaff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [role, setRole] = useState<PosShiftMemberRole>('JUALAN');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const canApprove = canApprovePosShiftStaff(profile?.role);

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === 'ACTIVE'),
    [members]
  );
  const pendingMembers = useMemo(
    () => members.filter((member) => member.status === 'PENDING_APPROVAL'),
    [members]
  );
  const endedMembers = useMemo(
    () => members.filter((member) => member.status === 'ENDED').slice(-6).reverse(),
    [members]
  );
  const openProfileIds = useMemo(
    () => new Set(members.filter(isOpenMember).map((member) => member.profile_id).filter(Boolean)),
    [members]
  );
  const openStaffIds = useMemo(
    () => new Set(members.filter(isOpenMember).map((member) => member.staff_id).filter(Boolean)),
    [members]
  );
  const currentUserRegistered = members.some(
    (member) => isOpenMember(member) && member.profile_id === profile?.id
  );

  const selectableStaff = useMemo(
    () =>
      availableStaff.filter((staff) => {
        if (staff.profile_id && openProfileIds.has(staff.profile_id)) return false;
        if (staff.staff_id && openStaffIds.has(staff.staff_id)) return false;
        return true;
      }),
    [availableStaff, openProfileIds, openStaffIds]
  );

  const selectedStaffRecord = useMemo(
    () => selectableStaff.find((staff) => staffOptionValue(staff) === selectedStaff) ?? null,
    [selectableStaff, selectedStaff]
  );
  const selectableStaffValues = useMemo(
    () => selectableStaff.map((staff) => staffOptionValue(staff)),
    [selectableStaff]
  );
  const safeSelectedStaffValue = boundSelectValue(selectedStaff, selectableStaffValues) ?? '';
  const selectedStaffLabel = selectedStaffRecord ? staffOptionLabel(selectedStaffRecord) : '';
  const currentStaffRecord = useMemo(
    () => availableStaff.find((staff) => staff.profile_id === profile?.id) ?? null,
    [availableStaff, profile?.id]
  );

  const loadMembers = useCallback(async () => {
    if (!branchId || !shift?.id) return;
    setIsLoading(true);
    try {
      const res = await fetchShiftMembers(branchId, shift.id);
      setMembers(res.members ?? []);
      setAvailableStaff(res.availableStaff ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuatkan staf syif');
    } finally {
      setIsLoading(false);
    }
  }, [branchId, shift?.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (selectedStaff && selectableStaff.some((staff) => staffOptionValue(staff) === selectedStaff)) {
      return;
    }
    setSelectedStaff(selectableStaff[0] ? staffOptionValue(selectableStaff[0]) : '');
  }, [selectableStaff, selectedStaff]);

  function showJoinToast(res: { alreadyActive?: boolean; requiresApproval?: boolean }) {
    if (res.alreadyActive) {
      toast.info('Staf ini sudah aktif dalam syif');
      return;
    }
    if (res.requiresApproval) {
      toast.success('Permohonan staf masuk syif dihantar untuk kelulusan AM/ke atas');
      return;
    }
    toast.success('Staf disahkan sebagai rekod rasmi syif POS');
  }

  async function joinCurrentUser() {
    if (!branchId || !shift?.id || !profile || !currentStaffRecord) return;
    setIsSaving(true);
    try {
      const res = await joinPosShiftMember({
        branch_id: branchId,
        shift_id: shift.id,
        profile_id: profile.id,
        staff_id: currentStaffRecord.staff_id,
        role_in_shift: activeMembers.length ? 'JUALAN' : 'PIC',
      });
      showJoinToast(res);
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal rekod masuk syif');
    } finally {
      setIsSaving(false);
    }
  }

  async function joinSelectedStaff() {
    if (!branchId || !shift?.id) return;
    const selected = selectedStaffRecord;

    if (!selected) {
      toast.error('Pilih staf aktif yang ditetapkan di cawangan ini');
      return;
    }

    setIsSaving(true);
    try {
      const res = await joinPosShiftMember({
        branch_id: branchId,
        shift_id: shift.id,
        profile_id: selected.profile_id,
        staff_id: selected.staff_id,
        role_in_shift: role,
      });
      showJoinToast(res);
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal tambah staf syif');
    } finally {
      setIsSaving(false);
    }
  }

  async function approveMember(member: PosShiftStaffMember) {
    setIsSaving(true);
    try {
      await approvePosShiftMember({
        member_id: member.id,
        notes: 'Disahkan melalui panel Staf Dalam Syif POS.',
      });
      toast.success(`${member.full_name} disahkan sebagai staf syif POS`);
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal sahkan staf syif');
    } finally {
      setIsSaving(false);
    }
  }

  async function rejectMember(member: PosShiftStaffMember) {
    setIsSaving(true);
    try {
      await rejectPosShiftMember({
        member_id: member.id,
        notes: 'Ditolak melalui panel Staf Dalam Syif POS.',
      });
      toast.success(`Permohonan ${member.full_name} ditolak`);
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal tolak staf syif');
    } finally {
      setIsSaving(false);
    }
  }

  async function endMember(member: PosShiftStaffMember) {
    setIsSaving(true);
    try {
      await endPosShiftMember({
        member_id: member.id,
        ended_at: new Date().toISOString(),
      });
      toast.success(`Tamat tugas direkod untuk ${member.full_name}`);
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal tamatkan tugas staf');
    } finally {
      setIsSaving(false);
    }
  }

  if (!shift) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Buka syif POS dahulu sebelum rekod staf bertugas.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4" />
            Staf Dalam Syif
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant={activeMembers.length ? 'secondary' : 'destructive'}>
              {activeMembers.length} aktif
            </Badge>
            {pendingMembers.length > 0 && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                {pendingMembers.length} tunggu kelulusan
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Tambah staf cawangan masuk syif
              </p>
              <Select
                value={safeSelectedStaffValue}
                onValueChange={(value) => setSelectedStaff(String(value ?? ''))}
                disabled={!selectableStaff.length}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue>
                    {safeSelectedStaffValue
                      ? selectedStaffLabel
                      : selectableStaff.length
                        ? 'Pilih staf cawangan'
                        : 'Tiada staf cawangan tersedia'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {selectableStaff.map((staff) => (
                    <SelectItem key={staffOptionValue(staff)} value={staffOptionValue(staff)}>
                      {staffOptionLabel(staff)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Peranan</p>
              <Select value={role} onValueChange={(value) => setRole((value as PosShiftMemberRole) ?? 'JUALAN')}>
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue>{ROLE_LABELS[role]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={joinSelectedStaff} disabled={isSaving || !selectedStaffRecord}>
              <UserPlus className="h-4 w-4" />
              Tambah
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Hanya staf aktif yang ditetapkan di cawangan ini boleh direkod. Jika dibuat oleh staf biasa, rekod akan menunggu kelulusan AM/ke atas sebelum sah dalam POS.
          </p>
          {profile && currentStaffRecord && !currentUserRegistered && (
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={joinCurrentUser}
              disabled={isSaving}
            >
              <UserCheck className="h-4 w-4" />
              Rekod saya mula bertugas
            </Button>
          )}
          {profile && !currentStaffRecord && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
              Akaun anda tidak dipautkan sebagai staf cawangan ini. Pentadbir Utama masih boleh urus syif, tetapi rekod staf rasmi mesti dipilih daripada staf cawangan.
            </div>
          )}
        </div>

        {pendingMembers.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <ShieldCheck className="h-4 w-4" />
              Menunggu kelulusan AM / OM / Admin
            </p>
            {pendingMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950"
              >
                <div className="min-w-[220px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{member.full_name}</p>
                    <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
                      {ROLE_LABELS[member.role_in_shift]}
                    </Badge>
                    <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
                      Belum rasmi
                    </Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                    <Clock3 className="h-3.5 w-3.5" />
                    Mohon {formatTime(member.started_at)} - perlu disahkan sebelum masuk rekod POS rasmi
                  </p>
                </div>
                {canApprove ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => approveMember(member)}
                      disabled={isSaving}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Sahkan
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => rejectMember(member)}
                      disabled={isSaving}
                    >
                      <XCircle className="h-4 w-4" />
                      Tolak
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs font-medium text-amber-700">
                    Menunggu AM/ke atas
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Memuatkan staf syif...</p>
          ) : activeMembers.length ? (
            activeMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3"
              >
                <div className="min-w-[220px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{member.full_name}</p>
                    <Badge variant={roleVariant(member.role_in_shift)}>
                      {ROLE_LABELS[member.role_in_shift]}
                    </Badge>
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Sah POS
                    </Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    Mula {formatTime(member.started_at)} - {durationText(member.started_at)}
                    {member.approved_at ? ` - disahkan ${formatTime(member.approved_at)}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => endMember(member)}
                  disabled={isSaving}
                >
                  <LogOut className="h-4 w-4" />
                  Tamat tugas
                </Button>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Tiada staf rasmi aktif dalam syif. Rekod staf cawangan dan dapatkan kelulusan AM/ke atas supaya masa kerja dan payroll tepat.
            </div>
          )}
        </div>

        {endedMembers.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tamat tugas terbaru
            </p>
            {endedMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span>{member.full_name}</span>
                <span className="text-muted-foreground">
                  {formatTime(member.started_at)} - {formatTime(member.ended_at)} ({durationText(member.started_at, member.ended_at)})
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
