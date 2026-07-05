/** ISO week: Monday start (Malaysia payroll convention) */

export type WeekRange = {
 period_start: string;
 period_end: string;
 label: string;
};

function toIsoDate(d: Date) {
 return d.toISOString().slice(0, 10);
}

export function getWeekRangeContaining(reference: Date, offsetWeeks = 0): WeekRange {
 const d = new Date(reference);
 d.setHours(12, 0, 0, 0);
 const day = d.getDay();
 const diffToMonday = day === 0 ? -6 : 1 - day;
 d.setDate(d.getDate() + diffToMonday + offsetWeeks * 7);
 const start = new Date(d);
 const end = new Date(d);
 end.setDate(end.getDate() + 6);
 return {
 period_start: toIsoDate(start),
 period_end: toIsoDate(end),
 label: `${toIsoDate(start)} - ${toIsoDate(end)}`,
 };
}

/** Minggu lepas (lengkap) - lalai untuk jana gaji pekerja asing */
export function getPreviousCompleteWeek(reference = new Date()): WeekRange {
 return getWeekRangeContaining(reference, -1);
}

export function getCurrentWeek(reference = new Date()): WeekRange {
 return getWeekRangeContaining(reference, 0);
}
