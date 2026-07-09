'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
 Building2,
 Calculator,
 BriefcaseBusiness,
 CalendarDays,
 Globe,
 Home,
 Landmark,
 Phone,
 ShieldCheck,
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
import { Textarea } from '@/components/ui/textarea';
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
import {
 DEFAULT_SALES_LEGAL_ENTITY_CODE,
 LEGAL_ENTITIES,
 type LegalEntityCode,
} from '@/lib/brand/legal-entities';
import {
 getCompanyAccessPreview,
 getCompanyRoleLabel,
 getCompanyRoleOptions,
} from '@/lib/auth/role-labels';
import type { UserRole } from '@/types/enums';
import { boundSelectValue } from '@/lib/ui/select-utils';

const WEEKDAY_PRESETS = [5, 6, 7] as const;
const COMPANY_HQ_BRANCH_VALUE = '__COMPANY_HQ__';
const TODAY_ISO = new Date().toISOString().slice(0, 10);

const BRANCH_STAFF_POSITION_PRESETS = [
 {
 id: 'SALES_POS',
 label: 'Staf Jualan / POS',
 jobTitle: 'Staf Jualan / POS',
 department: 'Cawangan / POS',
 workScope: 'Jualan kiosk, buka/tutup POS, layan pelanggan dan jaga kebersihan kaunter.',
 },
 {
 id: 'PIC_BRANCH',
 label: 'PIC Cawangan / Shift Lead',
 jobTitle: 'PIC Cawangan',
 department: 'Operasi Cawangan',
 workScope: 'Pantau syif, susun staf bertugas, semak stok harian, buka/tutup POS dan lapor isu kepada AM.',
 },
 {
 id: 'STOCK_INVENTORY',
 label: 'Pembantu Stok / Inventori',
 jobTitle: 'Pembantu Stok Cawangan',
 department: 'Inventori Kiosk',
 workScope: 'Terima stok, semak baki roti/kaya/plastik, rekod reject dan bantu kira stok sebelum/selepas syif.',
 },
 {
 id: 'OPERATIONS_RUNNER',
 label: 'Runner / Pembantu Operasi',
 jobTitle: 'Runner Cawangan',
 department: 'Operasi Cawangan',
 workScope: 'Bantu operasi harian cawangan, ambil barang kecil, sokong staf POS dan bantu ketika waktu puncak.',
 },
 {
 id: 'CLEANING_SUPPORT',
 label: 'Kebersihan / Sokongan',
 jobTitle: 'Staf Kebersihan Cawangan',
 department: 'Kebersihan',
 workScope: 'Jaga kebersihan kiosk, peralatan, ruang pelanggan dan bantu checklist kebersihan harian.',
 },
] as const;

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
 defaultLegalEntityCode?: LegalEntityCode;
 isAreaManagerMode?: boolean;
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
 preferredId?: string): string {
 if (preferredId && branches.some((b) => b.id === preferredId)) return preferredId;
 if (branches.length === 1) return branches[0].id;
 return '';
}

function staffTemplateForCompany(code: LegalEntityCode, role: UserRole) {
 if (code === 'RKJ_DIST') {
 if (role === 'DRIVER') {
 return {
 jobTitle: 'Pemandu Distributor',
 department: 'Logistik',
 workScope: 'Penghantaran stok ke cawangan dan pickup point agent mengikut route harian.',
 };
 }
 if (role === 'AREA_MANAGER') {
 return {
 jobTitle: 'Pengurus Kawasan',
 department: 'Operasi Cawangan',
 workScope: 'Pantau cawangan cover, stok, syif, POS dan isu operasi kawasan.',
 };
 }
 if (role === 'MAINTENANCE_MANAGER') {
 return {
 jobTitle: 'Manager Maintenance',
 department: 'Maintenance',
 workScope: 'Terima laporan maintenance, atur tindakan pembaikan dan sokongan staf ganti.',
 };
 }
 return {
 jobTitle: getCompanyRoleLabel(role, code),
 department: 'HQ Distributor',
 workScope: 'Tugasan HQ, logistik, agent, inventory atau pentadbiran mengikut akses yang diberi.',
 };
 }

 if (code === 'RKJ_MFG') {
 if (role === 'OPERATION_MANAGER') {
 return {
 jobTitle: 'Pengurus Operasi Kilang',
 department: 'Production',
 workScope: 'Urus perancangan production, order kilang, stok bahan mentah dan laporan kilang.',
 };
 }
 if (role === 'CEO_FACTORY') {
 return {
 jobTitle: 'CEO Kilang / Pengeluaran',
 department: 'Pengurusan Kilang',
 workScope: 'Pantau prestasi kilang, kapasiti production, bahan mentah dan kelulusan operasi.',
 };
 }
 return {
 jobTitle: getCompanyRoleLabel(role, code),
 department: 'Kilang',
 workScope: 'Tugasan production, packing, QC, stor bahan mentah atau sokongan kilang.',
 };
 }

 if (role === 'OPERATION_MANAGER') {
 return {
 jobTitle: 'Pengurus Operasi Roti Kaya Junus',
 department: 'Operasi Cawangan',
 workScope: 'Pantau cawangan, POS, syif, inventori dan laporan operasi kiosk.',
 };
 }
 return {
 jobTitle: getCompanyRoleLabel(role, code),
 department: 'Cawangan / POS',
 workScope: 'Tugasan cawangan seperti POS, PIC syif, stok, operasi harian atau kebersihan mengikut jawatan.',
 };
}

