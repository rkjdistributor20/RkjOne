'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ArrowLeft, BarChart3, CalendarDays, ClipboardList, Users } from 'lucide-react';
import { ModuleHeader, ModuleLayout, moduleTabsTriggerClass } from '@/components/shared/module-ui';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { OperationsReportFilters, OperationsReportRow } from '@/lib/reports/operations-types';
import { ActiveFilters, FilterBar } from './operations/filters';
import { CASE_TYPES, mytToday, PAGE_SIZE, presetRange, reportUrl, TABS, workspaceUrl, type Filters, type Tab, type View, type WorkspaceSelection } from './operations/model';
import { ReceiptDialog } from './operations/receipt';
import { count, emptyControls, ExportCsv, panelClass, ReportError, ReportLoading, ReportTable, selectClass, subtextClass, time, useReport, type TableControls } from './operations/report-ui';
import { CasesTotal, columnsFor, dataNotice, FilteredTotals, Overview, searchableRow, ViewTransactionsButton, type RowActions } from './operations/views';

type Browse = TableControls & { page: number };
type Drill = { tab: Tab; view: View; filters: Filters; label: string; parentBrowse: Browse; catalog?: OperationsReportFilters };
const firstPage: Browse = { ...emptyControls, page: 1 };
const icons = { summary: BarChart3, daily: CalendarDays, shifts: Users, actions: ClipboardList };
const panels = {
 summary: { title: 'Sumbangan mengikut cawangan', details: 'Pilih cawangan untuk menyemak pecahan harian.' },
 daily: { title: 'Jualan mengikut hari dan cawangan', details: 'Hari jualan bermula jam 00:00 MYT. Pilih tarikh untuk membuka rekod syif dan staf.' },
 shifts: { title: 'Jualan mengikut syif dan staf', details: 'Jumlah dalam tempoh mengikut masa jualan asal. Jumlah penuh bagi setiap juruwang dalam syif boleh melintasi tengah malam; jangan tambahnya kepada jumlah tempoh.' },
 actions: { title: 'Senarai kes perlu tindakan', details: 'Pesanan, percubaan bayaran dan pembayaran disahkan ialah rekod berbeza. Amaun kes bukan kutipan diterima, hutang atau wang hilang.' },
 transactions: { title: 'Transaksi & resit', details: 'Bayaran lewat kekal pada jualan asal. Senarai turut memaparkan rekod batal atau pulangan, yang tidak dikira sebagai transaksi selesai.' },
 receipt: { title: 'Butiran resit', details: '' },
};

