'use client';

import Link from 'next/link';
import { Banknote, ClipboardList, TrendingUp } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { KpiCard, KpiGrid } from '@/components/shared/module-ui';
import { Button } from '@/components/ui/button';
import type { OperationsReportResponse, OperationsReportRow, OperationsReportTotals } from '@/lib/reports/operations-types';
import { reportCashierLabel, type View } from './model';
import { count, RM, statusLabel, subtextClass, time, type Column } from './report-ui';

type Row = OperationsReportRow;
type Totals = OperationsReportTotals;
type RowAction = (row: Row, event: MouseEvent<HTMLButtonElement>) => void;
export type RowActions = {
 branch: RowAction;
 day: RowAction;
 staff: RowAction;
 shift: RowAction;
 receipt: RowAction;
 allowFinanceReview: boolean;
};

const muted = 'block text-xs text-muted-foreground';
const linkStyle = 'cursor-pointer rounded text-left font-semibold text-foreground underline decoration-amber-600 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const dayLabel = (value?: string | null) => value?.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1') || '—';
const sortBranch = (r: Row) => r.branch_name || r.branch_code;
const shiftLabel = (r: Row) => r.shift_number || (r.shift_id ? 'Syif tanpa nombor' : 'Syif belum dipadankan');
const staffLabel = reportCashierLabel;
const branchLabel = (r: Row) => r.branch_name || r.branch_code || 'Cawangan belum dikenal pasti';

function openRow(label: string, hint: string, row: Row, action?: RowAction) {
 return action
  ? <button type="button" className={linkStyle} aria-label={`${label} — ${hint}`}
    onClick={(event) => action(row, event)}>{label}</button>
  : <span className="font-medium">{label}</span>;
}

function BranchCell({ row, drill }: { row: Row; drill?: RowAction }) {
 return <div className="min-w-32">
  {openRow(branchLabel(row), 'Lihat jualan harian', row, row.branch_id ? drill : undefined)}
  {row.branch_name && row.branch_code && <span className={muted}>{row.branch_code}</span>}
 </div>;
}

function Scale({ label, value }: { label: string; value: ReactNode }) {
 return <div className="space-y-0.5">
  <dt className="text-xs text-muted-foreground">{label}</dt>
  <dd className="font-semibold tabular-nums">{value}</dd>
 </div>;
}

export function dataNotice(state?: string | null) {
 switch (state) {
  case 'trial_unavailable':
  case 'trial_not_available':
   return 'Rekod ujian tidak tersedia. Data operasi tidak digunakan sebagai ganti.';
  case 'no_records':
  case 'no_data':
  case 'empty':
   return 'Tiada rekod yang sepadan dalam skop dan tempoh ini.';
  case 'unavailable':
   return 'Data belum tersedia. Ruang kosong bukan RM0.00.';
  case 'complete':
   return null;
  case 'partial':
   return 'Ada rekod yang belum lengkap atau memerlukan semakan. Jumlah berdasarkan bukti yang tersedia setakat laporan dijana.';
  default:
   return 'Jumlah berdasarkan rekod yang tersedia setakat masa laporan dijana. Kelengkapan penyelarasan belum disahkan.';
 }
}

function Settlement({ settlement }: Pick<OperationsReportResponse, 'settlement'>) {
 const source = typeof settlement?.source === 'string' ? settlement.source : null;
 const amount = typeof settlement?.amount === 'number' ? settlement.amount : null;
 const label = typeof settlement?.label === 'string' ? settlement.label : null;
 const verified = typeof settlement?.verified_amount === 'number' ? settlement.verified_amount : null;
 return <div className="rounded-lg border bg-muted/25 p-3 text-sm">
  <p className="font-medium">Serahan kepada HQ / penyelesaian bank</p>
  <p className="mt-1 text-muted-foreground">
   {source && (label || amount != null) ? <>{label || 'Rekod serahan / penyelesaian'}{amount != null && <>: <strong>{RM(amount)}</strong></>} · Sumber: {source === 'bank_in_records' ? 'Kewangan → Bank Masuk' : source}
    {source === 'bank_in_records' && <span className="block">Disahkan oleh Kewangan: {verified == null ? 'belum ada rekod disahkan' : RM(verified)}.</span>}
    <span className="block">Mengikut tarikh bank masuk, bukan tarikh jualan. Ini bukan bukti settlement QR.</span></>
    : 'Belum direkod dalam laporan ini. Kutipan disahkan bukan bukti serahan tunai atau penyelesaian bank.'}
  </p>
 </div>;
}

