/** Hari dalam minggu kerja - 0 = Isnin ... 6 = Ahad. */
export const DAY_LABELS = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd'] as const;
export const DAY_LABELS_FULL = ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu', 'Ahad'] as const;
const DAY_MS = 86_400_000;
const MYT_ZONE = 'Asia/Kuala_Lumpur';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
 timeZone: MYT_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const timestampFormatter = new Intl.DateTimeFormat('ms-MY', {
 timeZone: MYT_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function malaysiaRosterDate(now = new Date()): string {
 const parts = dateFormatter.formatToParts(now);
 return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-');
}

export function formatRosterTimestamp(value: string): string {
 return timestampFormatter.format(new Date(value));
}

export function isRosterWeek(value: unknown): value is string {
 if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
 const day = new Date(`${value}T00:00:00Z`);
 return day.getUTCDay() === 1 && day.toISOString().slice(0, 10) === value;
}

export function shiftDateForWeek(weekStart: string, offset: number): string {
 const day = new Date(`${weekStart}T00:00:00Z`);
 day.setUTCDate(day.getUTCDate() + offset);
 return day.toISOString().slice(0, 10);
}

export function getThisWeekStart(now = new Date()): string {
 const today = malaysiaRosterDate(now);
 const day = new Date(`${today}T00:00:00Z`).getUTCDay();
 return shiftDateForWeek(today, -((day + 6) % 7));
}

export function getNextWeekStart(now = new Date()): string {
 return shiftDateForWeek(getThisWeekStart(now), 7);
}

export function rosterTimestamp(date: string, time = '00:00'): Date {
 return new Date(`${date}T${time}+08:00`);
}

export function getRosterDeadline(weekStart: string): Date {
 return new Date(rosterTimestamp(weekStart).getTime() - 1);
}

export function isRosterOverdue(weekStart: string, now = new Date()): boolean {
 return now > getRosterDeadline(weekStart);
}

export function daysUntilDeadline(weekStart: string, now = new Date()): number {
 return Math.ceil((getRosterDeadline(weekStart).getTime() - now.getTime()) / DAY_MS);
}

export function shouldRemindRoster(weekStart: string, now = new Date()): boolean {
 return weekStart > getThisWeekStart(now) && !isRosterOverdue(weekStart, now);
}

export function crossesMidnight(start: string | null | undefined, end: string | null | undefined): boolean {
 return Boolean(start && end && end < start);
}

export function formatWeekRange(weekStart: string): string {
 const fmt = (date: string) => rosterTimestamp(date).toLocaleDateString('ms-MY', {
  timeZone: MYT_ZONE, day: 'numeric', month: 'short',
 });
 return `${fmt(weekStart)} - ${fmt(shiftDateForWeek(weekStart, 6))}`;
}
