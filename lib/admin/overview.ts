import type { SupabaseClient } from '@supabase/supabase-js';

type QueryError = { message: string } | null;
type QueryResult<T> = { data: T | null; error: QueryError; count?: number | null };

type ProfileRow = {
 role: string;
 status: string;
 branch_id: string | null;
 last_login_at: string | null;
};

type BookingRow = {
 status: string;
 priority: string;
 scheduled_date: string;
 created_at: string;
};

type AgentOrderRow = {
 status: string;
 total_amount_rm: number | string | null;
 production_date: string;
 created_at: string;
};

type PosSummaryRow = {
 summary_date: string;
 total_sales: number | string | null;
 total_cash: number | string | null;
 total_qr: number | string | null;
 transaction_count: number | string | null;
 void_count: number | string | null;
 refund_count: number | string | null;
};

type CollectionRow = {
 amount: number | string | null;
 status: string;
};

export type AdminBreakdownRow = {
 label: string;
 count: number;
 amount?: number;
};

export type AdminOverview = {
 period: {
 today: string;
 monthStart: string;
 };
 users: {
 activeProfiles: number;
 suspendedProfiles: number;
 loginAccounts: number;
 staffTotal: number;
 branchAssigned: number;
 hqUsers: number;
 byRole: AdminBreakdownRow[];
 };
 bookings: {
 total: number;
 open: number;
 dueToday: number;
 urgent: number;
 byStatus: AdminBreakdownRow[];
 };
 orders: {
 total: number;
 open: number;
 totalAmount: number;
 byStatus: AdminBreakdownRow[];
 };
 transactions: {
 todaySales: number;
 monthSales: number;
 monthCash: number;
 monthQr: number;
 todayTransactions: number;
 monthTransactions: number;
 voids: number;
 refunds: number;
 };
 governance: {
 pendingApprovals: number;
 outstandingCash: number;
 };
 issues: string[];
};

function isoDate(date: Date) {
 return date.toISOString().slice(0, 10);
}

function getPeriod() {
 const now = new Date();
 const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
 return {
 today: isoDate(now),
 monthStart: isoDate(monthStart),
 };
}

function toNumber(value: number | string | null | undefined) {
 const numberValue = Number(value ?? 0);
 return Number.isFinite(numberValue) ? numberValue : 0;
}

async function safeQuery<T>(
 issues: string[],
 label: string,
 query: PromiseLike<QueryResult<T>>,
) {
 const { data, error, count } = await query;
 if (error) {
 issues.push(`${label}: ${error.message}`);
 return { data: null, count: count ?? 0 };
 }
 return { data, count: count ?? 0 };
}

function buildCountBreakdown(rows: Array<{ status?: string; role?: string }>, key: 'status' | 'role') {
 const counts = new Map<string, number>();
 for (const row of rows) {
 const label = row[key] ?? 'UNKNOWN';
 counts.set(label, (counts.get(label) ?? 0) + 1);
 }
 return Array.from(counts, ([label, count]) => ({ label, count })).sort(
 (a, b) => b.count - a.count || a.label.localeCompare(b.label),
 );
}

