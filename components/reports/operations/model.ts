import { reportTime } from '@/lib/reports/filters';
import { operationsReportUrl } from '@/lib/reports/operations-api';
import type { OperationsReportData, OperationsReportView } from '@/lib/reports/operations-types';

export const TABS = [
 ['summary', 'Ringkasan'],
 ['daily', 'Harian'],
 ['shifts', 'Syif & Staf'],
 ['actions', 'Perlu Tindakan'],
] as const;

export type Tab = (typeof TABS)[number][0];
export type View = OperationsReportView;
export type Filters = {
 from: string;
 to: string;
 amId: string;
 branchId: string;
 staffId: string;
 shiftId: string;
 data: OperationsReportData;
};
export type ReportQuery = Record<string, string | string[] | undefined>;
export const CASE_TYPES = [
 ['payment_pending', 'Bayaran dalam semakan'],
 ['payment_unmatched', 'Bayaran belum dipadankan'],
 ['payment_duplicate', 'Padanan bayaran berganda'],
 ['qr_unverified', 'QR belum disahkan'],
 ['cash_variance', 'Perbezaan tunai'],
 ['cash_count_missing', 'Kiraan tunai belum direkodkan'],
 ['shift_open', 'Syif masih terbuka'],
 ['shift_incomplete', 'Rekod tutup syif belum lengkap'],
 ['transaction_incomplete', 'Rekod transaksi belum lengkap'],
] as const;
export type CaseType = (typeof CASE_TYPES)[number][0] | '';
export type WorkspaceSelection = { tab: Tab; filters: Filters; caseType: CaseType };

export const PRESETS = [
 ['today', 'Hari ini'],
 ['yesterday', 'Semalam'],
 ['week', 'Minggu ini'],
 ['month', 'Bulan ini'],
 ['custom', 'Julat tarikh'],
] as const;
export type Preset = (typeof PRESETS)[number][0];

const DAY_MS = 86_400_000;
const dateValue = (value: string) => Date.parse(value + 'T00:00:00Z');
const isoDay = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const validDate = (value: string) =>
 /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01'
 && Number.isFinite(dateValue(value)) && isoDay(dateValue(value)) === value;
const uuid = (value: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) ? value : '';

export function dateRangeError(from: string, to: string) {
 if (!validDate(from) || !validDate(to)) return 'Pilih tarikh mula dan akhir yang sah.';
 if (from > to) return 'Tarikh mula tidak boleh selepas tarikh akhir.';
 if (dateValue(to) - dateValue(from) > DAY_MS * 365) return 'Pilih tempoh tidak melebihi 366 hari.';
 return '';
}

export function presetRange(preset: Exclude<Preset, 'custom'>, today: string) {
 const todayValue = dateValue(today);
 if (preset === 'yesterday') {
  const yesterday = isoDay(todayValue - DAY_MS);
  return { from: yesterday, to: yesterday };
 }
 if (preset === 'week') {
  // Apply calendar arithmetic after choosing the current MYT day; Monday starts the week.
  const sinceMonday = (new Date(todayValue).getUTCDay() + 6) % 7;
  return { from: isoDay(todayValue - sinceMonday * DAY_MS), to: today };
 }
 return { from: preset === 'month' ? today.slice(0, 7) + '-01' : today, to: today };
}

export function mytToday() {
 return reportTime(new Date()).slice(0, 10);
}

const optionalParams = {
 amId: 'am_id',
 branchId: 'branch_id',
 staffId: 'staff_id',
 shiftId: 'shift_id',
} as const;

export function readSelection(query: ReportQuery, today: string, canFilterAm: boolean): WorkspaceSelection {
 const get = (key: string) => {
  const value = query[key];
  return typeof value === 'string' ? value : '';
 };
 const from = get('from');
 const to = get('to');
 const tab = TABS.find(([id]) => id === get('tab'))?.[0] ?? 'summary';
 return {
  tab,
  caseType: CASE_TYPES.find(([kind]) => kind === get('case_type'))?.[0] ?? '',
  filters: {
   ...(dateRangeError(from, to) ? presetRange('month', today) : { from, to }),
   amId: canFilterAm ? uuid(get('am_id')) : '',
   branchId: uuid(get('branch_id')),
   staffId: uuid(get('staff_id')),
   shiftId: uuid(get('shift_id')),
   data: get('data') === 'trial' ? 'trial' : 'operational',
  },
 };
}

function filterParams(filters: Filters) {
 const params = new URLSearchParams({ from: filters.from, to: filters.to, data: filters.data });
 for (const [key, param] of Object.entries(optionalParams)) {
  const value = filters[key as keyof typeof optionalParams];
  if (value) params.set(param, value);
 }
 return params;
}

export function workspaceUrl({ tab, filters, caseType }: WorkspaceSelection, legacy = false) {
 const params = filterParams(filters);
 if (tab !== 'summary') params.set('tab', tab);
 if (caseType) params.set('case_type', caseType);
 if (legacy) params.set('mode', 'legacy');
 return '/reports?' + params.toString();
}

export const PAGE_SIZE = 25;

export function reportUrl(view: View, filters: Filters, options: {
 page?: number;
 transactionId?: string;
 caseType?: string;
 csv?: boolean;
 } = {}) {
 const paged = !options.csv && view !== 'receipt';
 return operationsReportUrl({
  ...filters,
  view,
  format: options.csv ? 'csv' : 'json',
  transactionId: options.transactionId,
  caseType: view === 'actions' ? options.caseType : undefined,
  page: paged ? options.page ?? 1 : undefined,
  limit: paged ? PAGE_SIZE : undefined,
 });
}
