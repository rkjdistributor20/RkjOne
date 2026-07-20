import { HQ_DISTRIBUTOR_LABEL } from '@/lib/brand/legal-entities';

export type DeliveryLegType =
 | 'FACTORY_TO_HQ'
 | 'HQ_TO_VEHICLE'
 | 'VEHICLE_TO_VEHICLE'
 | 'VEHICLE_TO_BRANCH';

export interface FleetVehicle {
 id: string;
 vehicle_code: string;
 plate_number: string | null;
 vehicle_type: string;
 capacity: string | null;
 remarks: string | null;
 default_driver_id: string | null;
 company_custodian_profile_id?: string | null;
 company_custodian_name?: string | null;
 company_custodian_role?: string | null;
 company_assigned_at?: string | null;
 company_usage_note?: string | null;
 status: string;
 latest_status?: string | null;
 vehicle_category?: 'MANAGER' | 'DELIVERY' | 'FACTORY' | 'REPLACEMENT';
}

export type DriverVehicleAssignmentRole = 'PRIMARY' | 'RELIEF' | 'ASSISTANT';

export interface FleetDriver {
 id: string;
 driver_code: string;
 full_name: string;
 route_description: string | null;
 phone: string | null;
 assigned_route_keys?: string[];
 vehicles?: Array<{
 id: string;
 vehicle_code: string;
 plate_number: string | null;
 vehicle_type: string | null;
 capacity: string | null;
 remarks: string | null;
  vehicle_category: 'MANAGER' | 'DELIVERY' | 'FACTORY' | 'REPLACEMENT';
  status: string;
  assignment_id: string;
  assignment_role: DriverVehicleAssignmentRole;
  responsibility_notes: string | null;
  acknowledged_at: string | null;
 }>;
 route_rows?: Array<{
 id?: string;
 route_code: string;
 sequence_no?: number;
 driver_name: string | null;
 assistant_name?: string | null;
 collect_from: string | null;
 location_name: string | null;
 location_type: string | null;
 notes: string | null;
 status: string;
 }>;
}

export interface FleetDriverResponse {
 drivers: FleetDriver[];
 route_options: FleetRouteOption[];
 available_vehicles: FleetVehicle[];
 current_driver_id: string | null;
 can_manage: boolean;
}

export interface FleetRouteOption {
 key: string;
 route_code: string;
 sequence_no: number;
 label: string;
 driver_name: string | null;
 assigned_driver_names: string[];
 collect_from: string | null;
 location_name: string | null;
 location_type: string | null;
 notes: string | null;
 status: string;
}

export interface DeliveryLegItem {
 quantity: number;
 unit: string;
 received_quantity: number | null;
 stock_item: { item_code: string; name: string };
}

export interface DeliveryLeg {
 id: string;
 leg_sequence: number;
 leg_type: DeliveryLegType;
 status: string;
 dispatched_at: string | null;
 delivered_at: string | null;
 from_location: { name: string; location_type: string };
 to_location: { name: string; location_type: string };
 driver: { full_name: string } | null;
 vehicle: { vehicle_type: string; vehicle_code: string } | null;
 delivery_leg_items: DeliveryLegItem[];
 proof_of_delivery?: Array<{
 id: string;
 receiver_name: string | null;
 delivered_at: string;
 receiver_signature_url: string | null;
 }>;
}

export interface DeliveryOrder {
 id: string;
 order_number: string;
 status: string;
 scheduled_date: string | null;
 notes: string | null;
 created_at: string;
 ai_route_summary?: string | null;
 ai_optimized_at?: string | null;
 driver_current_lat?: number | null;
 driver_current_lng?: number | null;
 origin_location: { name: string; location_type: string };
 final_destination: { name: string; location_type: string };
 primary_driver: { full_name: string } | null;
 primary_vehicle: { vehicle_type: string; vehicle_code: string } | null;
 delivery_legs: DeliveryLeg[];
}

export interface FleetStatusLog {
 id: string;
 status: string;
 location_description: string | null;
 logged_at: string;
 vehicle: { vehicle_code: string; vehicle_type: string };
 driver: { full_name: string } | null;
}

export type FleetGpsConnectionStatus = 'ok' | 'not_configured' | 'error';