export function Overview({ data, onReview }: { data: OperationsReportResponse; onReview: () => void }) {
 const { totals, settlement } = data;
 return <div className="space-y-3">
  <KpiGrid cols={3}>
   <KpiCard title="Jualan bersih yang disahkan" value={RM(totals.net_sales)} icon={TrendingUp}
    description="Jualan selesai dengan bayaran penuh disahkan, selepas diskaun dan pemulangan." />
   <KpiCard title="Kutipan yang disahkan" value={RM(totals.confirmed)} icon={Banknote} variant="success"
    description="Jumlah bayaran yang direkodkan sebagai diterima." />
   <KpiCard title="Perlu tindakan" value={<button type="button" className={linkStyle}
    aria-label={`Perlu tindakan: ${totals.review_count == null ? 'bilangan belum tersedia' : count(totals.review_count) + ' kes'}. Lihat senarai kes.`}
    onClick={onReview}>{count(totals.review_count)}</button>} icon={ClipboardList} variant="warning"
    description="Kes untuk disemak, bukan jumlah wang hilang." />
  </KpiGrid>
  <div className="rkj-surface rounded-lg p-4">
   <dl className="mb-3 border-b pb-3 text-sm">
    <Scale label="Jualan bersih direkodkan dalam POS" value={RM(totals.recorded_sales)} />
   </dl>
   <p className="text-sm font-semibold">Pecahan kutipan disahkan</p>
   <p className="mt-0.5 text-xs text-muted-foreground">
    Komponen kutipan di atas, bukan amaun tambahan. Jualan direkodkan boleh termasuk QR belum disahkan. Kutipan boleh termasuk bahagian tunai pesanan yang masih menunggu QR.
   </p>
   <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
    <Scale label="Tunai daripada jualan" value={RM(totals.cash)} />
    <Scale label="QR disahkan" value={RM(totals.qr)} />
    {Boolean(totals.other) && <Scale label="Kaedah lain" value={RM(totals.other)} />}
   </dl>
  </div>
  <Settlement settlement={settlement} />
 </div>;
}

export function FilteredTotals({ totals, view }: { totals: Totals; view: View }) {
 return <div className="rounded-lg border p-3">
  <p className="text-sm font-semibold">Jumlah mengikut penapis aktif</p>
  <p className="text-xs text-muted-foreground">Meliputi semua halaman, tanpa carian jadual.</p>
  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 xl:grid-cols-6">
   {view !== 'summary' && <>
    <Scale label="Jualan bersih disahkan" value={RM(totals.net_sales)} />
    <Scale label="Jualan bersih direkodkan" value={RM(totals.recorded_sales)} />
    <Scale label="Kutipan disahkan" value={RM(totals.confirmed)} />
    <Scale label="Tunai jualan (pecahan)" value={RM(totals.cash)} />
    <Scale label="QR disahkan (pecahan)" value={RM(totals.qr)} />
    {Boolean(totals.other) && <Scale label="Kaedah lain (pecahan)" value={RM(totals.other)} />}
   </>}
   <Scale label="Transaksi selesai" value={count(totals.sales_count)} />
   {view !== 'transactions' && <Scale label="Syif" value={count(totals.shift_count)} />}
   {view !== 'summary' && <Scale label="Kes perlu tindakan" value={count(totals.review_count)} />}
  </dl>
 </div>;
}

function CashDetails({ row }: { row: Row }) {
 const hasExpected = Number.isFinite(row.expected_cash);
 const hasCounted = Number.isFinite(row.counted_cash);
 return <details className="mt-2 rounded-md border bg-background p-2">
  <summary className="cursor-pointer rounded font-medium focus-visible:outline-2 focus-visible:outline-ring">Rekod tunai syif</summary>
  <dl className="mt-3 grid grid-cols-2 gap-2">
   <Scale label="Tunai jualan syif (rekod terkini)" value={RM(row.shift_cash_sales)} />
   <Scale label="Float pembukaan" value={RM(row.opening_float)} />
   <Scale label="Pergerakan tunai lain" value={RM(row.other_cash_movements)} />
   <Scale label="Tunai dijangka" value={RM(row.expected_cash)} />
   <Scale label="Tunai dikira" value={RM(row.counted_cash)} />
   <Scale label="Perbezaan" value={hasExpected && hasCounted ? RM(row.cash_variance) : '—'} />
  </dl>
  {!hasCounted && <p className="mt-2 text-xs text-muted-foreground">Kiraan tunai belum direkodkan.</p>}
  {hasCounted && !hasExpected && <p className="mt-2 text-xs text-muted-foreground">Tunai dijangka belum direkodkan.</p>}
 </details>;
}

function hasCashEvidence(row: Row) {
 return /cash/i.test(row.case_type ?? '') || [
  row.opening_float, row.shift_cash_sales, row.other_cash_movements,
  row.expected_cash, row.counted_cash, row.cash_variance,
 ].some((value) => value != null);
}

