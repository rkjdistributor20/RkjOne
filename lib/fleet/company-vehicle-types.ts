export type CompanyVehicleCategory = 'MANAGER' | 'DELIVERY' | 'FACTORY' | 'REPLACEMENT';
export type CompanyVehicleAccessMode = 'MANAGEMENT' | 'CUSTODIAN' | 'MAINTENANCE' | 'FINANCE' | 'HR';

export interface CompanyVehicleDocument {
 id: string;
 document_type: string;
 document_name: string;
 document_url: string | null;
 issued_at: string | null;
 expires_at: string | null;
 status: string;
}

export interface CompanyVehicleExpense {
 id: string;
 expense_type: string;
 amount: number;
 expense_date: string;
 receipt_url: string | null;
 notes: string | null;
 status: string;
 submitted_by_name: string | null;
}

export interface CompanyVehicleIncident {
 id: string;
 incident_type: string;
 severity: string;
 incident_at: string;
 location: string | null;
 description: string;
 status: string;
 estimated_cost: number | null;
 actual_cost: number | null;
 reported_by_name: string | null;
}

export interface CompanyVehicleUsage {
 id: string;
 purpose: string;
 usage_type: string;
 destination: string | null;
 started_at: string;
 ended_at: string | null;
 start_odometer_km: number | null;
 end_odometer_km: number | null;
 status: string;
 profile_name: string | null;
}

export interface CompanyVehicleRecord {
 id: string;
 vehicle_code: string;
 plate_number: string | null;
 vehicle_type: string;
 vehicle_category: CompanyVehicleCategory;
 company_custodian_profile_id: string | null;
 company_custodian_name: string | null;
 company_assigned_at: string | null;
 company_usage_note: string | null;
 road_tax_expiry: string | null;
 insurance_expiry: string | null;
 inspection_expiry: string | null;
 permit_expiry: string | null;
 compliance_notes: string | null;
 assignment_status: string | null;
 assignment_acknowledged_at: string | null;
 active_usage: CompanyVehicleUsage | null;
 latest_usages: CompanyVehicleUsage[];
 expenses: CompanyVehicleExpense[];
 incidents: CompanyVehicleIncident[];
 documents: CompanyVehicleDocument[];
 maintenance: Array<{
  id: string;
  service_name: string;
  status: string;
  next_service_date: string | null;
  next_service_odometer_km: number | null;
  remaining_km: number | null;
 }>;
 monthly_cost: number;
 open_incidents: number;
 documents_due: number;
 gps: {
  active: boolean;
  status: string;
  speed_kph: number | null;
  odometer_km: number | null;
  event_ts: string | null;
  map_url: string | null;
 } | null;
}

export interface CompanyVehicleDashboardResponse {
 mode: CompanyVehicleAccessMode;
 current_profile_id: string;
 can_manage: boolean;
 can_manage_compliance: boolean;
 can_review_expenses: boolean;
 gps_visible: boolean;
 generated_at: string;
 kpis: {
  total: number;
  in_use: number;
  documents_due: number;
  open_incidents: number;
  monthly_cost: number;
  pending_expenses: number;
  maintenance_due: number;
  tracked_gps: number;
 };
 vehicles: CompanyVehicleRecord[];
 custodians: Array<{ id: string; full_name: string; role: string }>;
}

export interface CompanyVehicleActionPayload {
 action: 'ASSIGN' | 'UPDATE_CATEGORY' | 'ACKNOWLEDGE_HANDOVER' | 'START_USAGE' | 'END_USAGE' | 'ADD_EXPENSE' | 'SAVE_DOCUMENT' | 'REPORT_INCIDENT' | 'REVIEW_EXPENSE' | 'UPDATE_INCIDENT';
 vehicle_id?: string;
 assignment_id?: string;
 custodian_profile_id?: string;
 vehicle_category?: CompanyVehicleCategory;
 purpose?: string;
 usage_type?: string;
 destination?: string;
 odometer_km?: number | null;
 notes?: string;
 usage_log_id?: string;
 expense_type?: string;
 amount?: number;
 expense_date?: string;
 fuel_litres?: number | null;
 receipt_url?: string;
 document_type?: string;
 document_name?: string;
 document_url?: string;
 issued_at?: string;
 expires_at?: string;
 incident_type?: string;
 severity?: string;
 incident_at?: string;
 location?: string;
 description?: string;
 estimated_cost?: number | null;
 expense_id?: string;
 incident_id?: string;
 status?: string;
 actual_cost?: number | null;
}
