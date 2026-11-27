'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BarChart3, Banknote, Building2, Download, Package, TrendingUp, Truck, Users, Wallet, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
 KpiCard, KpiGrid, ModuleHeader, ModuleLayout, ModuleLoading, PrimaryActionButton,
 moduleTabsListClass, moduleTabsTriggerClass,
} from '@/components/shared/module-ui';
import { LOGISTIK_LABEL } from '@/lib/fleet/logistics-label';
import { fetchReport, reportUrl } from '@/lib/reports/api';
import { defaultReportRange, MOVEMENT_FILTERS, MOVEMENT_TYPES, reportTime, type ReportFilters } from '@/lib/reports/filters';
import type {
 BranchPerformanceRow, FleetReportSummary, InventoryReportRow, MovementReportRow, ProductPerformanceRow,
 ReportOverview, ReportPage, ReportPaymentAttempt, ReportReceipt, ReportScope, ReportTransaction,
 SalesTrendRow, ShiftClosureRow, StaffPerformanceRow,
} from '@/lib/reports/types';

const money = new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' });
const fmt = (value: number) => money.format(value);
const recordedMoney = (value: number | null) => value == null ? '—' : fmt(value);
const time = (value: string | null) => value ? reportTime(value) : '—';
const identity = (name: string | null, id: string | null) => name ?? id ?? '—';
const selectClass = 'h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm';

const tabs = [
 ['sales', 'Jualan', TrendingUp],
 ['branches', 'Cawangan', Building2],
 ['products', 'Produk', Package],
 ['staff', 'Staf & Syif', Users],
 ['inventory', 'Stok', Warehouse],
 ['fleet', LOGISTIK_LABEL, Truck],
] as const;

function ReportData<T>({ url, children }: { url: string; children: (data: T) => ReactNode }) {
 const [result, setResult] = useState<{ url: string; data: T } | { url: string; error: string }>();
 useEffect(() => {
  const controller = new AbortController();
  void fetchReport<T>(url, controller.signal).then((data) => {
   if (!controller.signal.aborted) setResult({ url, data });
  }, (err: unknown) => {
   if (!controller.signal.aborted) setResult({ url, error: err instanceof Error ? err.message : 'Laporan tidak dapat dimuatkan' });
  });
  return () => controller.abort();
 }, [url]);

 if (result?.url !== url) return <ModuleLoading />;
 if ('error' in result) return <p role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">{result.error}</p>;
 return children(result.data);
}