function ActionCell({ row, actions }: { row: Row; actions: RowActions }) {
 const type = row.case_type?.toLowerCase() ?? '';
 const payment = /payment|qr|unmatched/.test(type);
 const cash = hasCashEvidence(row);
 const shift = /shift|cashier|staff|attribution/.test(type);
 return <div className="min-w-52 max-w-sm space-y-1">
  <p>{row.action_label || 'Semak rekod asal.'}</p>
  {row.transaction_id && openRow('Lihat resit', 'Butiran transaksi berkaitan', row, actions.receipt)}
  {payment && (actions.allowFinanceReview
   ? <p className={muted}><Link className={linkStyle} href="/finance">Kewangan</Link>: buka Semakan Fiuu VT atau QR Manual dan padankan rujukan asal.</p>
   : <p className={muted}>Rujuk Kewangan dengan rujukan, amaun dan syif asal. Jangan caj semula.</p>)}
  {(shift || cash) && <p className={muted}>Semak rekod POS{row.shift_number ? ` untuk syif ${row.shift_number}` : ' cawangan'}.
   {cash && ' Jangan guna tunai dijangka sebagai kiraan fizikal.'}</p>}
  {cash && <CashDetails row={row} />}
 </div>;
}

const moneyColumn = (id: keyof Totals, label: string): Column<Row> => ({
 id, label, numeric: true, value: (row) => row[id], cell: (row) => RM(row[id]),
});
const countColumn = (id: keyof Totals, label: string): Column<Row> => ({
 id, label, numeric: true, value: (row) => row[id], cell: (row) => count(row[id]),
});
const datetimeColumn = (id: 'sold_at' | 'payment_confirmed_at' | 'case_at' | 'last_activity_at', label: string): Column<Row> => ({
 id, label, value: (row) => row[id], cell: (row) => <span className="whitespace-nowrap">{time(row[id])}</span>,
});
const paymentColumns = [
 moneyColumn('cash', 'Tunai jualan'), moneyColumn('qr', 'QR disahkan'), moneyColumn('other', 'Kutipan lain'),
];
const salesColumn: Column<Row> = {
 ...moneyColumn('net_sales', 'Jualan bersih disahkan'),
 cell: (row) => <>
  {RM(row.net_sales)}
  {row.recorded_sales != null && row.recorded_sales !== row.net_sales &&
   <span className={muted}>Direkodkan: {RM(row.recorded_sales)}</span>}
 </>,
};
const confirmedColumn = moneyColumn('confirmed', 'Kutipan disahkan');
const salesCountColumn = countColumn('sales_count', 'Transaksi selesai');
const reviewColumn = countColumn('review_count', 'Perlu tindakan');

