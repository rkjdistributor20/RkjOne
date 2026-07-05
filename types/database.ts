import type { PermissionLevel, UserRole } from './enums';

export type Json =
 | string
 | number
 | boolean
 | null
 | { [key: string]: Json | undefined }
 | Json[];

export interface Database {
 public: {
 Tables: {
 organizations: {
 Row: Organization;
 Insert: Omit<Organization, 'id' | 'created_at' | 'updated_at'> & {
 id?: string;
 created_at?: string;
 updated_at?: string;
 };
 Update: Partial<Organization>;
 };
 regions: {
 Row: Region;
 Insert: Omit<Region, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<Region>;
 };
 branches: {
 Row: Branch;
 Insert: Omit<Branch, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<Branch>;
 };
 profiles: {
 Row: Profile;
 Insert: Omit<Profile, 'created_at' | 'updated_at'>;
 Update: Partial<Profile>;
 };
 role_permissions: {
 Row: RolePermission;
 Insert: Omit<RolePermission, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<RolePermission>;
 };
 staff: {
 Row: Staff;
 Insert: Omit<Staff, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<Staff>;
 };
 drivers: {
 Row: Driver;
 Insert: Omit<Driver, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<Driver>;
 };
 vehicles: {
 Row: Vehicle;
 Insert: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<Vehicle>;
 };
 products: {
 Row: Product;
 Insert: Omit<Product, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<Product>;
 };
 stock_items: {
 Row: StockItem;
 Insert: Omit<StockItem, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<StockItem>;
 };
 product_bom: {
 Row: ProductBom;
 Insert: Omit<ProductBom, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<ProductBom>;
 };
 inventory_locations: {
 Row: InventoryLocation;
 Insert: Omit<InventoryLocation, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<InventoryLocation>;
 };
 inventory_balances: {
 Row: InventoryBalance;
 Insert: Omit<InventoryBalance, 'id' | 'updated_at'>;
 Update: Partial<InventoryBalance>;
 };
 pos_shifts: {
 Row: PosShift;
 Insert: Omit<PosShift, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<PosShift>;
 };
 pos_transactions: {
 Row: PosTransaction;
 Insert: Omit<PosTransaction, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<PosTransaction>;
 };
 pos_transaction_items: {
 Row: PosTransactionItem;
 Insert: Omit<PosTransactionItem, 'id' | 'created_at'>;
 Update: Partial<PosTransactionItem>;
 };
 notifications: {
 Row: Notification;
 Insert: Omit<Notification, 'id' | 'created_at'>;
 Update: Partial<Notification>;
 };
 pos_daily_summaries: {
 Row: {
 id: string;
 organization_id: string;
 branch_id: string;
 summary_date: string;
 total_sales: number;
 total_cash: number;
 total_qr: number;
 transaction_count: number;
 void_count: number;
 refund_count: number;
 shift_count: number;
 created_at: string;
 updated_at: string;
 };
 Insert: Record<string, unknown>;
 Update: Record<string, unknown>;
 };
 approval_requests: {
 Row: ApprovalRequest;
 Insert: Omit<ApprovalRequest, 'id' | 'created_at' | 'updated_at'>;
 Update: Partial<ApprovalRequest>;
 };
 hr_service_requests: {
 Row: HrServiceRequest;
 Insert: Omit<HrServiceRequest, 'id' | 'created_at' | 'updated_at'> & {
 id?: string;
 created_at?: string;
 updated_at?: string;
 };
 Update: Partial<HrServiceRequest>;
 };
 hr_leave_balances: {
 Row: HrLeaveBalance;
 Insert: Omit<HrLeaveBalance, 'id' | 'created_at' | 'updated_at' | 'remaining_days'> & {
 id?: string;
 created_at?: string;
 updated_at?: string;
 remaining_days?: number;
 };
 Update: Partial<Omit<HrLeaveBalance, 'remaining_days'>>;
 };
 hr_leave_transactions: {
 Row: HrLeaveTransaction;
 Insert: Omit<HrLeaveTransaction, 'id' | 'created_at'> & {
 id?: string;
 created_at?: string;
 };
 Update: Partial<HrLeaveTransaction>;
 };
 maintenance_reports: {
 Row: MaintenanceReport;
 Insert: Omit<MaintenanceReport, 'id' | 'created_at' | 'updated_at'> & {
 id?: string;
 created_at?: string;
 updated_at?: string;
 };
 Update: Partial<MaintenanceReport>;
 };
 org_stock_planning_settings: {
 Row: OrgStockPlanningSettings;
 Insert: Omit<OrgStockPlanningSettings, 'updated_at'> & { updated_at?: string };
 Update: Partial<OrgStockPlanningSettings>;
 };
 malaysia_holidays: {
 Row: MalaysiaHoliday;
 Insert: Omit<MalaysiaHoliday, 'id'> & { id?: string };
 Update: Partial<MalaysiaHoliday>;
 };
 };
 Views: {
 dashboard_stats: {
 Row: DashboardStats;
 };
 };
 Functions: {
 calculate_commission: {
 Args: { p_org_id: string; p_sales_amount: number };
 Returns: number;
 };
 calculate_foreign_shift_pay: {
 Args: { p_org_id: string; p_hours: number };
 Returns: number;
 };
 open_pos_shift: {
 Args: {
 p_branch_id: string;
 p_opening_cash?: number;
 p_staff_id?: string | null;
 };
 Returns: { shift_id: string; shift_number: string; opening_cash: number };
 };
 close_pos_shift: {
 Args: {
 p_shift_id: string;
 p_closing_cash: number;
 p_notes?: string | null;
 };
 Returns: Record<string, unknown>;
 };
 process_pos_sale: {
 Args: {
 p_shift_id: string;
 p_branch_id: string;
 p_items: Array<{ product_id: string; quantity: number }>;
 p_payment_method: string;
 p_cash_amount: number;
 p_qr_amount: number;
 p_discount?: number;
 p_offline_id?: string | null;
 p_receipt_email?: string | null;
 p_receipt_phone?: string | null;
 };
 Returns: Record<string, unknown>;
 };
 void_pos_transaction: {
 Args: { p_transaction_id: string; p_reason: string };
 Returns: Record<string, unknown>;
 };
 refund_pos_transaction: {
 Args: { p_transaction_id: string; p_reason: string };
 Returns: Record<string, unknown>;
 };
 get_pos_product_availability: {
 Args: { p_branch_id: string };
 Returns: Record<string, { available: number; status: string }>;
 };
 };
 Enums: {
 user_role: UserRole;
 permission_level: PermissionLevel;
 entity_status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 region_code: 'UTARA' | 'TENGAH' | 'SELATAN';
 location_type: 'FACTORY' | 'HQ_WAREHOUSE' | 'FLEET_VEHICLE' | 'BRANCH_KIOSK';
 payment_method: 'CASH' | 'QR' | 'MIXED';
 pos_tx_status: 'COMPLETED' | 'VOIDED' | 'REFUNDED';
 pos_shift_status: 'OPEN' | 'CLOSED';
 worker_type: 'FOREIGN' | 'LOCAL';
 approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
 notification_type:
 | 'LOW_STOCK'
 | 'CRITICAL_STOCK'
 | 'PENDING_SHIFT'
 | 'PENDING_APPROVAL'
 | 'PENDING_BANK_IN'
 | 'DELIVERY_STATUS'
 | 'ROSTER_DUE'
 | 'ROSTER_PUBLISHED';
 };
 };
}