export function ReportsDashboard() {
 const [filters, setFilters] = useState<ReportFilters>(() => ({ ...defaultReportRange(), branchId: '' }));
 const [revision, setRevision] = useState(0);
 const [tab, setTab] = useState('sales');
 const refresh = () => setRevision((value) => value + 1);
 const selectedTab = tab === 'fleet' && filters.branchId ? 'sales' : tab;
 const updateFilter = (key: keyof ReportFilters, value: string) => {
  setFilters((current) => ({ ...current, [key]: value }));
  if (key === 'branchId' && tab === 'fleet') setTab('sales');
 };

 return (
  <ModuleLayout>
   <ModuleHeader
    title="Laporan"
    description="Jualan, syif dan stok mengikut cawangan. Tarikh dan masa menggunakan MYT."
    icon={BarChart3}
    actions={
     <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
       <Label className="text-xs" htmlFor="reports-branch">Cawangan</Label>
       <ReportData<ReportScope> key={revision} url={reportUrl('scope')}>
        {({ branches }) => (
         <select id="reports-branch" className={selectClass} value={filters.branchId}
          onChange={(e) => updateFilter('branchId', e.target.value)}>
          <option value="">Semua cawangan dalam skop</option>
          {filters.branchId && !branches.some((branch) => branch.id === filters.branchId) &&
           <option value={filters.branchId} disabled>Cawangan tidak tersedia</option>}
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
         </select>
        )}
       </ReportData>
      </div>
      <div className="space-y-1">
       <Label className="text-xs" htmlFor="reports-from">Dari (MYT)</Label>
       <Input id="reports-from" type="date" className="h-9 w-36" value={filters.from}
        onChange={(e) => updateFilter('from', e.target.value)} />
      </div>
      <div className="space-y-1">
       <Label className="text-xs" htmlFor="reports-to">Hingga (MYT)</Label>
       <Input id="reports-to" type="date" className="h-9 w-36" value={filters.to}
        onChange={(e) => updateFilter('to', e.target.value)} />
      </div>
      <PrimaryActionButton className="h-9" onClick={refresh}>Muat Semula</PrimaryActionButton>
     </div>
    }
   />
   <ReportData<{ overview: ReportOverview }> key={reportUrl('overview', filters, { revision: String(revision) })}
    url={reportUrl('overview', filters)}>
    {({ overview }) => (
     <>
      <KpiGrid>
       <KpiCard title="Jualan direkodkan" value={fmt(overview.total_sales)} icon={TrendingUp} />
       <KpiCard title="Transaksi selesai" value={overview.transaction_count} icon={BarChart3} />
       <KpiCard title="Tunai bersih / QR disahkan"
        value={fmt(overview.total_cash) + ' / ' + fmt(overview.total_qr)} icon={Banknote} />
       <KpiCard title="QR menunggu pengesahan" value={fmt(overview.pending_qr)} icon={Wallet} />
      </KpiGrid>
      <Tabs value={selectedTab === 'fleet' && !overview.organization_wide ? 'sales' : selectedTab}
       onValueChange={setTab} className="space-y-4">
       <TabsList className={moduleTabsListClass}>
        {tabs.filter(([id]) => id !== 'fleet' || overview.organization_wide).map(([id, label, Icon]) => (
         <TabsTrigger key={id} value={id} className={moduleTabsTriggerClass}>
          <Icon className="h-4 w-4" /> {label}
         </TabsTrigger>
        ))}
       </TabsList>

       <TabsContent value="sales" className="space-y-4">
        <SalesTrend filters={filters} />
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
         <span>Batal: <strong>{overview.void_count}</strong></span>
         <span>Pulangan: <strong>{overview.refund_count}</strong></span>
         <span>Stok rendah/kritikal: <strong>{overview.low_stock_count}</strong></span>
         {overview.payroll_net !== undefined && <span>Gaji bersih: <strong>{fmt(overview.payroll_net)}</strong></span>}
         {overview.outstanding_cash !== undefined && <span>Tunai belum dibankkan: <strong>{fmt(overview.outstanding_cash)}</strong></span>}
        </div>
        <p className="text-sm text-muted-foreground">
         Jualan direkodkan boleh merangkumi QR belum disahkan. QR tanpa bukti pengesahan atau dengan status gagal/batal:
         {' '}{fmt(overview.unverified_qr)}. Percubaan yang belum menjadi jualan tidak termasuk dalam jumlah ini.
        </p>
        <SalesDetails filters={filters} />
       </TabsContent>
       <TabsContent value="branches">
        <ReportData<{ branches: BranchPerformanceRow[] }> url={reportUrl('branches', filters, { limit: '200' })}>
         {({ branches }) => <ReportTable headers={['Cawangan', 'Wilayah', 'Jualan', 'Transaksi', 'Tunai bersih', 'QR disahkan', 'QR menunggu']}
          rows={branches.map((b) => [b.branch_name, b.region_name, fmt(b.total_sales), b.transaction_count,
           fmt(b.total_cash), fmt(b.total_qr), fmt(b.pending_qr)])} />}
        </ReportData>
       </TabsContent>
       <TabsContent value="products">
        <ReportData<{ products: ProductPerformanceRow[] }> url={reportUrl('products', filters)}>
         {({ products }) => <ReportTable headers={['Produk', 'SKU', 'Kuantiti', 'Jualan baris item']}
          rows={products.map((p) => [p.product_name, p.sku, p.quantity_sold, fmt(p.revenue)])} />}
        </ReportData>
       </TabsContent>
       <TabsContent value="staff">
        <StaffDetails filters={filters} />
       </TabsContent>
       <TabsContent value="inventory"><StockDetails filters={filters} /></TabsContent>
       {overview.organization_wide && (
        <TabsContent value="fleet">
         <ReportData<{ fleet: FleetReportSummary }> url={reportUrl('fleet', filters)}>
          {({ fleet }) => <ReportTable headers={['Jumlah pesanan', 'Menunggu', 'Dalam perjalanan', 'Dihantar']}
           rows={[[fleet.total_orders, fleet.pending, fleet.in_transit, fleet.delivered]]} />}
         </ReportData>
        </TabsContent>
       )}
      </Tabs>
     </>
    )}
   </ReportData>
  </ModuleLayout>
 );
}

