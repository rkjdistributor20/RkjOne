'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { reportTime } from '@/lib/reports/filters';
import type { OperationsReportResponse } from '@/lib/reports/operations-types';

export const panelClass = 'rkj-surface min-w-0 space-y-4 rounded-lg p-4 md:p-5';
export const selectClass = 'min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export const subtextClass = 'text-sm text-muted-foreground';

const ringgit = new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' });
const integer = new Intl.NumberFormat('ms-MY');
const compareText = new Intl.Collator('ms-MY', { numeric: true, sensitivity: 'base' });
export const RM = (value?: number | null) => typeof value === 'number' && Number.isFinite(value) ? ringgit.format(value) : '—';
export const count = (value?: number | null) => typeof value === 'number' && Number.isFinite(value) ? integer.format(value) : '—';
export function time(value?: string | null) {
 if (!value) return '—';
 if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
 if (!/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value) || !/[T ]\d{2}:\d{2}/.test(value)) return '—';
 const parsed = Date.parse(value);
 return Number.isFinite(parsed) ? reportTime(new Date(parsed)) : '—';
}

const statusText: Record<string, string> = {
 OPEN: 'Syif masih terbuka', CLOSED: 'Syif ditutup', ACTIVE: 'Aktif', APPROVED: 'Diluluskan',
 COMPLETED: 'Selesai', VOID: 'Batal', VOIDED: 'Batal', REFUNDED: 'Dipulangkan',
 PARTIALLY_REFUNDED: 'Pulangan separa', PENDING: 'Menunggu', REPORTED: 'Dilaporkan',
 PAID: 'Dibayar', QUARANTINED: 'Dalam semakan', FAILED: 'Gagal', CANCELLED: 'Dibatalkan',
};
export const statusLabel = (value?: string | null) => value ? statusText[value.toUpperCase()] ?? value : 'Tidak direkod';

type ReportResult = { url: string; revision: number } & (
 { data: OperationsReportResponse; error?: never } | { error: string; data?: never }
);

async function responseError(response: Response) {
 if (response.status === 401 || response.redirected) return 'Sesi anda mungkin telah tamat. Log masuk semula untuk melihat laporan.';
 if (response.status === 403) return 'Anda tidak mempunyai akses kepada laporan atau penapis ini.';
 const body = await response.json().catch(() => null);
 return typeof body?.error === 'string' ? body.error : 'Laporan tidak dapat dimuatkan. Sila cuba lagi.';
}

export function useReport(url: string | null, revision: number) {
 const [result, setResult] = useState<ReportResult>();
 useEffect(() => {
  if (!url) return;
  const controller = new AbortController();
  async function load(currentUrl: string) {
   try {
    const response = await fetch(currentUrl, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
     throw new Error(await responseError(response));
    }
    const data = await response.json() as OperationsReportResponse;
    if (!Array.isArray(data.rows) || !Number.isFinite(data.total_rows) || !data.totals || !data.filters) {
     throw new Error('Respons laporan tidak lengkap. Sila cuba lagi.');
    }
    if (!controller.signal.aborted) setResult({ url: currentUrl, revision, data });
   } catch (error) {
    if (!controller.signal.aborted) {
     setResult({ url: currentUrl, revision, error: error instanceof Error ? error.message : 'Laporan tidak dapat dimuatkan.' });
    }
   }
  }
  void load(url);
  return () => controller.abort();
 }, [url, revision]);
 return url && result?.url === url && result.revision === revision ? result : undefined;
}

export function ReportLoading() {
 return <div role="status" className="space-y-3 py-3">
  <p className={subtextClass}>Memuatkan laporan…</p>
  <div aria-hidden="true" className="h-20 rounded-md bg-muted motion-safe:animate-pulse" />
 </div>;
}

export function ReportError({ error, retry }: { error: string; retry: () => void }) {
 return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
  <p role="alert" className="text-sm text-destructive">{error}</p>
  <Button type="button" variant="outline" size="sm" onClick={retry}>Cuba lagi</Button>
 </div>;
}