export interface FleetGpsVehicleStatus {
 provider: 'cartrack';
 registration: string | null;
 vehicle_id: string | null;
 vehicle_code: string | null;
 plate_number: string | null;
 vehicle_type: string | null;
 label: string;
 latitude: number | null;
 longitude: number | null;
 speed_kph: number | null;
 odometer_km: number | null;
 fuel_level: number | null;
 ignition: boolean | null;
 heading: number | null;
 driver_name: string | null;
 company_custodian_name: string | null;
 company_custodian_role: string | null;
 location_description: string | null;
 event_ts: string | null;
 received_at: string;
 raw_status: string | null;
 matched: boolean;
 map_url: string | null;
}

export interface FleetGpsStatusResponse {
 source: 'cartrack';
 configured: boolean;
 status: FleetGpsConnectionStatus;
 fetched_at: string;
 message: string | null;
 fleetweb_url: string;
 docs_url: string;
 matched_count: number;
 unmatched_count: number;
 vehicles: FleetGpsVehicleStatus[];
}

export type FleetAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FleetAlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface FleetControlAlert {
 id: string;
 alert_type: string;
 severity: FleetAlertSeverity;
 status: FleetAlertStatus;
 title: string;
 message: string;
 event_at: string;
 vehicle_id: string | null;
 plate_number: string | null;
 metadata?: Record<string, unknown>;
 live?: boolean;
}

export interface FleetGeofenceSummary {
 id: string;
 name: string;
 geofence_type: string;
 radius_m: number;
 branch_id: string | null;
}

export interface FleetMaintenanceSummary {
 id: string;
 vehicle_id: string;
 plate_number: string | null;
 service_name: string;
 status: string;
 next_service_date: string | null;
 next_service_odometer_km: number | null;
 current_odometer_km: number | null;
 remaining_km: number | null;
}

export interface FleetDriverSessionSummary {
 id: string;
 driver_id: string;
 driver_name: string;
 vehicle_id: string;
 plate_number: string | null;
 status: string;
 started_at: string;
 checklist: Record<string, boolean>;
}

export interface FleetDeliveryEta {
 id: string;
 order_number: string;
 status: string;
 destination: string;
 plate_number: string | null;
 distance_km: number | null;
 eta_minutes: number | null;
 gps_available: boolean;
}

export interface FleetControlCenterResponse {
 mode: 'MANAGEMENT' | 'DRIVER';
 generated_at: string;
 gps: FleetGpsStatusResponse;
 kpis: {
  total_vehicles: number;
  moving: number;
  idle: number;
  offline: number;
  open_alerts: number;
  critical_alerts: number;
  active_deliveries: number;
  maintenance_due: number;
  geofence_coverage: number;
 };
 alerts: FleetControlAlert[];
 geofences: FleetGeofenceSummary[];
 geofence_options: Array<{ id: string; label: string }>;
 maintenance: FleetMaintenanceSummary[];
 active_sessions: FleetDriverSessionSummary[];
 deliveries: FleetDeliveryEta[];
 driver_setup: {
  driver_id: string;
  driver_name: string;
  vehicles: Array<{ id: string; plate_number: string | null; vehicle_type: string | null }>;
 } | null;
 recommendations: Array<{
  id: string;
  priority: 'SEGERA' | 'HARI_INI' | 'RANCANG';
  title: string;
  detail: string;
  action_tab: 'overview' | 'schedule' | 'drivers' | 'deliveries' | 'vehicles' | 'status';
 }>;
}

export interface CreateDeliveryPayload {
 origin_location_id: string;
 final_destination_id: string;
 primary_driver_id?: string;
 primary_vehicle_id?: string;
 scheduled_date?: string;
 notes?: string;
 ai_route_summary?: string;
 legs: Array<{
 leg_sequence: number;
 leg_type: DeliveryLegType;
 from_location_id: string;
 to_location_id: string;
 driver_id?: string;
 vehicle_id?: string;
 items: Array<{ stock_item_id: string; quantity: number; unit?: string }>;
 }>;
}

export interface PodPayload {
 receiver_name: string;
 receiver_signature_url?: string;
 gps_latitude?: number;
 gps_longitude?: number;
 driver_notes?: string;
 image_urls?: string[];
}

export const LEG_TYPE_LABELS: Record<DeliveryLegType, string> = {
 FACTORY_TO_HQ: `Kilang ke ${HQ_DISTRIBUTOR_LABEL}`,
 HQ_TO_VEHICLE: `${HQ_DISTRIBUTOR_LABEL} ke Kenderaan`,
 VEHICLE_TO_VEHICLE: 'Kenderaan ke Kenderaan',
 VEHICLE_TO_BRANCH: 'Kenderaan ke Cawangan',
};
