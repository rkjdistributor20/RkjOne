'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, RefreshCw, UserCog } from 'lucide-react';
import { fetchPayrollRules } from '@/lib/payroll/api';
import {
  fetchStaffDetail,
  resetStaffPortalPassword,
  updateStaffMember,
} from '@/lib/settings/api';
import {
  computeForeignWeeklyPay,
  computeLocalMonthlyPay,
  DEFAULT_SHIFTS_PER_WEEK,
  formatPayAmount,
  getForeignShiftTiers,
} from '@/lib/payroll/staff-pay-rates';
import type { PayrollRule, WorkerType } from '@/lib/payroll/types';
import { StaffCredentialsCard } from '@/components/settings/staff-credentials-card';
import type { AddStaffBranchOption } from '@/components/settings/add-staff-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SALES_LEGAL_ENTITY_CODE,
  LEGAL_ENTITIES,
  type LegalEntityCode,
} from '@/lib/brand/legal-entities';

interface EditStaffDialogProps {
  staffId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: AddStaffBranchOption[];
  onSuccess: () => Promise<void>;
}

export function EditStaffDialog({
  staffId,
  open,
  onOpenChange,
  branches,
  onSuccess,
}: EditStaffDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [staffCode, setStaffCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [legalEntityCode, setLegalEntityCode] = useState<LegalEntityCode>(
    DEFAULT_SALES_LEGAL_ENTITY_CODE
  );
  const [status, setStatus] = useState('ACTIVE');
  const [workerType, setWorkerType] = useState<WorkerType>('FOREIGN');
  const [shiftHours, setShiftHours] = useState('');
  const [shiftsPerWeek, setShiftsPerWeek] = useState(String(DEFAULT_SHIFTS_PER_WEEK));
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [remarks, setRemarks] = useState('');

  const [portalEmail, setPortalEmail] = useState<string | null>(null);
  const [portalPassword, setPortalPassword] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  const [hasPortal, setHasPortal] = useState(false);

  const [payrollRules, setPayrollRules] = useState<PayrollRule[]>([]);

  const foreignTiers = useMemo(
    () => getForeignShiftTiers(payrollRules),
    [payrollRules]
  );

  useEffect(() => {
    if (!open || !staffId) return;

    setLoading(true);
    Promise.all([fetchStaffDetail(staffId), fetchPayrollRules()])
      .then(([detail, rulesRes]) => {
        const s = detail.staff;
        setStaffCode(s.staff_code);
        setFullName(s.full_name);
        setBranchId(s.branch_id);
        setLegalEntityCode(
          (s.legal_entity?.code as LegalEntityCode | undefined) ?? DEFAULT_SALES_LEGAL_ENTITY_CODE
        );
        setStatus(s.status);
        setWorkerType(s.worker_type ?? 'FOREIGN');
        setShiftHours(s.shift_hours != null ? String(s.shift_hours) : '');
        setShiftsPerWeek(
          s.shifts_per_week != null ? String(s.shifts_per_week) : String(DEFAULT_SHIFTS_PER_WEEK)
        );
        setBankName(s.bank_name ?? '');
        setAccountNumber(s.account_number ?? '');
        setAccountHolder(s.account_holder ?? '');
        setRemarks(s.remarks ?? '');
        setPayrollRules(rulesRes.rules);

        if (detail.portal) {
          setHasPortal(true);
          setPortalEmail(detail.portal.login_email);
          setPortalPassword(detail.portal.portal_password);
        } else {
          setHasPortal(false);
          setPortalEmail(null);
          setPortalPassword(null);
        }
        setMustChangePassword(detail.login?.must_change_password ?? false);
        setLastLoginAt(detail.login?.last_login_at ?? null);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Gagal muat staf');
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
  }, [open, staffId, onOpenChange]);

  async function handleSave() {
    if (!staffId) return;
    setSaving(true);
    try {
      const res = await updateStaffMember(staffId, {
        full_name: fullName.trim(),
        branch_id: branchId,
        legal_entity_code: legalEntityCode,
        status,
        worker_type: workerType,
        bank_name: bankName || null,
        account_number: accountNumber || null,
        account_holder: accountHolder || null,
        remarks: remarks || null,
        ...(workerType === 'FOREIGN'
          ? {
              shift_hours: Number(shiftHours),
              shifts_per_week: Number(shiftsPerWeek) || DEFAULT_SHIFTS_PER_WEEK,
            }
          : {}),
      });
      if (res.portal) {
        setPortalEmail(res.portal.login_email);
        setPortalPassword(res.portal.portal_password);
        setHasPortal(true);
      }
      toast.success('Maklumat staf dikemaskini');
      onOpenChange(false);
      await onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal simpan');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePortal() {
    if (!staffId) return;
    setSaving(true);
    try {
      const res = await updateStaffMember(staffId, { create_portal_account: true });
      if (res.portal) {
        setPortalEmail(res.portal.login_email);
        setPortalPassword(res.portal.portal_password);
        setHasPortal(true);
        setMustChangePassword(true);
        toast.success('Akaun login dicipta');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal cipta akaun');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!staffId) return;
    if (!confirm('Reset kata laluan staf? Staf mesti tukar semula pada log masuk seterusnya.')) return;
    setResetting(true);
    try {
      const res = await resetStaffPortalPassword(staffId);
      setPortalEmail(res.portal.login_email);
      setPortalPassword(res.portal.portal_password);
      setMustChangePassword(true);
      toast.success('Kata laluan baharu dijana');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal reset');
    } finally {
      setResetting(false);
    }
  }

  const foreignPay = useMemo(() => {
    if (workerType !== 'FOREIGN') return null;
    const hours = Number(shiftHours);
    const days = Number(shiftsPerWeek);
    if (!Number.isFinite(hours) || hours <= 0) return null;
    return computeForeignWeeklyPay(payrollRules, hours, days);
  }, [payrollRules, workerType, shiftHours, shiftsPerWeek]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Edit Staf — {staffCode || '…'}
          </DialogTitle>
          <DialogDescription>
            Kemaskini maklumat staf kiosk dalam skop cawangan anda. Lihat dan kongsi kredensial
            log masuk.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">Memuatkan…</p>
        ) : (
          <div className="space-y-5 px-6 py-5">
            {hasPortal && portalEmail && portalPassword ? (
              <StaffCredentialsCard
                loginEmail={portalEmail}
                password={portalPassword}
                mustChangePassword={mustChangePassword}
                lastLoginAt={lastLoginAt}
              />
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm">
                <p className="text-muted-foreground">Staf belum ada akaun portal.</p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  onClick={handleCreatePortal}
                  disabled={saving}
                >
                  Cipta Akaun Login
                </Button>
              </div>
            )}

            {hasPortal && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={handleResetPassword}
                disabled={resetting}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', resetting && 'animate-spin')} />
                Jana Kata Laluan Baharu
              </Button>
            )}

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Kod Staf</Label>
                <Input value={staffCode} disabled className="bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Aktif</SelectItem>
                    <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nama Penuh</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Cawangan</Label>
                <Select value={branchId} onValueChange={(v) => v && setBranchId(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.branch_code} — {b.branch_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Syarikat Majikan</Label>
                <Select
                  value={legalEntityCode}
                  onValueChange={(v) => v && setLegalEntityCode(v as LegalEntityCode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_ENTITIES.map((entity) => (
                      <SelectItem key={entity.code} value={entity.code}>
                        {entity.legalName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Jenis Staf</Label>
              <div className="flex gap-2">
                {(['FOREIGN', 'LOCAL'] as WorkerType[]).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={workerType === t ? 'default' : 'outline'}
                    onClick={() => setWorkerType(t)}
                  >
                    {t === 'FOREIGN' ? 'Pekerja Asing' : 'Tempatan'}
                  </Button>
                ))}
              </div>
              {workerType === 'FOREIGN' && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {foreignTiers.map((tier) => (
                    <Button
                      key={tier.id}
                      type="button"
                      size="sm"
                      variant={shiftHours === String(tier.shift_hours) ? 'default' : 'outline'}
                      onClick={() => setShiftHours(String(tier.shift_hours))}
                    >
                      {tier.shift_hours}j
                    </Button>
                  ))}
                </div>
              )}
              {foreignPay && (
                <Badge variant="outline" className="tabular-nums">
                  Anggaran mingguan: {formatPayAmount(foreignPay.weekly)}
                </Badge>
              )}
              {workerType === 'LOCAL' && (
                <Badge variant="outline">
                  Bulanan:{' '}
                  {formatPayAmount(computeLocalMonthlyPay(payrollRules).total)}
                </Badge>
              )}
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>No. Akaun</Label>
                <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Pemegang Akaun</Label>
                <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Catatan</Label>
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="gap-1">
            <Pencil className="h-4 w-4" />
            {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
