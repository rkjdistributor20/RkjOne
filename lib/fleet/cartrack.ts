import type { FleetGpsStatusResponse, FleetGpsVehicleStatus } from './types';

const DEFAULT_API_BASE_URL = 'https://fleetapi-my.cartrack.com/rest';
const DEFAULT_FLEETWEB_URL = 'https://fleetweb-my.cartrack.com/map/fleet';
const DOCS_URL = 'https://developer.cartrack.com/docs/fleet-api/get-vehicles-status-location-fuel-odometer-and-more';

type LocalFleetVehicle = {
 id: string;
 vehicle_code: string;
 plate_number: string | null;
 vehicle_type: string | null;
 company_custodian_name?: string | null;
 company_custodian_role?: string | null;
};

type RawGpsStatus = {
 registration: string | null;
 latitude: number | null;
 longitude: number | null;
 speed_kph: number | null;
 odometer_km: number | null;
 fuel_level: number | null;
 ignition: boolean | null;
 heading: number | null;
 driver_name: string | null;
 location_description: string | null;
 event_ts: string | null;
 raw_status: string | null;
};

type CartrackCredentials = {
 baseUrl: string;
 username: string;
 token: string;
 fleetwebUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getByPath(value: unknown, path: string): unknown {
 return path.split('.').reduce<unknown>((current, part) => {
 if (!isRecord(current)) return undefined;
 return current[part];
 }, value);
}

function firstValue(row: unknown, paths: string[]) {
 for (const path of paths) {
 const value = getByPath(row, path);
 if (value !== undefined && value !== null && value !== '') return value;
 }
 return undefined;
}

function asString(value: unknown): string | null {
 if (typeof value === 'string') return value.trim() || null;
 if (typeof value === 'number' || typeof value === 'boolean') return String(value);
 return null;
}

function asNumber(value: unknown): number | null {
 if (typeof value === 'number' && Number.isFinite(value)) return value;
 if (typeof value === 'string') {
 const cleaned = value.replace(/,/g, '').trim();
 if (!cleaned) return null;
 const parsed = Number(cleaned);
 return Number.isFinite(parsed) ? parsed : null;
 }
 return null;
}

function asBoolean(value: unknown): boolean | null {
 if (typeof value === 'boolean') return value;
 if (typeof value === 'number') return value !== 0;
 if (typeof value === 'string') {
 const cleaned = value.trim().toLowerCase();
 if (['true', 'on', 'yes', '1', 'ignition on'].includes(cleaned)) return true;
 if (['false', 'off', 'no', '0', 'ignition off'].includes(cleaned)) return false;
 }
 return null;
}

function asIsoDate(value: unknown): string | null {
 const text = asString(value);
 if (!text) return null;
 const time = new Date(text).getTime();
 return Number.isFinite(time) ? new Date(time).toISOString() : text;
}

function normalizePlate(value?: string | null) {
 return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function endpointUrl(baseUrl: string, path: string) {
 return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function getCredentials(): CartrackCredentials | null {
 const username = process.env.CARTRACK_API_USERNAME?.trim() || process.env.CARTRACK_USERNAME?.trim();
 const token =
 process.env.CARTRACK_API_TOKEN?.trim() ||
 process.env.CARTRACK_API_PASSWORD?.trim() ||
 process.env.CARTRACK_PASSWORD?.trim();

 if (!username || !token) return null;

 return {
 baseUrl: (process.env.CARTRACK_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, ''),
 username,
 token,
 fleetwebUrl: process.env.CARTRACK_FLEETWEB_URL?.trim() || DEFAULT_FLEETWEB_URL,
 };
}

function extractRows(payload: unknown): unknown[] {
 if (Array.isArray(payload)) return payload;
 if (!isRecord(payload)) return [];

 const direct = ['data', 'vehicles', 'items', 'results'];
 for (const key of direct) {
 const value = payload[key];
 if (Array.isArray(value)) return value;
 }

 if (isRecord(payload.data)) {
 for (const key of direct) {
 const value = payload.data[key];
 if (Array.isArray(value)) return value;
 }
 }

 return [];
}

function parseGpsRow(row: unknown): RawGpsStatus {
 const registration = asString(firstValue(row, [
 'registration',
 'vehicle_registration',
 'vehicle.reg_number',
 'vehicle.registration',
 'reg_number',
 'license_plate',
 'plate_number',
 'plate',
 ]));

 return {
 registration,
 latitude: asNumber(firstValue(row, [
 'latitude',
 'lat',
 'position.latitude',
 'position.lat',
 'location.latitude',
 'location.lat',
 'gps.latitude',
 'gps.lat',
 ])),
 longitude: asNumber(firstValue(row, [
 'longitude',
 'lng',
 'lon',
 'position.longitude',
 'position.lng',
 'position.lon',
 'location.longitude',
 'location.lng',
 'gps.longitude',
 'gps.lng',
 ])),
 speed_kph: asNumber(firstValue(row, ['speed', 'speed_kph', 'speed_value', 'movement.speed'])),
 odometer_km: asNumber(firstValue(row, ['odometer', 'odometer_km', 'current_odometer', 'vehicle.odometer'])),
 fuel_level: asNumber(firstValue(row, ['fuel', 'fuel_level', 'fuel_percentage', 'fuel.level'])),
 ignition: asBoolean(firstValue(row, ['ignition', 'ignition_status', 'engine_on', 'vehicle.ignition'])),
 heading: asNumber(firstValue(row, ['heading', 'direction', 'bearing', 'position.heading'])),
 driver_name: asString(firstValue(row, ['driver_name', 'driver.name', 'driver.full_name', 'driver'])),
 location_description: asString(firstValue(row, [
 'position_description',
 'location_description',
 'position.address',
 'location.address',
 'location.description',
 'gps.address',
 'address',
 'location',
 ])),
 event_ts: asIsoDate(firstValue(row, [
 'event_ts',
 'event_time',
 'position_time',
 'last_position_time',
 'last_updated',
 'updated_at',
 'timestamp',
 ])),
 raw_status: asString(firstValue(row, ['status', 'vehicle_status', 'movement_status', 'state'])),
 };
}

async function requestCartrackStatuses(credentials: CartrackCredentials): Promise<RawGpsStatus[]> {
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 12_000);

 try {
 const response = await fetch(endpointUrl(credentials.baseUrl, '/vehicles/status'), {
 method: 'GET',
 headers: {
 Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.token}`).toString('base64')}`,
 Accept: 'application/json',
 },
 cache: 'no-store',
 signal: controller.signal,
 });

 const text = await response.text();
 let payload: unknown = {};
 if (text) {
 try {
 payload = JSON.parse(text) as unknown;
 } catch {
 payload = { message: text.slice(0, 240) };
 }
 }

 if (!response.ok) {
 const message = isRecord(payload) ? asString(payload.error) ?? asString(payload.message) : null;
 throw new Error(message ?? `Cartrack API gagal (${response.status})`);
 }

 return extractRows(payload).map(parseGpsRow);
 } finally {
 clearTimeout(timeout);
 }
}

function buildMapUrl(latitude: number | null, longitude: number | null) {
 if (latitude === null || longitude === null) return null;
 return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function reconcileStatuses(
 localVehicles: LocalFleetVehicle[],
 statuses: RawGpsStatus[],
 fetchedAt: string): FleetGpsVehicleStatus[] {
 const localByPlate = new Map<string, LocalFleetVehicle>();
 for (const vehicle of localVehicles) {
 const key = normalizePlate(vehicle.plate_number);
 if (key) localByPlate.set(key, vehicle);
 }

 const seenLocalIds = new Set<string>();
 const reconciled = statuses.map((status) => {
 const matched = localByPlate.get(normalizePlate(status.registration));
 if (matched) seenLocalIds.add(matched.id);

 return {
 provider: 'cartrack' as const,
 registration: status.registration,
 vehicle_id: matched?.id ?? null,
 vehicle_code: matched?.vehicle_code ?? null,
 plate_number: matched?.plate_number ?? status.registration,
 vehicle_type: matched?.vehicle_type ?? null,
 label: matched
 ? `${matched.plate_number ?? matched.vehicle_code} - ${matched.vehicle_type ?? 'Kenderaan'}`
 : status.registration ?? 'Kenderaan Cartrack',
 latitude: status.latitude,
 longitude: status.longitude,
 speed_kph: status.speed_kph,
 odometer_km: status.odometer_km,
 fuel_level: status.fuel_level,
 ignition: status.ignition,
 heading: status.heading,
 driver_name: status.driver_name,
 company_custodian_name: matched?.company_custodian_name ?? null,
 company_custodian_role: matched?.company_custodian_role ?? null,
 location_description: status.location_description,
 event_ts: status.event_ts,
 received_at: fetchedAt,
 raw_status: status.raw_status,
 matched: Boolean(matched),
 map_url: buildMapUrl(status.latitude, status.longitude),
 };
 });

 const missingLocal = localVehicles
 .filter((vehicle) => !seenLocalIds.has(vehicle.id))
 .map((vehicle) => ({
 provider: 'cartrack' as const,
 registration: vehicle.plate_number,
 vehicle_id: vehicle.id,
 vehicle_code: vehicle.vehicle_code,
 plate_number: vehicle.plate_number,
 vehicle_type: vehicle.vehicle_type,
 label: `${vehicle.plate_number ?? vehicle.vehicle_code} - ${vehicle.vehicle_type ?? 'Kenderaan'}`,
 latitude: null,
 longitude: null,
 speed_kph: null,
 odometer_km: null,
 fuel_level: null,
 ignition: null,
 heading: null,
 driver_name: null,
 company_custodian_name: vehicle.company_custodian_name ?? null,
 company_custodian_role: vehicle.company_custodian_role ?? null,
 location_description: 'Belum dipadankan dengan data Cartrack.',
 event_ts: null,
 received_at: fetchedAt,
 raw_status: null,
 matched: false,
 map_url: null,
 }));

 return [...reconciled, ...missingLocal].sort((a, b) => {
 const aTime = a.event_ts ? new Date(a.event_ts).getTime() : 0;
 const bTime = b.event_ts ? new Date(b.event_ts).getTime() : 0;
 return bTime - aTime;
 });
}

export function cartrackNotConfiguredResponse(localVehicles: LocalFleetVehicle[] = []): FleetGpsStatusResponse {
 const fetchedAt = new Date().toISOString();
 return {
 source: 'cartrack',
 configured: false,
 status: 'not_configured',
 fetched_at: fetchedAt,
 message: 'Cartrack belum disambung. Masukkan CARTRACK_API_USERNAME dan CARTRACK_API_TOKEN di server env.',
 fleetweb_url: process.env.CARTRACK_FLEETWEB_URL?.trim() || DEFAULT_FLEETWEB_URL,
 docs_url: DOCS_URL,
 matched_count: 0,
 unmatched_count: localVehicles.length,
 vehicles: reconcileStatuses(localVehicles, [], fetchedAt),
 };
}

export async function getCartrackFleetGpsStatus(
 localVehicles: LocalFleetVehicle[]): Promise<FleetGpsStatusResponse> {
 const credentials = getCredentials();
 if (!credentials) return cartrackNotConfiguredResponse(localVehicles);

 const fetchedAt = new Date().toISOString();

 try {
 const statuses = await requestCartrackStatuses(credentials);
 const vehicles = reconcileStatuses(localVehicles, statuses, fetchedAt);
 const matchedCount = vehicles.filter((vehicle) => vehicle.matched).length;

 return {
 source: 'cartrack',
 configured: true,
 status: 'ok',
 fetched_at: fetchedAt,
 message: statuses.length === 0 ? 'Cartrack API aktif tetapi tiada kenderaan dipulangkan.' : null,
 fleetweb_url: credentials.fleetwebUrl,
 docs_url: DOCS_URL,
 matched_count: matchedCount,
 unmatched_count: vehicles.length - matchedCount,
 vehicles,
 };
 } catch (error) {
 return {
 source: 'cartrack',
 configured: true,
 status: 'error',
 fetched_at: fetchedAt,
 message: error instanceof Error ? error.message : 'Gagal mendapatkan status GPS Cartrack.',
 fleetweb_url: credentials.fleetwebUrl,
 docs_url: DOCS_URL,
 matched_count: 0,
 unmatched_count: localVehicles.length,
 vehicles: reconcileStatuses(localVehicles, [], fetchedAt),
 };
 }
}
