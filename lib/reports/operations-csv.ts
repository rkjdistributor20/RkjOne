import { encodeCsv } from './csv';
import { reportTime } from './filters';
import type { ParsedOperationsReportFilters } from './operations-filters';
import type { OperationsReportPayload, OperationsReportReceiptItem, OperationsReportRow, OperationsReportTotals } from './operations-types';

type Cell = string | number | null;

const totalColumns = {
 recorded_sales: 'Jualan bersih direkodkan (RM)',
 net_sales: 'Jualan bersih disahkan (RM)',
 cash: 'Tunai daripada jualan (RM)',
 qr: 'QR disahkan (RM)',
 other: 'Kutipan lain disahkan (RM)',
 confirmed: 'Kutipan disahkan (RM)',
 sales_count: 'Bilangan transaksi',
 shift_count: 'Bilangan syif',
 review_count: 'Bilangan kes dalam semakan',
} satisfies Record<keyof OperationsReportTotals, string>;

const rowColumns = {
 branch_code: 'Kod cawangan',
 branch_name: 'Cawangan',
 branch_id: 'ID cawangan',
 manager_names: 'AM',
 day: 'Tarikh (MYT)',
 cashier_name: 'Juruwang',
 cashier_id: 'ID juruwang',
 shift_number: 'Syif',
 shift_id: 'ID syif',
 planned_start: 'Mula dirancang (MYT)',
 planned_end: 'Tamat dirancang (MYT)',
 opened_at: 'Syif dibuka (MYT)',
 closed_at: 'Syif ditutup (MYT)',
 shift_status: 'Status syif',
 cashier_started_at: 'Juruwang mula (MYT)',
 cashier_ended_at: 'Juruwang tamat (MYT)',
 ...totalColumns,
 full_shift_net_sales: 'Jualan bersih penuh syif (RM)',
 full_shift_confirmed: 'Kutipan disahkan penuh syif (RM)',
 last_activity_at: 'Aktiviti terakhir (MYT)',
 transaction_number: 'Transaksi',
 transaction_id: 'ID transaksi',
 transaction_total: 'Jumlah selepas diskaun asal (RM)',
 discount_amount: 'Diskaun asal (RM)',
 receipt_number: 'Resit',
 sold_at: 'Masa jualan (MYT)',
 payment_confirmed_at: 'Masa bayaran disahkan (MYT)',
 status: 'Status',
 reversed_at: 'Masa batal/pulangan (MYT)',
 reversal_reason: 'Sebab batal/pulangan',
 case_type: 'Jenis kes',
 case_label: 'Kes',
 action_label: 'Tindakan',
 case_at: 'Masa kes (MYT)',
 amount: 'Amaun kes (RM)',
 reference: 'Rujukan',
 opening_float: 'Float pembukaan (RM)',
 expected_cash: 'Tunai dijangka (RM)',
 counted_cash: 'Tunai dikira (RM)',
 cash_variance: 'Perbezaan tunai (RM)',
 other_cash_movements: 'Pergerakan tunai lain (RM)',
 shift_cash_sales: 'Tunai jualan syif (RM)',
} satisfies Record<keyof OperationsReportRow, string>;

const itemColumns = {
 sku: 'SKU item resit',
 name: 'Nama item resit',
 quantity: 'Kuantiti item resit',
 unit_price: 'Harga seunit (RM)',
 line_total: 'Jumlah item (RM)',
} satisfies Record<keyof OperationsReportReceiptItem, string>;

const timestamps = new Set<keyof OperationsReportRow>([
 'planned_start', 'planned_end', 'opened_at', 'closed_at', 'cashier_started_at', 'cashier_ended_at',
 'last_activity_at', 'sold_at', 'payment_confirmed_at', 'reversed_at', 'case_at',
]);
const viewLabels = {
 summary: 'Ringkasan', daily: 'Harian', shifts: 'Syif & Staf',
 actions: 'Perlu Tindakan', transactions: 'Transaksi', receipt: 'Resit',
};

function mytTimestamp(value: string) {
 // A scheduled clock time (without a zone) is already in the report's local time.
 return /[T ]\d{2}:\d{2}.*(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value) && Number.isFinite(Date.parse(value))
  ? reportTime(value) : value;
}

