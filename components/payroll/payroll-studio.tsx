'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
 Banknote,
 Building2,
 CalendarClock,
 CheckCircle2,
 Edit3,
 Eye,
 FileText,
 Landmark,
 Loader2,
 Save,
 Send,
 ShieldCheck,
 Sparkles,
 Users,
 WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
 CompanyPayrollDashboard,
 CompanyPayrollGroup,
 CompanyPayrollStaffRow,
} from '@/lib/payroll/company-payroll';
import {
 fetchCompanyPayroll,
 generatePayrollRun,
 updatePayrollStaffPay,
} from '@/lib/payroll/api';
import type { LegalEntityCode } from '@/lib/brand/legal-entities';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { WorkerTypeBadge } from '@/components/payroll/worker-type-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 KpiCard,
 KpiGrid,
 SectionCard,
 formatRM,
} from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';

type PayDraft = {
 worker_type: 'LOCAL' | 'FOREIGN';
 monthly_amount: string;
 weekly_amount: string;
 shift_hours: string;
 shifts_per_week: string;
};

const companyTone: Record<LegalEntityCode, string> = {
 RKJ: 'from-amber-50 via-white to-emerald-50 border-amber-200',
 RKJ_DIST: 'from-sky-50 via-white to-amber-50 border-sky-200',
 RKJ_MFG: 'from-emerald-50 via-white to-sky-50 border-emerald-200',
};

