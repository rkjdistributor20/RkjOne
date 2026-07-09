'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
 AlertTriangle,
 BadgeCheck,
 ClipboardCheck,
 ClipboardList,
 FileCheck2,
 PackageCheck,
 RefreshCw,
 Route,
 Save,
 ShieldCheck,
 Sparkles,
 UsersRound,
} from 'lucide-react';
import {
 createFactoryGmpBatch,
 fetchFactoryGmpDashboard,
 updateFactoryGmpBatch,
} from '@/lib/production/api';
import type { FactoryGmpDashboardData, FactoryGmpProduct } from '@/lib/production/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { KpiCard, KpiGrid, SectionCard } from '@/components/shared/module-ui';
import {
 GMP_RECORD_STAGES,
 MANUFACTURING_DATA_QUALITY_ACTIONS,
 MANUFACTURING_GMP_PRODUCTS,
 MANUFACTURING_STAFF_UNITS,
 getManufacturingGmpSummary,
} from '@/lib/manufacturing/gmp';
import { cn } from '@/lib/utils';

function priorityTone(priority: string) {
 if (priority === 'Critical') return 'border-red-200 bg-red-50 text-red-800';
 if (priority === 'High') return 'border-amber-200 bg-amber-50 text-amber-900';
 return 'border-sky-200 bg-sky-50 text-sky-800';
}

function todayIso() {
 return new Date().toISOString().slice(0, 10);
}

function n(value: number | string | null | undefined) {
 const num = Number(value ?? 0);
 return Number.isInteger(num) ? num.toLocaleString('ms-MY') : num.toLocaleString('ms-MY', { maximumFractionDigits: 2 });
}

function statusBadge(status: string) {
 if (status === 'RELEASED') return <Badge className="bg-emerald-600 text-white">Released</Badge>;
 if (status === 'HOLD') return <Badge className="bg-amber-500 text-amber-950">Hold</Badge>;
 if (status === 'REJECTED') return <Badge variant="destructive">Rejected</Badge>;
 if (status === 'IN_PROCESS') return <Badge variant="secondary">In process</Badge>;
 return <Badge variant="outline">Draft</Badge>;
}

function productName(product: FactoryGmpProduct | undefined) {
 return product?.product_name ?? 'Produk GMP';
}