function SalesTrend({ filters }: { filters: ReportFilters }) {
 return (
  <Card>
   <CardHeader className="pb-2"><CardTitle className="text-base">Jualan Harian (MYT)</CardTitle></CardHeader>
   <CardContent>
    <ReportData<{ trend: SalesTrendRow[] }> url={reportUrl('sales', filters)}>
     {({ trend }) => <ReportTable headers={['Tarikh', 'Jualan direkodkan', 'Transaksi', 'Tunai bersih',
      'QR disahkan', 'QR menunggu', 'QR tidak disahkan']}
      rows={trend.map((r) => [r.period, fmt(r.total_sales), r.transaction_count, fmt(r.total_cash),
       fmt(r.total_qr), fmt(r.pending_qr), fmt(r.unverified_qr)])} />}
    </ReportData>
   </CardContent>
  </Card>
 );
}

function PagedReport<T extends object>({ url, children }: {
 url: string; children: (data: T) => ReactNode;
}) {
 const [page, setPage] = useState(1);
 return (
  <ReportData<T & ReportPage> key={page} url={url + '&page=' + page}>
   {(data) => (
    <div className="space-y-3">
     {children(data)}
     {(page > 1 || data.has_more) && (
      <div className="flex items-center gap-3 text-sm">
       <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelum</Button>
       <span>Halaman {page}</span>
       <Button variant="outline" size="sm" disabled={!data.has_more || page >= 5000}
        onClick={() => setPage(page + 1)}>Seterusnya</Button>
      </div>
     )}
    </div>
   )}
  </ReportData>
 );
}

function DownloadCsv({ url }: { url: string }) {
 const [busy, setBusy] = useState(false);
 const inflight = useRef<AbortController | null>(null);
 useEffect(() => () => inflight.current?.abort(), []);

 async function download() {
  if (inflight.current) return;
  const controller = new AbortController();
  inflight.current = controller;
  setBusy(true);
  try {
   const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
   if (!response.ok || !response.headers.get('content-type')?.startsWith('text/csv')) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? 'Eksport gagal. Sila cuba semula.');
   }
   const blobUrl = URL.createObjectURL(await response.blob());
   const link = document.createElement('a');
   link.href = blobUrl;
   link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'laporan.csv';
   document.body.appendChild(link);
   link.click();
   link.remove();
   window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err) {
   if (!controller.signal.aborted) toast.error(err instanceof Error ? err.message : 'Eksport gagal');
  } finally {
   inflight.current = null;
   if (!controller.signal.aborted) setBusy(false);
  }
 }
 return <Button variant="outline" size="sm" onClick={download} disabled={busy}>
  <Download className="h-4 w-4" /> {busy ? 'Menyediakan CSV…' : 'Eksport CSV'}
 </Button>;
}

const transactionAmounts = (t: ReportTransaction) =>
 [fmt(t.total), fmt(t.cash), fmt(t.qr_confirmed), fmt(t.qr_pending), fmt(t.qr_unverified)];
const amountHeaders = ['Jumlah asal jualan', 'Tunai bersih', 'QR disahkan', 'QR menunggu', 'QR tidak disahkan'];
const attemptLabels: Record<ReportPaymentAttempt['status'], string> = {
 PENDING: 'Menunggu', REPORTED: 'Dilapor • menunggu pengesahan', QUARANTINED: 'Dalam semakan',
 PAID: 'Disahkan • belum menjadi jualan',
};

