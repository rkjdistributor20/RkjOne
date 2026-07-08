export const BOOKING_TYPE_VALUES = ['GENERAL', 'CUSTOMER', 'EVENT', 'MAINTENANCE', 'SALES_AGENT', 'DELIVERY', 'OTHER'] as const;
export const BOOKING_STATUS_VALUES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;
export const BOOKING_PRIORITY_VALUES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export type BookingTypeValue = (typeof BOOKING_TYPE_VALUES)[number];
export type BookingStatusValue = (typeof BOOKING_STATUS_VALUES)[number];
export type BookingPriorityValue = (typeof BOOKING_PRIORITY_VALUES)[number];

export class BookingValidationError extends Error {
 status: number;

 constructor(message: string, status = 400) {
  super(message);
  this.name = 'BookingValidationError';
  this.status = status;
 }
}

export function cleanString(value: unknown, max = 255) {
 if (typeof value !== 'string') return null;
 const text = value.trim();
 if (!text) return null;
 return text.slice(0, max);
}

export function parseEnumValue<T extends string>(
 field: string,
 value: unknown,
 allowed: readonly T[],
 options: { defaultValue?: T; optional?: boolean } = {},
): T | null {
 if (value == null || value === '') {
  if (options.defaultValue) return options.defaultValue;
  if (options.optional) return null;
  throw new BookingValidationError(`${field} wajib diisi.`);
 }
 if (typeof value !== 'string') {
  throw new BookingValidationError(`${field} mesti teks yang sah.`);
 }
 const normalized = value.trim().toUpperCase();
 if ((allowed as readonly string[]).includes(normalized)) return normalized as T;
 throw new BookingValidationError(`${field} tidak sah. Nilai dibenarkan: ${allowed.join(', ')}.`);
}

export function parseDateValue(field: string, value: unknown, options: { optional: true }): string | null;
export function parseDateValue(field: string, value: unknown, options?: { optional?: false }): string;
export function parseDateValue(field: string, value: unknown, options: { optional?: boolean } = {}) {
 const text = cleanString(value, 20);
 if (!text) {
  if (options.optional) return null;
  throw new BookingValidationError(`${field} wajib diisi.`);
 }
 const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
 if (!match) throw new BookingValidationError(`${field} mesti format YYYY-MM-DD.`);

 const year = Number(match[1]);
 const month = Number(match[2]);
 const day = Number(match[3]);
 const date = new Date(Date.UTC(year, month - 1, day));
 const valid =
  date.getUTCFullYear() === year &&
  date.getUTCMonth() === month - 1 &&
  date.getUTCDate() === day;

 if (!valid) throw new BookingValidationError(`${field} tidak sah.`);
 return text;
}

export function parseTimeValue(field: string, value: unknown) {
 const text = cleanString(value, 20);
 if (!text) return null;
 const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
 if (!match) throw new BookingValidationError(`${field} mesti format HH:MM atau HH:MM:SS.`);

 const hour = Number(match[1]);
 const minute = Number(match[2]);
 const second = match[3] == null ? 0 : Number(match[3]);
 if (hour > 23 || minute > 59 || second > 59) {
  throw new BookingValidationError(`${field} tidak sah.`);
 }
 return `${match[1]}:${match[2]}:${String(second).padStart(2, '0')}`;
}

export function parseExpectedPax(value: unknown) {
 if (value == null || value === '') return null;
 const parsed = Number(value);
 if (!Number.isFinite(parsed) || parsed < 0) {
  throw new BookingValidationError('Anggaran pax/unit mesti nombor positif.');
 }
 return Math.trunc(parsed);
}

export function parseMetadata(value: unknown, fallback: Record<string, unknown> | null) {
 if (value === undefined) return fallback;
 if (value == null) return {};
 if (typeof value !== 'object' || Array.isArray(value)) {
  throw new BookingValidationError('Metadata mesti objek JSON.');
 }
 return value as Record<string, unknown>;
}

export function isDuplicateBookingError(message: string | null | undefined) {
 return Boolean(message?.toLowerCase().includes('duplicate key'));
}

export function isTerminalBookingStatus(status: string | null | undefined) {
 return status === 'CANCELLED' || status === 'COMPLETED' || status === 'NO_SHOW';
}

export function validateBookingStatusTransition(currentStatus: string, nextStatus: BookingStatusValue) {
 if (nextStatus === currentStatus) return;
 const allowed: Record<string, BookingStatusValue[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
 };
 const nextAllowed = allowed[currentStatus] ?? [];
 if (!nextAllowed.includes(nextStatus)) {
  throw new BookingValidationError(
   `Status booking tidak boleh ditukar daripada ${currentStatus} kepada ${nextStatus}.`,
  );
 }
}

export function bookingValidationResponse(error: unknown) {
 if (error instanceof BookingValidationError) {
  return { body: { error: error.message }, status: error.status };
 }
 return null;
}