export function FactoryGmpDashboard() {
 const summary = getManufacturingGmpSummary();
 const [data, setData] = useState<FactoryGmpDashboardData | null>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [productionDate, setProductionDate] = useState(todayIso);
 const [productCode, setProductCode] = useState(MANUFACTURING_GMP_PRODUCTS[0]?.code ?? '');
 const [plannedQty, setPlannedQty] = useState('');
 const [actualQty, setActualQty] = useState('');
 const [notes, setNotes] = useState('');

 const load = useCallback(async () => {
  setLoading(true);
  try {
   setData(await fetchFactoryGmpDashboard());
  } catch (err) {
   toast.error(err instanceof Error ? err.message : 'Gagal memuatkan rekod GMP kilang');
  } finally {
   setLoading(false);
  }
 }, []);

 useEffect(() => {
  queueMicrotask(() => {
   void load();
  });
 }, [load]);

 const productMap = useMemo(() => {
  return new Map((data?.products ?? []).map((product) => [product.id, product]));
 }, [data?.products]);

 const safeProductCode = useMemo(() => {
  const products = data?.products ?? [];
  if (products.some((product) => product.product_code === productCode)) return productCode;
  return products[0]?.product_code ?? '';
 }, [data?.products, productCode]);

 async function handleCreateBatch() {
  if (!data?.migration_ready) {
   toast.error('Migration GMP belum dijalankan. Rekod sebenar belum boleh disimpan.');
   return;
  }
  if (!safeProductCode) {
   toast.error('Pilih produk GMP dahulu');
   return;
  }
  if (!productionDate) {
   toast.error('Pilih tarikh production');
   return;
  }

  const planned = Number(plannedQty || 0);
  const actual = Number(actualQty || 0);
  if (!Number.isFinite(planned) || planned < 0 || !Number.isFinite(actual) || actual < 0) {
   toast.error('Kuantiti mesti nombor positif atau kosong');
   return;
  }

  setSaving(true);
  try {
   await createFactoryGmpBatch({
    product_code: safeProductCode,
    production_date: productionDate,
    planned_qty: planned,
    actual_qty: actual,
    unit: 'PCS',
    status: actual > 0 ? 'IN_PROCESS' : 'DRAFT',
    deviation_notes: notes || undefined,
   });
   toast.success('Batch GMP berjaya direkod');
   setPlannedQty('');
   setActualQty('');
   setNotes('');
   await load();
  } catch (err) {
   toast.error(err instanceof Error ? err.message : 'Gagal simpan batch GMP');
  } finally {
   setSaving(false);
  }
 }

 async function handleStatus(batchId: string, status: 'HOLD' | 'RELEASED' | 'REJECTED') {
  setSaving(true);
  try {
   await updateFactoryGmpBatch(batchId, { status });
   toast.success(`Status batch ditukar kepada ${status}`);
   await load();
  } catch (err) {
   toast.error(err instanceof Error ? err.message : 'Gagal kemaskini status GMP');
  } finally {
   setSaving(false);
  }
 }

 const dbProducts = data?.products ?? [];
 const batches = data?.batches ?? [];
 const setupPending = data && !data.migration_ready;

 return (
 <div className="space-y-4">
 <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
 <p className="flex items-center gap-2 font-semibold">
 <ShieldCheck className="h-4 w-4" />
 Roti Kaya Junus Manufacturing Sdn Bhd - GMP readiness untuk 5 produk buatan kilang
 </p>
 <p className="mt-1 text-emerald-900/80">
 Produk GMP kilang ialah Roti Planta, Roti Kelapa, Roti Kacang, Roti Benggali dan Kaya.
 Menu POS hanya rujukan jualan, bukan master produk GMP.
 </p>
 </div>

 {setupPending ? (
 <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
 <p className="flex items-center gap-2 font-semibold">
 <AlertTriangle className="h-4 w-4" />
 Rekod database GMP belum aktif
 </p>
 <p className="mt-1 text-amber-900">
 {data.setup_message ?? 'Jalankan migration GMP di staging dahulu sebelum production.'}
 Dashboard ini masih boleh digunakan sebagai SOP/readiness, tetapi form batch disekat sehingga jadual GMP wujud.
 </p>
 </div>) : null}

 <KpiGrid cols={4}>
 <KpiCard
 title="Produk GMP"
 value={data?.summary.product_count || summary.productCount}
 description="5 produk buatan kilang"
 icon={PackageCheck}
 variant="success"
 />
 <KpiCard
 title="Batch Terkini"
 value={data?.summary.recent_batch_count ?? 0}
 description={data?.summary.latest_batch_date ? `Akhir ${data.summary.latest_batch_date}` : 'Belum ada rekod'}
 icon={ClipboardCheck}
 />
 <KpiCard
 title="Open/Hold"
 value={`${data?.summary.open_count ?? 0}/${data?.summary.hold_count ?? 0}`}
 description="Draft/in-process dan hold"
 icon={AlertTriangle}
 variant={(data?.summary.hold_count ?? 0) > 0 ? 'warning' : undefined}
 />
 <KpiCard
 title="Unit Staf"
 value={summary.staffUnitCount}
 description={`${summary.criticalStaffUnits} unit kritikal`}
 icon={UsersRound}
 variant="warning"
 />
 </KpiGrid>

 <SectionCard
 title="Rekod Batch GMP Harian"
 description="Cipta batch production mengikut produk buatan kilang, bukan mengikut menu POS. Status release hanya untuk batch yang sudah lengkap QC dan reconciliation."
 action={
 <Button type="button" variant="outline" size="sm" onClick={load}>
 <RefreshCw className="mr-1 h-4 w-4" /> Refresh
 </Button>
 }
 >
 <div className="grid gap-3 md:grid-cols-[1fr_180px_150px_150px]">
 <div className="space-y-2">
 <Label>Produk</Label>
 <Select value={safeProductCode} onValueChange={(value) => value && setProductCode(value)} disabled={!data?.migration_ready || dbProducts.length === 0}>
 <SelectTrigger className="w-full">
 <SelectValue placeholder={loading ? 'Memuatkan produk...' : 'Pilih produk GMP'} />
 </SelectTrigger>
 <SelectContent>
 {dbProducts.map((product) => (
 <SelectItem key={product.id} value={product.product_code}>
 {product.product_name}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>Tarikh production</Label>
 <Input type="date" value={productionDate} onChange={(event) => setProductionDate(event.target.value)} disabled={!data?.migration_ready} />
 </div>
 <div className="space-y-2">
 <Label>Plan qty</Label>
 <Input type="number" min="0" step="1" value={plannedQty} onChange={(event) => setPlannedQty(event.target.value)} placeholder="0" disabled={!data?.migration_ready} />
 </div>
 <div className="space-y-2">
 <Label>Actual qty</Label>
 <Input type="number" min="0" step="1" value={actualQty} onChange={(event) => setActualQty(event.target.value)} placeholder="0" disabled={!data?.migration_ready} />
 </div>
 </div>
 <div className="mt-3 space-y-2">
 <Label>Nota deviation / batch</Label>
 <Textarea
 rows={2}
 value={notes}
 onChange={(event) => setNotes(event.target.value)}
 placeholder="Contoh: batch pagi, line 1, QC hold sementara, reject/rework jika ada"
 disabled={!data?.migration_ready}
 />
 </div>
 <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
 <p className="text-xs text-muted-foreground">
 Batch no dijana automatik ikut prefix produk kilang dan tarikh production, contoh RPL-20260709-001.
 </p>
 <Button type="button" disabled={saving || !data?.migration_ready} onClick={handleCreateBatch}>
 <Save className="mr-1 h-4 w-4" />
 {saving ? 'Menyimpan...' : 'Simpan Batch GMP'}
 </Button>
 </div>

 <div className="mt-4 overflow-hidden rounded-lg border">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Batch</TableHead>
 <TableHead>Produk</TableHead>
 <TableHead>Tarikh</TableHead>
 <TableHead className="text-right">Plan</TableHead>
 <TableHead className="text-right">Actual</TableHead>
 <TableHead>Status</TableHead>
 <TableHead className="text-right">Tindakan</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {loading ? (
 <TableRow>
 <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
 Memuatkan rekod GMP...
 </TableCell>
 </TableRow>) : batches.length === 0 ? (
 <TableRow>
 <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
 Tiada batch GMP direkod lagi.
 </TableCell>
 </TableRow>) : batches.map((batch) => {
 const product = productMap.get(batch.gmp_product_id);
 return (
 <TableRow key={batch.id}>
 <TableCell>
 <p className="font-mono text-xs font-semibold">{batch.batch_no}</p>
 <p className="mt-1 text-xs text-muted-foreground">{batch.created_at.slice(0, 10)}</p>
 </TableCell>
 <TableCell>{productName(product)}</TableCell>
 <TableCell>{batch.production_date}</TableCell>
 <TableCell className="text-right">{n(batch.planned_qty)} {batch.unit}</TableCell>
 <TableCell className="text-right">{n(batch.actual_qty)} {batch.unit}</TableCell>
 <TableCell>{statusBadge(batch.status)}</TableCell>
 <TableCell className="text-right">
 <div className="flex flex-wrap justify-end gap-1.5">
 <Button type="button" variant="outline" size="sm" disabled={saving || batch.status === 'HOLD'} onClick={() => handleStatus(batch.id, 'HOLD')}>
 Hold
 </Button>
 <Button type="button" variant="outline" size="sm" disabled={saving || batch.status === 'REJECTED'} onClick={() => handleStatus(batch.id, 'REJECTED')}>
 Reject
 </Button>
 <Button type="button" size="sm" disabled={saving || batch.status === 'RELEASED'} onClick={() => handleStatus(batch.id, 'RELEASED')}>
 Release
 </Button>
 </div>
 </TableCell>
 </TableRow>);
 })}
 </TableBody>
 </Table>
 </div>
 </SectionCard>

 <SectionCard
 title="5 Produk Buatan Kilang - Rekod GMP Yang Wajib"
 description="Master GMP ini berasingan daripada Menu POS: Roti Planta, Roti Kelapa, Roti Kacang, Roti Benggali dan Kaya."
 >
 <div className="grid gap-3 lg:grid-cols-2">
 {MANUFACTURING_GMP_PRODUCTS.map((product) => (
 <div key={product.code} className="rounded-lg border bg-background p-4 shadow-sm">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <Badge className="bg-emerald-600 text-white">{product.code}</Badge>
 <Badge variant="outline">{product.batchPrefix}</Badge>
 </div>
 <h3 className="mt-2 text-base font-semibold">{product.name}</h3>
 <p className="mt-1 text-xs text-muted-foreground">{product.lineOwner}</p>
 </div>
 <PackageCheck className="h-5 w-5 text-emerald-700" />
 </div>

 <div className="mt-3 flex flex-wrap gap-1.5">
 <Badge variant="secondary">{product.factoryProductType === 'SPREAD' ? 'Produk Kaya' : 'Produk Roti'}</Badge>
 {product.stockItemCodes.map((code) => (
 <span key={code} className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11px]">
 {code}
 </span>
 ))}
 </div>
 <p className="mt-3 text-xs text-muted-foreground">
 Rujukan menu POS: {product.posMenuReferences.join(', ')}
 </p>

 <div className="mt-4 grid gap-3 md:grid-cols-2">
 <div>
 <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Rekod wajib</p>
 <ul className="space-y-1 text-sm">
 {product.targetRecords.map((record) => (
 <li key={record} className="flex gap-2">
 <FileCheck2 className="mt-0.5 h-4 w-4 text-emerald-700" />
 <span>{record}</span>
 </li>
 ))}
 </ul>
 </div>
 <div>
 <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Critical check</p>
 <ul className="space-y-1 text-sm">
 {product.criticalChecks.map((check) => (
 <li key={check} className="flex gap-2">
 <ShieldCheck className="mt-0.5 h-4 w-4 text-amber-600" />
 <span>{check}</span>
 </li>
 ))}
 </ul>
 </div>
 </div>

 <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-950">
 <p className="font-semibold">Release criteria</p>
 <p className="mt-1">{product.releaseCriteria.join(' / ')}</p>
 </div>
 </div>
 ))}
 </div>
 </SectionCard>

 <SectionCard
 title="SOP Rekod Batch GMP"
 description="Urutan ini menjadi asas borang GMP apabila migration diluluskan."
 >
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
 {GMP_RECORD_STAGES.map((stage, index) => (
 <div key={stage.code} className="rounded-lg border bg-background p-4">
 <div className="flex items-center justify-between gap-2">
 <Badge variant="secondary" className="gap-1">
 <ClipboardList className="h-3.5 w-3.5" />
 {String(index + 1).padStart(2, '0')} {stage.code}
 </Badge>
 <Badge variant="outline">{stage.timing}</Badge>
 </div>
 <h3 className="mt-3 font-semibold">{stage.title}</h3>
 <p className="mt-1 text-sm text-muted-foreground">{stage.evidence}</p>
 <p className="mt-3 text-xs font-semibold text-stone-700">Owner: {stage.owner}</p>
 </div>
 ))}
 </div>
 </SectionCard>

 <SectionCard
 title="Cadangan Susun Semula Staf Manufacturing"
 description="Struktur ini mengasingkan accountable person, production, QA/GMP, stock, HR, finance, hygiene dan logistics boundary."
 >
 <div className="overflow-hidden rounded-lg border">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Unit</TableHead>
 <TableHead>Lead</TableHead>
 <TableHead>Ahli / backup</TableHead>
 <TableHead>GMP duty</TableHead>
 <TableHead className="text-right">Priority</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {MANUFACTURING_STAFF_UNITS.map((unit) => (
 <TableRow key={unit.unit}>
 <TableCell>
 <p className="font-semibold">{unit.unit}</p>
 <p className="mt-1 text-xs text-muted-foreground">{unit.scope}</p>
 </TableCell>
 <TableCell className="min-w-44 text-sm">{unit.lead}</TableCell>
 <TableCell>
 <div className="flex flex-wrap gap-1.5">
 {unit.members.map((member) => (
 <Badge key={member} variant="outline" className="h-auto whitespace-normal py-1">
 {member}
 </Badge>
 ))}
 </div>
 </TableCell>
 <TableCell className="max-w-sm text-sm text-muted-foreground">{unit.gmpDuty}</TableCell>
 <TableCell className="text-right">
 <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-semibold', priorityTone(unit.priority))}>
 {unit.priority}
 </span>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </SectionCard>

 <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
 <SectionCard
 title="Data HR Yang Perlu Dibetulkan"
 description="Ini bukan auto-update. HR perlu sahkan sebelum pindah legal entity atau tukar kod staf."
 >
 <div className="space-y-3">
 {MANUFACTURING_DATA_QUALITY_ACTIONS.map((action) => (
 <div key={action.issue} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
 <div className="flex gap-2">
 <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
 <div>
 <p className="font-semibold text-amber-950">{action.issue}</p>
 <p className="mt-1 text-amber-900">{action.recommendation}</p>
 <p className="mt-2 text-xs text-amber-800">Impact: {action.impact}</p>
 </div>
 </div>
 </div>
 ))}
 </div>
 </SectionCard>

 <SectionCard
 title="Apa Sistem Akan Rekod"
 description="Bentuk rekod yang akan masuk database GMP selepas migration dijalankan."
 >
 <div className="space-y-3 text-sm">
 <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
 <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-700" />
 <div>
 <p className="font-semibold">Batch record per produk</p>
 <p className="text-muted-foreground">Batch no, production date, planned vs actual qty, line lead, raw material lots, status HOLD/RELEASED.</p>
 </div>
 </div>
 <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
 <ShieldCheck className="mt-0.5 h-4 w-4 text-sky-700" />
 <div>
 <p className="font-semibold">QC/CCP checkpoint</p>
 <p className="text-muted-foreground">Pre-op, weighing, process, packing, release dan CAPA dengan nama checker.</p>
 </div>
 </div>
 <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
 <Route className="mt-0.5 h-4 w-4 text-violet-700" />
 <div>
 <p className="font-semibold">Traceability</p>
 <p className="text-muted-foreground">Pautan produk, lot bahan mentah, plastik/label, order HQ/ejen dan dispatch.</p>
 </div>
 </div>
 <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
 <Sparkles className="mt-0.5 h-4 w-4 text-amber-700" />
 <div>
 <p className="font-semibold">Audit readiness</p>
 <p className="text-muted-foreground">Setiap finding ada owner, containment, corrective action dan close-out.</p>
 </div>
 </div>
 </div>
 </SectionCard>
 </div>
 </div>);
}