export interface Organization {
 id: string;
 code: string;
 name: string;
 hq_address: string | null;
 hq_city: string;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 settings: Json;
 created_at: string;
 updated_at: string;
}

export interface Region {
 id: string;
 organization_id: string;
 code: 'UTARA' | 'TENGAH' | 'SELATAN';
 name: string;
 manager_name: string | null;
 manager_profile_id: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 created_at: string;
 updated_at: string;
}

export interface Branch {
 id: string;
 organization_id: string;
 region_id: string;
 branch_code: string;
 branch_name: string;
 area: string | null;
 manager_name: string | null;
 latitude: number | null;
 longitude: number | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 remarks: string | null;
 created_at: string;
 updated_at: string;
}

export interface Profile {
 id: string;
 organization_id: string;
 employee_code: string | null;
 full_name: string;
 email: string | null;
 phone: string | null;
 role: UserRole;
 legal_entity_id: string | null;
 legal_entity?: LegalEntity | null;
 operating_legal_entity_id?: string | null;
 operating_legal_entity?: LegalEntity | null;
 region_id: string | null;
 branch_id: string | null;
 avatar_url: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 must_change_password: boolean;
 last_login_at: string | null;
 ic_number: string | null;
 date_of_birth: string | null;
 gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
 nationality: string | null;
 address_line1: string | null;
 address_line2: string | null;
 city: string | null;
 state: string | null;
 postcode: string | null;
 emergency_contact_name: string | null;
 emergency_contact_phone: string | null;
 emergency_contact_relation: string | null;
 profile_completed_at: string | null;
 metadata: Json;
 created_at: string;
 updated_at: string;
}

export interface LegalEntity {
 id: string;
 organization_id: string;
 code: string;
 name: string;
 legal_name: string;
 scope: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 sort_order: number;
 created_at?: string;
 updated_at?: string;
}

