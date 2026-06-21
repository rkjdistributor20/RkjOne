/** Utiliti minggu production kilang (Isnin = mula minggu) */

const MS_DAY = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

export function formatProductionDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = MS_DAY[d.getDay()];
  return `${day} · ${d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' })}`;
}

export function mondayOfWeek(from: Date = new Date()): string {
  const d = new Date(from);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

export function weekDayDates(mondayIso: string): string[] {
  const base = new Date(`${mondayIso}T12:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function addWeeks(mondayIso: string, weeks: number): string {
  const d = new Date(`${mondayIso}T12:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export function formatWeekRange(mondayIso: string): string {
  const days = weekDayDates(mondayIso);
  const start = new Date(`${days[0]}T12:00:00`);
  const end = new Date(`${days[6]}T12:00:00`);
  return `${start.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
