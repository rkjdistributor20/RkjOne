export interface PublishedProductionDate {
  production_date: string;
  week_start: string;
  week_notes?: string | null;
  day_notes?: string | null;
  cutoff_at?: string;
  orders_locked?: boolean;
  window_open?: boolean;
  order_id?: string | null;
  order_number?: string | null;
  order_phase?: 'PREDICTION' | 'FINAL' | null;
  has_prediction?: boolean;
  has_final_order?: boolean;
  routes_planned?: boolean;
  days_until_cutoff?: number;
}

export interface FactoryProductionWeek {
  id: string;
  week_start: string;
  status: 'DRAFT' | 'PUBLISHED';
  notes: string | null;
  published_at: string | null;
  days: string[];
}

export interface HqFactoryOrderItem {
  id: string;
  quantity: number;
  unit: string;
  stock_item: {
    item_code: string;
    name: string;
    category: string | null;
  };
}

export interface HqFactoryOrderBranchItem {
  id: string;
  branch_id: string;
  quantity: number;
  unit: string;
  branch?: { branch_code: string; branch_name: string };
  stock_item: {
    item_code: string;
    name: string;
    category: string | null;
  };
}

export interface HqFactoryOrder {
  id: string;
  order_number: string;
  production_date: string;
  status: 'SUBMITTED' | 'ACKNOWLEDGED' | 'FULFILLED' | 'CANCELLED';
  order_phase?: 'PREDICTION' | 'FINAL';
  notes: string | null;
  created_at: string;
  acknowledged_at: string | null;
  routes_planned_at?: string | null;
  created_by_profile?: { full_name: string } | null;
  hq_factory_order_items?: HqFactoryOrderItem[];
  hq_factory_order_branch_items?: HqFactoryOrderBranchItem[];
}

export interface OrderSuggestionBranchItem {
  stock_item_id: string;
  item_code: string;
  name: string;
  current_pcs: number;
  target_pcs: number;
  suggested_bags: number;
  suggested_pcs: number;
  unit: string;
}

export interface OrderSuggestionBranch {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  region_code: string | null;
  location_id: string;
  default_driver_id?: string | null;
  default_driver_name?: string | null;
  items: OrderSuggestionBranchItem[];
}

export interface OrderSuggestionFactoryItem {
  stock_item_id: string;
  item_code: string;
  name: string;
  suggested_qty: number;
  unit: string;
}

export interface OrderSuggestion {
  production_date: string;
  cutoff_at: string;
  window_open: boolean;
  branches: OrderSuggestionBranch[];
  factory_items: OrderSuggestionFactoryItem[];
}

export interface FactoryOrderReportBranch {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  region_code: string;
  driver_name?: string | null;
  items: Array<{
    item_code: string;
    name: string;
    quantity: number;
    unit: string;
  }>;
}

export interface FactoryOrderReport {
  order_id: string;
  order_number: string;
  production_date: string;
  status: string;
  order_phase?: string;
  cutoff_at: string;
  totals: Array<{
    item_code: string;
    name: string;
    category: string | null;
    quantity: number;
    unit: string;
  }>;
  branches: FactoryOrderReportBranch[];
  routes: Array<{
    plan_id: string;
    route_name: string;
    region_code: string;
    route_pattern?: string;
    status: string;
    handoff_completed?: boolean;
    driver: string | null;
    vehicle: string | null;
    stops: Array<{
      sequence: number;
      branch_code: string;
      branch_name: string;
      is_handoff?: boolean;
      handoff_driver?: string | null;
    }>;
  }>;
}

export interface DeliveryRoutePlan {
  id: string;
  route_name: string;
  region_code: string | null;
  production_date: string;
  route_pattern?: string;
  status: string;
  handoff_completed_at?: string | null;
  depends_on_plan_id?: string | null;
  driver?: { id?: string; full_name: string; driver_code?: string } | null;
  vehicle?: { vehicle_code: string; vehicle_type: string } | null;
  stops?: Array<{
    id?: string;
    stop_sequence: number;
    is_handoff?: boolean;
    notes?: string | null;
    handoff_driver?: { full_name: string } | null;
    branch: { branch_code: string; branch_name: string } | null;
    items?: Array<{
      id?: string;
      stock_item_id?: string;
      quantity: number;
      planned_quantity?: number;
      adjusted_quantity?: number | null;
      adjustment_reason?: string | null;
      stock_item?: { item_code: string; name: string };
    }>;
  }>;
}

export const HQ_FACTORY_ORDER_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Menunggu Kilang',
  ACKNOWLEDGED: 'Disahkan Kilang',
  FULFILLED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const ORDER_PHASE_LABELS: Record<string, string> = {
  PREDICTION: 'Ramalan (boleh ubah)',
  FINAL: 'Muktamad ke Kilang',
};

export interface DriverWorkScheduleEntry {
  plan_id: string;
  production_date: string;
  route_name: string;
  region_code: string | null;
  route_pattern: string;
  status: string;
  order_phase: string;
  order_number: string | null;
  driver_id: string;
  driver_name: string;
  driver_code: string;
  vehicle: string | null;
  handoff_completed: boolean;
  depends_on_ready: boolean;
  stops: Array<{
    sequence: number;
    branch_code: string;
    branch_name: string;
    is_handoff: boolean;
    item_count: number;
  }>;
}
