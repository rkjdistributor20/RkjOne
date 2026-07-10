import type {
 CreateDeliveryPayload,
 DeliveryOrder,
 FleetDriver,
 FleetRouteOption,
 FleetStatusLog,
 FleetVehicle,
 PodPayload,
} from './types';
import { fetchJson } from '@/lib/client/fetch-json';

export async function fetchFleetVehicles() {
 return fetchJson<{ vehicles: FleetVehicle[] }>(
 '/api/fleet/vehicles',
 undefined,
 { ttlMs: 60_000 });
}

export async function fetchFleetDrivers() {
 return fetchJson<{ drivers: FleetDriver[]; route_options: FleetRouteOption[] }>(
 '/api/fleet/drivers',
 undefined,
 { ttlMs: 60_000 });
}

export async function updateFleetDriver(payload: {
 id: string;
 full_name: string;
 phone?: string | null;
 route_description?: string | null;
 route_keys: string[];
}) {
 return fetchJson<{ ok: boolean }>('/api/fleet/drivers', {
 method: 'PATCH',
 body: JSON.stringify(payload),
 });
}

export async function deleteFleetDriver(id: string) {
 return fetchJson<{ ok: boolean }>('/api/fleet/drivers', {
 method: 'DELETE',
 body: JSON.stringify({ id }),
 });
}

export async function fetchDeliveryOrders(status?: string, limit = 20) {
 const params = new URLSearchParams();
 if (status) params.set('status', status);
 params.set('limit', String(limit));
 return fetchJson<{ orders: DeliveryOrder[] }>(
 `/api/fleet/orders?${params}`,
 undefined,
 { ttlMs: 10_000 });
}

export async function fetchMyDeliveryOrders() {
 return fetchJson<{ orders: DeliveryOrder[] }>(
 '/api/fleet/orders?mine=true&limit=20',
 undefined,
 { ttlMs: 10_000 });
}

export async function optimizeRoutePreview(payload: {
 stops: Array<{ key: string; location_id: string }>;
 current_lat?: number | null;
 current_lng?: number | null;
}) {
 return fetchJson<{
 result: {
 orderedKeys: string[];
 summary: string;
 criticalCount: number;
 lowCount: number;
 usedGps: boolean;
 };
 }>('/api/fleet/route/optimize', {
 method: 'POST',
 body: JSON.stringify(payload),
 });
}

export async function optimizeDeliveryOrderRoute(
 orderId: string,
 payload?: { current_lat?: number | null; current_lng?: number | null }) {
 return fetchJson<{ result: Record<string, unknown> }>(
 `/api/fleet/orders/${orderId}/optimize-route`,
 {
 method: 'POST',
 body: JSON.stringify(payload ?? {}),
 });
}

export async function fetchDeliveryOrder(id: string) {
 return fetchJson<{ order: DeliveryOrder }>(
 `/api/fleet/orders/${id}`,
 undefined,
 { ttlMs: 5_000 });
}

export async function createDeliveryOrder(payload: CreateDeliveryPayload) {
 return fetchJson<{ result: { order_id: string; order_number: string } }>(
 '/api/fleet/orders',
 { method: 'POST', body: JSON.stringify(payload) });
}

export async function dispatchLeg(legId: string) {
 return fetchJson<{ result: unknown }>(`/api/fleet/legs/${legId}/dispatch`, {
 method: 'POST',
 });
}

export async function submitPod(legId: string, payload: PodPayload) {
 return fetchJson<{ result: unknown }>(`/api/fleet/legs/${legId}/pod`, {
 method: 'POST',
 body: JSON.stringify(payload),
 });
}

export async function fetchFleetStatus() {
 return fetchJson<{ logs: FleetStatusLog[] }>(
 '/api/fleet/status',
 undefined,
 { ttlMs: 10_000 });
}

export async function logFleetStatus(payload: {
 vehicle_id: string;
 driver_id?: string;
 status: string;
 location_description?: string;
 gps_latitude?: number;
 gps_longitude?: number;
 notes?: string;
}) {
 return fetchJson<{ result: unknown }>('/api/fleet/status', {
 method: 'POST',
 body: JSON.stringify(payload),
 });
}
