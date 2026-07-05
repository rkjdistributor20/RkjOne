/** Utiliti minggu production kilang (Isnin = mula minggu) */

const MS_DAY = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

function pad2(value: number): string {
 return String(value).padStart(2, '0');
}

function localDateIso(date: Date): string {
 return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function utcDateIso(date: Date): string {
 return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function parseIsoDateUtc(isoDate: string): Date {
 const [year, month, day] = isoDate.split('-').map(Number);
 return new Date(Date.UTC(year, month - 1, day));
}

export function todayIsoDate(): string {
 return localDateIso(new Date());
}

export function formatProductionDayLabel(isoDate: string): string {
 const d = parseIsoDateUtc(isoDate);
 const day = MS_DAY[d.getUTCDay()];
 return `${day} - ${d.toLocaleDateString('ms-MY', {
 day: 'numeric',
 month: 'short',
 timeZone: 'UTC',
 })}`;
}

export function mondayOfWeek(from: Date = new Date()): string {
 const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
 const day = d.getDay();
 const diff = d.getDate() - day + (day === 0 ? -6 : 1);
 d.setDate(diff);
 return localDateIso(d);
}

export function normalizeProductionWeekStart(candidateIso: string): string {
 const d = parseIsoDateUtc(candidateIso);
 const day = d.getUTCDay();
 if (day === 1) return utcDateIso(d);

 // Jadual production dibina untuk minggu operasi akan datang. Jika state lama
 // tersimpan sebagai Ahad akibat offset timezone, bawa ke Isnin selepasnya.
 const diff = day === 0 ? 1 : 1 - day;
 d.setUTCDate(d.getUTCDate() + diff);
 return utcDateIso(d);
}

export function mondayForProductionDate(isoDate: string): string {
 const d = parseIsoDateUtc(isoDate);
 const day = d.getUTCDay();
 const diff = day === 0 ? -6 : 1 - day;
 d.setUTCDate(d.getUTCDate() + diff);
 return utcDateIso(d);
}

export function activeProductionPlanningWeek(from: Date = new Date()): string {
 const currentMonday = mondayOfWeek(from);
 return from.getDay() === 0 ? addWeeks(currentMonday, 1) : currentMonday;
}

export function weekDayDates(mondayIso: string): string[] {
 const base = parseIsoDateUtc(normalizeProductionWeekStart(mondayIso));
 return Array.from({ length: 7 }, (_, i) => {
 const d = new Date(base);
 d.setUTCDate(base.getUTCDate() + i);
 return utcDateIso(d);
 });
}

export function addWeeks(mondayIso: string, weeks: number): string {
 const d = parseIsoDateUtc(normalizeProductionWeekStart(mondayIso));
 d.setUTCDate(d.getUTCDate() + weeks * 7);
 return utcDateIso(d);
}

export function formatWeekRange(mondayIso: string): string {
 const days = weekDayDates(mondayIso);
 const start = parseIsoDateUtc(days[0]);
 const end = parseIsoDateUtc(days[6]);
 return `${start.toLocaleDateString('ms-MY', {
 day: 'numeric',
 month: 'short',
 timeZone: 'UTC',
 })} - ${end.toLocaleDateString('ms-MY', {
 day: 'numeric',
 month: 'short',
 year: 'numeric',
 timeZone: 'UTC',
 })}`;
}
