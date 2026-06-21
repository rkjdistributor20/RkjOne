export interface PublishedProductionDate {
  production_date: string;
  week_start: string;
  week_notes?: string | null;
  day_notes?: string | null;
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

export interface HqFactoryOrder {
  id: string;
  order_number: string;
  production_date: string;
  status: 'SUBMITTED' | 'ACKNOWLEDGED' | 'FULFILLED' | 'CANCELLED';
  notes: string | null;
  created_at: string;
  acknowledged_at: string | null;
  created_by_profile?: { full_name: string } | null;
  hq_factory_order_items?: HqFactoryOrderItem[];
}

export const HQ_FACTORY_ORDER_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Menunggu Kilang',
  ACKNOWLEDGED: 'Disahkan Kilang',
  FULFILLED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};