export interface MaintenanceReport {
 id: string;
 organization_id: string;
 report_number: string;
 branch_id: string | null;
 reported_by: string | null;
 assigned_to: string | null;
 report_type: 'MAINTENANCE' | 'STAFF_SHORTAGE' | 'EMERGENCY';
 category: 'GENERAL' | 'ELECTRICAL' | 'PLUMBING' | 'EQUIPMENT' | 'SIGNAGE' | 'CLEANLINESS' | 'SAFETY' | 'STAFFING';
 priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
 status: 'NEW' | 'REVIEWING' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'RESOLVED' | 'CANCELLED';
 title: string;
 description: string;
 substitute_required: boolean;
 substitute_status: 'NOT_REQUIRED' | 'REQUESTED' | 'HANIF_ASSIGNED' | 'COVERED' | 'CANCELLED';
 preferred_visit_date: string | null;
 contact_name: string | null;
 contact_phone: string | null;
 manager_notes: string | null;
 resolved_at: string | null;
 created_at: string;
 updated_at: string;
}

export interface RolePermission {
 id: string;
 organization_id: string;
 role: UserRole;
 module: string;
 permission: PermissionLevel;
 created_at: string;
 updated_at: string;
}

export interface Staff {
 id: string;
 organization_id: string;
 staff_code: string;
 full_name: string;
 legal_entity_id: string | null;
 branch_id: string | null;
 region_id: string | null;
 worker_type: 'FOREIGN' | 'LOCAL' | null;
 bank_name: string | null;
 account_number: string | null;
 account_holder: string | null;
 weekly_amount: number | null;
 monthly_amount: number | null;
 shift_hours: number | null;
 shifts_per_week: number | null;
 profile_id: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 on_hold: boolean;
 remarks: string | null;
 created_at: string;
 updated_at: string;
}

export interface Driver {
 id: string;
 organization_id: string;
 driver_code: string;
 full_name: string;
 route_description: string | null;
 phone: string | null;
 profile_id: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 remarks: string | null;
 created_at: string;
 updated_at: string;
}

export interface Vehicle {
 id: string;
 organization_id: string;
 vehicle_code: string;
 plate_number: string | null;
 vehicle_type: string;
 capacity: string | null;
 default_driver_id: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 remarks: string | null;
 created_at: string;
 updated_at: string;
}

export interface Product {
 id: string;
 organization_id: string;
 sku: string;
 name: string;
 category: string | null;
 price: number;
 sale_unit: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 notes: string | null;
 sort_order: number;
 created_at: string;
 updated_at: string;
}

export interface StockItem {
 id: string;
 organization_id: string;
 item_code: string;
 name: string;
 category: string | null;
 base_unit: string;
 storage_unit: string | null;
 conversion_text: string | null;
 pack_quantity: number | null;
 pack_unit: string | null;
 min_threshold: number | null;
 critical_threshold: number | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 notes: string | null;
 created_at: string;
 updated_at: string;
}

export interface ProductBom {
 id: string;
 organization_id: string;
 product_id: string;
 stock_item_id: string;
 quantity: number;
 unit: string;
 min_qty: number | null;
 max_qty: number | null;
 auto_deduct: boolean;
 notes: string | null;
 created_at: string;
 updated_at: string;
}

export interface InventoryLocation {
 id: string;
 organization_id: string;
 location_type: 'FACTORY' | 'HQ_WAREHOUSE' | 'FLEET_VEHICLE' | 'BRANCH_KIOSK';
 name: string;
 branch_id: string | null;
 vehicle_id: string | null;
 is_active: boolean;
 created_at: string;
 updated_at: string;
}

export interface InventoryBalance {
 id: string;
 organization_id: string;
 location_id: string;
 stock_item_id: string;
 quantity: number;
 unit: string;
 last_movement_at: string | null;
 updated_at: string;
}

export interface PosShift {
 id: string;
 organization_id: string;
 branch_id: string;
 shift_number: string;
 staff_id: string | null;
 opened_by: string;
 closed_by: string | null;
 status: 'OPEN' | 'CLOSED';
 opening_cash: number;
 closing_cash: number | null;
 expected_cash: number | null;
 cash_variance: number | null;
 total_sales: number;
 total_cash: number;
 total_qr: number;
 transaction_count: number;
 opened_at: string;
 closed_at: string | null;
 notes: string | null;
 created_at: string;
 updated_at: string;
}

export interface PosTransaction {
 id: string;
 organization_id: string;
 branch_id: string;
 shift_id: string;
 transaction_number: string;
 status: 'COMPLETED' | 'VOIDED' | 'REFUNDED';
 subtotal: number;
 discount: number;
 total: number;
 payment_method: 'CASH' | 'QR' | 'MIXED';
 cash_amount: number;
 qr_amount: number;
 change_amount: number;
 void_reason: string | null;
 voided_by: string | null;
 voided_at: string | null;
 refund_reason: string | null;
 refunded_by: string | null;
 refunded_at: string | null;
 original_transaction_id: string | null;
 receipt_sent: boolean;
 receipt_email: string | null;
 receipt_phone: string | null;
 offline_id: string | null;
 synced_at: string | null;
 created_by: string;
 created_at: string;
 updated_at: string;
}

