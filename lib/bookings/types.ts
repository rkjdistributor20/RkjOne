export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export type BookingType =
 | 'GENERAL'
 | 'CUSTOMER'
 | 'EVENT'
 | 'MAINTENANCE'
 | 'SALES_AGENT'
 | 'DELIVERY'
 | 'OTHER';

export type BookingPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type BookingBranch = {
 id: string;
 branch_code: string;
 branch_name: string;
 area?: string | null;
 region_name?: string | null;
};

export type BookingPerson = {
 full_name: string | null;
 role?: string | null;
};

export type BookingRecord = {
 id: string;
 booking_number: string;
 booking_type: BookingType;
 status: BookingStatus;
 priority: BookingPriority;
 title: string;
 description: string | null;
 customer_name: string | null;
 customer_phone: string | null;
 customer_email: string | null;
 scheduled_date: string;
 scheduled_time: string | null;
 expected_pax: number | null;
 source: string;
 notes: string | null;
 metadata: Record<string, unknown>;
 confirmed_at: string | null;
 cancelled_at: string | null;
 completed_at: string | null;
 created_at: string;
 updated_at: string;
 branch: BookingBranch | null;
 creator: BookingPerson | null;
 assignee: BookingPerson | null;
};

export type BookingFormPayload = {
 branch_id?: string | null;
 booking_type?: BookingType;
 status?: BookingStatus;
 priority?: BookingPriority;
 title: string;
 description?: string | null;
 customer_name?: string | null;
 customer_phone?: string | null;
 customer_email?: string | null;
 scheduled_date: string;
 scheduled_time?: string | null;
 expected_pax?: number | null;
 source?: string;
 notes?: string | null;
 metadata?: Record<string, unknown>;
};

export type BookingListFilters = {
 status?: string;
 branch_id?: string;
 from?: string;
 to?: string;
 limit?: number;
};
