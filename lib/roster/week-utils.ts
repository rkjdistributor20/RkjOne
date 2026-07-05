/** Hari dalam minggu kerja - 0 = Isnin ... 6 = Ahad */

export const DAY_LABELS = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd'] as const;
export const DAY_LABELS_FULL = [
 'Isnin',
 'Selasa',
 'Rabu',
 'Khamis',
 'Jumaat',
 'Sabtu',
 'Ahad',
] as const;

export function getMonday(d: Date = new Date()): Date {
 const x = new Date(d);
 x.setHours(0, 0, 0, 0);
 const day = x.getDay();
 const diff = day === 0 ? -6 : 1 - day;
 x.setDate(x.getDate() + diff);
 return x;
}

export function formatDateISO(d: Date): string {
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, '0');
 const day = String(d.getDate()).padStart(2, '0');
 return `${y}-${m}-${day}`;
}

export function getThisWeekStart(from = new Date()): string {
 return formatDateISO(getMonday(from));
}

export function getNextWeekStart(from = new Date()): string {
 const mon = getMonday(from);
 mon.setDate(mon.getDate() + 7);
 return formatDateISO(mon);
}

/** Ahad sebelum Isnin minggu sasaran - deadline muat turun jadual */
export function getRosterDeadline(weekStartIso: string): Date {
 const mon = new Date(`${weekStartIso}T00:00:00`);
 const sun = new Date(mon);
 sun.setDate(sun.getDate() ?? 1);
 sun.setHours(23, 59, 59, 999);
 return sun;
}

export function isRosterOverdue(weekStartIso: string, now = new Date()): boolean {
 return now > getRosterDeadline(weekStartIso);
}

export function daysUntilDeadline(weekStartIso: string, now = new Date()): number {
 const deadline = getRosterDeadline(weekStartIso);
 return Math.ceil((deadline.getTime() ?? now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Reminder dari Isnin minggu semasa sehingga deadline Ahad */
export function shouldRemindRoster(weekStartIso: string, now = new Date()): boolean {
 const weekStart = new Date(`${weekStartIso}T00:00:00`);
 const thisMonday = getMonday(now);
 if (weekStart <= thisMonday) return false;
 if (isRosterOverdue(weekStartIso, now)) return false;
 return now >= thisMonday;
}

export function shiftDateForWeek(weekStartIso: string, dayIndex: number): string {
 const d = new Date(`${weekStartIso}T00:00:00`);
 d.setDate(d.getDate() + dayIndex);
 return formatDateISO(d);
}

export function formatWeekRange(weekStartIso: string): string {
 const start = new Date(`${weekStartIso}T00:00:00`);
 const end = new Date(start);
 end.setDate(end.getDate() + 6);
 const fmt = (d: Date) =>
 d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' });
 return `${fmt(start)} - ${fmt(end)}`;
}
