'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Pencil, RefreshCw, UserCog } from 'lucide-react';
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

const COMPANY_HQ_BRANCH_VALUE = '__COMPANY_HQ__';

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
 DEFAULT_SALES_LEGAL_ENTITY_CODE);
 const [status, setStatus] = useState('ACTIVE');
 const [workerType, setWorkerType] = useState<WorkerType>('FOREIGN');
 const [shiftHours, setShiftHours] = useState('');
 const [shiftsPerWeek, setShiftsPerWeek] = useState(String(DEFAULT_SHIFTS_PER_WEEK));
 const [bankName, setBankName] = useState('');
 const [accountNumber, setAccountNumber] = useState('');
 const [accountHolder, setAccountHolder] = useState('');
 const [remarks, setRemarks] = useState('');
 const [monthlyAmount, setMonthlyAmount] = useState('');
 const [weeklyAmount, setWeeklyAmount] = useState('');

 const [portalEmail, setPortalEmail] = useState<string | null>(null);
 const [portalPassword, setPortalPassword] = useState<string | null>(null);
 const [mustChangePassword, setMustChangePassword] = useState(false);
 const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
 const [hasPortal, setHasPortal] = useState(false);

 const [payrollRules, setPayrollRules] = useState<PayrollRule[]>([]);

 const foreignTiers = useMemo(
 () => getForeignShiftTiers(payrollRules),
 [payrollRules]);

 useEffect(() => {
 if (!open || !staffId) return;

 setLoading(true);
 Promise.all([fetchStaffDetail(staffId), fetchPayrollRules()]).then(([detail, rulesRes]) => {
 const s = detail.staff;
 const entityCode =
 (s.legal_entity?.code as LegalEntityCode | undefined) ?? DEFAULT_SALES_LEGAL_ENTITY_CODE;
 setStaffCode(s.staff_code);
 setFullName(s.full_name);
 setBranchId(entityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE ? s.branch_id ?? '' : COMPANY_HQ_BRANCH_VALUE);
 setLegalEntityCode(entityCode);
 setStatus(s.status);
 setWorkerType(s.worker_type ?? 'FOREIGN');
 setShiftHours(s.shift_hours != null ? String(s.shift_hours) : '');
 setShiftsPerWeek(
 s.shifts_per_week != null ? String(s.shifts_per_week) : String(DEFAULT_SHIFTS_PER_WEEK));
 setMonthlyAmount(s.monthly_amount != null ? String(s.monthly_amount) : '');
 setWeeklyAmount(s.weekly_amount != null ? String(s.weekly_amount) : '');
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
 }).catch((err) => {
 toast.error(err instanceof Error ? err.message : 'Gagal muat staf');
 onOpenChange(false);
 }).finally(() => setLoading(false));
 }, [open, staffId, onOpenChange]);

 async function handleSave() {
 if (!staffId) return;
 const useRkjDefaultPay = legalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE;
 const monthly = Number(monthlyAmount);
 const weekly = Number(weeklyAmount);

 if (!useRkjDefaultPay && workerType === 'LOCAL' && (!Number.isFinite(monthly) || monthly <= 0)) {
 toast.error('Masukkan kadar gaji bulanan untuk staf syarikat ini');
 return;
 }

 if (!useRkjDefaultPay && workerType === 'FOREIGN' && (!Number.isFinite(weekly) || weekly <= 0)) {
 toast.error('Masukkan kadar gaji mingguan untuk staf syarikat ini');
 return;
 }

 if (useRkjDefaultPay && workerType === 'FOREIGN') {
 const hours = Number(shiftHours);
 if (!Number.isFinite(hours) || hours <= 0) {
 toast.error('Pilih kadar shift pekerja asing RKJ');
 return;
 }
 }

 setSaving(true);
 try {
 const payload: Record<string, unknown> = {
 full_name: fullName.trim(),
 branch_id: branchId === COMPANY_HQ_BRANCH_VALUE ? null : branchId,
 legal_entity_code: legalEntityCode,
 status,
 worker_type: workerType,
 bank_name: bankName || null,
 account_number: accountNumber || null,
 account_holder: accountHolder || null,
 remarks: remarks || null,
 };

 if (!useRkjDefaultPay && workerType === 'LOCAL') {
 payload.monthly_amount = monthly;
 }

 if (!useRkjDefaultPay && workerType === 'FOREIGN') {
 payload.weekly_amount = weekly;
 }

 if (workerType === 'FOREIGN') {
 if (useRkjDefaultPay || shiftHours.trim()) {
 payload.shift_hours = Number(shiftHours);
 }
 payload.shifts_per_week = Number(shiftsPerWeek) || DEFAULT_SHIFTS_PER_WEEK;
 }

 const res = await updateStaffMember(staffId, payload);
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
 const useRkjDefaultPay = legalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE;
 const isKioskEmployer = useRkjDefaultPay;
 const selectedLegalEntity = LEGAL_ENTITIES.find((entity) => entity.code === legalEntityCode);

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
 <DialogHeader className="border-b px-6 py-5">
 <DialogTitle className="flex items-center gap-2">
 <UserCog className="h-5 w-5 text-primary" />
 Edit Staf - {staffCode || '...'}
 </DialogTitle>
 <DialogDescription>
 Kemaskini maklumat staf kiosk dalam skop cawangan anda. Lihat dan kongsi kredensial
 log masuk.
 </DialogDescription>
 </DialogHeader>

 {loading ? (
 <p className="px-6 py-8 text-sm text-muted-foreground">Memuatkan...</p>) : (
 <div className="space-y-5 px-6 py-5">
 {hasPortal && portalEmail && portalPassword ? (
 <StaffCredentialsCard
 loginEmail={portalEmail}
 password={portalPassword}
 mustChangePassword={mustChangePassword}
 lastLoginAt={lastLoginAt}
 />) : (
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
 </div>)}

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
 </Button>)}

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
 {isKioskEmployer ? (
 <div className="space-y-1.5 sm:col-span-2">
 <Label>{isKioskEmployer ? 'Cawangan' : 'Lokasi / Cawangan (opsyenal)'}</Label>
 <Select value={branchId} onValueChange={(v) => v && setBranchId(v)}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {branches.map((b) => (
 <SelectItem key={b.id} value={b.id}>
 {b.branch_code} - {b.branch_name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>) : (
 <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground sm:col-span-2">
 <Building2 className="mr-1.5 inline h-3.5 w-3.5" />
 Staf syarikat/HQ - tiada cawangan kiosk diperlukan.
 </div>)}
 <div className="space-y-1.5 sm:col-span-2">
 <Label>Syarikat Majikan</Label>
 <Select
 value={legalEntityCode}
 onValueChange={(v) => {
 if (!v) return;
 const next = v as LegalEntityCode;
 const wasRkjDefaultPay = legalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE;
 setLegalEntityCode(next);
 if (next !== DEFAULT_SALES_LEGAL_ENTITY_CODE) {
 setBranchId(COMPANY_HQ_BRANCH_VALUE);
 if (wasRkjDefaultPay) {
 setWorkerType('LOCAL');
 setMonthlyAmount('');
 setWeeklyAmount('');
 }
 } else if (branchId === COMPANY_HQ_BRANCH_VALUE) {
 setBranchId('');
 }
 }}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {LEGAL_ENTITIES.map((entity) => (
 <SelectItem key={entity.code} value={entity.code}>
 {entity.legalName}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 </div>

 <Separator />

 <div className="space-y-3">
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
 </Button>))}
 </div>

 {useRkjDefaultPay ? (
 <p className="text-xs text-muted-foreground">
 Kadar ini menggunakan formula payroll RKJ untuk staf cawangan.
 </p>) : (
 <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3">
 <div className="mb-3 flex items-start justify-between gap-3">
 <div>
 <p className="text-sm font-semibold">Kadar gaji syarikat sendiri</p>
 <p className="text-xs text-muted-foreground">
 Khusus untuk {selectedLegalEntity?.legalName ?? 'syarikat ini'} dan tidak
 menggunakan kadar kiosk RKJ.
 </p>
 </div>
 <Badge variant="outline">Manual</Badge>
 </div>

 {workerType === 'LOCAL' ? (
 <div className="space-y-1.5">
 <Label htmlFor="edit-monthly-amount">Gaji bulanan (RM)</Label>
 <Input
 id="edit-monthly-amount"
 type="number"
 min={0}
 step="0.01"
 placeholder="Contoh: 2500.00"
 value={monthlyAmount}
 onChange={(event) => setMonthlyAmount(event.target.value)}
 />
 </div>) : (
 <div className="grid gap-3 sm:grid-cols-3">
 <div className="space-y-1.5 sm:col-span-3">
 <Label htmlFor="edit-weekly-amount">Gaji mingguan (RM)</Label>
 <Input
 id="edit-weekly-amount"
 type="number"
 min={0}
 step="0.01"
 placeholder="Contoh: 600.00"
 value={weeklyAmount}
 onChange={(event) => setWeeklyAmount(event.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="edit-shift-hours">Jam shift</Label>
 <Input
 id="edit-shift-hours"
 type="number"
 min={0}
 step="0.5"
 placeholder="Opsyenal"
 value={shiftHours}
 onChange={(event) => setShiftHours(event.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="edit-shifts-per-week">Hari/minggu</Label>
 <Input
 id="edit-shifts-per-week"
 type="number"
 min={1}
 max={7}
 value={shiftsPerWeek}
 onChange={(event) => setShiftsPerWeek(event.target.value)}
 />
 </div>
 </div>)}
 </div>)}

 {workerType === 'FOREIGN' && useRkjDefaultPay && (
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
 </Button>))}
 </div>)}

 {foreignPay && useRkjDefaultPay && (
 <Badge variant="outline" className="tabular-nums">
 Anggaran mingguan: {formatPayAmount(foreignPay.weekly)}
 </Badge>)}

 {!useRkjDefaultPay && workerType === 'FOREIGN' && (
 <Badge variant="outline" className="tabular-nums">
 Gaji mingguan: {formatPayAmount(Number(weeklyAmount) || 0)}
 </Badge>)}

 {!useRkjDefaultPay && workerType === 'LOCAL' && (
 <Badge variant="outline" className="tabular-nums">
 Gaji bulanan: {formatPayAmount(Number(monthlyAmount) || 0)}
 </Badge>)}

 {workerType === 'LOCAL' && useRkjDefaultPay && (
 <Badge variant="outline">
 Bulanan:{' '}
 {formatPayAmount(computeLocalMonthlyPay(payrollRules).total)}
 </Badge>)}
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
 </div>)}

 <DialogFooter className="border-t bg-muted/20 px-6 py-4">
 <Button variant="outline" onClick={() => onOpenChange(false)}>
 Tutup
 </Button>
 <Button onClick={handleSave} disabled={saving || loading} className="gap-1">
 <Pencil className="h-4 w-4" />
 {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}