export function AddStaffDialog({
 open,
 onOpenChange,
 branches,
 existingStaffCodes,
 defaultBranchId,
 defaultLegalEntityCode,
 isAreaManagerMode = false,
 onSuccess,
}: AddStaffDialogProps) {
 const [staffCode, setStaffCode] = useState('');
 const [fullName, setFullName] = useState('');
 const [phone, setPhone] = useState('');
 const [icNumber, setIcNumber] = useState('');
 const [role, setRole] = useState<UserRole>('STAFF');
 const [branchPositionPreset, setBranchPositionPreset] = useState('SALES_POS');
 const [jobTitle, setJobTitle] = useState('');
 const [department, setDepartment] = useState('');
 const [employmentStartDate, setEmploymentStartDate] = useState(TODAY_ISO);
 const [nationality, setNationality] = useState('Malaysia');
 const [branchId, setBranchId] = useState('');
 const [legalEntityCode, setLegalEntityCode] = useState<LegalEntityCode>(
 defaultLegalEntityCode ?? DEFAULT_SALES_LEGAL_ENTITY_CODE);
 const [workerType, setWorkerType] = useState<WorkerType>('FOREIGN');
 const [shiftHours, setShiftHours] = useState('');
 const [shiftsPerWeek, setShiftsPerWeek] = useState(String(DEFAULT_SHIFTS_PER_WEEK));
 const [manualMonthlyAmount, setManualMonthlyAmount] = useState('');
 const [manualWeeklyAmount, setManualWeeklyAmount] = useState('');
 const [bankName, setBankName] = useState('');
 const [accountNumber, setAccountNumber] = useState('');
 const [accountHolder, setAccountHolder] = useState('');
 const [emergencyContactName, setEmergencyContactName] = useState('');
 const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
 const [emergencyContactRelation, setEmergencyContactRelation] = useState('');
 const [workScope, setWorkScope] = useState('');
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
 [payrollRules]);

 const localPay = useMemo(
 () => computeLocalMonthlyPay(payrollRules),
 [payrollRules]);

 const foreignPay = useMemo(() => {
 const hours = Number(shiftHours);
 const days = Number(shiftsPerWeek);
 if (!Number.isFinite(hours) || hours <= 0) return null;
 if (!Number.isFinite(days) || days <= 0) return null;
 return computeForeignWeeklyPay(payrollRules, hours, days);
 }, [payrollRules, shiftHours, shiftsPerWeek]);

 const codeTaken = useMemo(
 () => existingStaffCodes.some((c) => c.toUpperCase() === staffCode.trim().toUpperCase()),
 [existingStaffCodes, staffCode]);
 const availableLegalEntities = useMemo(
 () =>
 isAreaManagerMode
 ? LEGAL_ENTITIES.filter((entity) => entity.code === DEFAULT_SALES_LEGAL_ENTITY_CODE)
 : LEGAL_ENTITIES,
 [isAreaManagerMode]);
 const roleOptions = useMemo(
 () => {
 const options = getCompanyRoleOptions(legalEntityCode);
 return isAreaManagerMode ? options.filter((option) => option === 'STAFF') : options;
 },
 [isAreaManagerMode, legalEntityCode]);
 const accessPreview = useMemo(
 () => getCompanyAccessPreview(role, legalEntityCode),
 [legalEntityCode, role]);

 const isKioskEmployer = legalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE;
 const useRkjDefaultPay = legalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE;
 const branchSelectValues = useMemo(() => branches.map((branch) => branch.id), [branches]);
 const safeBranchId = isKioskEmployer
 ? boundSelectValue(branchId, branchSelectValues) ?? ''
 : COMPANY_HQ_BRANCH_VALUE;
 const codeValid = /^S\d{2,}$/i.test(staffCode.trim());
 const nameValid = fullName.trim().length >= 2;
 const phoneValid = phone.replace(/\D/g, '').length >= 9;
 const idValid = icNumber.trim().length >= 6;
 const jobValid = jobTitle.trim().length >= 2 && department.trim().length >= 2;
 const branchValid = !isKioskEmployer || Boolean(safeBranchId);
 const manualMonthlyValid =
 useRkjDefaultPay || workerType !== 'LOCAL' || Number(manualMonthlyAmount) > 0;
 const manualWeeklyValid =
 useRkjDefaultPay || workerType !== 'FOREIGN' || Number(manualWeeklyAmount) > 0;
 const shiftValid = workerType !== 'FOREIGN' || !useRkjDefaultPay || Boolean(shiftHours);
 const daysNum = Number(shiftsPerWeek);
 const daysValid =
 workerType !== 'FOREIGN' ||
 (Number.isFinite(daysNum) && daysNum >= 1 && daysNum <= 7);

 const canSubmit =
 codeValid &&
 !codeTaken &&
 nameValid &&
 phoneValid &&
 idValid &&
 jobValid &&
 roleOptions.includes(role) &&
 branchValid &&
 shiftValid &&
 daysValid &&
 manualMonthlyValid &&
 manualWeeklyValid &&
 !saving &&
 !rulesLoading;

 function applyBranchPositionPreset(presetId: string) {
 const preset =
 BRANCH_STAFF_POSITION_PRESETS.find((item) => item.id === presetId) ??
 BRANCH_STAFF_POSITION_PRESETS[0];
 setBranchPositionPreset(preset.id);
 setJobTitle(preset.jobTitle);
 setDepartment(preset.department);
 setWorkScope(preset.workScope);
 }

 function resetForm() {
 setStaffCode('');
 setFullName('');
 setPhone('');
 setIcNumber('');
 setRole('STAFF');
 setBranchPositionPreset('SALES_POS');
 setJobTitle('');
 setDepartment('');
 setEmploymentStartDate(TODAY_ISO);
 setNationality('Malaysia');
 setBranchId('');
 setLegalEntityCode(defaultLegalEntityCode ?? DEFAULT_SALES_LEGAL_ENTITY_CODE);
 setWorkerType('FOREIGN');
 setShiftHours('');
 setShiftsPerWeek(String(DEFAULT_SHIFTS_PER_WEEK));
 setManualMonthlyAmount('');
 setManualWeeklyAmount('');
 setBankName('');
 setAccountNumber('');
 setAccountHolder('');
 setEmergencyContactName('');
 setEmergencyContactPhone('');
 setEmergencyContactRelation('');
 setWorkScope('');
 }

 useEffect(() => {
 if (!open) return;

 setStaffCode(suggestNextStaffCode(existingStaffCodes));
 const nextLegalEntityCode =
 isAreaManagerMode ? DEFAULT_SALES_LEGAL_ENTITY_CODE : defaultLegalEntityCode ?? DEFAULT_SALES_LEGAL_ENTITY_CODE;
 const nextRole: UserRole = 'STAFF';
 setLegalEntityCode(nextLegalEntityCode);
 setRole(nextRole);
 if (nextLegalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE) {
 applyBranchPositionPreset('SALES_POS');
 } else {
 const nextTemplate = staffTemplateForCompany(nextLegalEntityCode, nextRole);
 setJobTitle(nextTemplate.jobTitle);
 setDepartment(nextTemplate.department);
 setWorkScope(nextTemplate.workScope);
 }
 setEmploymentStartDate(TODAY_ISO);
 setNationality('Malaysia');
 setPhone('');
 setIcNumber('');
 setBranchId(
 nextLegalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE
 ? resolveDefaultBranch(branches, defaultBranchId)
 : COMPANY_HQ_BRANCH_VALUE);
 setWorkerType(nextLegalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE ? 'FOREIGN' : 'LOCAL');
 setShiftsPerWeek(String(DEFAULT_SHIFTS_PER_WEEK));
 setManualMonthlyAmount('');
 setManualWeeklyAmount('');
 setBankName('');
 setAccountNumber('');
 setAccountHolder('');
 setEmergencyContactName('');
 setEmergencyContactPhone('');
 setEmergencyContactRelation('');

 setRulesLoading(true);
 fetchPayrollRules().then(({ rules }) => {
 setPayrollRules(rules);
 const tiers = getForeignShiftTiers(rules);
 if (tiers.length > 0) {
 setShiftHours(String(tiers.find((t) => t.shift_hours === 9)?.shift_hours ?? tiers[0].shift_hours));
 }
 }).catch(() => toast.error('Gagal muat kadar gaji')).finally(() => setRulesLoading(false));
 }, [open, branches, defaultBranchId, defaultLegalEntityCode, existingStaffCodes, isAreaManagerMode]);

 useEffect(() => {
 if (!open) return;
 if (legalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE && branchId === COMPANY_HQ_BRANCH_VALUE) {
 setBranchId(resolveDefaultBranch(branches, defaultBranchId));
 }
 if (legalEntityCode !== DEFAULT_SALES_LEGAL_ENTITY_CODE && !branchId) {
 setBranchId(COMPANY_HQ_BRANCH_VALUE);
 }
 }, [branchId, branches, defaultBranchId, legalEntityCode, open]);

 async function handleSubmit() {
 if (!canSubmit) return;

 setSaving(true);
 try {
 const res = await createStaffMember({
 staff_code: staffCode.trim(),
 full_name: fullName.trim(),
 role,
 phone: phone.trim(),
 ic_number: icNumber.trim(),
 nationality: nationality.trim() || null,
 job_title: jobTitle.trim(),
 department: department.trim(),
 employment_start_date: employmentStartDate || null,
 work_scope: workScope.trim() || null,
 bank_name: bankName.trim() || null,
 account_number: accountNumber.trim() || null,
 account_holder: accountHolder.trim() || fullName.trim(),
 emergency_contact_name: emergencyContactName.trim() || null,
 emergency_contact_phone: emergencyContactPhone.trim() || null,
 emergency_contact_relation: emergencyContactRelation.trim() || null,
 remarks: workScope.trim() || null,
 branch_id: safeBranchId === COMPANY_HQ_BRANCH_VALUE ? null : safeBranchId,
 worker_type: workerType,
 legal_entity_code: legalEntityCode,...(!useRkjDefaultPay && workerType === 'LOCAL'
 ? {
 monthly_amount: Number(manualMonthlyAmount),
 }
 : {}),...(!useRkjDefaultPay && workerType === 'FOREIGN'
 ? {
 weekly_amount: Number(manualWeeklyAmount),
 shift_hours: shiftHours ? Number(shiftHours) : undefined,
 shifts_per_week: Number(shiftsPerWeek) || DEFAULT_SHIFTS_PER_WEEK,
 }
 : {}),...(useRkjDefaultPay && workerType === 'FOREIGN'
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

 const selectedBranch =
 safeBranchId === COMPANY_HQ_BRANCH_VALUE ? null : branches.find((b) => b.id === safeBranchId);
 const selectedLegalEntity = LEGAL_ENTITIES.find((entity) => entity.code === legalEntityCode);

 return (
 <>
 <Dialog
 open={open}
 onOpenChange={(next) => {
 onOpenChange(next);
 if (!next) resetForm();
 }}
 >
 <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
 <DialogHeader className="space-y-1 border-b px-6 py-5">
 <DialogTitle className="flex items-center gap-2 text-lg">
 <UserPlus className="h-5 w-5 text-amber-600" />
 Tambah Staf Baharu
 </DialogTitle>
 <DialogDescription>
 Daftar staf baharu mengikut syarikat majikan. Staf cawangan wajib pilih kiosk,
 manakala staf RKJ Distributor dan Manufacturing boleh didaftarkan sebagai staf syarikat/HQ.
 {isAreaManagerMode ? ' AM hanya boleh tambah staf cawangan dalam kawasan sendiri.' : ''}
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-6 px-6 py-5">
 {/* 1 - Maklumat asas */}
 <section className="space-y-3">
 <div className="flex items-center gap-2">
 <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
 1
 </span>
 <h3 className="text-sm font-semibold">Maklumat Staf & Akses Sistem</h3>
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
 <p className="text-xs text-destructive">Kod staf sudah wujud</p>) : staffCode && !codeValid ? (
 <p className="text-xs text-muted-foreground">Format: S + nombor (cth S058)</p>) : null}
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
 <div className="space-y-1.5">
 <Label htmlFor="phone">No. Telefon</Label>
 <Input
 id="phone"
 placeholder="Contoh: 60123456789"
 value={phone}
 onChange={(event) => setPhone(event.target.value)}
 />
 {!phoneValid && phone ? (
 <p className="text-xs text-muted-foreground">Masukkan nombor telefon yang lengkap.</p>) : null}
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="ic-number">No. IC / Passport</Label>
 <Input
 id="ic-number"
 placeholder="IC 12 digit atau passport"
 value={icNumber}
 onChange={(event) => setIcNumber(event.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label>Peranan Sistem</Label>
 <Select
 value={role}
 onValueChange={(value) => {
 if (!value) return;
 const nextRole = value as UserRole;
 setRole(nextRole);
 if (legalEntityCode === DEFAULT_SALES_LEGAL_ENTITY_CODE && nextRole === 'STAFF') {
 applyBranchPositionPreset(branchPositionPreset);
 } else {
 const template = staffTemplateForCompany(legalEntityCode, nextRole);
 setJobTitle(template.jobTitle);
 setDepartment(template.department);
 setWorkScope(template.workScope);
 }
 }}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {roleOptions.map((option) => (
 <SelectItem key={option} value={option}>
 {getCompanyRoleLabel(option, legalEntityCode)}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 {isKioskEmployer && role === 'STAFF' && (
 <div className="space-y-1.5">
 <Label>Jawatan Cawangan</Label>
 <Select
 value={branchPositionPreset}
 onValueChange={(value) => value && applyBranchPositionPreset(value)}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {BRANCH_STAFF_POSITION_PRESETS.map((item) => (
 <SelectItem key={item.id} value={item.id}>
 {item.label}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>)}
 <div className="space-y-1.5">
 <Label htmlFor="employment-start">Tarikh Mula Kerja</Label>
 <Input
 id="employment-start"
 type="date"
 value={employmentStartDate}
 onChange={(event) => setEmploymentStartDate(event.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="job-title">Jawatan HR</Label>
 <Input
 id="job-title"
 value={jobTitle}
 onChange={(event) => setJobTitle(event.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="department">Jabatan / Unit</Label>
 <Input
 id="department"
 value={department}
 onChange={(event) => setDepartment(event.target.value)}
 />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label htmlFor="nationality">Warganegara</Label>
 <Input
 id="nationality"
 value={nationality}
 onChange={(event) => setNationality(event.target.value)}
 />
 </div>
 <div className="rounded-lg border bg-muted/30 p-3 sm:col-span-2">
 <div className="mb-2 flex items-center gap-2 text-sm font-medium">
 <ShieldCheck className="h-4 w-4 text-emerald-600" />
 Dashboard & SOP mengikut akses
 </div>
 <div className="flex flex-wrap gap-1.5">
 {accessPreview.map((item) => (
 <Badge key={item} variant="outline" className="bg-background">
 {item}
 </Badge>))}
 </div>
 </div>
 </div>
 </section>

 <Separator />

 {/* 2 - Penempatan */}
 <section className="space-y-3">
 <div className="flex items-center gap-2">
 <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
 2
 </span>
 <h3 className="text-sm font-semibold">
 {isKioskEmployer ? 'Syarikat Majikan & Penempatan' : 'Syarikat Majikan'}
 </h3>
 </div>

 <div className="space-y-1.5">
 <Label>Syarikat Majikan</Label>
 <Select
 value={legalEntityCode}
 onValueChange={(v) => {
 if (!v) return;
 const next = isAreaManagerMode ? DEFAULT_SALES_LEGAL_ENTITY_CODE : (v as LegalEntityCode);
 const nextRole: UserRole = 'STAFF';
 setLegalEntityCode(next);
 setRole(nextRole);
 if (next === DEFAULT_SALES_LEGAL_ENTITY_CODE) {
 applyBranchPositionPreset(branchPositionPreset);
 } else {
 const template = staffTemplateForCompany(next, nextRole);
 setJobTitle(template.jobTitle);
 setDepartment(template.department);
 setWorkScope(template.workScope);
 }
 if (next !== DEFAULT_SALES_LEGAL_ENTITY_CODE) {
 setBranchId(COMPANY_HQ_BRANCH_VALUE);
 setWorkerType('LOCAL');
 } else if (branchId === COMPANY_HQ_BRANCH_VALUE) {
 setBranchId(resolveDefaultBranch(branches, defaultBranchId));
 setWorkerType('FOREIGN');
 }
 }}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {availableLegalEntities.map((entity) => (
 <SelectItem key={entity.code} value={entity.code}>
 {entity.legalName}
 </SelectItem>))}
 </SelectContent>
 </Select>
 <p className="text-xs text-muted-foreground">
 {isAreaManagerMode
 ? 'AM hanya boleh tambah staf cawangan RKJ dalam kawasan sendiri.'
 : 'Pilih syarikat undang-undang sebenar untuk rekod HR dan payroll.'}
 </p>
 </div>

 {isKioskEmployer ? (
 <div className="space-y-1.5">
 <Label>{isKioskEmployer ? 'Cawangan Kiosk' : 'Lokasi / Cawangan (opsyenal)'}</Label>
 <Select value={safeBranchId} onValueChange={(v) => v && setBranchId(v)}>
 <SelectTrigger>
 <SelectValue placeholder={isKioskEmployer ? 'Pilih cawangan' : 'Pilih lokasi atau HQ'} />
 </SelectTrigger>
 <SelectContent>
 {branches.map((b) => (
 <SelectItem key={b.id} value={b.id}>
 {b.branch_code} - {b.branch_name} ({b.region_name})
 </SelectItem>))}
 </SelectContent>
 </Select>
 {selectedBranch && (
 <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
 <Building2 className="h-3.5 w-3.5" />
 Kawasan: {selectedBranch.region_name}
 </p>)}
 </div>) : (
 <div className="rounded-lg border bg-muted/30 p-3">
 <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
 <Building2 className="h-3.5 w-3.5" />
 Staf {selectedLegalEntity?.legalName ?? 'syarikat'} akan direkod sebagai staf syarikat/HQ. Tiada maklumat cawangan diperlukan.
 </p>
 </div>)}
 </section>

 <Separator />

 {/* 3 - Jenis & gaji */}
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
 : 'border-border hover:bg-muted/50')}
 >
 <div className="mb-1 flex items-center gap-1.5">
 <Globe className="h-4 w-4 text-orange-600" />
 <span className="text-sm font-medium">Pekerja Asing</span>
 </div>
 <p className="text-xs text-muted-foreground">
 {useRkjDefaultPay ? 'Gaji mingguan - ikut shift' : 'Gaji mingguan - kadar sendiri'}
 </p>
 <Badge
 variant="outline"
 className="mt-2 border-orange-200 bg-orange-100/80 text-[10px] font-normal text-orange-900"
 >
 {useRkjDefaultPay ? 'Lalai kiosk' : 'Kadar syarikat sendiri'}
 </Badge>
 </button>

 <button
 type="button"
 onClick={() => setWorkerType('LOCAL')}
 className={cn(
 'rounded-lg border p-3 text-left transition-colors',
 workerType === 'LOCAL'
 ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-400'
 : 'border-border hover:bg-muted/50')}
 >
 <div className="mb-1 flex items-center gap-1.5">
 <Home className="h-4 w-4 text-sky-600" />
 <span className="text-sm font-medium">Staf Tempatan</span>
 </div>
 <p className="text-xs text-muted-foreground">
 {useRkjDefaultPay ? 'Gaji bulanan + elaun' : 'Gaji bulanan - kadar sendiri'}
 </p>
 </button>
 </div>

 {workerType === 'FOREIGN' && useRkjDefaultPay && (
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
 : 'border-orange-100 bg-white/60 hover:bg-white')}
 >
 <span className="block text-xs text-muted-foreground">
 {tier.shift_hours} jam
 </span>
 <span className="tabular-nums">
 {formatPayAmount(tier.rate ?? 0)}/shift
 </span>
 </button>);
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
 'bg-orange-500 hover:bg-orange-600')}
 onClick={() => setShiftsPerWeek(String(n))}
 >
 {n} hari
 </Button>))}
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
 </div>)}

 {!useRkjDefaultPay && (
 <div className="space-y-3 rounded-lg border border-sky-100 bg-sky-50/40 p-3">
 <div className="flex items-start justify-between gap-3">
 <div>
 <p className="text-sm font-semibold">Kadar gaji syarikat sendiri</p>
 <p className="text-xs text-muted-foreground">
 Kadar ini khusus untuk {LEGAL_ENTITIES.find((entity) => entity.code === legalEntityCode)?.legalName}.
 Ia tidak guna formula kiosk Roti Kaya Junus.
 </p>
 </div>
 <Badge variant="outline">Manual</Badge>
 </div>
 {workerType === 'LOCAL' ? (
 <div className="space-y-1.5">
 <Label htmlFor="manual-monthly">Gaji bulanan (RM)</Label>
 <Input
 id="manual-monthly"
 type="number"
 min={0}
 step="0.01"
 placeholder="Contoh: 2500.00"
 value={manualMonthlyAmount}
 onChange={(event) => setManualMonthlyAmount(event.target.value)}
 />
 </div>) : (
 <div className="grid gap-3 sm:grid-cols-3">
 <div className="space-y-1.5 sm:col-span-3">
 <Label htmlFor="manual-weekly">Gaji mingguan (RM)</Label>
 <Input
 id="manual-weekly"
 type="number"
 min={0}
 step="0.01"
 placeholder="Contoh: 600.00"
 value={manualWeeklyAmount}
 onChange={(event) => setManualWeeklyAmount(event.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="manual-shift-hours">Jam shift</Label>
 <Input
 id="manual-shift-hours"
 type="number"
 min={0}
 step="0.5"
 placeholder="Opsyenal"
 value={shiftHours}
 onChange={(event) => setShiftHours(event.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="manual-days">Hari/minggu</Label>
 <Input
 id="manual-days"
 type="number"
 min={1}
 max={7}
 value={shiftsPerWeek}
 onChange={(event) => setShiftsPerWeek(event.target.value)}
 />
 </div>
 </div>)}
 </div>)}

 {/* Ringkasan gaji */}
 <div className="rounded-lg border bg-muted/30 p-4">
 <div className="mb-2 flex items-center gap-2 text-sm font-medium">
 <Calculator className="h-4 w-4 text-primary" />
 Anggaran Gaji
 </div>
 {rulesLoading ? (
 <p className="text-sm text-muted-foreground">Memuat kadar payroll...</p>) : !useRkjDefaultPay && workerType === 'LOCAL' ? (
 <div className="space-y-1 text-sm">
 <div className="flex justify-between text-muted-foreground">
 <span>Gaji bulanan syarikat</span>
 <span className="tabular-nums">
 {formatPayAmount(Number(manualMonthlyAmount) || 0)}
 </span>
 </div>
 <div className="flex justify-between border-t pt-2 font-semibold">
 <span>Jumlah bulanan</span>
 <span className="tabular-nums text-sky-700">
 {formatPayAmount(Number(manualMonthlyAmount) || 0)}
 </span>
 </div>
 </div>) : !useRkjDefaultPay && workerType === 'FOREIGN' ? (
 <div className="space-y-1 text-sm">
 <div className="flex justify-between text-muted-foreground">
 <span>Gaji mingguan syarikat</span>
 <span className="tabular-nums">
 {formatPayAmount(Number(manualWeeklyAmount) || 0)}
 </span>
 </div>
 <div className="flex justify-between border-t pt-2 font-semibold">
 <span>Jumlah mingguan</span>
 <span className="tabular-nums text-orange-700">
 {formatPayAmount(Number(manualWeeklyAmount) || 0)}
 </span>
 </div>
 </div>) : workerType === 'LOCAL' ? (
 <div className="space-y-1 text-sm">
 {localPay.breakdown.map((row) => (
 <div
 key={row.component}
 className="flex justify-between text-muted-foreground"
 >
 <span>{row.component}</span>
 <span className="tabular-nums">{formatPayAmount(row.amount)}</span>
 </div>))}
 <div className="flex justify-between border-t pt-2 font-semibold">
 <span>Jumlah bulanan</span>
 <span className="tabular-nums text-sky-700">
 {formatPayAmount(localPay.total)}
 </span>
 </div>
 </div>) : foreignPay ? (
 <div className="space-y-1 text-sm">
 <div className="flex justify-between text-muted-foreground">
 <span>{foreignPay.component}</span>
 <span className="tabular-nums">
 {formatPayAmount(foreignPay.perShift)}/shift
 </span>
 </div>
 <div className="flex justify-between text-muted-foreground">
 <span>x {foreignPay.shiftsPerWeek} hari/minggu</span>
 <span className="tabular-nums">{formatPayAmount(foreignPay.weekly)}</span>
 </div>
 <div className="flex justify-between border-t pt-2 font-semibold">
 <span>Jumlah mingguan</span>
 <span className="tabular-nums text-orange-700">
 {formatPayAmount(foreignPay.weekly)}
 </span>
 </div>
 </div>) : (
 <p className="text-sm text-muted-foreground">
 Pilih kadar shift untuk lihat anggaran gaji
 </p>)}
 </div>
 </section>

 <Separator />

 {/* 4 - Payroll bank dan SOP */}
 <section className="space-y-3">
 <div className="flex items-center gap-2">
 <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
 4
 </span>
 <h3 className="text-sm font-semibold">Bank, Kecemasan & SOP Kerja</h3>
 </div>

 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1.5">
 <Label htmlFor="bank-name" className="flex items-center gap-1.5">
 <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
 Nama Bank
 </Label>
 <Input
 id="bank-name"
 placeholder="Contoh: Maybank"
 value={bankName}
 onChange={(event) => setBankName(event.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="account-number">No. Akaun Bank</Label>
 <Input
 id="account-number"
 placeholder="No. akaun payroll"
 value={accountNumber}
 onChange={(event) => setAccountNumber(event.target.value)}
 />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label htmlFor="account-holder">Nama Pemegang Akaun</Label>
 <Input
 id="account-holder"
 placeholder={fullName || 'Nama seperti akaun bank'}
 value={accountHolder}
 onChange={(event) => setAccountHolder(event.target.value)}
 />
 </div>

 <div className="space-y-1.5">
 <Label htmlFor="emergency-name" className="flex items-center gap-1.5">
 <Phone className="h-3.5 w-3.5 text-muted-foreground" />
 Nama Waris / Kontak Kecemasan
 </Label>
 <Input
 id="emergency-name"
 value={emergencyContactName}
 onChange={(event) => setEmergencyContactName(event.target.value)}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="emergency-phone">Telefon Waris</Label>
 <Input
 id="emergency-phone"
 value={emergencyContactPhone}
 onChange={(event) => setEmergencyContactPhone(event.target.value)}
 />
 </div>
 <div className="space-y-1.5 sm:col-span-2">
 <Label htmlFor="emergency-relation">Hubungan Waris</Label>
 <Input
 id="emergency-relation"
 placeholder="Contoh: Isteri, ibu, ayah, adik"
 value={emergencyContactRelation}
 onChange={(event) => setEmergencyContactRelation(event.target.value)}
 />
 </div>

 <div className="space-y-1.5 sm:col-span-2">
 <Label htmlFor="work-scope" className="flex items-center gap-1.5">
 <BriefcaseBusiness className="h-3.5 w-3.5 text-muted-foreground" />
 Skop Kerja / SOP Ringkas
 </Label>
 <Textarea
 id="work-scope"
 rows={4}
 value={workScope}
 onChange={(event) => setWorkScope(event.target.value)}
 />
 <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
 <CalendarDays className="h-3.5 w-3.5" />
 {selectedLegalEntity?.legalName ?? 'Syarikat'} - {getCompanyRoleLabel(role, legalEntityCode)}
 </div>
 </div>
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
 {saving ? 'Menyimpan...' : 'Daftar Staf'}
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
 {createdCredentials?.name} ({createdCredentials?.code}) - kongsi kredensial ini
 kepada staf. Mesti tukar kata laluan pada log masuk pertama.
 </DialogDescription>
 </DialogHeader>
 {createdCredentials && (
 <StaffCredentialsCard
 loginEmail={createdCredentials.email}
 password={createdCredentials.password}
 mustChangePassword
 compact
 />)}
 <DialogFooter>
 <Button onClick={() => setCreatedCredentials(null)}>Faham</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </>);
}