export function OperationalReportWorkspace({
 initial, today, scope,
}: {
 initial: WorkspaceSelection;
 today: string;
 scope: 'owner' | 'admin' | 'area';
}) {
 const isArea = scope === 'area';
 const [selection, setSelection] = useState(initial);
 const [drills, setDrills] = useState<Drill[]>([]);
 const [browse, setBrowse] = useState(firstPage);
 const [revision, setRevision] = useState(0);
 const [resetDates, setResetDates] = useState(0);
 const [focusVersion, setFocusVersion] = useState(0);
 const [receipt, setReceipt] = useState<{ id: string; opener: HTMLButtonElement; open: boolean }>();
 const panelHeading = useRef<HTMLHeadingElement>(null);
 const drill = drills.at(-1);
 const tab = drill?.tab ?? selection.tab;
 const view = drill?.view ?? tab;
 const filters = drill?.filters ?? selection.filters;
 const url = reportUrl(view, filters, { page: browse.page, caseType: selection.caseType });
 const csv = reportUrl(view, filters, { csv: true, caseType: selection.caseType });
 const report = useReport(url, revision);
 const data = report?.data;
 const banner = data ? dataNotice(data.data_state) : null;
 const panel = panels[view];

 useEffect(() => {
  if (focusVersion) panelHeading.current?.focus();
 }, [focusVersion]);

 function save(next: WorkspaceSelection) {
  setSelection(next);
  window.history.replaceState(null, '', workspaceUrl(next));
 }

 function changeFilters(changes: Partial<Filters>, caseType = selection.caseType) {
  if (drill) return;
  setDrills([]);
  setBrowse(firstPage);
  save({ tab, caseType, filters: { ...selection.filters, ...changes } });
 }

 function resetFilters() {
  changeFilters({ ...presetRange('month', mytToday()), amId: '', branchId: '', staffId: '', shiftId: '', data: 'operational' }, '');
  setResetDates((n) => n + 1);
 }

 function switchTab(next: Tab, focus = false) {
  setDrills([]);
  setBrowse(firstPage);
  save({ ...selection, tab: next, caseType: focus && next === 'actions' ? '' : selection.caseType });
  if (focus) setFocusVersion((n) => n + 1);
 }

 function openDrill(nextTab: Tab, nextView: View, label: string, overrides: Partial<Filters> = {}) {
  setDrills((previous) => [...previous, {
   tab: nextTab, view: nextView, label, filters: { ...filters, ...overrides }, parentBrowse: browse, catalog: data?.filters,
  }]);
  setBrowse(firstPage);
  setFocusVersion((n) => n + 1);
 }

 function back() {
  if (!drill) return;
  setBrowse(drill.parentBrowse);
  setDrills((previous) => previous.slice(0, -1));
  setFocusVersion((n) => n + 1);
 }

 function openReceipt(row: OperationsReportRow, event: MouseEvent<HTMLButtonElement>) {
  if (!row.transaction_id) return;
  setReceipt({ id: row.transaction_id, opener: event.currentTarget, open: true });
 }

 const actions: RowActions = {
  branch: (row) => {
   if (row.branch_id) openDrill('daily', 'daily', row.branch_name || row.branch_code || 'Cawangan dipilih', { branchId: row.branch_id });
  },
  day: (row) => {
   if (row.day) openDrill('shifts', 'shifts', row.day + ' MYT', { from: row.day, to: row.day, branchId: row.branch_id || filters.branchId });
  },
  staff: (row) => {
   if (row.cashier_id) openDrill('shifts', 'transactions', row.cashier_name || 'Staf dipilih', {
    branchId: row.branch_id || filters.branchId, staffId: row.cashier_id, shiftId: row.shift_id || filters.shiftId,
   });
  },
  shift: (row) => {
   if (row.shift_id) openDrill('shifts', 'transactions', row.shift_number || 'Syif dipilih', {
    branchId: row.branch_id || filters.branchId, shiftId: row.shift_id,
   });
  },
  receipt: openReceipt,
  allowFinanceReview: !isArea,
 };
 const refresh = () => setRevision((n) => n + 1);
 function goToPage(page: number) {
  setBrowse((previous) => ({ ...previous, page }));
  setFocusVersion((n) => n + 1);
 }
 const title = scope === 'owner' ? 'Owner' : scope === 'admin' ? 'Admin Utama' : 'Pengurus Kawasan';
 const lastPage = data ? Math.min(5000, Math.ceil(data.total_rows / PAGE_SIZE)) : 0;

 return <ModuleLayout className="min-w-0">
  <ModuleHeader title="Laporan Operasi" icon={BarChart3}
   description={isArea
    ? 'Jualan, kutipan dan susulan bagi cawangan dalam jagaan anda.'
    : 'Jualan, kutipan dan susulan merentas cawangan dalam skop organisasi anda.'}
   badges={<span className="rounded-md border bg-background px-2 py-1 text-xs font-medium">{title}</span>}
   actions={<Link href={workspaceUrl(selection, true)} prefetch={false}
    className="rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
    Laporan lain & inventori
   </Link>}
  />
  <FilterBar filters={selection.filters} today={today} catalog={drills[0]?.catalog ?? data?.filters} canFilterAm={!isArea}
   change={changeFilters} reset={resetFilters} refresh={refresh} resetDates={resetDates} locked={Boolean(drill)} />
  <Tabs value={tab} onValueChange={(value) => {
   const next = TABS.find(([id]) => id === value)?.[0];
   if (next) switchTab(next);
  }} className="min-w-0 gap-3">
   <TabsList aria-label="Paparan laporan operasi" className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
    {TABS.map(([id, label]) => {
     const Icon = icons[id];
     return <TabsTrigger key={id} value={id} className={`${moduleTabsTriggerClass} min-h-10 min-w-0 whitespace-normal`}>
      <Icon aria-hidden="true" /> {label}
     </TabsTrigger>;
    })}
   </TabsList>
   {TABS.filter(([id]) => id !== tab).map(([id]) => <TabsContent key={id} value={id} />)}
   <TabsContent key={tab} value={tab} className="min-w-0">
    <div className="space-y-4">
     {drill && <nav aria-label="Laluan butiran laporan" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button type="button" variant="outline" size="sm" onClick={back}><ArrowLeft aria-hidden="true" /> Kembali</Button>
      <ol className="flex flex-wrap gap-2 text-xs text-muted-foreground">
       {drills.map((item, index) => <li key={index} aria-current={index === drills.length - 1 ? 'location' : undefined}>
        {index > 0 && <span aria-hidden="true"> / </span>}{item.label}
       </li>)}
      </ol>
     </nav>}
     <ActiveFilters filters={filters} catalog={data?.filters} scopedToBranches={isArea} />
     {drill && <p className="text-xs text-muted-foreground">Skop butiran ini sementara. Kembali untuk memulihkan paparan sebelumnya.</p>}
     {data && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <p>Dijana: <span className="font-medium text-foreground">{time(data.generated_at)} MYT</span></p>
      <p>— bermaksud tiada nilai tersedia, bukan RM0.00.</p>
     </div>}
     {banner && <p className="rounded-md border border-amber-400/40 bg-amber-50/60 px-3 py-2 text-sm text-foreground dark:bg-amber-950/20">
      {filters.data === 'trial' && data?.data_state === 'no_data'
       ? 'Tiada rekod ujian berpenanda dalam skop ini. Data operasi tidak digunakan sebagai ganti.' : banner}
     </p>}
     {view === 'summary' && data && <Overview data={data} onReview={() => switchTab('actions', true)} />}
     <section className={panelClass} aria-labelledby="operations-table-title" aria-busy={!report}>
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div className="max-w-2xl space-y-1">
        <h2 ref={panelHeading} id="operations-table-title" tabIndex={-1} className="font-semibold focus:outline-none">
         {panel.title}
        </h2>
        <p className={subtextClass}>{panel.details}</p>
       </div>
       <div className="flex flex-wrap items-start gap-2">
        {view === 'shifts' && <ViewTransactionsButton onClick={() => openDrill('shifts', 'transactions', 'Transaksi dalam skop')} />}
        {data && <ExportCsv key={csv} url={csv} />}
       </div>
      </div>
      {view === 'actions' && <div className="max-w-xs space-y-1">
       <label htmlFor="operations-case" className="block text-sm font-medium">Jenis kes</label>
       <select id="operations-case" className={selectClass} value={selection.caseType} onChange={(event) => {
        const value = CASE_TYPES.find(([id]) => id === event.target.value)?.[0] ?? '';
        setBrowse(firstPage);
        save({ ...selection, caseType: value });
       }}>
        <option value="">Semua kes</option>
        {CASE_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
       </select>
      </div>}
      {!report ? <ReportLoading /> : report.error ? <ReportError error={report.error} retry={refresh} /> : data && <>
       {view === 'actions'
        ? <CasesTotal total={data.total_rows} />
        : <FilteredTotals totals={data.totals} view={view} />}
       <ReportTable title={panel.title} rows={data.rows}
        columns={columnsFor(view, actions).filter((column) => column.id !== 'other' || Boolean(data.totals.other))}
        rowKey={(row, index) => [row.transaction_id, row.case_type, row.reference, row.branch_id, row.day, row.shift_id, row.cashier_id, index].join(':')}
        controls={browse} update={(controls) => setBrowse((previous) => ({ ...previous, ...controls }))}
        searchable={searchableRow} multiPage={data.total_rows > PAGE_SIZE}
        emptyText={browse.page > 1 ? 'Tiada rekod pada halaman ini. Kembali ke halaman sebelumnya.' : 'Tiada rekod yang sepadan dalam skop dan tempoh ini.'} />
       {(browse.page > 1 || data.has_more) && <nav aria-label="Halaman jadual laporan" className="flex flex-wrap items-center gap-2 text-sm">
        <Button type="button" variant="outline" disabled={browse.page <= 1} onClick={() => goToPage(browse.page - 1)}>Sebelumnya</Button>
        <span>Halaman {count(browse.page)}{lastPage >= browse.page ? ' / ' + count(lastPage) : ''} · {count(data.total_rows)} baris</span>
        <Button type="button" variant="outline" disabled={!data.has_more || browse.page >= 5000} onClick={() => goToPage(browse.page + 1)}>Seterusnya</Button>
       </nav>}
       <p className="text-xs text-muted-foreground">Eksport meliputi penapis aktif, bukan carian atau susunan halaman jadual.</p>
      </>}
     </section>
    </div>
   </TabsContent>
  </Tabs>
  <ReceiptDialog transactionId={receipt?.open ? receipt.id : null} filters={filters} opener={receipt?.opener}
   close={() => setReceipt((current) => current ? { ...current, open: false } : current)} />
 </ModuleLayout>;
}
