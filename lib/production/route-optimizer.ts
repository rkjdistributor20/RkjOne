/**
 * Paparan & helper laluan penghantaran driver (AI heuristik dari DB).
 */

import type { DriverWorkScheduleEntry } from './types';

export const MAX_STOPS_PER_INSTRUCTION = 20;

export function manifestProgress(entry: DriverWorkScheduleEntry): {
  done: number;
  total: number;
  percent: number;
} {
  const total = entry.kiosk_stops || entry.stops.filter((s) => !s.is_handoff).length;
  const done = entry.completed_stops ?? entry.stops.filter((s) => s.status === 'DELIVERED').length;
  return {
    done,
    total,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

export function formatInstructionLabel(entry: DriverWorkScheduleEntry): string {
  if (entry.instruction_code) return entry.instruction_code;
  return `Arahan ${entry.driver_code} · ${entry.production_date}`;
}

export function groupPickByCategory(
  items: DriverWorkScheduleEntry['pick_summary']
): Array<{ category: string; items: typeof items }> {
  const map = new Map<string, typeof items>();
  for (const item of items) {
    const cat = item.category ?? 'Lain';
    const list = map.get(cat) ?? [];
    list.push(item);
    map.set(cat, list);
  }
  return ['Roti', 'Bahan', 'Packaging', 'Lain']
    .filter((c) => map.has(c))
    .map((c) => ({ category: c, items: map.get(c)! }));
}
