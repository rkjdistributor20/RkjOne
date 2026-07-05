'use client';

import { Building2, Download, FileUp, Sparkles, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchMyPayroll, uploadMyPayslip } from '@/lib/payroll/api';
import type { MyPayrollDashboard } from '@/lib/payroll/my-payroll';
import { LEGAL_ENTITIES } from '@/lib/brand/legal-entities';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { WorkerTypeBadge } from '@/components/payroll/worker-type-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { SectionCard, formatRM } from '@/components/shared/module-ui';

function fmt(n: number | null | undefined) {
 if (n == null) return ' - ';
 return formatRM(n);
}

export function StaffPayHrPanel({ compact = false }: { compact?: boolean }) {
 const [data, setData] = useState<MyPayrollDashboard | null>(null);
 const [loading, setLoading] = useState(true);
 const [uploading, setUploading] = useState(false);
 const [periodLabel, setPeriodLabel] = useState('');
 const [legalEntityCode, setLegalEntityCode] = useState('RKJ');
 const [staffId, setStaffId] = useState('');
 const [file, setFile] = useState<File | null>(null);

 const load = useCallback(async () => {
 setLoading(true);
 try {
 const res = await fetchMyPayroll();
 setData(res.payroll);
 if (res.payroll.employments[0]) {
 setStaffId(res.payroll.employments[0].staff_id);
 setLegalEntityCode(res.payroll.employments[0].legal_entity_code);
 }
 } catch {
 setData(null);
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 load();
 }, [load]);

 async function handleUpload() {
 if (!file || !periodLabel.trim()) {
 toast.error('Sila pilih fail dan isi tempoh slip');
 return;
 }
 setUploading(true);
 try {
 const form = new FormData();
 form.append('file', file);
 form.append('period_label', periodLabel.trim());
 form.append('legal_entity_code', legalEntityCode);
 if (staffId) form.append('staff_id', staffId);
 await uploadMyPayslip(form);
 toast.success('Slip gaji dimuat naik');
 setFile(null);
 setPeriodLabel('');
 await load();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Upload gagal');
 } finally {
 setUploading(false);
 }
 }

 if (loading) {
 return (
 <SectionCard title="HR & Gaji Saya" description="Memuatkan...">
 <p className="text-sm text-muted-foreground">Sila tunggu...</p>
 </SectionCard>);
 }

 if (!data) {
 return null;
 }

 return (
 <SectionCard
 title="HR & Gaji Saya"
 description="Maklumat majikan 3 syarikat, gaji auto, slip dihantar HR dan muat turun untuk kegunaan peribadi."
 action={
 data.is_group_owner ? (
 <Badge className="bg-amber-500 hover:bg-amber-500">Pemilik 3 Syarikat</Badge>) : undefined
 }
 >
 <div className="space-y-5">
 <div className="grid gap-3 md:grid-cols-3">
 {data.companies.map((company) => (
 <div
 key={company.code}
 className={`rounded-xl border p-3 text-sm ${company.is_my_employer ? 'border-primary/40 bg-primary/5' : 'bg-muted/20 opacity-80'}`}
 >
 <div className="flex items-center gap-2">
 <LegalEntityLogo size={22} />
 <div>
 <p className="font-semibold leading-tight">{company.legal_name}</p>
 <p className="text-xs text-muted-foreground">{company.code}</p>
 </div>
 </div>
 <p className="mt-2 text-xs text-muted-foreground">{company.scope}</p>
 {company.is_my_employer ? (
 <Badge variant="outline" className="mt-2">
 Majikan saya
 </Badge>) : (
 <Badge variant="secondary" className="mt-2">
 Syarikat kumpulan
 </Badge>)}
 </div>))}
 </div>

 {(data.total_weekly != null || data.total_monthly != null) && (
 <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
 {data.total_weekly != null && (
 <div>
 <p className="text-xs text-muted-foreground">Jumlah mingguan</p>
 <p className="text-lg font-bold">{fmt(data.total_weekly)}/minggu</p>
 </div>)}
 {data.total_monthly != null && (
 <div>
 <p className="text-xs text-muted-foreground">Jumlah bulanan</p>
 <p className="text-lg font-bold">{fmt(data.total_monthly)}/bulan</p>
 </div>)}
 </div>)}

 {data.employments.map((emp) => (
 <div key={emp.staff_id} className="rounded-lg border p-4">
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div>
 <p className="font-semibold">{emp.legal_entity_name}</p>
 <p className="text-xs text-muted-foreground">
 {emp.staff_code} - {emp.branch_name ?? 'HQ'} - {emp.pay_label}
 </p>
 </div>
 <WorkerTypeBadge workerType={emp.worker_type} />
 </div>
 {emp.pay_breakdown.length > 0 && (
 <div className="mt-3 grid gap-1 sm:grid-cols-2">
 {emp.pay_breakdown.map((row) => (
 <div
 key={row.label}
 className="flex justify-between rounded-md bg-muted/40 px-2 py-1.5 text-xs"
 >
 <span>{row.label}</span>
 <span className="font-medium tabular-nums">{fmt(row.amount)}</span>
 </div>))}
 </div>)}
 </div>))}

 {!compact && data.payroll_history.length > 0 && (
 <div>
 <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
 <Wallet className="h-4 w-4" />
 Sejarah Payroll
 </p>
 <div className="overflow-x-auto rounded-lg border">
 <table className="w-full text-xs">
 <thead>
 <tr className="border-b bg-muted/50 text-left">
 <th className="p-2">Run</th>
 <th className="p-2">Syarikat</th>
 <th className="p-2">Tempoh</th>
 <th className="p-2">Kasar</th>
 <th className="p-2">Bersih</th>
 </tr>
 </thead>
 <tbody>
 {data.payroll_history.slice(0, 8).map((row, i) => (
 <tr key={`${row.run_number}-${i}`} className="border-b">
 <td className="p-2">{row.run_number}</td>
 <td className="p-2">{row.legal_entity_code ?? ' - '}</td>
 <td className="p-2">
 {row.period_start} ke {row.period_end}
 </td>
 <td className="p-2">{fmt(row.gross_pay)}</td>
 <td className="p-2 font-medium">{fmt(row.net_pay)}</td>
 </tr>))}
 </tbody>
 </table>
 </div>
 </div>)}

 {(data.payslips.length > 0 || !compact) && (
 <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
 <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
 <Sparkles className="h-4 w-4 text-violet-600" />
 Slip Gaji Saya
 </p>
 {data.payslips.length === 0 ? (
 <p className="text-xs text-muted-foreground">
 Tiada slip lagi. HR akan hantar slip ke dashboard ini selepas pengesahan gaji.
 </p>) : (
 <div className="grid gap-2">
 {data.payslips.map((slip) => (
 <div
 key={slip.id}
 className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm"
 >
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <p className="font-medium">{slip.period_label}</p>
 {slip.source === 'SYSTEM' ? (
 <Badge className="bg-violet-600 hover:bg-violet-600 text-[10px]">
 Dihantar HR
 </Badge>) : (
 <Badge variant="outline" className="text-[10px]">
 Muat naik sendiri
 </Badge>)}
 </div>
 <p className="text-xs text-muted-foreground">
 {slip.legal_entity_name ?? slip.legal_entity_code}
 {slip.net_pay != null ? ` - Bersih ${fmt(slip.net_pay)}` : ''}
 </p>
 </div>
 {slip.download_url ? (
 <a
 href={slip.download_url}
 target="_blank"
 rel="noopener noreferrer"
 download={slip.file_name}
 className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
 >
 <Download className="mr-1 h-3.5 w-3.5" />
 Muat turun
 </a>) : (
 <Button size="sm" variant="outline" disabled>
 Tiada fail
 </Button>)}
 </div>))}
 </div>)}
 </div>)}

 {!compact && (
 <div className="rounded-lg border border-dashed p-4">
 <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
 <FileUp className="h-4 w-4" />
 Muat Naik Slip Tambahan (Pilihan)
 </p>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-2">
 <Label>Tempoh slip</Label>
 <Input
 placeholder="cth. Minggu 1-7 Jun 2025"
 value={periodLabel}
 onChange={(e) => setPeriodLabel(e.target.value)}
 />
 </div>
 <div className="space-y-2">
 <Label>Syarikat majikan</Label>
 <Select value={legalEntityCode} onValueChange={(v) => setLegalEntityCode(v ?? 'RKJ')}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {LEGAL_ENTITIES.map((e) => (
 <SelectItem key={e.code} value={e.code}>
 {e.legalName}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2 sm:col-span-2">
 <Label>Fail (PDF / gambar)</Label>
 <Input
 type="file"
 accept="application/pdf,image/jpeg,image/png,image/webp"
 onChange={(e) => setFile(e.target.files?.[0] ?? null)}
 />
 </div>
 </div>
 <Button className="mt-3" size="sm" onClick={handleUpload} disabled={uploading}>
 {uploading ? 'Memuat naik...' : 'Muat Naik Slip Tambahan'}
 </Button>
 </div>)}

 {compact && data.payslips.length > 0 && (
 <div className="flex flex-wrap gap-2">
 {data.payslips.slice(0, 3).map((slip) =>
 slip.download_url ? (
 <a
 key={slip.id}
 href={slip.download_url}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center rounded-md border px-2 py-1 text-xs hover:bg-muted"
 >
 <Download className="mr-1 h-3 w-3" />
 {slip.period_label}
 </a>) : null)}
 </div>)}
 </div>
 </SectionCard>);
}
