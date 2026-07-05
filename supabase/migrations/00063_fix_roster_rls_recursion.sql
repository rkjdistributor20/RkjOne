-- Fix infinite recursion in weekly roster RLS policies
-- Migration 00063

CREATE OR REPLACE FUNCTION public.can_access_roster_plan(p_plan_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
 SELECT EXISTS (
 SELECT 1 FROM weekly_roster_plans p
 WHERE p.id = p_plan_id
 AND p.organization_id = public.organization_id()
 AND public.has_branch_access(p.branch_id)
 );
$$;

CREATE OR REPLACE FUNCTION public.is_own_published_roster_entry(p_entry_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
 SELECT EXISTS (
 SELECT 1 FROM weekly_roster_entries e
 JOIN weekly_roster_plans p ON p.id = e.plan_id
 JOIN staff s ON s.id = e.staff_id
 WHERE e.id = p_entry_id
 AND p.status = 'PUBLISHED'
 AND s.profile_id = auth.uid()
 );
$$;

CREATE OR REPLACE FUNCTION public.is_own_published_roster_plan(p_plan_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
 SELECT EXISTS (
 SELECT 1 FROM weekly_roster_entries e
 JOIN staff s ON s.id = e.staff_id
 WHERE e.plan_id = p_plan_id
 AND s.profile_id = auth.uid()
 );
$$;

DROP POLICY IF EXISTS roster_entries_via_plan ON weekly_roster_entries;
DROP POLICY IF EXISTS roster_entries_staff_read ON weekly_roster_entries;
DROP POLICY IF EXISTS roster_plans_staff_read ON weekly_roster_plans;

CREATE POLICY roster_entries_manager ON weekly_roster_entries
 FOR ALL USING (public.can_access_roster_plan(plan_id));

CREATE POLICY roster_entries_staff_read ON weekly_roster_entries
 FOR SELECT USING (public.is_own_published_roster_entry(id));

CREATE POLICY roster_plans_staff_read ON weekly_roster_plans
 FOR SELECT USING (
 status = 'PUBLISHED'
 AND organization_id = public.organization_id()
 AND public.is_own_published_roster_plan(id)
 );

GRANT EXECUTE ON FUNCTION public.can_access_roster_plan(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_own_published_roster_entry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_own_published_roster_plan(UUID) TO authenticated;