export function columnsFor(view: View, actions: RowActions): Column<Row>[] {
 const branch: Column<Row> = { id: 'branch', label: 'Cawangan', value: sortBranch, cell: (row) => <BranchCell row={row} /> };
 switch (view) {
  case 'summary':
   return [
    { ...branch, cell: (row) => <BranchCell row={row} drill={actions.branch} /> },
    { id: 'am', label: 'AM', value: (r) => r.manager_names?.join(', '),
     cell: (r) => r.manager_names ? r.manager_names.join(', ') || 'Belum ditetapkan' : '—' },
    salesColumn, confirmedColumn, ...paymentColumns, salesCountColumn, countColumn('shift_count', 'Syif'), reviewColumn,
    datetimeColumn('last_activity_at', 'Aktiviti terakhir (MYT)'),
   ];
  case 'daily':
   return [
    { id: 'day', label: 'Tarikh (MYT)', value: (r) => r.day,
     cell: (r) => openRow(dayLabel(r.day), `Lihat syif dan staf untuk ${branchLabel(r)}`, r, r.day ? actions.day : undefined) },
    branch, salesColumn, confirmedColumn, ...paymentColumns, salesCountColumn, reviewColumn,
   ];
  case 'shifts':
   return [
    { id: 'staff', label: 'Staf / juruwang', value: (r) => r.cashier_name, cell: (r) =>
     openRow(staffLabel(r), r.shift_id ? 'Lihat transaksi staf dalam syif ini' : 'Lihat transaksi staf ini',
      r, r.cashier_id ? actions.staff : undefined) },
    branch,
    { id: 'shift', label: 'Syif', value: (r) => r.shift_number, cell: (r) =>
     <div className="min-w-32">{openRow(shiftLabel(r), 'Lihat transaksi syif ini', r, r.shift_id ? actions.shift : undefined)}
      <span className={muted}>{statusLabel(r.shift_status)}</span>
     </div> },
    { id: 'planned', label: 'Dirancang (MYT)', value: (r) => r.planned_start, cell: (r) =>
     <Pair a="Mula" av={time(r.planned_start)} b="Tamat" bv={time(r.planned_end)} /> },
    { id: 'actual', label: 'Sebenar (MYT)', value: (r) => r.opened_at, cell: (r) =>
     <Pair a="Buka" av={time(r.opened_at)} b="Tutup" bv={time(r.closed_at)} /> },
    { id: 'staff-time', label: 'Rekod juruwang (MYT)', value: (r) => r.cashier_started_at, cell: (r) =>
     <Pair a="Mula" av={time(r.cashier_started_at)} b="Tamat" bv={time(r.cashier_ended_at)} /> },
    salesCountColumn,
    { ...salesColumn, label: 'Jualan bersih dalam tempoh' },
    { ...confirmedColumn, label: 'Kutipan dalam tempoh' },
    ...paymentColumns,
    { id: 'full-shift', label: 'Jumlah penuh syif (juruwang)', value: (r) => r.full_shift_net_sales, cell: (r) =>
     <Pair a="Jualan" av={RM(r.full_shift_net_sales)} b="Kutipan" bv={RM(r.full_shift_confirmed)} /> },
   ];
  case 'actions':
   return [
    { id: 'case', label: 'Jenis kes', value: (r) => r.case_label, cell: (r) => <div className="min-w-32">
     <span className="font-semibold">{r.case_label || 'Rekod perlu semakan'}</span>
     {r.status && <span className={muted}>{statusLabel(r.status)}</span>}
     {r.reference && <span className={`${muted} break-all`}>{r.reference}</span>}
    </div> },
    branch,
    datetimeColumn('case_at', 'Masa kes (MYT)'),
    { id: 'person', label: 'Staf / syif', value: (r) => r.cashier_name, cell: (r) =>
     <div className="min-w-28">{r.cashier_name || '—'}<span className={muted}>{r.shift_number || '—'}</span></div> },
    { id: 'amount', label: 'Amaun kes', numeric: true, value: (r) => r.amount, cell: (r) => RM(r.amount) },
    { id: 'action', label: 'Tindakan', cell: (r) => <ActionCell row={r} actions={actions} /> },
   ];
  case 'transactions':
   return [
    { id: 'receipt', label: 'Resit / transaksi', value: (r) => r.receipt_number ?? r.transaction_number, cell: (r) =>
     <div className="min-w-32">{openRow(r.receipt_number || r.transaction_number || 'Butiran resit', 'Buka resit', r, r.transaction_id ? actions.receipt : undefined)}
      {r.receipt_number && r.transaction_number && <span className={muted}>{r.transaction_number}</span>}
     </div> },
    datetimeColumn('sold_at', 'Masa jualan asal (MYT)'),
    branch,
    { id: 'staff', label: 'Juruwang / syif asal', value: (r) => r.cashier_name, cell: (r) =>
     <div className="min-w-32">{staffLabel(r)}<span className={muted}>{shiftLabel(r)}</span></div> },
    { id: 'status', label: 'Status transaksi', value: (r) => r.status, cell: (r) =>
     <>{statusLabel(r.status)}
      {r.recorded_sales != null && r.confirmed != null && r.recorded_sales > r.confirmed &&
       <span className={muted}>Kutipan belum lengkap</span>}
     </> },
    datetimeColumn('payment_confirmed_at', 'Bayaran disahkan (MYT)'),
    salesColumn, confirmedColumn, ...paymentColumns,
   ];
  case 'receipt':
   return [];
 }
}

export function Pair({ a, av, b, bv }: { a: string; av: string; b: string; bv: string }) {
 return <dl className="space-y-1 whitespace-nowrap">
  <div><dt className="inline text-xs text-muted-foreground">{a}: </dt><dd className="inline tabular-nums">{av}</dd></div>
  <div><dt className="inline text-xs text-muted-foreground">{b}: </dt><dd className="inline tabular-nums">{bv}</dd></div>
 </dl>;
}

export function searchableRow(row: Row) {
 return [
  row.branch_code, row.branch_name, ...(row.manager_names ?? []), row.day, row.day && dayLabel(row.day),
  row.cashier_name, row.shift_number, row.transaction_number, row.receipt_number,
  row.status && statusLabel(row.status), row.shift_status && statusLabel(row.shift_status),
  row.case_label, row.case_type, row.action_label, row.reference,
 ];
}

export function CasesTotal({ total }: { total: number }) {
 return <p className={subtextClass}><strong className="text-foreground">{count(total)} kes</strong> sepadan dengan penapis aktif, merentas semua halaman.</p>;
}

export function ViewTransactionsButton({ onClick }: { onClick: () => void }) {
 return <Button type="button" variant="outline" onClick={onClick}>Lihat transaksi dalam skop</Button>;
}