function isoToday() {
 return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth() {
 const d = new Date();
 d.setDate(1);
 return d.toISOString().slice(0, 10);
}

function periodDays(start: string, end: string) {
 const s = new Date(`${start}T00:00:00`);
 const e = new Date(`${end}T00:00:00`);
 if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
 return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function n(value: string | number | null | undefined) {
 const parsed = Number(value ?? 0);
 return Number.isFinite(parsed) ? parsed : 0;
}

function moneyInput(value: number | null) {
 return value == null ? '' : String(Number(value).toFixed(2)).replace(/\.00$/, '');
}

function makeDraft(staff: CompanyPayrollStaffRow | null): PayDraft {
 return {
 worker_type: staff?.worker_type ?? 'LOCAL',
 monthly_amount: moneyInput(staff?.monthly_amount ?? staff?.computed_monthly ?? null),
 weekly_amount: moneyInput(staff?.weekly_amount ?? staff?.computed_weekly ?? null),
 shift_hours: staff?.shift_hours == null ? '' : String(staff.shift_hours),
 shifts_per_week: staff?.shifts_per_week == null ? '' : String(staff.shifts_per_week),
 };
}

function previewPay(
 company: CompanyPayrollGroup | null,
 staff: CompanyPayrollStaffRow | null,
 draft: PayDraft,
 periodStart: string,
 periodEnd: string) {
 if (!company || !staff) {
 return {
 gross: 0,
 epf: 0,
 socso: 0,
 eis: 0,
 net: 0,
 basis: 'Pilih staf untuk preview slip gaji.',
 };
 }

 const days = periodDays(periodStart, periodEnd);
 const workerType = draft.worker_type;
 if (workerType === 'FOREIGN') {
 const weekly = n(draft.weekly_amount || staff.weekly_amount || staff.computed_weekly);
 return {
 gross: weekly,
 epf: 0,
 socso: 0,
 eis: 0,
 net: weekly,
 basis: `${company.code}: pekerja asing - kadar mingguan rekod (${days} hari tempoh semakan).`,
 };
 }

 const monthly = n(draft.monthly_amount || staff.monthly_amount || staff.computed_monthly);
 const gross = Math.round(monthly * (days / 30) * 100) / 100;
 const epf = Math.round(gross * 0.11 * 100) / 100;
 const socso = Math.round(Math.min(gross, 6000) * 0.005 * 100) / 100;
 const eis = Math.round(gross * 0.002 * 100) / 100;
 return {
 gross,
 epf,
 socso,
 eis,
 net: Math.max(0, Math.round((gross - epf - socso - eis) * 100) / 100),
 basis:
 company.code === 'RKJ'
 ? 'RKJ: staf tempatan ikut kadar syarikat dan komisen POS jika berkaitan.'
 : `${company.legal_name}: gaji bulanan rekod staf, prorata ikut tempoh payroll.`,
 };
}

function companyShortName(code: LegalEntityCode) {
 if (code === 'RKJ_DIST') return 'Distributor';
 if (code === 'RKJ_MFG') return 'Manufacturing';
 return 'Roti Kaya Junus';
}

export function PayrollStudio({ onGenerated }: { onGenerated?: () => void }) {
 const [data, setData] = useState<CompanyPayrollDashboard | null>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [generating, setGenerating] = useState(false);
 const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
 const [selectedStaffId, setSelectedStaffId] = useState<string>('');
 const [periodStart, setPeriodStart] = useState(firstDayOfMonth);
 const [periodEnd, setPeriodEnd] = useState(isoToday);
 const [draft, setDraft] = useState<PayDraft>(makeDraft(null));

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetchCompanyPayroll();
 setData(res);
 setSelectedCompanyId((prev) => prev || res.companies[0]?.id || '');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal memuatkan Payroll Studio');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 load();
 }, [load]);

 const selectedCompany = useMemo(
 () => data?.companies.find((company) => company.id === selectedCompanyId) ?? null,
 [data, selectedCompanyId]);

 const selectedStaff = useMemo(() => {
 if (!selectedCompany) return null;
 return selectedCompany.staff.find((staff) => staff.id === selectedStaffId) ?? selectedCompany.staff[0] ?? null;
 }, [selectedCompany, selectedStaffId]);

 useEffect(() => {
 if (!selectedCompany) return;
 if (!selectedCompany.staff.some((staff) => staff.id === selectedStaffId)) {
 setSelectedStaffId(selectedCompany.staff[0]?.id ?? '');
 }
 }, [selectedCompany, selectedStaffId]);

 useEffect(() => {
 setDraft(makeDraft(selectedStaff));
 }, [selectedStaff?.id]);

 const preview = previewPay(selectedCompany, selectedStaff, draft, periodStart, periodEnd);

 async function handleSavePay() {
 if (!selectedCompany || !selectedStaff) return;
 setSaving(true);
 try {
 await updatePayrollStaffPay(selectedStaff.id, {
 legal_entity_code: selectedCompany.code,
 worker_type: draft.worker_type,
 monthly_amount: draft.worker_type === 'LOCAL' ? n(draft.monthly_amount) : null,
 weekly_amount: draft.worker_type === 'FOREIGN' ? n(draft.weekly_amount) : null,
 shift_hours: draft.worker_type === 'FOREIGN' && draft.shift_hours ? n(draft.shift_hours) : null,
 shifts_per_week:
 draft.worker_type === 'FOREIGN' && draft.shifts_per_week ? n(draft.shifts_per_week) : null,
 });
 toast.success('Profil gaji staf dikemaskini');
 await load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan profil gaji');
 } finally {
 setSaving(false);
 }
 }

 async function handleGenerateRun() {
 if (!selectedCompany) return;
 setGenerating(true);
 try {
 await generatePayrollRun({
 period_start: periodStart,
 period_end: periodEnd,
 legal_entity_id: selectedCompany.id,
 legal_entity_code: selectedCompany.code,
 report_type: selectedCompany.code === 'RKJ' ? 'STANDARD' : 'MONTHLY_LOCAL',
 });
 toast.success(`Payroll ${selectedCompany.legal_name} dijana untuk semakan`);
 await load();
 onGenerated?.();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal jana payroll syarikat');
 } finally {
 setGenerating(false);
 }
 }

 if (loading || !data) {
 return (
 <SectionCard title="Payroll Studio 3 Syarikat" description="Memuatkan profil gaji syarikat...">
 <div className="grid gap-3 sm:grid-cols-3">
 {Array.from({ length: 3 }).map((_, i) => (
 <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
 ))}
 </div>
 </SectionCard>);
 }

 return (
 <div className="space-y-5">
 <SectionCard
 title={
 <span className="flex items-center gap-2">
 <Sparkles className="h-4 w-4 text-amber-600" />
 Payroll Studio 3 Syarikat
 </span>
 }
 description="Satu aliran kerja untuk HR: pilih syarikat, semak kadar staf, preview slip, jana payroll dan hantar untuk kelulusan."
 action={
 <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
 Workflow HR
 </Badge>
 }
 >
 <div className="grid gap-3 lg:grid-cols-3">
 {data.companies.map((company) => {
 const active = company.id === selectedCompanyId;
 return (
 <button
 key={company.id}
 type="button"
 onClick={() => setSelectedCompanyId(company.id)}
 className={cn(
 'rounded-lg border bg-gradient-to-br p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
 companyTone[company.code],
 active && 'ring-2 ring-amber-400')}
 >
 <div className="flex items-start justify-between gap-3">
 <div className="flex items-center gap-3">
 <LegalEntityLogo size={34} />
 <div>
 <p className="font-semibold text-stone-950">{companyShortName(company.code)}</p>
 <p className="text-xs text-muted-foreground">{company.legal_name}</p>
 </div>
 </div>
 {active && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
 </div>
 <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
 <div className="rounded-md bg-white/80 p-2">
 <p className="text-muted-foreground">Staf</p>
 <p className="text-lg font-semibold">{company.staff.length}</p>
 </div>
 <div className="rounded-md bg-white/80 p-2">
 <p className="text-muted-foreground">Tempatan</p>
 <p className="text-lg font-semibold">{company.local_count}</p>
 </div>
 <div className="rounded-md bg-white/80 p-2">
 <p className="text-muted-foreground">Asing</p>
 <p className="text-lg font-semibold">{company.foreign_count}</p>
 </div>
 </div>
 </button>);
 })}
 </div>
 </SectionCard>

 <KpiGrid cols={4}>
 <KpiCard title="Syarikat Dipilih" value={selectedCompany ? companyShortName(selectedCompany.code) : '-'} icon={Building2} />
 <KpiCard title="Jumlah Staf" value={selectedCompany?.staff.length ?? 0} icon={Users} />
 <KpiCard title="Anggaran Bulanan" value={formatRM(selectedCompany?.monthly_payroll_total ?? 0)} icon={Banknote} />
 <KpiCard title="Anggaran Mingguan" value={formatRM(selectedCompany?.weekly_payroll_total ?? 0)} icon={CalendarClock} />
 </KpiGrid>

 <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
 <SectionCard
 title="1. Profil Gaji Staf"
 description="Edit kadar gaji di sini. RKJ Distributor dan Manufacturing guna kadar syarikat sendiri; staf kiosk RKJ kekal ikut struktur RKJ."
 >
 <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
 <div className="overflow-hidden rounded-lg border">
 <div className="grid grid-cols-[1fr_120px_140px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 <span>Staf</span>
 <span>Jenis</span>
 <span className="text-right">Kadar Semasa</span>
 </div>
 <div className="max-h-[420px] overflow-y-auto">
 {selectedCompany?.staff.length ? (
 selectedCompany.staff.map((staff) => {
 const active = staff.id === selectedStaff?.id;
 const amount =
 staff.worker_type === 'LOCAL'
 ? staff.monthly_amount ?? staff.computed_monthly
 : staff.weekly_amount ?? staff.computed_weekly;
 return (
 <button
 key={staff.id}
 type="button"
 onClick={() => setSelectedStaffId(staff.id)}
 className={cn(
 'grid w-full grid-cols-[1fr_120px_140px] gap-2 border-b px-3 py-3 text-left text-sm transition hover:bg-amber-50/50',
 active && 'bg-amber-50')}
 >
 <span className="min-w-0">
 <span className="block truncate font-medium">{staff.full_name}</span>
 <span className="block text-xs text-muted-foreground">
 {staff.staff_code} - {staff.branch_name ?? 'HQ / Syarikat'}
 </span>
 </span>
 <span>
 <WorkerTypeBadge workerType={staff.worker_type} />
 </span>
 <span className="text-right font-semibold tabular-nums">
 {amount ? formatRM(Number(amount)) : 'Belum set'}
 <span className="block text-[11px] font-normal text-muted-foreground">
 {staff.worker_type === 'LOCAL' ? 'bulanan' : 'mingguan'}
 </span>
 </span>
 </button>);
 })
 ) : (
 <div className="px-3 py-8 text-sm text-muted-foreground">
 Tiada staf aktif untuk syarikat ini.
 </div>)}
 </div>
 </div>

 <Card className="border-amber-200 bg-amber-50/30">
 <CardHeader className="pb-2">
 <CardTitle className="flex items-center gap-2 text-base">
 <Edit3 className="h-4 w-4 text-amber-700" />
 Edit Kadar
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 <div>
 <Label>Staf dipilih</Label>
 <p className="mt-1 rounded-md border bg-white px-3 py-2 text-sm font-medium">
 {selectedStaff?.full_name ?? 'Pilih staf'}
 </p>
 </div>
 <div className="space-y-1">
 <Label>Jenis staf</Label>
 <select
 className="h-10 w-full rounded-md border bg-white px-3 text-sm"
 value={draft.worker_type}
 onChange={(e) =>
 setDraft((prev) => ({
 ...prev,
 worker_type: e.target.value as 'LOCAL' | 'FOREIGN',
 }))}
 >
 <option value="LOCAL">Staf tempatan - gaji bulanan</option>
 <option value="FOREIGN">Pekerja asing - gaji mingguan</option>
 </select>
 </div>
 {draft.worker_type === 'LOCAL' ? (
 <div className="space-y-1">
 <Label>Gaji bulanan syarikat (RM)</Label>
 <Input
 type="number"
 min="0"
 step="0.01"
 value={draft.monthly_amount}
 onChange={(e) => setDraft((prev) => ({...prev, monthly_amount: e.target.value }))}
 placeholder="Contoh: 2500.00"
 />
 </div>
 ) : (
 <div className="grid gap-3">
 <div className="space-y-1">
 <Label>Gaji mingguan (RM)</Label>
 <Input
 type="number"
 min="0"
 step="0.01"
 value={draft.weekly_amount}
 onChange={(e) => setDraft((prev) => ({...prev, weekly_amount: e.target.value }))}
 placeholder="Contoh: 480.00"
 />
 </div>
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1">
 <Label>Jam/shift</Label>
 <Input
 type="number"
 min="0"
 value={draft.shift_hours}
 onChange={(e) => setDraft((prev) => ({...prev, shift_hours: e.target.value }))}
 placeholder="8"
 />
 </div>
 <div className="space-y-1">
 <Label>Hari/minggu</Label>
 <Input
 type="number"
 min="1"
 max="7"
 value={draft.shifts_per_week}
 onChange={(e) => setDraft((prev) => ({...prev, shifts_per_week: e.target.value }))}
 placeholder="6"
 />
 </div>
 </div>
 </div>
 )}
 <Button className="w-full bg-amber-500 text-stone-950 hover:bg-amber-400" onClick={handleSavePay} disabled={saving || !selectedStaff}>
 {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
 Simpan profil gaji
 </Button>
 </CardContent>
 </Card>
 </div>
 </SectionCard>

 <SectionCard
 title="2. Preview Payslip"
 description="HR boleh semak contoh slip sebelum run dijana atau payslip dipublish kepada staf."
 >
 <div className="space-y-4">
 <div className="rounded-lg border bg-gradient-to-br from-stone-950 to-stone-800 p-4 text-white shadow-sm">
 <div className="flex items-start justify-between gap-3">
 <div>
 <p className="text-xs uppercase tracking-[0.24em] text-amber-300">RKJ One Payslip</p>
 <h3 className="mt-2 text-lg font-semibold">{selectedStaff?.full_name ?? 'Pilih staf'}</h3>
 <p className="text-sm text-stone-300">{selectedCompany?.legal_name ?? '-'}</p>
 </div>
 <WalletCards className="h-8 w-8 text-amber-300" />
 </div>
 <div className="mt-5 grid gap-2 text-sm">
 <div className="flex justify-between">
 <span className="text-stone-300">Pendapatan kasar</span>
 <strong>{formatRM(preview.gross)}</strong>
 </div>
 <div className="flex justify-between">
 <span className="text-stone-300">EPF</span>
 <span>{formatRM(preview.epf)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-stone-300">SOCSO / EIS</span>
 <span>{formatRM(preview.socso + preview.eis)}</span>
 </div>
 <div className="mt-2 flex justify-between border-t border-white/20 pt-3 text-lg">
 <span>Gaji bersih</span>
 <strong className="text-amber-300">{formatRM(preview.net)}</strong>
 </div>
 </div>
 </div>
 <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-sm text-sky-950">
 <p className="flex items-center gap-2 font-medium">
 <Eye className="h-4 w-4" />
 Asas kiraan
 </p>
 <p className="mt-1 text-xs leading-relaxed text-sky-900">{preview.basis}</p>
 </div>
 </div>
 </SectionCard>
 </div>

 <SectionCard
 title="3. Generate Payroll & Kelulusan"
 description="Pilih tempoh, jana payroll syarikat terpilih, kemudian semak run sebelum diluluskan dan dibayar."
 action={<Badge variant="outline">{selectedCompany?.legal_name ?? 'Pilih syarikat'}</Badge>}
 >
 <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-1">
 <Label>Tarikh mula payroll</Label>
 <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
 </div>
 <div className="space-y-1">
 <Label>Tarikh akhir payroll</Label>
 <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
 </div>
 <div className="rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2">
 <p className="font-medium">Checklist sebelum generate</p>
 <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
 <span className="flex items-center gap-2">
 <ShieldCheck className="h-4 w-4 text-emerald-600" />
 Profil gaji staf dikemaskini
 </span>
 <span className="flex items-center gap-2">
 <FileText className="h-4 w-4 text-sky-600" />
 Preview payslip disemak
 </span>
 <span className="flex items-center gap-2">
 <Landmark className="h-4 w-4 text-amber-600" />
 Akaun bank staf lengkap
 </span>
 </div>
 </div>
 </div>

 <Card className="border-emerald-200 bg-emerald-50/50">
 <CardHeader className="pb-2">
 <CardTitle className="text-base">Tindakan HR</CardTitle>
 </CardHeader>
 <CardContent className="space-y-3 text-sm">
 <p className="text-muted-foreground">
 Run akan diasingkan untuk syarikat dipilih supaya HR boleh semak total dan payslip tanpa bercampur dengan syarikat lain.
 </p>
 <Button
 className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
 onClick={handleGenerateRun}
 disabled={generating || !selectedCompany}
 >
 {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
 Jana payroll syarikat ini
 </Button>
 </CardContent>
 </Card>
 </div>
 </SectionCard>
 </div>);
}