function SalesDetails({ filters }: { filters: ReportFilters }) {
 const [view, setView] = useState('transactions');
 const [receiptId, setReceiptId] = useState<string>();
 return (
  <Card>
   <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
    <CardTitle className="text-base">Butiran Jualan</CardTitle>
    <div className="flex flex-wrap items-center gap-2">
     <select aria-label="Jenis butiran jualan" className={selectClass} value={view} onChange={(e) => {
      setReceiptId(undefined);
      setView(e.target.value);
     }}>
      <option value="transactions">Transaksi & resit</option>
      <option value="payments">Percubaan bayaran belum dipos</option>
     </select>
     {view === 'transactions' && <DownloadCsv url={reportUrl('transactions', filters, { format: 'csv' })} />}
    </div>
   </CardHeader>
   <CardContent className="space-y-3">
    {view === 'transactions' ? (
     <>
      <p className="text-sm text-muted-foreground">
       Tarikh ditapis mengikut jualan asal (MYT). Amaun jualan batal atau pulangan bukan kutipan bersih atau bukti dana dipulangkan.
      </p>
      {receiptId && (
       <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
         <h3 className="font-medium">Butiran resit</h3>
         <Button variant="ghost" size="sm" onClick={() => setReceiptId(undefined)}>Tutup</Button>
        </div>
        <ReportData<{ receipt: ReportReceipt }> key={receiptId} url={reportUrl('receipt', filters, { transaction_id: receiptId })}>
         {({ receipt }) => (
          <>
           <p className="text-sm">
            {receipt.receipt_number ?? receipt.transaction_number} · {receipt.branch_name} · {time(receipt.sold_at)} MYT
            {' · '}{receipt.payment_method} · {receipt.status}
           </p>
           <p className="text-sm text-muted-foreground">
            Juruwang: {identity(receipt.cashier_name, receipt.cashier_id)} · Syif: {identity(receipt.shift_number, receipt.shift_id)}
           </p>
           {receipt.status !== 'COMPLETED' && <p className="text-sm">
            Masa batal/pulangan (MYT): {time(receipt.reversed_at)} · Sebab: {receipt.reversal_reason ?? '—'}
           </p>}
           <ReportTable headers={amountHeaders} rows={[transactionAmounts(receipt)]} />
           <ReportTable headers={['Item', 'SKU', 'Kuantiti', 'Harga seunit', 'Jumlah']}
            rows={receipt.items.map((i) => [i.name, i.sku, i.quantity, fmt(i.unit_price), fmt(i.line_total)])} />
          </>
         )}
        </ReportData>
       </div>
      )}
      <PagedReport<{ transactions: ReportTransaction[] }> url={reportUrl('transactions', filters)}>
       {({ transactions }) => <ReportTable headers={['Transaksi', 'Resit', 'Masa jualan (MYT)', 'Cawangan asal',
        'Juruwang asal', 'Syif asal', 'Status', 'Masa batal/pulangan (MYT)', 'Sebab batal/pulangan', ...amountHeaders]}
        rows={transactions.map((t) => [
         <Button key={t.id} variant="link" size="sm" onClick={() => setReceiptId(t.id)}>{t.transaction_number}</Button>,
         t.receipt_number, time(t.sold_at), t.branch_name, identity(t.cashier_name, t.cashier_id),
         identity(t.shift_number, t.shift_id), t.status, time(t.reversed_at), t.reversal_reason, ...transactionAmounts(t),
        ])} />}
      </PagedReport>
     </>
    ) : (
     <>
      <p className="text-sm text-muted-foreground">Setiap baris ialah satu percubaan bayaran, bukan jualan. Jangan jumlahkan percubaan ini.</p>
      <PagedReport<{ payments: ReportPaymentAttempt[] }> url={reportUrl('payments', filters)}>
       {({ payments }) => <ReportTable headers={['Masa (MYT)', 'Cawangan', 'Juruwang', 'Syif', 'Amaun percubaan', 'Status']}
        rows={payments.map((p) => [time(p.created_at), p.branch_name, identity(p.cashier_name, p.cashier_id),
         identity(p.shift_number, p.shift_id), fmt(p.amount_rm), attemptLabels[p.status]])} />}
      </PagedReport>
     </>
    )}
   </CardContent>
  </Card>
 );
}

function ShiftIdentity({ shift }: { shift: { shift_number: string | null; shift_id: string } }) {
 return <span className="whitespace-nowrap">
  {shift.shift_number && <span className="block">{shift.shift_number}</span>}
  <span className="text-xs text-muted-foreground">{shift.shift_id}</span>
 </span>;
}

