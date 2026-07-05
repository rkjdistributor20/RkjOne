/** Tempoh payroll bulanan - bulan lepas (lengkap) */

export type PeriodRange = {
 period_start: string;
 period_end: string;
 label: string;
};

function toIsoDate(d: Date) {
 return d.toISOString().slice(0, 10);
}

export function getPreviousCompleteMonth(reference = new Date()): PeriodRange {
 const d = new Date(reference);
 d.setHours(12, 0, 0, 0);
 d.setDate(1);
 d.setMonth(d.getMonth() ?? 1);
 const start = new Date(d);
 const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
 const monthNames = [
 'Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun',
 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis',
 ];
 const label = `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
 return {
 period_start: toIsoDate(start),
 period_end: toIsoDate(end),
 label,
 };
}

export function periodDays(start: string, end: string) {
 const s = new Date(`${start}T12:00:00`);
 const e = new Date(`${end}T12:00:00`);
 return Math.round((e.getTime() ?? s.getTime()) / 86400000) + 1;
}