export function ExportCsv({ url }: { url: string }) {
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const inflight = useRef<AbortController | null>(null);
 useEffect(() => () => inflight.current?.abort(), []);

 async function download() {
  if (inflight.current) return;
  const controller = new AbortController();
  inflight.current = controller;
  setBusy(true);
  setError('');
  try {
   const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
   if (!response.ok || !response.headers.get('content-type')?.startsWith('text/csv')) {
    throw new Error(await responseError(response));
   }
   const blob = await response.blob();
   if (controller.signal.aborted) return;
   const objectUrl = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.href = objectUrl;
   link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'laporan-operasi.csv';
   document.body.appendChild(link);
   link.click();
   link.remove();
   window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (cause) {
   if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Eksport gagal.');
  } finally {
   inflight.current = null;
   if (!controller.signal.aborted) setBusy(false);
  }
 }

 return <div className="space-y-1">
  <Button type="button" variant="outline" onClick={download} disabled={busy}>
   <Download aria-hidden="true" /> {busy ? 'Menyediakan CSV…' : 'Eksport CSV'}
  </Button>
  {error && <p role="alert" className="max-w-sm text-sm text-destructive">{error}</p>}
 </div>;
}

type SortValue = string | number | null | undefined;
export type Column<Row> = {
 id: string;
 label: string;
 cell: (row: Row) => ReactNode;
 value?: (row: Row) => SortValue;
 numeric?: boolean;
};
export type TableControls = {
 search: string;
 sort: { column: string; direction: 'ascending' | 'descending' } | null;
};
export const emptyControls: TableControls = { search: '', sort: null };

function compareValues(a: SortValue, b: SortValue, descending: boolean) {
 if (a == null) return b == null ? 0 : 1;
 if (b == null) return -1;
 const order = typeof a === 'number' && typeof b === 'number' ? a - b : compareText.compare(String(a), String(b));
 return descending ? -order : order;
}

export function ReportTable<Row>({
 title, rows, columns, rowKey, controls, update, searchable, emptyText, multiPage = false,
}: {
 title: string;
 rows: Row[];
 columns: Column<Row>[];
 rowKey: (row: Row, index: number) => string;
 controls?: TableControls;
 update?: (controls: TableControls) => void;
 searchable?: (row: Row) => (string | null | undefined)[];
 emptyText: string;
 multiPage?: boolean;
}) {
 const id = useId();
 const term = controls?.search.trim().toLocaleLowerCase('ms-MY') ?? '';
 const matching = term && searchable
  ? rows.filter((row) => searchable(row).some((value) => value?.toLocaleLowerCase('ms-MY').includes(term)))
  : rows;
 const sortColumn = columns.find((column) => column.id === controls?.sort?.column);
 const order = sortColumn?.value;
 const sorted = order
  ? [...matching].sort((a, b) => compareValues(order(a), order(b), controls?.sort?.direction === 'descending'))
  : matching;

 return <div className="space-y-3">
  {controls && update && searchable && <div className="flex flex-wrap items-end justify-between gap-2">
   <div className="w-full space-y-1 sm:max-w-xs">
    <label htmlFor={id} className="text-sm font-medium">Cari dalam jadual{multiPage ? ' (halaman ini)' : ''}</label>
    <div className="relative">
     <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
     <Input id={id} type="search" value={controls.search} onChange={(event) => update({ ...controls, search: event.target.value })}
      className="min-h-10 pl-9" placeholder="Nama, kod atau rujukan" />
    </div>
   </div>
   {multiPage && <p className="text-xs text-muted-foreground">Carian dan susunan lajur hanya untuk halaman ini.</p>}
  </div>}
  {term && rows.length > 0 && <p role="status" className="text-xs text-muted-foreground">
   {count(matching.length)} padanan{multiPage ? ' pada halaman ini' : ''}
  </p>}
  {sorted.length === 0 ? <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
   {rows.length ? 'Tiada padanan carian pada halaman ini.' : emptyText}
  </p> : (
   <div role="region" aria-label={title} tabIndex={0}
    className="max-w-full overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-ring">
    <table className="w-full text-left text-sm">
     <caption className="sr-only">{title}</caption>
     <thead className="border-b bg-muted/70">
      <tr>{columns.map(({ id, label, value, numeric }) => {
       const direction = controls?.sort?.column === id ? controls.sort.direction : undefined;
       const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowDownUp;
       return <th key={id} scope="col" aria-sort={direction}
        className={`min-w-24 px-3 py-2.5 align-bottom font-semibold ${numeric ? 'text-right' : ''}`}>
        {value && controls && update
         ? <button type="button" className="inline-flex cursor-pointer items-center gap-1.5 rounded text-inherit hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => update({ ...controls, sort: { column: id, direction: direction === 'ascending' ? 'descending' : 'ascending' } })}>
           {label}<Icon aria-hidden="true" className="size-3.5 shrink-0" />
          </button>
         : label}
       </th>;
      })}</tr>
     </thead>
     <tbody>{sorted.map((row, index) =>
      <tr key={rowKey(row, index)} className="border-b last:border-0 hover:bg-muted/30">
       {columns.map((column) => <td key={column.id}
        className={`px-3 py-2.5 align-top ${column.numeric ? 'text-right whitespace-nowrap tabular-nums' : ''}`}>
        {column.cell(row)}
       </td>)}
      </tr>,
     )}</tbody>
    </table>
   </div>
  )}
 </div>;
}
