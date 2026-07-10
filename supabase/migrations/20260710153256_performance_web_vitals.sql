-- RKJ One: real user performance monitoring
-- Stores sampled Web Vitals for signed-in users only. RLS keeps rows
-- organization-scoped and management-readable for diagnostics.

CREATE TABLE IF NOT EXISTS public.performance_web_vitals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 route text NOT NULL CHECK (char_length(route) BETWEEN 1 AND 180),
 metric_name text NOT NULL CHECK (char_length(metric_name) BETWEEN 1 AND 48),
 metric_value numeric(12, 3) NOT NULL,
 metric_delta numeric(12, 3),
 metric_rating text CHECK (metric_rating IN ('good', 'needs-improvement', 'poor')),
 navigation_type text CHECK (navigation_type IS NULL OR char_length(navigation_type) <= 48),
 connection_type text CHECK (connection_type IS NULL OR char_length(connection_type) <= 48),
 device_memory numeric(4, 1),
 user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 180),
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_web_vitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS performance_web_vitals_insert_own_org ON public.performance_web_vitals;
CREATE POLICY performance_web_vitals_insert_own_org
 ON public.performance_web_vitals
 FOR INSERT
 TO authenticated
 WITH CHECK (
  profile_id = (SELECT auth.uid())
  AND EXISTS (
   SELECT 1
   FROM public.profiles p
   WHERE p.id = (SELECT auth.uid())
    AND p.organization_id = performance_web_vitals.organization_id
  )
 );

DROP POLICY IF EXISTS performance_web_vitals_select_management ON public.performance_web_vitals;
CREATE POLICY performance_web_vitals_select_management
 ON public.performance_web_vitals
 FOR SELECT
 TO authenticated
 USING (
  EXISTS (
   SELECT 1
   FROM public.profiles p
   WHERE p.id = (SELECT auth.uid())
    AND p.organization_id = performance_web_vitals.organization_id
    AND p.role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER', 'FINANCE')
  )
 );

REVOKE ALL ON TABLE public.performance_web_vitals FROM anon;
GRANT INSERT, SELECT ON TABLE public.performance_web_vitals TO authenticated;

CREATE INDEX IF NOT EXISTS idx_performance_web_vitals_org_created
 ON public.performance_web_vitals(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_web_vitals_org_route_metric_created
 ON public.performance_web_vitals(organization_id, route, metric_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_web_vitals_org_rating_created
 ON public.performance_web_vitals(organization_id, metric_rating, created_at DESC);
