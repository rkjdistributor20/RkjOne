export type LocationType =
  | 'FACTORY'
  | 'HQ_WAREHOUSE'
  | 'FLEET_VEHICLE'
  | 'BRANCH_KIOSK';

export interface InventoryLocation {
  id: string;
  organization_id: string;
  location_type: LocationType;
  name: string;
  branch_id: string | null;
  vehicle_id: string | null;
  is_active: boolean;
  branch?: { branch_code: string; branch_name: string } | null;
  vehicle?: { vehicle_code: string; vehicle_type: string } | null;
}

export interface StockItemOption {
  id: string;
  item_code: string;
  name: string;
  category: string | null;
  base_unit: string;
  min_threshold: number | null;
  critical_threshold: number | null;
}

export interface InventoryBalanceRow {
  id: string;
  location_id: string;
  stock_item_id: string;
  quantity: number;
  unit: string;
  stock_item: StockItemOption;
  status: 'OK' | 'LOW' | 'CRITICAL';
}

export interface StockMovementRow {
  id: string;
  movement_type: string;
  quantity: number;
  unit: string;
  balance_before: number | null;
  balance_after: number | null;
  reference_type: string | null;
  notes: string | null;
  created_at: string;
  stock_item: { item_code: string; name: string };
  created_by_profile?: { full_name: string } | null;
}

export interface StockTransferRow {
  id: string;
  transfer_number: string;
  status: string;
  from_location: { name: string; location_type: string };
  to_location: { name: string; location_type: string };
  created_at: string;
  dispatched_at: string | null;
  delivered_at: string | null;
  stock_transfer_items?: Array<{
    quantity: number;
    unit: string;
    stock_item: { item_code: string; name: string };
  }>;
}

export interface LineItemInput {
  stock_item_id: string;
  quantity: number;
  unit?: string;
}

export interface AdjustmentItemInput {
  stock_item_id: string;
  quantity_after: number;
  unit?: string;
}

export interface CountItemInput {
  stock_item_id: string;
  counted_quantity: number;
  unit?: string;
}

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  FACTORY: 'Kilang',
  HQ_WAREHOUSE: 'Gudang HQ',
  FLEET_VEHICLE: 'Kenderaan',
  BRANCH_KIOSK: 'Kiosk Cawangan',
};
