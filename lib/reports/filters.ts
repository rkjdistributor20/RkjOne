export const MOVEMENT_TYPES = {
 RECEIVE: 'Stok masuk',
 TRANSFER_IN: 'Pindahan masuk',
 TRANSFER_OUT: 'Pindahan keluar',
 ADJUSTMENT: 'Pelarasan',
 COUNT: 'Kiraan',
 WRITE_OFF: 'Hapus kira',
 SALE_DEDUCT: 'Potongan jualan',
 PRODUCTION: 'Pengeluaran',
} as const;

export const MOVEMENT_FILTERS = {
 INBOUND: 'Semua stok masuk',
 OUTBOUND: 'Semua stok keluar',
 TRANSFER: 'Semua pindahan',
 ...MOVEMENT_TYPES,
} as const;

export type MovementType = keyof typeof MOVEMENT_TYPES;
export type ReportFilters = { from: string; to: string; branchId: string };

const mytDateTime = new Intl.DateTimeFormat('en-GB', {
 timeZone: 'Asia/Kuala_Lumpur',
 year: 'numeric', month: '2-digit', day: '2-digit',
 hour: '2-digit', minute: '2-digit', second: '2-digit',
 hourCycle: 'h23',
});

export function reportTime(value: string | Date) {
 const parts = Object.fromEntries(mytDateTime.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function defaultReportRange(now = new Date()) {
 const to = reportTime(now).slice(0, 10);
 return { from: `${to.slice(0, 7)}-01`, to };
}

const uuidPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = 86_400_000;

function dateValue(value: string) {
 if (!datePattern.test(value) || value < '1900-01-01') return NaN;
 const timestamp = Date.parse(`${value}T00:00:00Z`);
 return Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(value) ? timestamp : NaN;
}

function optionalId(params: URLSearchParams, key: string) {
 const value = params.get(key);
 if (value !== null && !uuidPattern.test(value)) throw new Error('ID penapis tidak sah');
 return value?.toLowerCase() ?? null;
}

export function parseReportFilters(params: URLSearchParams, now?: Date) {
 const defaults = defaultReportRange(now);
 const from = params.get('from') ?? defaults.from;
 const to = params.get('to') ?? defaults.to;
 const span = dateValue(to) - dateValue(from);
 if (!Number.isFinite(span) || span < 0 || span > 365 * dayMs) {
  throw new Error('Julat tarikh MYT tidak sah (maksimum 366 hari).');
 }

 const rawPage = params.get('page') ?? '1';
 const rawLimit = params.get('limit');
 const page = Number(rawPage);
 const limit = rawLimit === null ? null : Number(rawLimit);
 if (!/^\d+$/.test(rawPage) || page < 1 || page > 5000
   || (rawLimit !== null && (!/^\d+$/.test(rawLimit) || limit! < 1 || limit! > 200))) {
  throw new Error('Halaman atau had tidak sah');
 }

 const movementType = params.get('movement_type');
 if (movementType !== null && !Object.hasOwn(MOVEMENT_FILTERS, movementType)) {
  throw new Error('Jenis pergerakan tidak sah');
 }

 const format = params.get('format') ?? 'json';
 if (format !== 'json' && format !== 'csv') throw new Error('Format laporan tidak sah');
 return {
  from, to, page, limit, format, movementType,
  branchId: optionalId(params, 'branch_id'),
  transactionId: optionalId(params, 'transaction_id'),
 };
}