export interface PosTransactionItem {
 id: string;
 transaction_id: string;
 product_id: string;
 product_name: string;
 sku: string;
 quantity: number;
 unit_price: number;
 line_total: number;
 created_at: string;
}

export interface Notification {
 id: string;
 organization_id: string;
 recipient_id: string;
 type: Database['public']['Enums']['notification_type'];
 title: string;
 message: string;
 link: string | null;
 entity_type: string | null;
 entity_id: string | null;
 is_read: boolean;
 read_at: string | null;
 created_at: string;
}

export interface ApprovalRequest {
 id: string;
 organization_id: string;
 entity_type: string;
 entity_id: string;
 title: string;
 description: string | null;
 status: 'PENDING' | 'APPROVED' | 'REJECTED';
 requested_by: string;
 assigned_to: string | null;
 approved_by: string | null;
 rejected_by: string | null;
 rejection_reason: string | null;
 branch_id: string | null;
 region_id: string | null;
 metadata: Json;
 created_at: string;
 updated_at: string;
 resolved_at: string | null;
}

export type HrServiceRequestType =
 | 'LEAVE'
 | 'PROFILE_UPDATE'
 | 'DOCUMENT'
 | 'PAYROLL'
 | 'TRANSFER'
 | 'ATTENDANCE'
 | 'UNIFORM_EQUIPMENT'
 | 'OVERTIME'
 | 'CLAIM'
 | 'TRAINING'
 | 'RESIGNATION'
 | 'DISCIPLINE'
 | 'ASSET'
 | 'LOAN_ADVANCE'
 | 'HR_HELP';

export type HrServiceRequestStatus =
 | 'SUBMITTED'
 | 'IN_REVIEW'
 | 'APPROVED'
 | 'REJECTED'
 | 'CANCELLED'
 | 'COMPLETED';

export type HrServiceRequestPriority = 'LOW' | 'NORMAL' | 'HIGH';

export type HrLeaveType = 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'UNPAID' | 'REPLACEMENT';

export type HrLeaveTransactionType =
 | 'ENTITLEMENT'
 | 'CARRY_FORWARD'
 | 'ADJUSTMENT'
 | 'PENDING'
 | 'APPROVED_USAGE'
 | 'REJECT_RELEASE'
 | 'CANCEL_RELEASE';

export interface HrServiceRequest {
 id: string;
 organization_id: string;
 legal_entity_id: string | null;
 branch_id: string | null;
 profile_id: string;
 staff_id: string | null;
 request_number: string;
 request_type: HrServiceRequestType;
 title: string;
 description: string;
 start_date: string | null;
 end_date: string | null;
 priority: HrServiceRequestPriority;
 status: HrServiceRequestStatus;
 reviewed_by: string | null;
 reviewed_at: string | null;
 reviewer_note: string | null;
 metadata: Json;
 created_at: string;
 updated_at: string;
}

export interface HrLeaveBalance {
 id: string;
 organization_id: string;
 legal_entity_id: string | null;
 staff_id: string;
 profile_id: string | null;
 leave_year: number;
 leave_type: HrLeaveType;
 entitlement_days: number;
 carried_forward_days: number;
 used_days: number;
 pending_days: number;
 adjustment_days: number;
 remaining_days: number;
 notes: string | null;
 updated_by: string | null;
 created_at: string;
 updated_at: string;
}

export interface HrLeaveTransaction {
 id: string;
 organization_id: string;
 leave_balance_id: string | null;
 staff_id: string;
 profile_id: string | null;
 hr_service_request_id: string | null;
 leave_type: HrLeaveType;
 transaction_type: HrLeaveTransactionType;
 days: number;
 balance_after_days: number | null;
 note: string | null;
 created_by: string | null;
 created_at: string;
}

export interface DashboardStats {
 organization_id: string;
 sales_today: number;
 sales_this_week: number;
 sales_this_month: number;
 pending_approvals: number;
 critical_stock_count: number;
 low_stock_count: number;
 outstanding_cash: number;
}

export interface OrgStockPlanningSettings {
 organization_id: string;
 stock_coverage_days: number;
 safety_buffer_pcs: number;
 updated_at: string;
}

export interface MalaysiaHoliday {
 id: string;
 holiday_date: string;
 name: string;
 holiday_type: string;
 region_code: string | null;
 demand_multiplier: number;
 notes: string | null;
}

export type Tables<T extends keyof Database['public']['Tables']> =
 Database['public']['Tables'][T]['Row'];

export type ProfileWithBranch = Profile & {
 branch?: Branch | null;
 region?: Region | null;
 legal_entity_id?: string | null;
 legal_entity?: LegalEntity | null;
};
