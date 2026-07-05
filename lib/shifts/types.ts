export interface ShiftTemplate {
 id: string;
 template_code: string;
 name: string;
 start_time: string | null;
 end_time: string | null;
 default_hours: number | null;
 crosses_midnight: boolean;
}

export interface StaffShiftRow {
 id: string;
 shift_date: string;
 scheduled_start: string | null;
 scheduled_end: string | null;
 scheduled_hours: number | null;
 actual_hours: number | null;
 ot_hours: number | null;
 status: 'PENDING' | 'APPROVED' | 'REJECTED';
 staff: { staff_code: string; full_name: string };
 branch: { branch_code: string; branch_name: string };
 template: { name: string } | null;
}

export interface AttendanceRow {
 id: string;
 attendance_date: string;
 clock_in: string | null;
 clock_out: string | null;
 hours_worked: number | null;
 ot_hours: number | null;
 staff: { staff_code: string; full_name: string };
}
