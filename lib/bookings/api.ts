import type { BookingFormPayload, BookingListFilters, BookingRecord } from '@/lib/bookings/types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
 const res = await fetch(url, {
 credentials: 'same-origin',
 cache: 'no-store',
 headers: { 'Content-Type': 'application/json' },
 ...options,
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
 return data;
}

function queryString(filters: BookingListFilters) {
 const params = new URLSearchParams();
 if (filters.status) params.set('status', filters.status);
 if (filters.branch_id) params.set('branch_id', filters.branch_id);
 if (filters.from) params.set('from', filters.from);
 if (filters.to) params.set('to', filters.to);
 if (filters.limit) params.set('limit', String(filters.limit));
 const query = params.toString();
 return query ? `?${query}` : '';
}

export async function fetchBookings(filters: BookingListFilters = {}) {
 return fetchJson<{ bookings: BookingRecord[] }>(`/api/bookings${queryString(filters)}`);
}

export async function fetchBooking(id: string) {
 return fetchJson<{ booking: BookingRecord }>(`/api/bookings/${id}`);
}

export async function createBooking(payload: BookingFormPayload) {
 return fetchJson<{ booking: BookingRecord }>('/api/bookings', {
 method: 'POST',
 body: JSON.stringify(payload),
 });
}

export async function updateBooking(id: string, payload: Partial<BookingFormPayload>) {
 return fetchJson<{ booking: BookingRecord }>(`/api/bookings/${id}`, {
 method: 'PATCH',
 body: JSON.stringify(payload),
 });
}
