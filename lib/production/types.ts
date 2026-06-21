export interface PublishedProductionDate {
  production_date: string;
  week_start: string;
  week_notes?: string | null;
  day_notes?: string | null;
  cutoff_at?: string;
  orders_locked?: boolean;
  window_open?: boolean;
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
    driver: string | null;
    vehicle: string | null;
    status: string;
    stops: Array<{
      sequence: number;
      branch_code: string;
      branch_name: string;
    }>;
  }>;
}

export interface DeliveryRoutePlan {
  id: string;
  route_name: string;
  region_code: string | null;
  production_date: string;
  status: string;
  driver?: { full_name: string } | null;
  vehicle?: { vehicle_code: string; vehicle_type: string } | null;
  stops?: Array<{
    stop_sequence: number;
    branch: { branch_code: string; branch_name: string };
  }>;
}

export const HQ_FACTORY_ORDER_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Menunggu Kilang',
  ACKNOWLEDGED: 'Disahkan Kilang',
  FULFILLED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};