function formulaSafe(cell: Cell): Cell {
 // Also account for format controls and full-width formula starters. Numbers
 // stay numeric, so a recorded negative variance is not exported as text.
 return typeof cell === 'string' && /^[\s\p{Cc}\p{Cf}]*[=+\-@＝＋－＠\t\r\n]/u.test(cell)
  ? `'${cell}` : cell;
}

export function operationsReportCsv(report: OperationsReportPayload, query: ParsedOperationsReportFilters) {
 const actions = query.view === 'actions';
 const rowKeys = (Object.keys(rowColumns) as (keyof OperationsReportRow)[])
  .filter((key) => !actions || (!Object.hasOwn(totalColumns, key)
   && key !== 'transaction_total' && key !== 'discount_amount'
   && key !== 'full_shift_net_sales' && key !== 'full_shift_confirmed'));
 const itemKeys = query.view === 'receipt' ? Object.keys(itemColumns) as (keyof OperationsReportReceiptItem)[] : [];
 const project = (row: OperationsReportRow) => rowKeys.map((key) => {
  const value = row[key];
  if (Array.isArray(value)) return value.join('; ');
  return typeof value === 'string' && timestamps.has(key) ? mytTimestamp(value) : value ?? null;
 });

 const header = ['Jenis rekod', 'Medan laporan', 'Nilai', ...rowKeys.map((key) => rowColumns[key]), ...itemKeys.map((key) => itemColumns[key])];
 const rows: Cell[][] = [header];
 const metadata: [string, Cell][] = [
  ['Paparan', viewLabels[query.view]], ['Dari (MYT)', query.from], ['Hingga (MYT)', query.to],
  ['Zon waktu', 'MYT (Asia/Kuala_Lumpur)'], ['Dijana pada (MYT)', reportTime(report.generated_at)],
  ['Dijana pada (ISO)', report.generated_at], ['Jenis data', query.data], ['Bilangan baris', report.total_rows],
  ['Keadaan data', report.data_state ?? null],
 ];
 if (query.branchId) {
  metadata.push(['branch_id', query.branchId]);
  const branch = report.filters.branches.find(({ id }) => id === query.branchId);
  if (branch) metadata.push(['Cawangan dipilih', branch.name]);
 }
 if (query.amId) {
  metadata.push(['am_id', query.amId]);
  const manager = report.filters.managers.find(({ id }) => id === query.amId);
  if (manager) metadata.push(['AM dipilih', manager.name]);
 }
 if (query.staffId) {
  metadata.push(['staff_id', query.staffId]);
  const staff = report.filters.staff.find(({ id }) => id === query.staffId);
  if (staff) metadata.push(['Staf dipilih', staff.name]);
 }
 if (query.shiftId) {
  metadata.push(['shift_id', query.shiftId]);
  const shift = report.filters.shifts.find(({ id }) => id === query.shiftId);
  if (shift) metadata.push(['Syif dipilih', shift.number]);
 }
 if (query.transactionId) metadata.push(['transaction_id', query.transactionId]);
 if (query.caseType) metadata.push(['case_type', query.caseType]);
 if (report.settlement != null && !actions) metadata.push(['Serahan / settlement (JSON)', JSON.stringify(report.settlement)]);

 for (const [field, value] of metadata) rows.push(['Metadata', field, value]);
 if (actions) rows.push(['Jumlah kes', 'Kes sepadan dengan penapis aktif', report.total_rows]);
 else rows.push(['Jumlah keseluruhan', null, null, ...project(report.totals)]);
 if (query.view === 'receipt' && report.receipt) {
  const receipt = report.receipt;
  rows.push(['Butiran', null, null, ...project({ ...report.rows[0], ...receipt })]);
  for (const item of receipt.items) {
   rows.push(['Item resit', null, null, ...rowKeys.map(() => null), ...itemKeys.map((key) => item[key] ?? null)]);
  }
 } else {
  for (const row of report.rows) rows.push(['Butiran', null, null, ...project(row)]);
 }

 return encodeCsv(rows.map((row) => Array.from({ length: header.length }, (_, i) => formulaSafe(row[i] ?? null))));
}
