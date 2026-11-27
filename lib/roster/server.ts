import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveScopedBranches } from '@/lib/auth/branch-scope';
import type { RosterEntryInput } from './types';
import { isRosterWeek } from './week-utils';

const MANAGER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'AREA_MANAGER']);
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;

export class RosterError extends Error {
 constructor(message: string, readonly status: number) {
  super(message);
 }
}

export function requireRosterManager(role: string) {
 if (!MANAGER_ROLES.has(role)) throw new RosterError('Hanya pengurus boleh urus jadual staf', 403);
}

export function rosterId(value: unknown, label: string): string {
 if (typeof value !== 'string' || !UUID.test(value)) throw new RosterError(`${label} tidak sah`, 400);
 return value.toLowerCase();
}

export function rosterWeek(value: unknown): string {
 if (!isRosterWeek(value)) throw new RosterError('Pilih tarikh Isnin yang sah', 400);
 return value;
}

export async function rosterScope(
 supabase: SupabaseClient,
 profile: Parameters<typeof resolveScopedBranches>[1],
 branchId?: string,
) {
 requireRosterManager(profile.role);
 try {
  const { branchIds } = await resolveScopedBranches(supabase, profile, branchId);
  if (branchId && branchIds !== null && !branchIds.includes(branchId)) throw new Error('Out of scope');
  return branchId ? [branchId] : branchIds;
 } catch {
  throw new RosterError('Cawangan di luar kawasan anda atau skop belum ditetapkan', 403);
 }
}

export function rosterErrorResponse(error: unknown) {
 if (error instanceof RosterError) return NextResponse.json({ error: error.message }, { status: error.status });
 if (error instanceof SyntaxError) return NextResponse.json({ error: 'Permintaan JSON tidak sah' }, { status: 400 });
 return NextResponse.json({ error: 'Gagal memproses jadual staf' }, { status: 500 });
}

export function rosterWriteError(error: { code: string; message: string }): never {
 const statuses: Record<string, number> = { '42501': 403, '22023': 400, '23505': 409, 'P0002': 404 };
 const status = statuses[error.code];
 if (!status) throw error;
 throw new RosterError(error.message, status);
}

function object(value: unknown): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RosterError('Data jadual tidak sah', 400);
 return value as Record<string, unknown>;
}

function time(value: unknown): string | null {
 if (value == null || value === '') return null;
 if (typeof value !== 'string' || !TIME.test(value)) throw new RosterError('Masa syif tidak sah', 400);
 return value;
}

export function rosterSavePayload(input: unknown) {
 const body = object(input);
 const branchId = rosterId(body.branch_id, 'Cawangan');
 const weekStart = rosterWeek(body.week_start);
 const copyFrom = body.copy_from_week == null ? null : rosterWeek(body.copy_from_week);
 const rows = body.entries ?? [];
 if (!Array.isArray(rows) || rows.length > 1000 || (copyFrom && (copyFrom === weekStart || rows.length))) {
  throw new RosterError('Slot jadual atau minggu sumber tidak sah', 400);
 }

 const keys = new Set<string>();
 const entries: RosterEntryInput[] = rows.map((row) => {
  const entry = object(row);
  const staffId = rosterId(entry.staff_id, 'Staf');
  const day = entry.day_index;
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6 || typeof entry.is_off !== 'boolean') {
   throw new RosterError('Hari atau status slot tidak sah', 400);
  }
  const key = `${staffId}:${day}`;
  if (keys.has(key)) throw new RosterError('Slot staf dan hari berulang', 400);
  keys.add(key);
  const off = entry.is_off;
  const template = off || entry.template_id == null ? null : rosterId(entry.template_id, 'Template');
  const start = off ? null : time(entry.scheduled_start);
  const end = off ? null : time(entry.scheduled_end);
  if (!off && !template && (!start || !end)) throw new RosterError('Isi masa mula dan tamat untuk setiap syif', 400);
  if (entry.notes != null && (typeof entry.notes !== 'string' || entry.notes.length > 1000)) {
   throw new RosterError('Nota slot tidak sah', 400);
  }
  return {
   staff_id: staffId, day_index: day, is_off: off, template_id: template,
   scheduled_start: start, scheduled_end: end, notes: entry.notes as string | null | undefined,
  };
 });
 return { branchId, weekStart, copyFrom, entries };
}
