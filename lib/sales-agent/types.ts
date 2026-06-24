export type AgentAccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type AgentOutletStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type AgentOrderStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'SUBMITTED_FACTORY'
  | 'ACKNOWLEDGED'
  | 'FULFILLED'
  | 'CANCELLED';
export type AgentPaymentPurpose = 'STOCK_ORDER' | 'POS_SUBSCRIPTION';
export type OnlinePaymentMethod = 'CARD' | 'DEBIT' | 'FPX';
export type AgentPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export type SalesAgentAccount = {
  id: string;
  company_name: string;
  registration_no: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  business_address: string | null;
  status: AgentAccountStatus;
};

export type AgentOutlet = {
  id: string;
  outlet_code: string;
  outlet_name: string;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  pos_enabled: boolean;
  subscription_active: boolean;
  status: AgentOutletStatus;
};

export type AgentStockOrderItem = {
  id?: string;
  stock_item_id: string;
  item_name?: string;
  item_code?: string;
  quantity: number;
  unit: string;
  unit_price_rm: number;
  line_total_rm: number;
};

export type AgentStockOrder = {
  id: string;
  order_number: string;
  production_date: string;
  status: AgentOrderStatus;
  total_amount_rm: number;
  notes: string | null;
  submitted_at: string | null;
  items?: AgentStockOrderItem[];
};

export type ProductionDayOption = {
  production_date: string;
  orders_locked: boolean;
  window_open: boolean;
  cutoff_at: string | null;
};

export type AgentDashboardData = {
  account: SalesAgentAccount | null;
  outlets: AgentOutlet[];
  orders: AgentStockOrder[];
  payments: Array<{
    id: string;
    purpose: AgentPaymentPurpose;
    amount_rm: number;
    payment_method: OnlinePaymentMethod;
    status: AgentPaymentStatus;
    created_at: string;
  }>;
  production_days: ProductionDayOption[];
  subscription_monthly_rm: number;
  stats: {
    pending_orders: number;
    active_outlets: number;
    factory_submitted: number;
  };
};

export type StockCatalogItem = {
  id: string;
  item_code: string;
  item_name: string;
  unit: string;
  unit_price_rm: number;
};
