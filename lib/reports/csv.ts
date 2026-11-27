import { MOVEMENT_TYPES, reportTime } from './filters';
import type { InventoryReportRow, MovementReportRow, ReportTransaction, ShiftClosureRow, StaffPerformanceRow } from './types';

type Cell = string | number | null;
const timestamp = (value: string | null) => value ? reportTime(value) : null;

function csvCell(value: Cell) {
 if (value === null) return '';
 if (typeof value === 'number') return String(value);
 // Quote every text cell and prevent spreadsheet formulas in stored text.
 const safe = /^[\s\u0000-\u001f]*[=+\-@\t\r\n]/u.test(value) ? `'${value}` : value;
 return `"${safe.replaceAll('"', '""')}"`;
}

export function encodeCsv(rows: Cell[][]) {
 return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function transactionCsv(rows: ReportTransaction[]) {
 return encodeCsv([
  ['Transaksi', 'Resit', 'Masa jualan (MYT)', 'Kod cawangan', 'Cawangan', 'Juruwang', 'ID juruwang',
   'Syif', 'ID syif', 'Status transaksi', 'Masa batal/pulangan (MYT)', 'Sebab batal/pulangan',
   'Kaedah', 'Jumlah asal (RM)', 'Tunai bersih (RM)', 'QR disahkan (RM)', 'QR menunggu (RM)', 'QR tidak disahkan (RM)'],
  ...rows.map((row) => [
   row.transaction_number, row.receipt_number, reportTime(row.sold_at), row.branch_code, row.branch_name,
   row.cashier_name, row.cashier_id, row.shift_number, row.shift_id, row.status,
   timestamp(row.reversed_at), row.reversal_reason ?? null, row.payment_method,
   row.total, row.cash, row.qr_confirmed, row.qr_pending, row.qr_unverified,
  ]),
 ]);
}

export function staffCsv(rows: StaffPerformanceRow[]) {
 return encodeCsv([
  ['Cawangan asal', 'Juruwang asal', 'ID juruwang', 'Syif asal', 'ID syif', 'Syif dibuka (MYT)', 'Syif ditutup (MYT)',
   'Juruwang mula (MYT)', 'Juruwang tamat (MYT)', 'Transaksi selesai', 'Jualan (RM)'],
  ...rows.map((row) => [row.branch_name, row.cashier_name, row.cashier_id, row.shift_number, row.shift_id,
   timestamp(row.opened_at), timestamp(row.shift_closed_at), timestamp(row.cashier_started_at), timestamp(row.cashier_ended_at),
   row.transaction_count, row.total_sales]),
 ]);
}

export function shiftClosureCsv(rows: ShiftClosureRow[]) {
 return encodeCsv([
  ['Kod cawangan', 'Cawangan', 'Syif', 'ID syif', 'Syif dibuka (MYT)', 'Syif ditutup (MYT)', 'Kerja syif tamat (MYT)',
   'Tunai dijangka (RM)', 'Tunai dikira (RM)', 'Perbezaan tunai (RM)'],
  ...rows.map((row) => [row.branch_code, row.branch_name, row.shift_number, row.shift_id, timestamp(row.opened_at),
   timestamp(row.closed_at), timestamp(row.actual_work_ended_at), row.expected_cash, row.closing_cash, row.cash_variance]),
 ]);
}

export function inventoryCsv(rows: InventoryReportRow[]) {
 return encodeCsv([
  ['Cawangan', 'Lokasi', 'Kod item', 'Item', 'Kuantiti', 'Unit', 'Status'],
  ...rows.map((row) => [row.branch_name, row.location_name, row.item_code, row.name, row.quantity, row.unit, row.status]),
 ]);
}

export function movementCsv(rows: MovementReportRow[]) {
 return encodeCsv([
  ['Masa (MYT)', 'Cawangan', 'Lokasi', 'Kod item', 'Item', 'Pergerakan', 'Kuantiti', 'Unit',
   'Sebelum', 'Selepas', 'Jenis rujukan', 'ID rujukan', 'Pelaku', 'ID pelaku'],
  ...rows.map((row) => [
   reportTime(row.created_at), row.branch_name, row.location_name, row.item_code, row.name,
   MOVEMENT_TYPES[row.movement_type], row.quantity, row.unit, row.balance_before, row.balance_after,
   row.reference_type, row.reference_id, row.actor_name, row.created_by,
  ]),
 ]);
}
