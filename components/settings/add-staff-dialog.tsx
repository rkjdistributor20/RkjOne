'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  Calculator,
  Globe,
  Home,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { fetchPayrollRules } from '@/lib/payroll/api';
import { createStaffMember } from '@/lib/settings/api';
import {
  computeForeignWeeklyPay,
  computeLocalMonthlyPay,
  DEFAULT_SHIFTS_PER_WEEK,
  formatPayAmount,
  getForeignShiftTiers,
} from '@/lib/payroll/staff-pay-rates';
import type { PayrollRule, WorkerType } from '@/lib/payroll/types';
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
import { StaffCredentialsCard } from '@/components/settings/staff-credentials-card';
import { cn } from '@/lib/utils';

const WEEKDAY_PRESETS = [5, 6, 7] as const;

export type AddStaffBranchOption = {
  id: string;
  branch_code: string;
  branch_name: string;
  region_name: string;
};

interface AddStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: AddStaffBranchOption[];
  existingStaffCodes: string[];
  defaultBranchId?: string;
  onSuccess: () => Promise<void>;
}

function suggestNextStaffCode(codes: string[]): string {
  let max = 0;
  for (const code of codes) {
    const match = /^S(\d+)$/i.exec(code.trim());
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `S${String(max + 1).padStart(3, '0')}`;
}

function resolveDefaultBranch(
  branches: AddStaffBranchOption[],
  preferredId?: string
): string {
  if (preferredId && branches.some((b) => b.id === preferredId)) return preferredId;
  if (branches.length === 1) return branches[0].id;
  return '';
}

export function AddStaffDialog({
  open,
  onOpenChange,
  branches,
  existingStaffCodes,
  defaultBranchId,
  onSuccess,
}: AddStaffDialogProps) {
  const [staffCode, setStaffCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [workerType, setWorkerType] = useState<WorkerType>('FOREIGN');
  const [shiftHours, setShiftHours] = useState('');
  const [shiftsPerWeek, setShiftsPerWeek] = useState(String(DEFAULT_SHIFTS_PER_WEEK));
  const [payrollRules, setPayrollRules] = useState<PayrollRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    code: string;
    email: string;
    password: string;
  } | null>(null);

  const foreignTiers = useMemo(
    () => getForeignShiftTiers(payrollRules),
    [payrollRules]
  );

  const localPay = useMemo(
    () => computeLocalMonthlyPay(payrollRules),
    [payrollRules]
  );

  const foreignPay = useMemo(() => {
    const hours = Number(shiftHours);
    const days = Number(shiftsPerWeek);
    if (!Number.isFinite(hours) || hours <= 0) return null;
    if (!Number.isFinite(days) || days <= 0) return null;
    return computeForeignWeeklyPay(payrollRules, hours, days);
  }, [payrollRules, shiftHours, shiftsPerWeek]);

  const codeTaken = useMemo(
    () => existingStaffCodes.some((c) => c.toUpperCase() === staffCode.trim().toUpperCase()),
    [existingStaffCodes, staffCode]
  );

  const codeValid = /^S\d{2,}$/i.test(staffCode.trim());
  const nameValid = fullName.trim().length >= 2;
  const branchValid = Boolean(branchId);
  const shiftValid = workerType !== 'FOREIGN' || Boolean(shiftHours);
  const daysNum = Number(shiftsPerWeek);
  const daysValid =
    workerType !== 'FOREIGN' ||
    (Number.isFinite(daysNum) && daysNum >= 1 && daysNum <= 7);

  const canSubmit =
    codeValid &&
    !codeTaken &&
    nameValid &&
    branchValid &&
    shiftValid &&
    daysValid &&
    !saving &&
    !rulesLoading;

  function resetForm() {
    setStaffCode('');
    setFullName('');
    setBranchId('');
    setWorkerType('FOREIGN');
    setShiftHours('');
    setShiftsPerWeek(String(DEFAULT_SHIFTS_PER_WEEK));
  }

  useEffect(() => {
    if (!open) return;

    setStaffCode(suggestNextStaffCode(existingStaffCodes));
    setBranchId(resolveDefaultBranch(branches, defaultBranchId));
    setWorkerType('FOREIGN');
    setShiftsPerWeek(String(DEFAULT_SHIFTS_PER_WEEK));

    setRulesLoading(true);
    fetchPayrollRules()
      .then(({ rules }) => {
        setPayrollRules(rules);
        const tiers = getForeignShiftTiers(rules);
        if (tiers.length > 0) {
          setShiftHours(String(tiers.find((t) => t.shift_hours === 9)?.shift_hours ?? tiers[0].shift_hours));
        }
      })
      .catch(() => toast.error('Gagal muat kadar gaji'))
      .finally(() => setRulesLoading(false));
  }, [open, branches, defaultBranchId, existingStaffCodes]);

  async function handleSubmit() {
    if (!canSubmit) return;

    setSaving(true);
    try {
      const res = await createStaffMember({
        staff_code: staffCode.trim(),
        full_name: fullName.trim(),
        branch_id: branchId,
        worker_type: workerType,
        ...(workerType === 'FOREIGN'
          ? {
              shift_hours: Number(shiftHours),
              shifts_per_week: Number(shiftsPerWeek) || DEFAULT_SHIFTS_PER_WEEK,
            }
          : {}),
      });
      if (res.portal) {
        setCreatedCredentials({
          name: fullName.trim(),
          code: staffCode.trim(),
          email: res.portal.login_email,
          password: res.portal.portal_password,
        });
      }
      toast.success(`Staf ${fullName.trim()} (${staffCode.trim()}) berjaya didaftarkan`);
      onOpenChange(false);
      resetForm();
      await onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal tambah staf');
    } finally {
      setSaving(false);
    }
  }

  const selectedBranch = branches.find((b) => b.id === branchId);

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="space-y-1 border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-amber-600" />
            Tambah Staf Kiosk
          </DialogTitle>
          <DialogDescription>
            Daftar staf baharu ke cawangan kiosk. Gaji dikira automatik ikut kadar
            payroll yang ditetapkan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          {/* 1 — Maklumat asas */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
                1
              </span>
              <h3 className="text-sm font-semibold">Maklumat Staf</h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="staff-code">Kod Staf</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    onClick={() => setStaffCode(suggestNextStaffCode(existingStaffCodes))}
                  >
                    <Sparkles className="h-3 w-3" />
                    Cadangan
                  </Button>
                </div>
                <Input
                  id="staff-code"
                  placeholder="S058"
                  value={staffCode}
                  onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
                  className={cn(codeTaken && 'border-destructive')}
                />
                {codeTaken ? (
                  <p className="text-xs text-destructive">Kod staf sudah wujud</p>
                ) : staffCode && !codeValid ? (
                  <p className="text-xs text-muted-foreground">Format: S + nombor (cth S058)</p>
                ) : null}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="full-name">Nama Penuh</Label>
                <Input
                  id="full-name"
                  placeholder="Nama seperti dalam rekod"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* 2 — Penempatan */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
                2
              </span>
              <h3 className="text-sm font-semibold">Penempatan Cawangan</h3>
            </div>

            <div className="space-y-1.5">
              <Label>Cawangan Kiosk</Label>
              <Select value={branchId} onValueChange={(v) => v && setBranchId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih cawangan" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.branch_code} — {b.branch_name} ({b.region_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBranch && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  Kawasan: {selectedBranch.region_name}
                </p>
              )}
            </div>
          </section>

          <Separator />

          {/* 3 — Jenis & gaji */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
                3
              </span>
              <h3 className="text-sm font-semibold">Jenis Staf &amp; Kadar Gaji</h3>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWorkerType('FOREIGN')}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  workerType === 'FOREIGN'
                    ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-400'
                    : 'border-border hover:bg-muted/50'
                )}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium">Pekerja Asing</span>
                </div>
                <p className="text-xs text-muted-foreground">Gaji mingguan · ikut shift</p>
                <Badge
                  variant="outline"
                  className="mt-2 border-orange-200 bg-orange-100/80 text-[10px] font-normal text-orange-900"
                >
                  Lalai kiosk
                </Badge>
              </button>

              <button
                type="button"
                onClick={() => setWorkerType('LOCAL')}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  workerType === 'LOCAL'
                    ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-400'
                    : 'border-border hover:bg-muted/50'
                )}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <Home className="h-4 w-4 text-sky-600" />
                  <span className="text-sm font-medium">Staf Tempatan</span>
                </div>
                <p className="text-xs text-muted-foreground">Gaji bulanan + elaun</p>
              </button>
            </div>

            {workerType === 'FOREIGN' && (
              <div className="space-y-3 rounded-lg border border-orange-100 bg-orange-50/40 p-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Kadar shift (pilih satu)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {foreignTiers.map((tier) => {
                      const hours = String(tier.shift_hours);
                      const selected = shiftHours === hours;
                      return (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => setShiftHours(hours)}
                          className={cn(
                            'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                            selected
                              ? 'border-orange-400 bg-white font-medium shadow-sm'
                              : 'border-orange-100 bg-white/60 hover:bg-white'
                          )}
                        >
                          <span className="block text-xs text-muted-foreground">
                            {tier.shift_hours} jam
                          </span>
                          <span className="tabular-nums">
                            {formatPayAmount(tier.rate ?? 0)}/shift
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Hari bekerja seminggu</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {WEEKDAY_PRESETS.map((n) => (
                      <Button
                        key={n}
                        type="button"
                        size="sm"
                        variant={Number(shiftsPerWeek) === n ? 'default' : 'outline'}
                        className={cn(
                          Number(shiftsPerWeek) === n &&
                            'bg-orange-500 hover:bg-orange-600'
                        )}
                        onClick={() => setShiftsPerWeek(String(n))}
                      >
                        {n} hari
                      </Button>
                    ))}
                    <Input
                      type="number"
                      min={1}
                      max={7}
                      className="h-8 w-16"
                      value={shiftsPerWeek}
                      onChange={(e) => setShiftsPerWeek(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Ringkasan gaji */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Calculator className="h-4 w-4 text-primary" />
                Anggaran Gaji
              </div>
              {rulesLoading ? (
                <p className="text-sm text-muted-foreground">Memuat kadar payroll…</p>
              ) : workerType === 'LOCAL' ? (
                <div className="space-y-1 text-sm">
                  {localPay.breakdown.map((row) => (
                    <div
                      key={row.component}
                      className="flex justify-between text-muted-foreground"
                    >
                      <span>{row.component}</span>
                      <span className="tabular-nums">{formatPayAmount(row.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Jumlah bulanan</span>
                    <span className="tabular-nums text-sky-700">
                      {formatPayAmount(localPay.total)}
                    </span>
                  </div>
                </div>
              ) : foreignPay ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{foreignPay.component}</span>
                    <span className="tabular-nums">
                      {formatPayAmount(foreignPay.perShift)}/shift
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>× {foreignPay.shiftsPerWeek} hari/minggu</span>
                    <span className="tabular-nums">{formatPayAmount(foreignPay.weekly)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Jumlah mingguan</span>
                    <span className="tabular-nums text-orange-700">
                      {formatPayAmount(foreignPay.weekly)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pilih kadar shift untuk lihat anggaran gaji
                </p>
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            className="bg-amber-500 hover:bg-amber-600"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {saving ? 'Menyimpan…' : 'Daftar Staf'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={Boolean(createdCredentials)}
      onOpenChange={(open) => !open && setCreatedCredentials(null)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Akaun Login Staf Dicipta</DialogTitle>
          <DialogDescription>
            {createdCredentials?.name} ({createdCredentials?.code}) — kongsi kredensial ini
            kepada staf. Mesti tukar kata laluan pada log masuk pertama.
          </DialogDescription>
        </DialogHeader>
        {createdCredentials && (
          <StaffCredentialsCard
            loginEmail={createdCredentials.email}
            password={createdCredentials.password}
            mustChangePassword
            compact
          />
        )}
        <DialogFooter>
          <Button onClick={() => setCreatedCredentials(null)}>Faham</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
