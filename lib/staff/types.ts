export interface StaffMemberRow {
 id: string;
 staff_code: string;
 full_name: string;
 status: string;
 branch_id: string | null;
 branch_code: string | null;
 branch_name: string | null;
 worker_type: 'LOCAL' | 'FOREIGN' | null;
 weekly_amount: number | null;
 monthly_amount: number | null;
 shift_hours: number | null;
 shifts_per_week: number | null;
 job_title?: string | null;
 department?: string | null;
 work_scope?: string | null;
}

export interface StaffBranchGroup {
 branch_id: string;
 branch_code: string;
 branch_name: string;
 staff: StaffMemberRow[];
}

export interface StaffRegionGroup {
 region_id: string;
 region_code: string;
 region_name: string;
 manager_name: string | null;
 branches: StaffBranchGroup[];
 staff_count: number;
}

export interface StaffGroupedResponse {
 groups: StaffRegionGroup[];
 scoped_region_id: string | null;
 selected_branch_id: string | null;
}
