-- RKJ One: dashboard performance acceleration
-- Adds indexes for common dashboard filters, a guarded dashboard rollup
-- materialized view for admin/reporting refreshes, and a branch-scoped
-- dashboard snapshot RPC used by the app with code-level fallback.

CREATE INDEX IF NOT EXISTS idx_delivery_orders_org_status_created
 ON public.delivery_orders(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleet_status_log_org_vehicle_logged
 ON public.fleet_status_log(organization_id, vehicle_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_collections_org_status_branch
 ON public.finance_collections(organization_id, status, branch_id);

CREATE INDEX IF NOT EXISTS idx_approval_requests_org_branch_status
 ON public.approval_requests(organization_id, branch_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_shifts_org_status_branch
 ON public.pos_shifts(organization_id, status, branch_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.dashboard_daily_rollups AS
SELECT
 pds.organization_id,
 pds.summary_date,
 COALESCE(SUM(pds.total_sales), 0)::numeric(14, 2) AS total_sales,
 COALESCE(SUM(pds.transaction_count), 0)::integer AS transaction_count,
 COUNT(DISTINCT pds.branch_id)::integer AS branch_count,
 MAX(pds.updated_at) AS source_updated_at
FROM public.pos_daily_summaries pds
GROUP BY pds.organization_id, pds.summary_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_daily_rollups_org_date
 ON public.dashboard_daily_rollups(organization_id, summary_date);

REVOKE ALL ON TABLE public.dashboard_daily_rollups FROM anon;
REVOKE ALL ON TABLE public.dashboard_daily_rollups FROM authenticated;

CREATE OR REPLACE FUNCTION public.refresh_dashboard_daily_rollups()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
 REFRESH MATERIALIZED VIEW public.dashboard_daily_rollups;
$$;

REVOKE ALL ON FUNCTION public.refresh_dashboard_daily_rollups() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_dashboard_daily_rollups() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_dashboard_daily_rollups() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_daily_rollups() TO service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot(
 p_org_id uuid,
 p_branch_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
 organization_id uuid,
 sales_today numeric,
 sales_this_week numeric,
 sales_this_month numeric,
 pending_approvals bigint,
 critical_stock_count bigint,
 low_stock_count bigint,
 outstanding_cash numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
 WITH params AS (
  SELECT
   CURRENT_DATE AS today,
   date_trunc('week', CURRENT_DATE)::date AS week_start,
   date_trunc('month', CURRENT_DATE)::date AS month_start
 ),
 scoped_summaries AS (
  SELECT pds.summary_date, pds.total_sales
  FROM public.pos_daily_summaries pds
  WHERE pds.organization_id = p_org_id
   AND (p_branch_ids IS NULL OR pds.branch_id = ANY(p_branch_ids))
 ),
 scoped_approvals AS (
  SELECT COUNT(*)::bigint AS total
  FROM public.approval_requests ar
  WHERE ar.organization_id = p_org_id
   AND ar.status = 'PENDING'
   AND (p_branch_ids IS NULL OR ar.branch_id = ANY(p_branch_ids))
 ),
 scoped_cash AS (
  SELECT COALESCE(SUM(fc.amount), 0)::numeric AS total
  FROM public.finance_collections fc
  WHERE fc.organization_id = p_org_id
   AND fc.status = 'PENDING'
   AND (p_branch_ids IS NULL OR fc.branch_id = ANY(p_branch_ids))
 )
 SELECT
  p_org_id AS organization_id,
  COALESCE(SUM(ss.total_sales) FILTER (WHERE ss.summary_date = params.today), 0)::numeric AS sales_today,
  COALESCE(SUM(ss.total_sales) FILTER (WHERE ss.summary_date >= params.week_start), 0)::numeric AS sales_this_week,
  COALESCE(SUM(ss.total_sales) FILTER (WHERE ss.summary_date >= params.month_start), 0)::numeric AS sales_this_month,
  scoped_approvals.total AS pending_approvals,
  0::bigint AS critical_stock_count,
  0::bigint AS low_stock_count,
  scoped_cash.total AS outstanding_cash
 FROM params
 CROSS JOIN scoped_approvals
 CROSS JOIN scoped_cash
 LEFT JOIN scoped_summaries ss ON true
 GROUP BY scoped_approvals.total, scoped_cash.total;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_snapshot(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_snapshot(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot(uuid, uuid[]) TO authenticated;