function buildOrderBreakdown(rows: AgentOrderRow[]) {
 const counts = new Map<string, { count: number; amount: number }>();
 for (const row of rows) {
 const current = counts.get(row.status) ?? { count: 0, amount: 0 };
 current.count += 1;
 current.amount += toNumber(row.total_amount_rm);
 counts.set(row.status, current);
 }
 return Array.from(counts, ([label, value]) => ({
 label,
 count: value.count,
 amount: value.amount,
 })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export async function loadAdminOverview(
 service: SupabaseClient,
 organizationId: string,
): Promise<AdminOverview> {
 const period = getPeriod();
 const issues: string[] = [];

 const [
 profilesResult,
 staffCountResult,
 bookingsResult,
 ordersResult,
 summariesResult,
 approvalsResult,
 collectionsResult,
 ] = await Promise.all([
 safeQuery<ProfileRow[]>(
 issues,
 'profiles',
 service
 .from('profiles')
 .select('role,status,branch_id,last_login_at')
 .eq('organization_id', organizationId),
 ),
 safeQuery<unknown[]>(
 issues,
 'staff',
 service
 .from('staff')
 .select('*', { count: 'exact', head: true })
 .eq('organization_id', organizationId)
 .eq('status', 'ACTIVE'),
 ),
 safeQuery<BookingRow[]>(
 issues,
 'bookings',
 service
 .from('bookings')
 .select('status,priority,scheduled_date,created_at')
 .eq('organization_id', organizationId)
 .order('created_at', { ascending: false })
 .limit(1000),
 ),
 safeQuery<AgentOrderRow[]>(
 issues,
 'agent_stock_orders',
 service
 .from('agent_stock_orders')
 .select('status,total_amount_rm,production_date,created_at')
 .eq('organization_id', organizationId)
 .gte('created_at', `${period.monthStart}T00:00:00`)
 .order('created_at', { ascending: false })
 .limit(1000),
 ),
 safeQuery<PosSummaryRow[]>(
 issues,
 'pos_daily_summaries',
 service
 .from('pos_daily_summaries')
 .select('summary_date,total_sales,total_cash,total_qr,transaction_count,void_count,refund_count')
 .eq('organization_id', organizationId)
 .gte('summary_date', period.monthStart)
 .lte('summary_date', period.today),
 ),
 safeQuery<unknown[]>(
 issues,
 'approval_requests',
 service
 .from('approval_requests')
 .select('*', { count: 'exact', head: true })
 .eq('organization_id', organizationId)
 .eq('status', 'PENDING'),
 ),
 safeQuery<CollectionRow[]>(
 issues,
 'finance_collections',
 service
 .from('finance_collections')
 .select('amount,status')
 .eq('organization_id', organizationId)
 .eq('status', 'PENDING'),
 ),
 ]);

 const profiles = profilesResult.data ?? [];
 const activeProfiles = profiles.filter((profile) => profile.status === 'ACTIVE');
 const bookings = bookingsResult.data ?? [];
 const orders = ordersResult.data ?? [];
 const summaries = summariesResult.data ?? [];
 const collections = collectionsResult.data ?? [];

 const todaySummary = summaries.filter((row) => row.summary_date === period.today);
 const monthSales = summaries.reduce((sum, row) => sum + toNumber(row.total_sales), 0);
 const monthCash = summaries.reduce((sum, row) => sum + toNumber(row.total_cash), 0);
 const monthQr = summaries.reduce((sum, row) => sum + toNumber(row.total_qr), 0);
 const monthTransactions = summaries.reduce((sum, row) => sum + toNumber(row.transaction_count), 0);
 const todaySales = todaySummary.reduce((sum, row) => sum + toNumber(row.total_sales), 0);
 const todayTransactions = todaySummary.reduce((sum, row) => sum + toNumber(row.transaction_count), 0);
 const voids = summaries.reduce((sum, row) => sum + toNumber(row.void_count), 0);
 const refunds = summaries.reduce((sum, row) => sum + toNumber(row.refund_count), 0);

 const openBookingStatuses = new Set(['PENDING', 'CONFIRMED']);
 const openOrderStatuses = new Set(['DRAFT', 'PENDING_PAYMENT', 'PAID', 'SUBMITTED_FACTORY', 'ACKNOWLEDGED']);

 return {
 period,
 users: {
 activeProfiles: activeProfiles.length,
 suspendedProfiles: profiles.filter((profile) => profile.status !== 'ACTIVE').length,
 loginAccounts: profiles.length,
 staffTotal: staffCountResult.count,
 branchAssigned: activeProfiles.filter((profile) => profile.branch_id).length,
 hqUsers: activeProfiles.filter((profile) => !profile.branch_id).length,
 byRole: buildCountBreakdown(activeProfiles, 'role'),
 },
 bookings: {
 total: bookings.length,
 open: bookings.filter((booking) => openBookingStatuses.has(booking.status)).length,
 dueToday: bookings.filter((booking) => booking.scheduled_date === period.today).length,
 urgent: bookings.filter((booking) => booking.priority === 'URGENT').length,
 byStatus: buildCountBreakdown(bookings, 'status'),
 },
 orders: {
 total: orders.length,
 open: orders.filter((order) => openOrderStatuses.has(order.status)).length,
 totalAmount: orders.reduce((sum, order) => sum + toNumber(order.total_amount_rm), 0),
 byStatus: buildOrderBreakdown(orders),
 },
 transactions: {
 todaySales,
 monthSales,
 monthCash,
 monthQr,
 todayTransactions,
 monthTransactions,
 voids,
 refunds,
 },
 governance: {
 pendingApprovals: approvalsResult.count,
 outstandingCash: collections.reduce((sum, row) => sum + toNumber(row.amount), 0),
 },
 issues,
 };
}
