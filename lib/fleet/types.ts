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
  default_driver_id: string | null;
  status: string;
  latest_status?: string | null;
}

export interface FleetDriver {
  id: string;
  driver_code: string;
  full_name: string;
  route_description: string | null;
  phone: string | null;
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
  FACTORY_TO_HQ: `Kilang → ${HQ_DISTRIBUTOR_LABEL}`,
  HQ_TO_VEHICLE: `${HQ_DISTRIBUTOR_LABEL} → Kenderaan`,
  VEHICLE_TO_VEHICLE: 'Kenderaan → Kenderaan',
  VEHICLE_TO_BRANCH: 'Kenderaan → Cawangan',
};
