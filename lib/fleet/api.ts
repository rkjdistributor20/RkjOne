import type {
 CreateDeliveryPayload,
 DeliveryOrder,
 FleetDriverResponse,
 FleetControlCenterResponse,
 FleetGpsStatusResponse,
 FleetStatusLog,
 FleetVehicle,
 PodPayload,
} from './types';
import { fetchJson } from '@/lib/client/fetch-json';
import type { CompanyVehicleActionPayload, CompanyVehicleDashboardResponse } from './company-vehicle-types';

export async function fetchFleetVehicles() {
 return fetchJson<{ vehicles: FleetVehicle[] }>(
 '/api/fleet/vehicles',
 undefined,
 { ttlMs: 60_000 });
}

export async function fetchFleetDrivers() {
 return fetchJson<FleetDriverResponse>(
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
 vehicle_assignments?: Array<{
  vehicle_id: string;
  assignment_role: 'PRIMARY' | 'RELIEF' | 'ASSISTANT';
  responsibility_notes?: string | null;
 }>;
}) {
 return fetchJson<{ ok: boolean }>('/api/fleet/drivers', {
 method: 'PATCH',
 body: JSON.stringify(payload),
 });
}

export async function acknowledgeDriverVehicleAssignment(assignmentId: string) {
 return fetchJson<{ ok: boolean }>('/api/fleet/drivers', {
  method: 'POST',
  body: JSON.stringify({ action: 'ACKNOWLEDGE_ASSIGNMENT', assignment_id: assignmentId }),
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

export async function fetchFleetGpsStatus() {
 return fetchJson<FleetGpsStatusResponse>(
 '/api/fleet/gps/status',
 undefined,
 { ttlMs: 20_000 });
}

export async function fetchFleetControlCenter() {
 return fetchJson<FleetControlCenterResponse>(
  '/api/fleet/control-center',
  undefined,
  { ttlMs: 15_000 });
}

export async function syncFleetGps() {
 return fetchJson<{ ok: boolean; snapshots: number; alerts: number }>(
  '/api/fleet/gps/sync',
  { method: 'POST' });
}

export async function updateFleetAlert(id: string, status: 'ACKNOWLEDGED' | 'RESOLVED') {
 return fetchJson<{ ok: boolean }>(`/api/fleet/alerts/${id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status }),
 });
}

export async function startFleetDriverSession(payload: {
 driver_id: string;
 vehicle_id: string;
 checklist: Record<string, boolean>;
 odometer_km?: number | null;
 latitude?: number | null;
 longitude?: number | null;
 notes?: string | null;
}) {
 return fetchJson<{ ok: boolean; session_id: string }>('/api/fleet/driver-session', {
  method: 'POST', body: JSON.stringify(payload),
 });
}

export async function endFleetDriverSession(payload: {
 session_id: string;
 odometer_km?: number | null;
 latitude?: number | null;
 longitude?: number | null;
 notes?: string | null;
}) {
 return fetchJson<{ ok: boolean }>('/api/fleet/driver-session', {
  method: 'PATCH', body: JSON.stringify(payload),
 });
}

export async function createFleetGeofence(payload: {
 name: string;
 geofence_type: string;
 branch_id?: string | null;
 latitude: number;
 longitude: number;
 radius_m: number;
}) {
 return fetchJson<{ ok: boolean; id: string }>('/api/fleet/geofences', {
  method: 'POST', body: JSON.stringify(payload),
 });
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

export async function fetchCompanyVehicles() {
 return fetchJson<CompanyVehicleDashboardResponse>(
  '/api/fleet/company-vehicles',
  undefined,
  { ttlMs: 15_000 });
}

export async function submitCompanyVehicleAction(payload: CompanyVehicleActionPayload) {
 return fetchJson<{ ok: boolean; id: string | null }>('/api/fleet/company-vehicles', {
  method: 'POST',
  body: JSON.stringify(payload),
 });
}
