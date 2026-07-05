CREATE TABLE IF NOT EXISTS area_manager_operation_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
 event_type TEXT NOT NULL CHECK (event_type IN ('SPRING_CLEANING', 'HIGHWAY_MEETING')),
 title TEXT NOT NULL,
 scheduled_date DATE NOT NULL,
 scheduled_time TIME,
 branch_ids UUID[] NOT NULL DEFAULT '{}',
 highway_party TEXT,
 status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'DONE', 'CANCELLED')),
 notes TEXT,
 created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
 updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
 completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_am_operation_events_org_date
 ON area_manager_operation_events(organization_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_am_operation_events_region_date
 ON area_manager_operation_events(region_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_am_operation_events_branch_ids
 ON area_manager_operation_events USING GIN(branch_ids);

DROP TRIGGER IF EXISTS set_updated_at ON area_manager_operation_events;
CREATE TRIGGER set_updated_at
 BEFORE UPDATE ON area_manager_operation_events
 FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE area_manager_operation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS am_operation_events_scope ON area_manager_operation_events;
CREATE POLICY am_operation_events_scope ON area_manager_operation_events
 FOR ALL USING (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
 OR EXISTS (
 SELECT 1
 FROM unnest(branch_ids) AS scoped_branch_id
 WHERE public.has_branch_access(scoped_branch_id)
 )
 )
 ) WITH CHECK (
 organization_id = public.organization_id()
 AND (
 public.user_role() IN ('SUPER_ADMIN', 'ADMIN', 'OPERATION_MANAGER')
 OR EXISTS (
 SELECT 1
 FROM unnest(branch_ids) AS scoped_branch_id
 WHERE public.has_branch_access(scoped_branch_id)
 )
 )
 );
