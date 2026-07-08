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
export type AgentPaymentLifecycleStatus = AgentPaymentStatus | 'CANCELLED';

export type SalesAgentAccount = {
 id: string;
 company_name: string;
 registration_no: string | null;
 contact_person: string | null;
 contact_phone: string | null;
 contact_email: string | null;
 business_address: string | null;
 status: AgentAccountStatus;
 assigned_price_group_id?: string | null;
 price_group?: { id: string; code: string; name: string; payment_exempt: boolean } | null;
 payment_exempt?: boolean;
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
 subscription?: {
 status: string;
 period_start: string;
 period_end: string;
 amount_rm: number;
 } | null;
};

export type AgentSalesStaffStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type AgentSalesStaff = {
 id: string;
 agent_account_id: string;
 outlet_id: string | null;
 full_name: string;
 phone: string | null;
 email: string | null;
 role_title: string;
 duty_scope: string | null;
 status: AgentSalesStaffStatus;
 created_at: string;
 updated_at: string;
 outlet?: {
 id: string;
 outlet_code: string;
 outlet_name: string;
 } | null;
};

export type AgentSalesStaffPayload = {
 id?: string;
 outlet_id?: string | null;
 full_name?: string;
 phone?: string | null;
 email?: string | null;
 role_title?: string;
 duty_scope?: string | null;
 status?: AgentSalesStaffStatus;
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
 payment_exempt?: boolean;
 factory_order_id?: string | null;
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
 lifecycle_status?: AgentPaymentLifecycleStatus;
 created_at: string;
 }>;
 production_days: ProductionDayOption[];
 subscription_monthly_rm: number;
 stats: {
 pending_orders: number;
 active_outlets: number;
 factory_submitted: number;
 };
 payment_gateway: {
 mode: 'simulate' | 'live';
 ipay88_configured: boolean;
 };
};

export type StockCatalogItem = {
 id: string;
 item_code: string;
 item_name: string;
 unit: string;
 unit_price_rm: number;
 price_group_code?: string | null;
 price_group_name?: string | null;
 package_description?: string | null;
};

export type AgentPaymentReceiptItem = {
 item_code: string;
 item_name: string;
 quantity: number;
 unit: string;
 unit_price_rm: number;
 line_total_rm: number;
};

export type AgentPaymentReceipt = {
 receipt_number: string;
 issued_at: string;
 issuer: {
 code: string;
 legal_name: string;
 name: string;
 address?: string | null;
 phone?: string | null;
 email?: string | null;
 registration_no?: string | null;
 tax_id?: string | null;
 bank_name?: string | null;
 bank_account_name?: string | null;
 bank_account_no?: string | null;
 };
 agent: {
 company_name: string;
 registration_no: string | null;
 contact_person: string | null;
 contact_email: string | null;
 };
 purpose: AgentPaymentPurpose;
 payment: {
 id: string;
 method: OnlinePaymentMethod;
 amount_rm: number;
 gateway_ref: string | null;
 paid_at: string;
 };
 order?: {
 id: string;
 order_number: string;
 production_date: string;
 total_amount_rm: number;
 items: AgentPaymentReceiptItem[];
 factory_order_id?: string;
 };
 subscription?: {
 id: string;
 outlet_code: string;
 outlet_name: string;
 period_start: string;
 period_end: string;
 amount_rm: number;
 };
};

export type AgentPaymentTarget = {
 purpose: AgentPaymentPurpose;
 referenceId: string;
 label: string;
 amountRm: number;
 productionDate?: string;
};

export type AgentPriceGroupOption = {
 id: string;
 code: string;
 name: string;
 description?: string | null;
 is_default?: boolean;
 status?: string;
 payment_exempt?: boolean;
};

export type AdminAgentOutletOption = {
 id: string;
 outlet_code: string;
 outlet_name: string;
 address_line: string | null;
 city: string | null;
 state: string | null;
 status: AgentOutletStatus;
 subscription_active: boolean;
};

export type AdminBranchPickupOption = {
 id: string;
 branch_code: string;
 branch_name: string;
 area: string | null;
 status: string;
};

export type AdminSalesAgentAccount = SalesAgentAccount & {
 profile_id: string;
 assigned_price_group_id: string | null;
 source_reference: string | null;
 assigned_driver_name: string | null;
 pickup_location: string | null;
 created_at: string;
 updated_at: string;
 profile: {
 id: string;
 full_name: string;
 email: string;
 status: string;
 last_login_at: string | null;
 } | null;
 price_group: {
 id: string;
 code: string;
 name: string;
 payment_exempt?: boolean;
 } | null;
 outlets: AdminAgentOutletOption[];
 stats: {
 outlets: number;
 active_outlets: number;
 orders: number;
 paid_or_submitted_orders: number;
 total_order_rm: number;
 };
};


export type AgentAccountReportEvent = {
 id: string;
 event_type: 'CREATED' | 'UPDATED' | 'ARCHIVED' | 'REACTIVATED' | 'SUSPENDED';
 company_name: string;
 contact_person: string | null;
 contact_email: string | null;
 registration_no: string | null;
 price_group_name: string | null;
 reason: string | null;
 created_at: string;
 created_by_profile?: { full_name: string; email: string | null } | null;
};

export type AgentSpecialAssignableStaff = {
 id: string;
 staff_code: string;
 full_name: string;
 profile_id: string | null;
 legal_entity_id: string | null;
 legal_entity?: { code: string; legal_name: string; name: string } | null;
};

export type AdminAgentDriverOption = {
 id: string;
 driver_code: string | null;
 full_name: string;
 route_description: string | null;
 phone: string | null;
};

export type AgentSpecialStaffAssignment = {
 id: string;
 agent_account_id: string;
 staff_id: string;
 profile_id: string | null;
 role_title: string;
 assignment_note: string | null;
 status: 'ACTIVE' | 'ENDED';
 assigned_at: string;
 staff?: { staff_code: string; full_name: string } | null;
 agent_account?: { company_name: string } | null;
 legal_entity?: { code: string; legal_name: string; name: string } | null;
};
export type AdminAgentPayload = {
 account_id?: string;
 staff_id?: string | null;
 email?: string;
 password?: string;
 full_name?: string;
 company_name?: string;
 registration_no?: string | null;
 contact_person?: string | null;
 contact_phone?: string | null;
 contact_email?: string | null;
 business_address?: string | null;
 assigned_price_group_id?: string | null;
 assigned_driver_name?: string | null;
 pickup_location?: string | null;
 source_reference?: string | null;
 status?: AgentAccountStatus;
};