function StaffDetails({ filters }: { filters: ReportFilters }) {
 const staffUrl = reportUrl('staff', filters);
 const closuresUrl = reportUrl('shift-closures', filters);
 return (
  <div className="space-y-4">
   <Card>
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
     <CardTitle className="text-base">Jualan mengikut juruwang dan syif asal</CardTitle>
     <DownloadCsv url={staffUrl + '&format=csv'} />
    </CardHeader>
    <CardContent className="space-y-3">
     <p className="text-sm text-muted-foreground">
      Masa mula/tamat ialah rekod kehadiran juruwang, bukan jadual atau tempoh bekerja. Jualan ditapis mengikut masa jualan asal.
     </p>
     <PagedReport<{ staff: StaffPerformanceRow[] }> key={staffUrl} url={staffUrl}>
      {({ staff }) => <ReportTable headers={['Juruwang asal', 'Cawangan asal', 'Syif asal', 'Syif dibuka (MYT)',
       'Syif ditutup (MYT)', 'Juruwang mula (MYT)', 'Juruwang tamat (MYT)', 'Transaksi selesai', 'Jualan']}
       rows={staff.map((s) => [identity(s.cashier_name, s.cashier_id), s.branch_name, <ShiftIdentity key={s.shift_id} shift={s} />,
        time(s.opened_at), time(s.shift_closed_at), time(s.cashier_started_at), time(s.cashier_ended_at), s.transaction_count,
        fmt(s.total_sales)])} />}
     </PagedReport>
    </CardContent>
   </Card>
   <Card>
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
     <CardTitle className="text-base">Perbezaan tunai ketika syif ditutup</CardTitle>
     <DownloadCsv url={closuresUrl + '&format=csv'} />
    </CardHeader>
    <CardContent className="space-y-3">
     <p className="text-sm text-muted-foreground">
      Ditapis mengikut masa tutup POS (MYT). Perbezaan direkod untuk seluruh syif, bukan juruwang: tunai dikira tolak tunai dijangka.
     </p>
     <PagedReport<{ closures: ShiftClosureRow[] }> key={closuresUrl} url={closuresUrl}>
      {({ closures }) => <ReportTable headers={['Cawangan', 'Syif', 'Syif dibuka (MYT)', 'Syif ditutup (MYT)',
       'Kerja syif tamat (MYT)', 'Tunai dijangka', 'Tunai dikira', 'Perbezaan tunai']}
       rows={closures.map((s) => [`${s.branch_code} · ${s.branch_name}`, <ShiftIdentity key={s.shift_id} shift={s} />,
        time(s.opened_at), time(s.closed_at), time(s.actual_work_ended_at), recordedMoney(s.expected_cash),
        recordedMoney(s.closing_cash), recordedMoney(s.cash_variance)])} />}
     </PagedReport>
    </CardContent>
   </Card>
  </div>
 );
}

function StockDetails({ filters }: { filters: ReportFilters }) {
 const [view, setView] = useState('inventory');
 const [movement, setMovement] = useState('');
 const extra = movement && view === 'movements' ? { movement_type: movement } : undefined;
 const url = reportUrl(view, filters, extra);
 return (
  <div className="space-y-3">
   <div className="flex flex-wrap items-center gap-2">
    <select aria-label="Jenis laporan stok" className={selectClass} value={view} onChange={(e) => setView(e.target.value)}>
     <option value="inventory">Baki semasa</option>
     <option value="movements">Sejarah pergerakan</option>
    </select>
    {view === 'movements' && (
     <select aria-label="Jenis pergerakan stok" className={selectClass} value={movement}
      onChange={(e) => setMovement(e.target.value)}>
      <option value="">Semua pergerakan</option>
      {Object.entries(MOVEMENT_FILTERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
     </select>
    )}
    <DownloadCsv key={url} url={url + '&format=csv'} />
   </div>
   {view === 'inventory' ? (
    <>
     <p className="text-sm text-muted-foreground">Baki semasa tidak ditapis mengikut tarikh.</p>
     <PagedReport<{ items: InventoryReportRow[] }> key={url} url={url}>
      {({ items }) => <ReportTable headers={['Cawangan', 'Lokasi', 'Kod item', 'Item', 'Kuantiti', 'Unit', 'Status']}
       rows={items.map((i) => [i.branch_name, i.location_name, i.item_code, i.name, i.quantity, i.unit, i.status])} />}
     </PagedReport>
    </>
   ) : (
    <PagedReport<{ movements: MovementReportRow[] }> key={url} url={url}>
     {({ movements }) => <ReportTable headers={['Masa (MYT)', 'Cawangan', 'Lokasi', 'Item', 'Jenis', 'Kuantiti',
      'Unit', 'Sebelum', 'Selepas', 'Rujukan', 'Pelaku']}
      rows={movements.map((m) => [time(m.created_at), m.branch_name, m.location_name, m.item_code + ' · ' + m.name,
       MOVEMENT_TYPES[m.movement_type], m.quantity, m.unit, m.balance_before, m.balance_after,
       [m.reference_type, m.reference_id].filter(Boolean).join(' · ') || null, identity(m.actor_name, m.created_by)])} />}
    </PagedReport>
   )}
  </div>
 );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
 if (!rows.length) return <p className="text-sm text-muted-foreground">Tiada rekod dalam skop ini.</p>;
 return (
  <div className="overflow-x-auto rounded-lg border">
   <table className="w-full text-sm">
    <thead className="border-b bg-muted/50 text-left">
     <tr>{headers.map((h) => <th key={h} scope="col" className="whitespace-nowrap p-3 font-medium">{h}</th>)}</tr>
    </thead>
    <tbody>
     {rows.map((row, i) => (
      <tr key={i} className="border-b last:border-0">
       {row.map((cell, j) => <td key={j} className="p-3">{cell ?? '—'}</td>)}
      </tr>
     ))}
    </tbody>
   </table>
  </div>
 );
}
