import { MOVEMENT_TYPES, reportTime } from './filters';
import type { InventoryReportRow, MovementReportRow, ReportTransaction } from './types';

type Cell = string | number | null;

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
   'Syif', 'ID syif', 'Status transaksi', 'Kaedah', 'Jumlah (RM)', 'Tunai bersih (RM)',
   'QR disahkan (RM)', 'QR menunggu (RM)', 'QR tidak disahkan (RM)'],
  ...rows.map((row) => [
   row.transaction_number, row.receipt_number, reportTime(row.sold_at), row.branch_code, row.branch_name,
   row.cashier_name, row.cashier_id, row.shift_number, row.shift_id, row.status, row.payment_method,
   row.total, row.cash, row.qr_confirmed, row.qr_pending, row.qr_unverified,
  ]),
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
